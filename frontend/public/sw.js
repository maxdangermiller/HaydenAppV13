/*
 * Service worker for the installable app. Served from the site root (see main.views.service_worker)
 * so it covers every page.
 *
 * - Pages: network first, so a new deploy shows up on the next load. If the server can't be reached,
 *   the last copy of the app is used instead; it then shows its own Offline screen and keeps retrying.
 * - Built files under /static/assets/ have content hashes in their names, so they're cached forever.
 * - Other static files (icons, sounds): served from cache, refreshed in the background.
 * - The API, admin and WebSocket are never touched: live show data must never come from a cache.
 */
const SHELL_CACHE = 'shell-v1'
const STATIC_CACHE = 'static-v1'
const MAX_STATIC_ENTRIES = 60
const SHELL_KEY = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add(SHELL_KEY)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL_CACHE && key !== STATIC_CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (/^\/(api|admin|ws)\//.test(url.pathname)) return
  // Audio and video use range requests, which the Cache API can't store.
  if (request.headers.has('range')) return

  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (url.pathname.startsWith('/static/assets/')) event.respondWith(hashedAsset(request))
  else if (url.pathname.startsWith('/static/')) event.respondWith(staticFile(request, event))
})

// Every page of the app is the same index.html, so one cached copy serves them all.
async function page(request) {
  try {
    const response = await fetch(request)
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      const cache = await caches.open(SHELL_CACHE)
      await cache.put(SHELL_KEY, response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match(SHELL_KEY)
    if (cached) return cached
    throw err
  }
}

async function hashedAsset(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await store(request, response.clone())
  return response
}

async function staticFile(request, event) {
  const cached = await caches.match(request)
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) await store(request, response.clone())
    return response
  })
  if (cached) {
    event.waitUntil(refresh.catch(() => {}))
    return cached
  }
  return refresh
}

// Old builds' files pile up after each deploy; keep only the most recent ones.
async function store(request, response) {
  const cache = await caches.open(STATIC_CACHE)
  await cache.put(request, response)
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES))) await cache.delete(key)
}
