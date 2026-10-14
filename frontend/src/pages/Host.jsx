import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import CameraPanel from '../components/CameraPanel'
import Modal from '../components/Modal'
import { formatClock, formatTime, receiveState, useShowTime } from '../time'
import { useDisplays } from '../useDisplays'
import { useShowSocket } from '../useShowSocket'
import { FPS_OPTIONS, VideoBroadcaster } from '../video'

// Displays heartbeat every 5s; treat one as gone after missing a few.
const STALE_MS = 15000
// Only alert about a disconnect if the display hasn't come back by then (e.g. a quick reload).
const DISCONNECT_ALERT_DELAY_MS = 10000

export default function Host() {
  const [displays, setDisplays] = useDisplays()
  const [state, setState] = useState(null)
  const [pending, setPending] = useState(false)
  const [statuses, setStatuses] = useState({})
  const [problems, setProblems] = useState([])
  const [editing, setEditing] = useState(null)
  const [editError, setEditError] = useState('')
  const [recordTimes, setRecordTimes] = useState(false)
  const [recordedTime, setRecordedTime] = useState(null)
  const [resumePrompt, setResumePrompt] = useState(false)
  const displaysRef = useRef(displays)
  const statusesRef = useRef({})
  const alertTimersRef = useRef({})
  const [serverVideo, setServerVideo] = useState({ live: false })
  const [viewers, setViewers] = useState([])
  const sendRef = useRef(() => false)
  const [broadcaster] = useState(() => new VideoBroadcaster((message) => sendRef.current(message), setViewers))

  const { elapsed, clock } = useShowTime(state)

  useEffect(() => {
    displaysRef.current = displays
  }, [displays])

  const nameOf = (number) => displaysRef.current?.find((d) => d.display_number === number)?.name ?? `Display ${number}`
  const addProblem = (text) => setProblems((current) => [...current, text])

  const setStatus = useCallback((number, online, isProtected) => {
    const wasOnline = statusesRef.current[number]?.online
    statusesRef.current = { ...statusesRef.current, [number]: { online, protected: isProtected, seenAt: Date.now() } }
    setStatuses(statusesRef.current)

    clearTimeout(alertTimersRef.current[number])
    if (wasOnline && !online) {
      alertTimersRef.current[number] = setTimeout(() => {
        if (!statusesRef.current[number]?.online) addProblem(`Display ${nameOf(number)} Has Disconnected!`)
      }, DISCONNECT_ALERT_DELAY_MS)
    }
  }, [])

  const onMessage = useCallback((message) => {
    switch (message.type) {
      case 'state':
        setState(receiveState(message))
        setPending(false)
        break
      case 'displays':
        setDisplays(message.displays)
        break
      case 'display_status':
        setStatus(message.display, message.online, message.protected)
        break
      case 'tamper':
        addProblem(`Tamper Alert on ${nameOf(message.display)}!`)
        setStatus(message.display, true, false)
        break
      case 'error':
        addProblem(message.message)
        break
      case 'resume_prompt':
        setResumePrompt(true)
        break
      case 'video':
        setServerVideo({ live: message.live, network: message.network })
        broadcaster.iceServers = message.ice_servers ?? []
        break
      case 'video_join':
        broadcaster.addViewer(message.peer, message.display)
        break
      case 'video_leave':
        broadcaster.removeViewer(message.peer)
        break
      case 'signal':
        broadcaster.handleSignal(message.peer, message.data)
        break
    }
  }, [setDisplays, setStatus, broadcaster])

  const { send, connected, rejected } = useShowSocket('role=host', onMessage)

  useEffect(() => {
    sendRef.current = send
  }, [send])

  // Opening the host page starts the show: Preshow, timer at zero. If a show is already in progress
  // the server asks first (resume_prompt). Only once per page load, so a dropped connection never
  // resets anything; the server also skips it if another host is already connected.
  const openedRef = useRef(false)
  useEffect(() => {
    if (connected && !openedRef.current) {
      openedRef.current = true
      send({ action: 'open_show' })
    }
  }, [connected, send])

  useEffect(() => {
    if (!displays) return
    broadcaster.setLimits({
      displayLimits: Object.fromEntries(displays.map((d) => [d.display_number, d.max_video_fps])),
    })
  }, [broadcaster, displays])

  useEffect(() => {
    const id = setInterval(() => {
      for (const [number, status] of Object.entries(statusesRef.current)) {
        if (status.online && Date.now() - status.seenAt > STALE_MS) setStatus(Number(number), false, false)
      }
    }, 2000)
    return () => {
      clearInterval(id)
      Object.values(alertTimersRef.current).forEach(clearTimeout)
    }
  }, [setStatus])

  // Don't leave the spinner up forever if a state update gets lost.
  useEffect(() => {
    if (!pending) return
    const id = setTimeout(() => setPending(false), 3000)
    return () => clearTimeout(id)
  }, [pending])

  const canGoBack = !!state && state.index > 0
  const canGoForward = !!state && state.index < state.total - 1

  function move(delta) {
    if (pending || !(delta > 0 ? canGoForward : canGoBack)) return
    if (!send({ action: delta > 0 ? 'next' : 'previous' })) return
    setPending(true)
    // Only moving forward completes a scene; stepping back is a correction, not a timing.
    if (recordTimes && delta > 0) setRecordedTime({ index: state.index, name: state.current, seconds: elapsed })
  }

  const moveRef = useRef(move)
  useEffect(() => {
    moveRef.current = move
  })

  const modalOpen = !!editing || !!recordedTime || resumePrompt || problems.length > 0
  useEffect(() => {
    function onKey(event) {
      if (modalOpen || document.querySelector('.modal') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (event.key === ' ' || event.key === 'ArrowRight') moveRef.current(1)
      else if (event.key === 'ArrowLeft') moveRef.current(-1)
      else return
      // Stops Space from also "clicking" whichever button has focus.
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  async function saveDisplay() {
    try {
      const data = await api(`displays/${editing.display_number}/`, {
        method: 'PUT',
        body: {
          name: editing.name,
          play_sound: editing.play_sound,
          max_video_fps: editing.max_video_fps,
          video_layout: editing.video_layout,
        },
      })
      setDisplays(data.displays)
      setEditing(null)
    } catch (err) {
      setEditError(err.message)
    }
  }

  async function saveRecordedTime() {
    const { index, seconds } = recordedTime
    setRecordedTime(null)
    try {
      await api(`scenes/${index}/`, { method: 'PATCH', body: { est_time: seconds } })
    } catch (err) {
      addProblem(`Couldn't save the recorded time: ${err.message}`)
    }
  }

  if (rejected) {
    return (
      <div className="page-center">
        <h1 className="impact text-white">Session expired</h1>
        <button type="button" className="btn btn-dark btn-lg" onClick={() => window.location.assign('/login')}>Log in again</button>
      </div>
    )
  }

  const loading = !state || pending || !connected
  const remaining = state && state.est > 0 ? state.est - elapsed : 0
  const rows = [
    ['Current', 'color-current', state?.current],
    ['Next', 'color-next', state?.next],
    ['After', 'color-after', state?.after],
    state?.preshow
      ? ['Current Time', 'color-est', formatClock(clock)]
      : ['Estimated Time', 'color-est', `${remaining > 0 ? formatTime(remaining) : '~:~~'} / ${formatTime(elapsed)}`],
  ]

  return (
    <div className="host-layout">
      <div className="host-controls">
        <div className="display-grid">
          {(displays ?? []).map((display) => {
            const status = statuses[display.display_number]
            const statusClass = status?.online ? (status.protected ? 'btn-display-protected' : 'btn-display-unprotected') : ''
            return (
              <button
                key={display.display_number}
                type="button"
                className={`btn btn-dark ${statusClass}`}
                title={status?.online ? (status.protected ? 'Online, fullscreen' : 'Online, not fullscreen') : 'Offline'}
                onClick={() => {
                  setEditError('')
                  setEditing({ ...display })
                }}
              >
                {display.name}
              </button>
            )
          })}
        </div>

        <div className="button-row">
          <button type="button" className="btn btn-dark btn-lg" disabled={!canGoBack || pending} onClick={() => move(-1)}>
            Backward
          </button>
          <button type="button" className="btn btn-dark btn-lg" disabled={!canGoForward || pending} onClick={() => move(1)}>
            Forward
          </button>
        </div>
        {state && state.total === 0 && <div className="text-white">No scenes loaded. Upload a show CSV first.</div>}

        <div className="form-check form-switch time-record-switch">
          <input className="form-check-input" type="checkbox" role="switch" id="time-record-switch"
                 checked={recordTimes} onChange={(e) => setRecordTimes(e.target.checked)} />
          <label className="form-check-label" htmlFor="time-record-switch">Enable Time Recording</label>
        </div>

        <CameraPanel
          broadcaster={broadcaster}
          send={send}
          connected={connected}
          serverVideo={serverVideo}
          viewers={viewers}
          nameOf={nameOf}
        />
      </div>

      <div className="host-status">
        {!connected && <div className="badge bg-warning text-dark mb-3">Reconnecting…</div>}
        {rows.map(([label, color, value]) => (
          <div key={label}>
            <h1 className={`impact ${color}`}>{label}:</h1>
            <h2>
              {loading ? <span className="spinner-border" role="status"><span className="visually-hidden">Loading…</span></span> : value}
            </h2>
          </div>
        ))}
      </div>

      {editing && (
        <Modal
          title={`Edit ${displays.find((d) => d.display_number === editing.display_number)?.name}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={saveDisplay}>Save changes</button>
            </>
          }
        >
          <label htmlFor="display-name" className="form-label">Name</label>
          <input id="display-name" type="text" className="form-control" maxLength={50} autoFocus
                 value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <div className="form-check mt-3">
            <input id="display-sound" className="form-check-input" type="checkbox" checked={editing.play_sound}
                   onChange={(e) => setEditing({ ...editing, play_sound: e.target.checked })} />
            <label htmlFor="display-sound" className="form-check-label">Play sound on scene change</label>
          </div>

          <hr />
          <h6 className="mb-3">Live video</h6>
          <label htmlFor="display-layout" className="form-label">Layout</label>
          <select id="display-layout" className="form-select" value={editing.video_layout}
                  onChange={(e) => setEditing({ ...editing, video_layout: e.target.value })}>
            <option value="overlay">Scene info over the video</option>
            <option value="split">Video above the scene info</option>
            <option value="none">No video</option>
          </select>
          <label htmlFor="display-fps" className="form-label mt-3">Frame rate limit</label>
          <select id="display-fps" className="form-select" value={editing.max_video_fps}
                  onChange={(e) => setEditing({ ...editing, max_video_fps: Number(e.target.value) })}>
            {FPS_OPTIONS.map((fps) => <option key={fps} value={fps}>{fps} fps{fps === 30 ? ' (no limit)' : ''}</option>)}
          </select>
          <div className="form-text">Lower this for displays on Wi-Fi or slower computers.</div>
          {editError && <div className="text-danger mt-2">{editError}</div>}
        </Modal>
      )}

      {recordedTime && (
        <Modal
          title="Save Time"
          onClose={() => setRecordedTime(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setRecordedTime(null)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={saveRecordedTime}>Save</button>
            </>
          }
        >
          <h5>Save the recorded time as the estimate for "{recordedTime.name}"?</h5>
          <h5>Recorded Time: {formatTime(recordedTime.seconds)}</h5>
        </Modal>
      )}

      {resumePrompt && (
        <Modal
          title="Show in progress"
          onClose={() => setResumePrompt(false)}
          footer={
            <>
              <button type="button" className="btn btn-outline-danger me-auto"
                      onClick={() => {
                        setResumePrompt(false)
                        if (send({ action: 'restart' })) setPending(true)
                      }}>
                Start from the beginning
              </button>
              <button type="button" className="btn btn-primary" autoFocus onClick={() => setResumePrompt(false)}>
                Resume
              </button>
            </>
          }
        >
          {state ? (
            <>
              <p className="mb-1">Currently on <strong>{state.current}</strong>, {formatTime(elapsed)} into the scene.</p>
              <p className="mb-0 text-muted">Resume where it left off, or start again from the first scene?</p>
            </>
          ) : 'Resume where it left off, or start again from the first scene?'}
        </Modal>
      )}

      {!editing && !recordedTime && !resumePrompt && problems.length > 0 && (
        <Modal
          title="Problem"
          onClose={() => setProblems([])}
          footer={<button type="button" className="btn btn-secondary" onClick={() => setProblems([])}>Close</button>}
        >
          {problems.map((problem, i) => <h5 key={i} className="text-danger">{problem}</h5>)}
        </Modal>
      )}
    </div>
  )
}
