// The staff pages' and settings' only way to the Worker: same-origin fetch('/api/…') per docs/API.md.
// The staff token lives in localStorage 'visitor-log:staff-token'. A 401 clears it and tells the page to show the keypad.
// ?mock=1 swaps the network for api.mock.js (development only, same shapes as API.md); Playwright never uses it.

const TOKEN_KEY = 'visitor-log:staff-token'
const WHO_KEY = 'visitor-log:staff-who'
export const SIGNED_OUT_EVENT = 'visitor-log:signed-out'

export const MOCK = new URLSearchParams(location.search).get('mock') === '1'

/** A link to another staff or settings page that keeps ?mock=1 while developing against the mock. */
export const withMock = (href) => (MOCK ? `${href}${href.includes('?') ? '&' : '?'}mock=1` : href)

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Something went wrong. Please try again.')
    this.status = status
    this.code = body?.code || 'error'
    this.field = body?.field || null
    this.body = body || {}
  }
}

function read(key) { try { return localStorage.getItem(key) } catch { return null } }
function write(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch {} }

export const session = {
  token: () => read(TOKEN_KEY),
  who() { try { return JSON.parse(read(WHO_KEY) || 'null') } catch { return null } },
  save({ token, role, staff }) {
    write(TOKEN_KEY, token)
    write(WHO_KEY, JSON.stringify({ role, name: staff?.name || '', id: staff?.id || '' }))
  },
  clear() { write(TOKEN_KEY, null); write(WHO_KEY, null) },
}

let mock = null
async function transport(method, path, body, token) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (MOCK) {
    mock ??= await import('./api.mock.js')
    return mock.handle(method, path, body, token)
  }
  return fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
}

/** Send a request; answer the Response when it is 2xx, throw ApiError (with the API's own error text) otherwise. */
export async function raw(method, path, body) {
  let res
  try {
    res = await transport(method, path, body, session.token())
  } catch {
    throw new ApiError(0, { error: "Can't reach the visitor log. Check the connection and try again.", code: 'network' })
  }
  if (res.ok) return res
  let data = null
  try { data = await res.json() } catch {}
  if (res.status === 401 && path !== '/api/signin') {
    session.clear()
    window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail: data }))
  }
  throw new ApiError(res.status, data)
}

export async function request(method, path, body) {
  const res = await raw(method, path, body)
  return res.status === 204 ? null : res.json()
}

export const get = (path) => request('GET', path)
export const post = (path, body = {}) => request('POST', path, body)
export const put = (path, body = {}) => request('PUT', path, body)
export const del = (path) => request('DELETE', path)

/** Sign in with a PIN; keeps the token and who signed in. Answers the API's body. */
export async function signIn(pin) {
  const body = await post('/api/signin', { pin })
  session.save(body)
  return body
}

export async function signOut() {
  try { await post('/api/signout') } catch {}
  session.clear()
}

/** Fetch a file with the token and hand it to the browser through a Blob link, named as the API names it. */
export async function download(path) {
  const res = await raw('GET', path)
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename\*?="?([^";]+)"?/i)
  const filename = match ? decodeURIComponent(match[1]) : 'download.csv'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.hidden = true
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return { filename, size: blob.size }
}

export const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString()
