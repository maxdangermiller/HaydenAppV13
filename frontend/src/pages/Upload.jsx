import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { formatTime } from '../time'

export default function Upload() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(null)
  const [scenes, setScenes] = useState([])

  useEffect(() => {
    api('scenes/').then((data) => setScenes(data.scenes)).catch(() => {})
  }, [uploadedCount])

  async function onSubmit(event) {
    event.preventDefault()
    if (!file) return
    const form = new FormData()
    form.append('csv_file', file)
    setUploading(true)
    setError('')
    try {
      const data = await api('scenes/upload/', { method: 'POST', form })
      setUploadedCount(data.count)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page-center">
      <h1 className="impact text-white" style={{ fontSize: '10vh' }}>
        {uploadedCount === null ? 'Upload Show CSV' : 'Upload Successful!'}
      </h1>

      {uploadedCount === null ? (
        <form onSubmit={onSubmit} className="d-flex flex-column align-items-center gap-2">
          <input type="file" className="form-control" accept=".csv" onChange={(e) => setFile(e.target.files[0] ?? null)} />
          <small className="text-white">Columns: <code className="text-white">name,est_time</code> (seconds). Replaces the current show.</small>
          {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={!file || uploading}>Upload CSV</button>
        </form>
      ) : (
        <p className="text-white fs-4">Loaded {uploadedCount} scenes. The show has been reset to the first scene.</p>
      )}

      <button type="button" className="btn btn-dark btn-lg" onClick={() => navigate('/join')}>Return Home</button>

      {scenes.length > 0 && (
        <table className="table table-sm table-dark mt-3" style={{ maxWidth: '30rem' }}>
          <thead><tr><th>#</th><th>Scene</th><th>Est. time</th></tr></thead>
          <tbody>
            {scenes.map((scene) => (
              <tr key={scene.index}>
                <td>{scene.index + 1}</td>
                <td>{scene.name}</td>
                <td>{scene.est_time > 0 ? formatTime(scene.est_time) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
