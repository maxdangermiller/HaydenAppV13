import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { user, login } = useAuth()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user?.authenticated) return <Navigate to={location.state?.from || '/join'} replace />

  async function onSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(username, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-center">
      <h1 className="impact page-title">Login</h1>
      <form onSubmit={onSubmit} style={{ width: 'min(100%, 22rem)' }}>
        <div className="mb-3">
          <label htmlFor="username" className="form-label">Username</label>
          <input id="username" className="form-control" autoComplete="username" autoFocus required
                 value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">Password</label>
          <input id="password" type="password" className="form-control" autoComplete="current-password" required
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <div className="d-flex justify-content-between">
          <button type="submit" className="btn btn-success" disabled={submitting}>Login</button>
          <Link to="/" className="btn btn-outline-light">Back to Home</Link>
        </div>
      </form>
    </div>
  )
}
