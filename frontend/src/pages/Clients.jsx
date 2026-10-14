import { useNavigate } from 'react-router-dom'
import { useDisplays } from '../useDisplays'

export default function Clients() {
  const [displays] = useDisplays()
  const navigate = useNavigate()

  return (
    <div className="page-center">
      <h1 className="impact page-title">Join As</h1>
      {!displays ? (
        <div className="spinner-border text-light" role="status"><span className="visually-hidden">Loading…</span></div>
      ) : (
        [displays.slice(0, 3), displays.slice(3, 6)].map((row, i) => (
          <div className="button-row" key={i}>
            {row.map((display) => (
              <button
                key={display.display_number}
                type="button"
                className="btn btn-dark btn-lg"
                onClick={() => navigate(`/client/${display.display_number}`)}
              >
                {display.name}
              </button>
            ))}
          </div>
        ))
      )}
      <button type="button" className="btn btn-danger btn-lg" onClick={() => navigate('/join')}>Go Back</button>
    </div>
  )
}
