import { useEffect, useState } from 'react'

/** Register the service worker (production builds only, so it never caches the dev server). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker registration failed:', err))
  })
}

// Browsers fire this once, early, when the app is installable; keep it until someone clicks Install.
let installPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener(installPrompt))

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installPrompt = event
  notify()
})
window.addEventListener('appinstalled', () => {
  installPrompt = null
  notify()
})

/** [canInstall, install]: whether the browser offers installing the app, and a function to ask. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(installPrompt)
  useEffect(() => {
    listeners.add(setPrompt)
    return () => listeners.delete(setPrompt)
  }, [])

  async function install() {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    installPrompt = null
    notify()
  }

  return [!!prompt, install]
}
