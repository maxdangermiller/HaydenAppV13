import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page-center">
      <h1 className="impact page-title">404</h1>
      <p className="text-white fs-4">That page doesn't exist.</p>
      <Link to="/" className="btn btn-dark btn-lg">Go Home</Link>
    </div>
  )
}
