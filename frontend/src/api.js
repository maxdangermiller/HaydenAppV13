export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

/**
 * Call the Django JSON API. Pass `body` for JSON or `form` for a FormData upload.
 * Throws ApiError with the server's error message on a non-2xx response.
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  let payload
  if (form) {
    payload = form
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (method !== 'GET') headers['X-CSRFToken'] = getCookie('csrftoken')

  const response = await fetch(`/api/${path}`, { method, headers, body: payload, credentials: 'same-origin' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`, response.status)
  return data
}
