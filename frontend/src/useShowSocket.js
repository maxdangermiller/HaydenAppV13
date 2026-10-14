import { useCallback, useEffect, useRef, useState } from 'react'

// Close codes the server uses to refuse a connection; retrying won't help.
const FATAL_CODES = [4403, 4404]

/**
 * Connect to the show WebSocket and keep reconnecting with backoff.
 * `query` picks the role: "role=host", "display=3", or "" for a viewer.
 */
export function useShowSocket(query, onMessage) {
  const handlerRef = useRef(onMessage)
  const socketRef = useRef(null)
  const reconnectRef = useRef(() => {})
  const [connected, setConnected] = useState(false)
  const [rejected, setRejected] = useState(false)

  useEffect(() => {
    handlerRef.current = onMessage
  })

  useEffect(() => {
    let stopped = false
    let attempt = 0
    let retryTimer

    function open() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws/show/${query ? `?${query}` : ''}`)
      socketRef.current = socket

      socket.onopen = () => {
        attempt = 0
        setConnected(true)
        setRejected(false)
      }
      socket.onmessage = (event) => handlerRef.current(JSON.parse(event.data))
      socket.onclose = (event) => {
        if (socketRef.current !== socket) return
        setConnected(false)
        if (stopped) return
        if (FATAL_CODES.includes(event.code)) {
          setRejected(true)
          return
        }
        retryTimer = setTimeout(open, Math.min(1000 * 2 ** attempt++, 10000))
      }
    }

    // Drop the current socket without waiting for its close handshake (it may be half-open).
    reconnectRef.current = () => {
      const old = socketRef.current
      socketRef.current = null
      old?.close()
      setConnected(false)
      clearTimeout(retryTimer)
      if (!stopped) open()
    }

    open()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
    }
  }, [query])

  const send = useCallback((message) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  const reconnect = useCallback(() => reconnectRef.current(), [])

  return { send, connected, rejected, reconnect }
}
