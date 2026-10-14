import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

export default function RequireAuth({ superuser = false, children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return (
      <div className="page-center">
        <div className="spinner-border text-light" role="status"><span className="visually-hidden">Loading…</span></div>
      </div>
    )
  }
  if (!user.authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (superuser && !user.is_superuser) {
    return (
      <div className="page-center">
        <h1 className="impact text-white">Admin access required</h1>
        <p className="text-white">Signed in as {user.username}, which isn't an admin account.</p>
        <Link to="/join" className="btn btn-dark btn-lg">Go Back</Link>
      </div>
    )
  }
  return children
}
