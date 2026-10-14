import { useEffect, useState } from 'react'

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Seconds since the current scene started, ticking locally from the last server state. */
export function useElapsed(state) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  if (!state) return 0
  return state.elapsed + Math.max(0, Math.floor((now - state.receivedAt) / 1000))
}
