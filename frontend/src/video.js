/**
 * Peer-to-peer webcam streaming from the host's browser to each display (WebRTC).
 *
 * Video never passes through the server: the show WebSocket only carries the small setup
 * messages ("signals"). In "local" mode no outside servers are used at all; in "internet" mode the
 * server supplies STUN/TURN servers (`iceServers`) so displays on other networks can connect too.
 */

export const RESOLUTIONS = {
  720: { width: 1280, height: 720, maxBitrate: 2_500_000 },
  1080: { width: 1920, height: 1080, maxBitrate: 4_500_000 },
}

const RETRY_MS = 2000

export function cameraSupported() {
  return !!navigator.mediaDevices?.getUserMedia
}

export async function openCamera(resolution, deviceId) {
  const { width, height } = RESOLUTIONS[resolution]
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 30 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  })
  for (const track of stream.getVideoTracks()) track.contentHint = 'motion'
  return stream
}

export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'videoinput')
}

/** Runs async handlers one at a time, so ICE candidates never race ahead of the SDP they belong to. */
function serial() {
  let chain = Promise.resolve()
  return (task) => {
    chain = chain.then(task).catch((err) => console.warn('WebRTC:', err))
    return chain
  }
}

// Quality steps, best first. Lower steps also cut the bitrate, and the lowest shrink the picture,
// so a struggling connection gets real relief. The scene info never depends on any of this.
export const QUALITY_LEVELS = [
  { fps: 30, bitrate: 1, scale: 1 },
  { fps: 15, bitrate: 0.6, scale: 1 },
  { fps: 10, bitrate: 0.45, scale: 1 },
  { fps: 5, bitrate: 0.3, scale: 1.5 },
  { fps: 2, bitrate: 0.15, scale: 2 },
]
export const FPS_OPTIONS = QUALITY_LEVELS.map((level) => level.fps)

function levelForFps(fps) {
  const index = QUALITY_LEVELS.findIndex((level) => level.fps <= fps)
  return index === -1 ? QUALITY_LEVELS.length - 1 : index
}

// Automatic throttling, judged separately for each display from its connection stats.
const STATS_INTERVAL_MS = 2000
const WARMUP_MS = 8000 // WebRTC starts low and ramps up; don't mistake that for trouble
const STEP_DOWN_SAMPLES = 2 // ~4s of trouble before lowering the frame rate
const STEP_DOWN_SAMPLES_BELOW_5FPS = 5 // 5 fps is fine; only go lower after ~10s more trouble
const STEP_UP_SAMPLES = 10 // ~20s healthy before trying a higher frame rate
const MAX_STEP_UP_SAMPLES = 60 // if step-ups keep failing, wait up to ~2 min between tries
const FAILED_STEP_UP_MS = 30000

/** Host side: one outgoing connection per display. */
export class VideoBroadcaster {
  constructor(send, onViewersChange) {
    this.send = send
    this.onViewersChange = onViewersChange
    this.stream = null
    this.maxBitrate = 0
    this.peers = new Map() // peer id -> entry, see addViewer
    this.iceServers = []
    this.maxFps = 30
    this.displayLimits = {} // display number -> max fps
    this.autoThrottle = true
    this.timer = null
  }

  get live() {
    return !!this.stream
  }

  start(stream, maxBitrate) {
    this.stream = stream
    this.maxBitrate = maxBitrate
    clearInterval(this.timer)
    this.timer = setInterval(() => this.checkConnections(), STATS_INTERVAL_MS)
  }

  /** Swap camera or resolution without reconnecting anyone. */
  async replaceStream(stream, maxBitrate) {
    const [track] = stream.getVideoTracks()
    this.stream = stream
    this.maxBitrate = maxBitrate
    await Promise.all([...this.peers.values()].map(async (entry) => {
      await entry.pc.getSenders()[0]?.replaceTrack(track)
      await this.applyQuality(entry)
    }))
  }

  stop() {
    clearInterval(this.timer)
    this.timer = null
    this.dropViewers()
    this.stream = null
  }

  dropViewers() {
    for (const { pc } of this.peers.values()) pc.close()
    this.peers.clear()
    this.notify()
  }

  /** Change the overall cap, per-display caps, or automatic throttling; applies immediately. */
  setLimits({ maxFps = this.maxFps, displayLimits = this.displayLimits, autoThrottle = this.autoThrottle }) {
    this.maxFps = maxFps
    this.displayLimits = displayLimits
    this.autoThrottle = autoThrottle
    for (const entry of this.peers.values()) {
      if (!autoThrottle) entry.autoLevel = 0
      this.applyQuality(entry)
    }
    this.notify()
  }

  async addViewer(peer, display) {
    if (!this.stream) return
    this.removeViewer(peer)

    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const entry = {
      pc, display, state: 'connecting', run: serial(),
      autoLevel: 0, connectedAt: 0, troubleSamples: 0, healthySamples: 0,
      stepUpSamples: STEP_UP_SAMPLES, lastStepUpAt: 0, lastBytes: null, lastTime: 0, fps: null, kbps: null,
    }
    this.peers.set(peer, entry)
    this.notify()

    pc.onicecandidate = (event) => {
      if (event.candidate) this.send({ action: 'signal', peer, data: { candidate: event.candidate.toJSON() } })
    }
    pc.onconnectionstatechange = () => {
      if (this.peers.get(peer) !== entry) return
      entry.state = pc.connectionState
      if (pc.connectionState === 'connected' && !entry.connectedAt) entry.connectedAt = Date.now()
      if (['failed', 'closed'].includes(pc.connectionState)) this.removeViewer(peer)
      else this.notify()
    }

    const [track] = this.stream.getVideoTracks()
    pc.addTransceiver(track, {
      direction: 'sendonly',
      streams: [this.stream],
      sendEncodings: [this.encodingFor(entry)],
    })

    await entry.run(async () => {
      await pc.setLocalDescription(await pc.createOffer())
      this.send({ action: 'signal', peer, data: { sdp: pc.localDescription.toJSON() } })
    })
  }

  removeViewer(peer) {
    const entry = this.peers.get(peer)
    if (!entry) return
    this.peers.delete(peer)
    entry.pc.close()
    this.notify()
  }

  handleSignal(peer, data) {
    const entry = this.peers.get(peer)
    if (!entry) return
    entry.run(async () => {
      if (data.sdp) await entry.pc.setRemoteDescription(data.sdp)
      else if (data.candidate) await entry.pc.addIceCandidate(data.candidate)
    })
  }

  capLevel(entry) {
    return Math.max(levelForFps(this.maxFps), levelForFps(this.displayLimits[entry.display] ?? 30))
  }

  effectiveLevel(entry) {
    return Math.max(entry.autoLevel, this.capLevel(entry))
  }

  encodingFor(entry) {
    const level = QUALITY_LEVELS[this.effectiveLevel(entry)]
    return {
      maxBitrate: Math.round(this.maxBitrate * level.bitrate),
      maxFramerate: level.fps,
      scaleResolutionDownBy: level.scale,
    }
  }

  async applyQuality(entry) {
    const sender = entry.pc.getSenders()[0]
    const params = sender?.getParameters()
    if (!params?.encodings?.length) return
    Object.assign(params.encodings[0], this.encodingFor(entry))
    try {
      await sender.setParameters(params)
    } catch (err) {
      console.warn('WebRTC: could not change video quality', err)
    }
  }

  async checkConnections() {
    const entries = [...this.peers.values()].filter((entry) => entry.state === 'connected')
    await Promise.all(entries.map((entry) => this.checkConnection(entry).catch(() => {})))
    if (entries.length) this.notify()
  }

  /** Lower a display's frame rate while its connection is struggling; raise it again once it recovers. */
  async checkConnection(entry) {
    const stats = readStats(await entry.pc.getStats())
    const now = Date.now()
    if (stats.bytesSent != null && entry.lastBytes != null) {
      entry.kbps = Math.round(((stats.bytesSent - entry.lastBytes) * 8) / (now - entry.lastTime))
    }
    entry.lastBytes = stats.bytesSent
    entry.lastTime = now
    entry.fps = stats.fps

    if (!this.autoThrottle || now - entry.connectedAt < WARMUP_MS) return

    // Real congestion signals only. Chrome's qualityLimitationReason says "bandwidth" for the whole
    // (often 20s+) resolution ramp-up even on a perfect link, so it isn't usable here; "cpu" means
    // this computer can't keep up encoding, which lowering the frame rate does help.
    const current = this.effectiveLevel(entry)
    const target = this.maxBitrate * QUALITY_LEVELS[current].bitrate
    const nextUp = current > 0 ? this.maxBitrate * QUALITY_LEVELS[current - 1].bitrate : target
    const struggling = stats.loss > 0.05 || stats.rtt > 0.4 || stats.limitation === 'cpu'
      || (stats.available != null && stats.available < target * 0.5)
    const healthy = !struggling && stats.loss < 0.02 && stats.rtt < 0.25
      && (stats.available == null || stats.available >= nextUp)

    if (struggling) {
      entry.healthySamples = 0
      entry.troubleSamples += 1
      const needed = QUALITY_LEVELS[current].fps <= 5 ? STEP_DOWN_SAMPLES_BELOW_5FPS : STEP_DOWN_SAMPLES
      if (entry.troubleSamples >= needed && current < QUALITY_LEVELS.length - 1) {
        entry.autoLevel = current + 1
        entry.troubleSamples = 0
        // Went straight back into trouble after a step up: wait longer before the next try.
        if (now - entry.lastStepUpAt < FAILED_STEP_UP_MS) {
          entry.stepUpSamples = Math.min(entry.stepUpSamples * 2, MAX_STEP_UP_SAMPLES)
        }
        await this.applyQuality(entry)
      }
    } else if (healthy) {
      entry.troubleSamples = 0
      entry.healthySamples += 1
      if (entry.healthySamples >= entry.stepUpSamples && entry.autoLevel > this.capLevel(entry)) {
        entry.autoLevel -= 1
        entry.healthySamples = 0
        entry.lastStepUpAt = now
        await this.applyQuality(entry)
      }
    } else {
      entry.troubleSamples = 0
      entry.healthySamples = 0
    }
  }

  notify() {
    this.onViewersChange([...this.peers.values()].map((entry) => {
      const level = this.effectiveLevel(entry)
      let reason = null
      if (level > 0) {
        if (level === levelForFps(this.displayLimits[entry.display] ?? 30)) reason = 'display limit'
        else if (level === levelForFps(this.maxFps)) reason = 'max frame rate'
        else reason = 'weak connection'
      }
      return {
        display: entry.display,
        state: entry.state,
        targetFps: QUALITY_LEVELS[level].fps,
        fps: entry.fps,
        kbps: entry.kbps,
        reason,
      }
    }))
  }
}

/** The numbers we care about from an RTCPeerConnection stats report. */
function readStats(report) {
  let outbound, remoteInbound, transport
  report.forEach((stat) => {
    if (stat.type === 'outbound-rtp' && stat.kind === 'video') outbound = stat
    else if (stat.type === 'remote-inbound-rtp' && stat.kind === 'video') remoteInbound = stat
    else if (stat.type === 'transport') transport = stat
  })
  const pair = transport?.selectedCandidatePairId ? report.get(transport.selectedCandidatePairId) : null
  return {
    bytesSent: outbound?.bytesSent ?? null,
    fps: outbound?.framesPerSecond ?? null,
    limitation: outbound?.qualityLimitationReason ?? 'none',
    loss: remoteInbound?.fractionLost ?? 0,
    rtt: remoteInbound?.roundTripTime ?? pair?.currentRoundTripTime ?? 0,
    available: pair?.availableOutgoingBitrate ?? null,
  }
}

/** Display side: a single incoming connection from the streaming host. */
export class VideoReceiver {
  constructor(send, onStream) {
    this.send = send
    this.onStream = onStream
    this.pc = null
    this.wanted = false
    this.retryTimer = null
    this.iceServers = []
    this.run = serial()
  }

  /** Ask the host for video (again) if we don't already have a working connection. */
  request() {
    this.wanted = true
    if (this.pc && !['failed', 'closed'].includes(this.pc.connectionState)) return
    this.send({ action: 'video_join' })
  }

  close() {
    this.wanted = false
    clearTimeout(this.retryTimer)
    // Tell the host right away so it stops encoding for us, rather than waiting ~30s to notice.
    if (this.pc) this.send({ action: 'video_leave' })
    this.reset()
  }

  reset() {
    this.pc?.close()
    this.pc = null
    this.onStream(null)
  }

  handleSignal(data) {
    this.run(async () => {
      if (data.sdp?.type === 'offer') await this.answer(data.sdp)
      else if (data.candidate && this.pc) await this.pc.addIceCandidate(data.candidate)
    })
  }

  async answer(offer) {
    this.reset()
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    this.pc = pc

    pc.ontrack = (event) => this.onStream(event.streams[0] ?? new MediaStream([event.track]))
    pc.onicecandidate = (event) => {
      if (event.candidate) this.send({ action: 'signal', data: { candidate: event.candidate.toJSON() } })
    }
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || !['failed', 'closed'].includes(pc.connectionState)) return
      this.reset()
      if (this.wanted) this.retryTimer = setTimeout(() => this.wanted && this.request(), RETRY_MS)
    }

    await pc.setRemoteDescription(offer)
    await pc.setLocalDescription(await pc.createAnswer())
    this.send({ action: 'signal', data: { sdp: pc.localDescription.toJSON() } })
  }
}
