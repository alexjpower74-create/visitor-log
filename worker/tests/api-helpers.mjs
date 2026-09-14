// Helpers for the API suites against a real local Worker in TEST_MODE. "Now" is pinned with X-Test-Now:
// Mon Sep 14 2026, 3:00 PM NDT unless a test says otherwise (Harbour's afternoon window; Lighthouse and Cove open).
//
// d1() reads the Worker's local D1 through `wrangler d1 execute visitor-log --local --persist-to $STATE_DIR --json --command <sql>`
// (read-only SELECTs, test-only; tests/run.mjs sets STATE_DIR). Nothing in the Worker knows about it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localInstant } from '../src/time.js'

export const BASE = process.env.API_BASE || 'http://127.0.0.1:8402'
const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

export const HOME = 'SAMPLE Harbourview Care Home (demo)'
export const PIN = { donna: '7314', carl: '2580', amira: '4691' }

// nl('15:00') → the instant of 3:00 PM St. John's time on Mon Sep 14 2026 (or another date); 'HH:MM:SS' too.
export const nl = (hhmm, date = '2026-09-14') => {
  const [h, m, s = 0] = hhmm.split(':').map(Number)
  return new Date(localInstant(date, h, m).getTime() + s * 1000).toISOString()
}
export const T3PM = nl('15:00')

let ipSeq = 0
let phoneSeq = 0

// A fresh SAMPLE phone number (709-555-01xx) for each visitor.
export const phone = () => `709-555-01${String(phoneSeq++ % 100).padStart(2, '0')}`

// Each request comes from its own X-Test-IP unless the test gives one, so the PIN guard only bites where a test means it.
export async function call(method, url, { body, token, now = T3PM, ip, headers = {} } = {}) {
  const h = { 'X-Test-Now': now, 'X-Test-IP': ip || `test-${process.pid}-${++ipSeq}`, ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  let payload
  if (body !== undefined) {
    h['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const r = await fetch(BASE + url, { method, headers: h, body: payload })
  const type = r.headers.get('content-type') || ''
  const data = type.includes('application/json') ? await r.json() : await r.text()
  return { status: r.status, body: data, headers: r.headers }
}

export async function reset() {
  const r = await call('POST', '/api/test/reset')
  assert.equal(r.status, 200, 'reset needs a Worker started with TEST_MODE=1')
}

export async function token(pin, now = T3PM) {
  const r = await call('POST', '/api/signin', { body: { pin }, now })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body.token
}

// A visitor signs in on their phone; expects 201. Returns { token, out_url, visit }.
export async function visitor(resident_id, now = T3PM, extra = {}) {
  const r = await call('POST', '/api/visitor/signin', {
    body: { name: `Visitor ${++ipSeq} (SAMPLE)`, phone: phone(), resident_id, ...extra }, now,
  })
  assert.equal(r.status, 201, `visitor for ${resident_id} at ${now}: ${JSON.stringify(r.body)}`)
  return r.body
}

// Staff sign someone in at the desk; expects 201. Returns { visit, warnings }.
export async function staffVisit(staffToken, resident_id, now = T3PM, extra = {}) {
  const r = await call('POST', '/api/staff/visits', {
    token: staffToken, body: { resident_id, visitor_name: `Desk visitor ${++ipSeq} (SAMPLE)`, visitor_phone: '', ...extra }, now,
  })
  assert.equal(r.status, 201, `staff sign-in for ${resident_id} at ${now}: ${JSON.stringify(r.body)}`)
  return r.body
}

export async function building(staffToken, now = T3PM) {
  const r = await call('GET', '/api/staff/building', { token: staffToken, now })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body
}

export async function dayLog(staffToken, date, now = T3PM, unit) {
  const r = await call('GET', `/api/staff/visits?date=${date}${unit ? `&unit=${unit}` : ''}`, { token: staffToken, now })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body
}

export async function addNotice(managerToken, unit_id, severity, message, now = T3PM) {
  const r = await call('POST', '/api/settings/notices', { token: managerToken, body: { unit_id, severity, message }, now })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return r.body.id
}

export const unitOf = (b, id) => b.units.find((u) => u.id === id)
export const counts = (b) => Object.fromEntries(b.units.map((u) => [u.id, u.count]))

export function d1(sql) {
  assert.ok(process.env.STATE_DIR, 'STATE_DIR must point at the Worker persist dir (tests/run.mjs sets it)')
  const r = spawnSync('wrangler', ['d1', 'execute', 'visitor-log', '--local', '--persist-to', process.env.STATE_DIR,
    '--json', '--command', sql], { cwd: WORKER, encoding: 'utf8', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } })
  assert.equal(r.status, 0, `wrangler d1 execute failed: ${r.stderr}`)
  return JSON.parse(r.stdout)[0].results
}
