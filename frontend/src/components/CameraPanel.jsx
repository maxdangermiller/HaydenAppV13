import { useEffect, useRef, useState } from 'react'
import { cameraSupported, FPS_OPTIONS, listCameras, openCamera, RESOLUTIONS } from '../video'

function loadSetting(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Settings just won't be remembered.
  }
}

/** Host controls for streaming a webcam to the displays. */
export default function CameraPanel({ broadcaster, send, connected, serverVideo, viewers, nameOf }) {
  const [resolution, setResolution] = useState(() => loadSetting('camera.resolution', '720'))
  const [layout, setLayout] = useState(() => loadSetting('camera.layout', 'overlay'))
  const [network, setNetwork] = useState(() => loadSetting('camera.network', 'local'))
  const [maxFps, setMaxFps] = useState(() => Number(loadSetting('camera.maxFps', '30')))
  const [autoThrottle, setAutoThrottle] = useState(() => loadSetting('camera.autoThrottle', 'true') === 'true')
  const [deviceId, setDeviceId] = useState(() => loadSetting('camera.deviceId', ''))
  const [cameras, setCameras] = useState([])
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const streamRef = useRef(null)
  const previewRef = useRef(null)

  const supported = cameraSupported()

  useEffect(() => {
    broadcaster.setLimits({ maxFps, autoThrottle })
  }, [broadcaster, maxFps, autoThrottle])

  useEffect(() => {
    if (supported) listCameras().then(setCameras).catch(() => {})
  }, [supported])

  // If our socket drops, the server tells displays the video ended. Once we're back, go live
  // again; displays reconnect to us from scratch.
  useEffect(() => {
    if (connected && broadcaster.live) {
      broadcaster.dropViewers()
      send({ action: 'video_state', live: true, layout, network })
    }
    // Only on (re)connect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    broadcaster.stop()
  }, [broadcaster])

  function showStream(stream) {
    streamRef.current = stream
    if (previewRef.current) previewRef.current.srcObject = stream
    for (const track of stream.getVideoTracks()) {
      track.onended = () => {
        if (streamRef.current !== stream) return
        stop()
        setError('The camera was disconnected.')
      }
    }
  }

  async function start() {
    setBusy(true)
    setError('')
    try {
      const stream = await openCamera(resolution, deviceId)
      showStream(stream)
      broadcaster.start(stream, RESOLUTIONS[resolution].maxBitrate)
      setLive(true)
      send({ action: 'video_state', live: true, layout, network })
      // Camera names are only available once permission has been granted.
      setCameras(await listCameras())
    } catch (err) {
      setError(cameraErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    broadcaster.stop()
    setLive(false)
    send({ action: 'video_state', live: false, layout, network })
  }

  async function changeSource(nextResolution, nextDeviceId) {
    setResolution(nextResolution)
    setDeviceId(nextDeviceId)
    saveSetting('camera.resolution', nextResolution)
    saveSetting('camera.deviceId', nextDeviceId)
    if (!live) return

    setBusy(true)
    setError('')
    // Release the old camera first; some systems won't open the same device twice.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    try {
      const stream = await openCamera(nextResolution, nextDeviceId)
      showStream(stream)
      await broadcaster.replaceStream(stream, RESOLUTIONS[nextResolution].maxBitrate)
    } catch (err) {
      stop()
      setError(cameraErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function changeLayout(nextLayout) {
    setLayout(nextLayout)
    saveSetting('camera.layout', nextLayout)
    if (live) send({ action: 'video_state', live: true, layout: nextLayout, network })
  }

  function changeNetwork(nextNetwork) {
    setNetwork(nextNetwork)
    saveSetting('camera.network', nextNetwork)
  }

  if (!supported) {
    return (
      <div className="camera-panel text-white">
        <strong>Camera</strong>
        <span>
          Browsers only allow camera access on secure pages. Use the website (https://), or on a local
          server open <code className="text-white">http://localhost:8000/host</code> on the computer running it.
        </span>
      </div>
    )
  }

  const settings = live ? broadcaster.stream?.getVideoTracks()[0]?.getSettings() : null

  return (
    <div className="camera-panel text-white">
      <div className="d-flex justify-content-between align-items-center">
        <strong>Camera</strong>
        {live ? (
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={stop}>Stop video</button>
        ) : (
          <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={start}>Start video</button>
        )}
      </div>

      {serverVideo.live && !live && (
        <div className="text-warning small">Another host is already streaming video.</div>
      )}

      <div className="d-flex gap-2 flex-wrap">
        <select className="form-select form-select-sm w-auto" aria-label="Camera" value={deviceId} disabled={busy}
                onChange={(e) => changeSource(resolution, e.target.value)}>
          <option value="">Default camera</option>
          {cameras.filter((c) => c.deviceId).map((camera, i) => (
            <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${i + 1}`}</option>
          ))}
        </select>
        <select className="form-select form-select-sm w-auto" aria-label="Resolution" value={resolution} disabled={busy}
                onChange={(e) => changeSource(e.target.value, deviceId)}>
          <option value="720">720p</option>
          <option value="1080">1080p</option>
        </select>
        <select className="form-select form-select-sm w-auto" aria-label="Display layout" value={layout}
                onChange={(e) => changeLayout(e.target.value)}>
          <option value="overlay">Layout: info over video</option>
          <option value="split">Layout: video above info</option>
        </select>
        {/* Peers are set up with the network's servers when they connect, so this can't change mid-stream. */}
        <select className="form-select form-select-sm w-auto" aria-label="Video network" value={network}
                disabled={live || busy} title={live ? 'Stop video to change' : undefined}
                onChange={(e) => changeNetwork(e.target.value)}>
          <option value="local">Network: local only</option>
          <option value="internet">Network: internet</option>
        </select>
        <select className="form-select form-select-sm w-auto" aria-label="Max frame rate" value={maxFps}
                onChange={(e) => {
                  setMaxFps(Number(e.target.value))
                  saveSetting('camera.maxFps', e.target.value)
                }}>
          {FPS_OPTIONS.map((fps) => <option key={fps} value={fps}>Max {fps} fps</option>)}
        </select>
      </div>

      <div className="form-check form-switch small mb-0">
        <input className="form-check-input" type="checkbox" role="switch" id="auto-throttle" checked={autoThrottle}
               onChange={(e) => {
                 setAutoThrottle(e.target.checked)
                 saveSetting('camera.autoThrottle', String(e.target.checked))
               }} />
        <label className="form-check-label" htmlFor="auto-throttle">
          Lower the frame rate automatically for displays with weak connections
        </label>
      </div>

      <div className="small text-white-50">
        {network === 'local'
          ? 'Video goes only to displays on the same network as this computer.'
          : 'Displays anywhere can connect. Some networks also need a TURN server (see README).'}
      </div>

      <video ref={previewRef} className="camera-preview" autoPlay muted playsInline hidden={!live} />

      {live && (
        <div className="small">
          {settings && <div>Camera: {settings.width}×{settings.height}{settings.frameRate ? ` @ ${Math.round(settings.frameRate)} fps` : ''}</div>}
          {viewers.length === 0 ? (
            <div>Watching: no displays yet</div>
          ) : (
            <table className="viewer-table">
              <tbody>
                {viewers.map((v, i) => (
                  <tr key={i}>
                    <td>{nameOf(v.display)}</td>
                    {v.state === 'connected' ? (
                      <>
                        <td className="num">{v.fps != null ? `${Math.round(v.fps)} fps` : '…'}</td>
                        <td className="num">{v.kbps != null ? formatRate(v.kbps) : ''}</td>
                        <td className={v.reason === 'weak connection' ? 'text-warning' : 'text-white-50'}>
                          {v.reason ? `limited to ${v.targetFps} fps: ${v.reason}` : ''}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="text-white-50">{v.state}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {error && <div className="text-warning small">{error}</div>}
    </div>
  )
}

function formatRate(kbps) {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`
}

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Allow camera access for this site in the browser settings.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'That camera could not be found. Check it is plugged in, or pick another camera.'
    case 'NotReadableError':
      return 'The camera is in use by another application.'
    default:
      return `Couldn't start the camera: ${err?.message ?? err}`
  }
}
