import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
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

/**
 * Host controls for streaming a webcam to the displays: a compact Start/Stop + settings row, the
 * settings in a popup, and a floating preview in the corner that can be minimized.
 */
export default function CameraPanel({ broadcaster, send, connected, serverVideo, viewers, nameOf }) {
  const [resolution, setResolution] = useState(() => loadSetting('camera.resolution', '720'))
  const [network, setNetwork] = useState(() => loadSetting('camera.network', 'local'))
  const [maxFps, setMaxFps] = useState(() => Number(loadSetting('camera.maxFps', '30')))
  const [autoThrottle, setAutoThrottle] = useState(() => loadSetting('camera.autoThrottle', 'true') === 'true')
  const [deviceId, setDeviceId] = useState(() => loadSetting('camera.deviceId', ''))
  const [previewMinimized, setPreviewMinimized] = useState(() => loadSetting('camera.previewMinimized', 'false') === 'true')
  const [cameras, setCameras] = useState([])
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewStream, setPreviewStream] = useState(null)
  const streamRef = useRef(null)

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
      send({ action: 'video_state', live: true, network })
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
    setPreviewStream(stream)
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
      send({ action: 'video_state', live: true, network })
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
    setPreviewStream(null)
    broadcaster.stop()
    setLive(false)
    send({ action: 'video_state', live: false, network })
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

  function togglePreview() {
    setPreviewMinimized(!previewMinimized)
    saveSetting('camera.previewMinimized', String(!previewMinimized))
  }

  const settings = live ? previewStream?.getVideoTracks()[0]?.getSettings() : null
  const watching = viewers.filter((v) => v.state === 'connected').length

  return (
    <>
      <div className="video-controls">
        {live ? (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={stop}>Stop video</button>
        ) : (
          <button type="button" className="btn btn-success" disabled={busy || !supported} onClick={start}>
            Start video
          </button>
        )}
        <button type="button" className="btn btn-outline-light" onClick={() => setSettingsOpen(true)}>
          Video settings
        </button>
      </div>
      {!supported && (
        <div className="video-controls-note">
          Camera needs a secure page: use the https:// website, or <code>http://localhost:8000/host</code> on the
          computer running a local server.
        </div>
      )}
      {serverVideo.live && !live && <div className="video-controls-note text-warning">Another host is already streaming video.</div>}
      {error && <div className="video-controls-note text-warning">{error}</div>}

      {settingsOpen && (
        <Modal
          title="Video settings"
          onClose={() => setSettingsOpen(false)}
          footer={<button type="button" className="btn btn-primary" onClick={() => setSettingsOpen(false)}>Done</button>}
        >
          <div className="video-settings">
            <label htmlFor="video-camera" className="form-label">Camera</label>
            <select id="video-camera" className="form-select" value={deviceId} disabled={busy || !supported}
                    onChange={(e) => changeSource(resolution, e.target.value)}>
              <option value="">Default camera</option>
              {cameras.filter((c) => c.deviceId).map((camera, i) => (
                <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${i + 1}`}</option>
              ))}
            </select>

            <div className="row g-3 mt-0">
              <div className="col-6">
                <label htmlFor="video-resolution" className="form-label">Resolution</label>
                <select id="video-resolution" className="form-select" value={resolution} disabled={busy || !supported}
                        onChange={(e) => changeSource(e.target.value, deviceId)}>
                  <option value="720">720p</option>
                  <option value="1080">1080p</option>
                </select>
              </div>
              <div className="col-6">
                <label htmlFor="video-max-fps" className="form-label">Max frame rate</label>
                <select id="video-max-fps" className="form-select" value={maxFps}
                        onChange={(e) => {
                          setMaxFps(Number(e.target.value))
                          saveSetting('camera.maxFps', e.target.value)
                        }}>
                  {FPS_OPTIONS.map((fps) => <option key={fps} value={fps}>{fps} fps</option>)}
                </select>
              </div>
            </div>

            <div className="form-check form-switch mt-3">
              <input className="form-check-input" type="checkbox" role="switch" id="auto-throttle" checked={autoThrottle}
                     onChange={(e) => {
                       setAutoThrottle(e.target.checked)
                       saveSetting('camera.autoThrottle', String(e.target.checked))
                     }} />
              <label className="form-check-label" htmlFor="auto-throttle">
                Lower the frame rate automatically for displays with weak connections
              </label>
            </div>

            <label htmlFor="video-network" className="form-label mt-3">Network</label>
            {/* Peers are set up with the network's servers when they connect, so this can't change mid-stream. */}
            <select id="video-network" className="form-select" value={network} disabled={live || busy}
                    onChange={(e) => {
                      setNetwork(e.target.value)
                      saveSetting('camera.network', e.target.value)
                    }}>
              <option value="local">Local only</option>
              <option value="internet">Internet</option>
            </select>
            <div className="form-text">
              {network === 'local'
                ? 'Video goes only to displays on the same network as this computer.'
                : 'Displays anywhere can connect. Some networks also need a TURN server (see README).'}
              {live && ' Stop the video to change this.'}
            </div>

            <div className="form-text mt-3">Each display's layout and frame rate limit are in that display's settings.</div>

            {live && (
              <>
                <hr />
                <div className="small text-muted mb-1">
                  {settings ? `Camera: ${settings.width}×${settings.height}${settings.frameRate ? ` @ ${Math.round(settings.frameRate)} fps` : ''}` : 'Live'}
                </div>
                {viewers.length === 0 ? (
                  <div className="small">No displays watching yet.</div>
                ) : (
                  <table className="viewer-table small">
                    <tbody>
                      {viewers.map((v, i) => (
                        <tr key={i}>
                          <td>{nameOf(v.display)}</td>
                          {v.state === 'connected' ? (
                            <>
                              <td className="num">{v.fps != null ? `${Math.round(v.fps)} fps` : '…'}</td>
                              <td className="num">{v.kbps != null ? formatRate(v.kbps) : ''}</td>
                              <td className={v.reason === 'weak connection' ? 'text-danger' : 'text-muted'}>
                                {v.reason ? `limited to ${v.targetFps} fps: ${v.reason}` : ''}
                              </td>
                            </>
                          ) : (
                            <td colSpan={3} className="text-muted">{v.state}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {live && (
        <div className={`video-float${previewMinimized ? ' minimized' : ''}`}>
          <button type="button" className="video-float-header" onClick={togglePreview}
                  aria-label={previewMinimized ? 'Show video preview' : 'Minimize video preview'}>
            <span className="live-dot" aria-hidden="true" />
            <span>Live · {watching} watching</span>
            <span className="video-float-toggle" aria-hidden="true">{previewMinimized ? '▴' : '▾'}</span>
          </button>
          <Preview stream={previewStream} />
        </div>
      )}
    </>
  )
}

function Preview({ stream }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <video ref={ref} className="video-float-preview" autoPlay muted playsInline />
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
