import { useEffect, useState } from 'react'
import { api } from './api'

/** The six display configs. Returns [displays, setDisplays]; displays is null until loaded. */
export function useDisplays() {
  const [displays, setDisplays] = useState(null)
  useEffect(() => {
    api('displays/').then((data) => setDisplays(data.displays)).catch(() => setDisplays([]))
  }, [])
  return [displays, setDisplays]
}
