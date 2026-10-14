import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  // Also sets the CSRF cookie that every later POST/PUT/PATCH needs.
  useEffect(() => {
    api('auth/me/').then(setUser).catch(() => setUser({ authenticated: false }))
  }, [])

  const login = useCallback(async (username, password) => {
    setUser(await api('auth/login/', { method: 'POST', body: { username, password } }))
  }, [])

  const logout = useCallback(async () => {
    setUser(await api('auth/logout/', { method: 'POST' }))
  }, [])

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
