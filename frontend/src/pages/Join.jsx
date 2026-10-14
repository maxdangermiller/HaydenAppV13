import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import InstallButton from '../components/InstallButton'

export default function Join() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  return (
    <div className="page-center">
      <h1 className="impact page-title">Join As</h1>
      <div className="button-row">
        <button type="button" className="btn btn-dark btn-lg" onClick={() => navigate('/host')}>Host</button>
        <button type="button" className="btn btn-dark btn-lg" onClick={() => navigate('/clients')}>Client</button>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/upload')}>Upload Show CSV</button>
      <InstallButton />
      <button type="button" className="btn btn-link text-white" onClick={logout}>
        Log out {user.username}
      </button>
    </div>
  )
}
