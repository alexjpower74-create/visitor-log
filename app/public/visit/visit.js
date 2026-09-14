// Shared by the visitor's phone pages: the API (same origin, docs/API.md only), this phone's storage, the header, notice cards,
// and the signed-in / signed-out / link-error screens that both / and /out/ show. Times and dates are the API's labels.

export const ME_KEY = 'visitor-log:me'
export const VISIT_KEY = 'visitor-log:visit'
export const SIGN_OUT_LINK_EXPIRED = 'This sign-out link has expired. It only works on the day of your visit.'
const VISIT_MISSING = "We can't find that visit. If you are still in the building, please tell the staff."

export const $ = (sel, root = document) => root.querySelector(sel)

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c)
  return el
}

// localStorage can be blocked (private browsing): the pages still work, they just do not remember.
export const store = {
  get(key) { try { return localStorage.getItem(key) } catch { return null } },
  set(key, value) { try { localStorage.setItem(key, value) } catch {} },
  remove(key) { try { localStorage.removeItem(key) } catch {} },
}

export async function api(method, path, body) {
  let res
  try {
    res = await fetch(path, {
      method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, body: { error: "Can't reach the visitor log. Check your connection and try again.", code: 'network' } }
  }
  let data = null
  try { data = await res.json() } catch {}
  return { ok: res.ok, status: res.status, body: data || { error: 'Something went wrong. Please try again.' } }
}

export const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`

// The sticky header's real height becomes the page's scroll padding (visit.css), so a button scrolled to the top edge is never
// left under the header, however many lines the home's name takes.
function keepClearOfHeader() {
  const header = document.querySelector('[data-sticky-header]')
  if (!header) return
  const apply = () => document.documentElement.style.setProperty('--header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`)
  apply()
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(header)
}
keepClearOfHeader()

/** The home name with its SAMPLE badge, from GET /api/visitor/start. */
export function paintHeader(start) {
  $('#home-name').textContent = start.home_name || 'Visitor log'
  $('#sample-badge').hidden = !start.sample
}

export function noticeCard(n) {
  return h('div', { class: 'notice', 'data-severity': n.severity, 'data-notice': n.id },
    h('span', { class: 'sev-pill' }, n.unit ? `${n.severity_label} · ${n.unit.name}` : n.severity_label),
    h('p', { class: 'notice-message' }, n.message))
}

function checkIcon() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 64 64')
  svg.setAttribute('class', 'v-check')
  svg.setAttribute('aria-hidden', 'true')
  const circle = document.createElementNS(ns, 'circle')
  Object.entries({ cx: 32, cy: 32, r: 29, fill: 'none', stroke: 'currentColor', 'stroke-width': 4 }).forEach(([k, v]) => circle.setAttribute(k, v))
  const tick = document.createElementNS(ns, 'path')
  Object.entries({ d: 'M19 33 L28 42 L45 23', fill: 'none', stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
    .forEach(([k, v]) => tick.setAttribute(k, v))
  svg.append(circle, tick)
  return svg
}

const OUT_SENTENCE = {
  visitor: (t) => `Signed out at ${t}.`,
  staff: (t) => `Staff signed you out at ${t}.`,
  auto: (t) => `You were signed out automatically at ${t} when visiting hours ended.`,
}

function hideLoading() { $('#loading')?.remove() }

/** Show a visit: #signed-in while it is in, #signed-out once it is out. */
export function showVisit(visit, token) {
  hideLoading()
  if (visit.state === 'in') renderSignedIn(visit, token)
  else renderSignedOut(visit)
}

function renderSignedIn(visit, token) {
  const section = $('#signed-in')
  const signOut = h('button', { type: 'button', id: 'sign-out', class: 'v-button v-primary v-big' }, 'Sign out')
  signOut.addEventListener('click', () => signOutVisit(token))
  section.replaceChildren(
    h('div', { class: 'v-done' }, checkIcon(), h('h1', {}, 'Signed in')),
    h('p', { id: 'in-time', class: 'v-time' }, visit.in_label),
    h('p', { class: 'v-visiting' }, `Visiting ${visit.resident.name}, Room ${visit.resident.room}, ${visit.resident.unit_name}`),
    h('div', { class: 'v-notices' }, ...visit.home_notices.map(noticeCard), ...visit.unit_notices.map(noticeCard)),
    h('p', { id: 'error', class: 'v-error', role: 'alert', hidden: true }),
    signOut,
    h('p', { class: 'v-keep' }, 'Keep this page. This sign-out link works until midnight tonight.'))
  $('#signed-out').hidden = true
  section.hidden = false
}

function renderSignedOut(visit) {
  const section = $('#signed-out')
  section.replaceChildren(
    h('div', { class: 'v-done out' }, checkIcon(), h('h1', {}, 'Signed out')),
    h('p', { id: 'out-time', class: 'v-time' }, visit.out_label),
    h('p', { class: 'v-visiting' }, (OUT_SENTENCE[visit.out_kind] || OUT_SENTENCE.visitor)(visit.out_label)),
    h('p', {}, 'Thank you for visiting.'),
    h('a', { class: 'v-button', href: '/' }, 'Sign in again'))
  $('#signed-in').replaceChildren()
  $('#signed-in').hidden = true
  section.hidden = false
}

/** A dead or unknown link: the API's words and a way to sign in, and nothing about any visit. */
export function showLinkError(message) {
  hideLoading()
  for (const id of ['#signed-in', '#signed-out']) { $(id).replaceChildren(); $(id).hidden = true }
  $('#link-error').textContent = message || VISIT_MISSING
  $('#link-error-section').hidden = false
}

async function signOutVisit(token) {
  const button = $('#sign-out')
  const error = $('#error')
  button.disabled = true
  error.hidden = true
  const r = await api('POST', `/api/visit/${encodeURIComponent(token)}/signout`)
  if (r.ok) {
    if (store.get(VISIT_KEY) === token) store.remove(VISIT_KEY)
    return renderSignedOut(r.body.visit)
  }
  if (r.status === 404 || r.status === 410) {
    store.remove(VISIT_KEY)
    return showLinkError(r.body.error)
  }
  button.disabled = false
  error.textContent = r.body.error
  error.hidden = false
}
