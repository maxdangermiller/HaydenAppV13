import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import Modal from '../components/Modal'
import { formatTime, useElapsed } from '../time'
import { useDisplays } from '../useDisplays'
import { useShowSocket } from '../useShowSocket'
import NotFound from './NotFound'

const HEARTBEAT_MS = 5000
// Reconnect if the server stops answering heartbeats (catches half-open connections).
const PONG_TIMEOUT_MS = 15000
// Ride out brief reconnects without flashing the offline screen.
const OFFLINE_GRACE_MS = 5000
const BEEP_URL = `${import.meta.env.BASE_URL}beep.mp3`

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement

export default function Display() {
  const number = Number(useParams().displayNumber)
  if (!Number.isInteger(number) || number < 1 || number > 6) return <NotFound />
  return <DisplayScreen key={number} number={number} />
}

function DisplayScreen({ number }) {
  const navigate = useNavigate()
  const [displays, setDisplays] = useDisplays()
  const [state, setState] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(!!fullscreenElement())
  const [joined, setJoined] = useState(!!fullscreenElement())
  const [tampered, setTampered] = useState(false)
  const [offline, setOffline] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [code, setCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [adminOpen, setAdminOpen] = useState(false)
  const lastPongRef = useRef(Date.now())
  const leavingRef = useRef(false)
  const previousSceneRef = useRef(null)

  const config = displays?.find((d) => d.display_number === number)
  const elapsed = useElapsed(state)

  const onMessage = useCallback((message) => {
    if (message.type === 'state') setState({ ...message, receivedAt: Date.now() })
    else if (message.type === 'displays') setDisplays(message.displays)
    else if (message.type === 'pong') lastPongRef.current = Date.now()
  }, [setDisplays])

  const { send, connected, reconnect } = useShowSocket(`display=${number}`, onMessage)

  // Heartbeat tells the host we're online and whether we're locked in fullscreen.
  useEffect(() => {
    if (!connected) return
    lastPongRef.current = Date.now()
    const beat = () => send({ action: 'heartbeat', protected: !!fullscreenElement() })
    beat()
    const id = setInterval(() => {
      if (Date.now() - lastPongRef.current > PONG_TIMEOUT_MS) reconnect()
      else beat()
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [connected, isFullscreen, send, reconnect])

  useEffect(() => {
    if (connected) {
      setOffline(false)
      return
    }
    const id = setTimeout(() => setOffline(true), OFFLINE_GRACE_MS)
    return () => clearTimeout(id)
  }, [connected])

  // Leaving fullscreen without an admin is treated as tampering.
  useEffect(() => {
    function onChange() {
      const fullscreen = !!fullscreenElement()
      setIsFullscreen(fullscreen)
      if (!fullscreen && !leavingRef.current) {
        send({ action: 'tamper' })
        setTampered(true)
        setJoined(false)
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [send])

  useEffect(() => {
    if (!state) return
    const previous = previousSceneRef.current
    previousSceneRef.current = state.current
    if (previous !== null && previous !== state.current && config?.play_sound) {
      new Audio(BEEP_URL).play().catch(() => {})
    }
  }, [state, config?.play_sound])

  function join() {
    const root = document.documentElement
    const request = root.requestFullscreen || root.webkitRequestFullscreen
    Promise.resolve(request?.call(root)).catch(() => {})
    setJoined(true)
    setTampered(false)
  }

  function leave(action) {
    leavingRef.current = true
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen
      Promise.resolve(exit?.call(document)).catch(() => {})
    }
    action()
  }

  const submitCode = useCallback(async () => {
    if (!code) return
    setCode('')
    try {
      const { valid } = await api('rfid/verify/', { method: 'POST', body: { code } })
      if (valid) {
        setAuthOpen(false)
        setAdminOpen(true)
      } else {
        setAuthError('Card not recognized.')
      }
    } catch (err) {
      setAuthError(err.message)
    }
  }, [code])

  // "C" opens the admin prompt; the RFID reader then types digits followed by Enter.
  useEffect(() => {
    function onKey(event) {
      if (adminOpen || !joined) return
      if (!authOpen) {
        if (event.key === 'c' || event.key === 'C') {
          setCode('')
          setAuthError('')
          setAuthOpen(true)
        }
        return
      }
      if (/^[0-9]$/.test(event.key)) setCode((c) => c + event.key)
      else if (event.key === 'Backspace') setCode((c) => c.slice(0, -1))
      else if (event.key === 'Enter') submitCode()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [authOpen, adminOpen, joined, submitCode])

  const remaining = state && state.est > 0 ? state.est - elapsed : 0

  return (
    <div className="display-page">
      {offline ? (
        <div className="page-center display-offline">
          <h1 className="impact m-0">Offline</h1>
          <h2 className="impact text-white">We're working on it!</h2>
        </div>
      ) : (
        <>
          <h1 className="impact display-title">{config?.name}</h1>
          <div className="display-main">
            <div className="display-current">
              <h1 className="impact display-label color-current">Current:</h1>
              <div className="scene-box"><h2>{state?.current}</h2></div>
            </div>
            <div className="display-upcoming">
              <div className="next">
                <h1 className="impact display-label color-next">Next:</h1>
                <div className="scene-box"><h2>{state?.next}</h2></div>
              </div>
              <div className="after">
                <h1 className="impact display-label color-after">After:</h1>
                <div className="scene-box"><h2>{state?.after}</h2></div>
              </div>
            </div>
          </div>
          <div className="display-est">
            <h1 className="impact color-est">Estimated Time:</h1>
            <h2>{remaining > 0 ? formatTime(remaining) : '~'}</h2>
          </div>
        </>
      )}

      {!joined && (
        <Modal
          title={tampered ? 'Tampering reported' : 'Press Btn To Join'}
          footer={<button type="button" className="btn btn-success" onClick={join}>Join</button>}
        >
          {tampered && 'This display left fullscreen and the host has been notified. Press Join to continue.'}
        </Modal>
      )}

      {authOpen && (
        <Modal
          title="Authorize"
          onClose={() => setAuthOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAuthOpen(false)}>Close</button>
              <button type="button" className="btn btn-success" onClick={submitCode}>Authorize</button>
            </>
          }
        >
          <input type="text" className="form-control" value={'*'.repeat(code.length)} placeholder="Scan card" readOnly />
          {authError && <div className="text-danger mt-2">{authError}</div>}
        </Modal>
      )}

      {adminOpen && (
        <Modal
          title="Admin"
          onClose={() => setAdminOpen(false)}
          footer={<button type="button" className="btn btn-secondary" onClick={() => setAdminOpen(false)}>Close</button>}
        >
          <div className="button-row">
            <button type="button" className="btn btn-success" onClick={() => leave(() => navigate('/clients'))}>
              Switch Display
            </button>
            <button type="button" className="btn btn-success" onClick={() => leave(() => window.location.reload())}>
              Reload
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
