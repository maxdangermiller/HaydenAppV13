import { useEffect, useState } from 'react'

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Time of day, e.g. "7:42:05 PM", in the viewer's time zone. */
export function formatClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

/** Store a "state" message along with when it arrived, so time can tick locally from it. */
export function receiveState(message) {
  const now = Date.now()
  return { ...message, receivedAt: now, clockOffset: message.server_time ? message.server_time - now : 0 }
}

/**
 * Ticking times for the current show state: seconds elapsed in the current scene, and the time
 * of day on the server's clock (so every display shows the same time, even if its own clock is off).
 */
export function useShowTime(state) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  if (!state) return { elapsed: 0, clock: now }
  return {
    elapsed: Math.floor(state.elapsed + Math.max(0, now - state.receivedAt) / 1000),
    clock: now + state.clockOffset,
  }
}
