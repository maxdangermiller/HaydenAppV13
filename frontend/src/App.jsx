import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import Credits from './components/Credits'
import Clients from './pages/Clients'
import Display from './pages/Display'
import Host from './pages/Host'
import Join from './pages/Join'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Upload from './pages/Upload'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Clients />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/client/:displayNumber" element={<Display />} />
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<RequireAuth><Join /></RequireAuth>} />
        <Route path="/host" element={<RequireAuth superuser><Host /></RequireAuth>} />
        <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />

        {/* Old URLs from the server-rendered version */}
        <Route path="/upload_scene_csv" element={<Navigate to="/upload" replace />} />
        <Route path="/accounts/login" element={<Navigate to="/login" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Credits />
    </>
  )
}
