// Visitor Log Worker: the API in docs/API.md under /api/*, the static app from ../app/public, and the maintenance cron.
import { assertPinAllowed, createSession, recordWrongPin, requireRole, staffByPin, WRONG_PIN } from './auth.js'
import { now as clockNow, testMode } from './clock.js'
import { ApiError, bad, json, notFound, unauthorized } from './http.js'
import { maintenance } from './maintenance.js'
import { resetSample } from './sample.js'
import { deleteNotice, getSettings, postNotice, putHome, putNotice, putScreening } from './settings.js'
import { building, dayLog, staffResidents, staffSignIn, staffSignOut } from './staff.js'
import { dateLabel, localDate, localHHMM, longLabel, timeLabel, TZ } from './time.js'
import { residentDetail, searchResidents, visitGet, visitorSignin, visitorStart, visitSignout } from './visitor.js'

// [method, pattern, handler, access, maintain] — access: undefined (anyone), 'staff', 'manager', 'test'.
// Every /api/staff/* and /api/settings* path also needs its role and runs maintenance first (see dispatch).
const ROUTES = [
  ['GET', '/api/info', info],
  ['POST', '/api/signin', signin],
  ['POST', '/api/signout', signout, 'staff'],
  ['GET', '/api/visitor/start', visitorStart],
  ['GET', '/api/visitor/residents', searchResidents],
  ['GET', '/api/visitor/residents/:id', residentDetail],
  ['POST', '/api/visitor/signin', visitorSignin],
  ['GET', '/api/visit/:token', visitGet, undefined, true],
  ['POST', '/api/visit/:token/signout', visitSignout, undefined, true],
  ['GET', '/api/staff/building', building, 'staff'],
  ['GET', '/api/staff/residents', staffResidents, 'staff'],
  ['POST', '/api/staff/visits', staffSignIn, 'staff'],
  ['POST', '/api/staff/visits/:id/signout', staffSignOut, 'staff'],
  ['GET', '/api/staff/visits', dayLog, 'staff'],
  ['GET', '/api/settings', getSettings, 'manager'],
  ['PUT', '/api/settings/home', putHome, 'manager'],
  ['PUT', '/api/settings/screening', putScreening, 'manager'],
  ['POST', '/api/settings/notices', postNotice, 'manager'],
  ['PUT', '/api/settings/notices/:id', putNotice, 'manager'],
  ['DELETE', '/api/settings/notices/:id', deleteNotice, 'manager'],
  ['POST', '/api/test/reset', testReset, 'test'],
  ['POST', '/api/test/maintenance', testMaintenance, 'test'],
].map(([method, pattern, handler, access, maintain]) => {
  const names = []
  const re = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'))}$`)
  return { method, re, names, handler, access, maintain }
})

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return await dispatch(request, env, url)
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message, code: e.code, ...e.extra }, e.status)
      console.error(e)
      return json({ error: 'Something went wrong on our side. Please try again.', code: 'server_error' }, 500)
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(maintenance(env, new Date(event.scheduledTime)))
  },
}

async function dispatch(request, env, url) {
  const now = clockNow(request, env)
  const c = {
    request, env, url, db: env.DB, now, nowIso: now.toISOString(), today: localDate(now), params: {},
    body: () => readJson(request),
  }
  const path = url.pathname
  // Every settings path is the manager's and every staff path needs a staff token, including ones this Worker does not answer.
  const area = path === '/api/settings' || path.startsWith('/api/settings/') ? 'manager' : path.startsWith('/api/staff/') ? 'staff' : null
  if (area) {
    await requireRole(c, area)
    await maintenance(env, now)
  }
  for (const r of ROUTES) {
    const m = path.match(r.re)
    if (!m || r.method !== request.method) continue
    if (r.access === 'test' && !testMode(env)) break
    c.params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]))
    if (r.access && r.access !== 'test' && !area) await requireRole(c, r.access)
    if (r.maintain) await maintenance(env, now)
    return await r.handler(c)
  }
  throw notFound('There is nothing here.')
}

// The JSON body as an object ({} when empty or not an object).
async function readJson(request) {
  const text = await request.text()
  if (!text) return {}
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw bad('body', 'Send the details as JSON.')
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
}

// ---------- public ----------

async function info(c) {
  const home = await c.db.prepare('SELECT home_name, sample, phone, retention_days FROM home WHERE id = 1').first()
  return json({
    // Before the home row exists (a migrated, empty D1) nothing is known, and never a SAMPLE badge on a real deployment.
    home_name: home ? home.home_name : '', sample: home ? home.sample === 1 : false, phone: home ? home.phone : '', zone: TZ,
    retention_days: home ? home.retention_days : 30, today: c.today, date_label: dateLabel(c.today), long_label: longLabel(c.today),
    now: c.nowIso, now_local: localHHMM(c.now), time_label: timeLabel(c.now),
  })
}

async function signin(c) {
  const body = await c.body()
  await assertPinAllowed(c)
  const staff = await staffByPin(c, body.pin)
  if (!staff) {
    await recordWrongPin(c)
    throw unauthorized(WRONG_PIN, { field: 'pin' })
  }
  const s = await createSession(c, staff.id)
  return json({ token: s.token, role: staff.role, staff: { id: staff.id, name: staff.name }, expires_at: s.expires_at })
}

async function signout(c) {
  await c.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.session.token_hash).run()
  return json({ ok: true })
}

// ---------- test only (TEST_MODE=1) ----------

async function testReset(c) {
  await resetSample(c.db)
  return json({ ok: true })
}

async function testMaintenance(c) {
  return json(await maintenance(c.env, c.now))
}
