import { useInstallPrompt } from '../pwa'

/** Offers to install the app when the browser supports it; renders nothing otherwise. */
export default function InstallButton({ className = 'btn btn-outline-light' }) {
  const [canInstall, install] = useInstallPrompt()
  if (!canInstall) return null
  return <button type="button" className={className} onClick={install}>Install app</button>
}
