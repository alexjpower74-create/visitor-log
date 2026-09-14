// The first-setup check (tests/run.mjs runs it): migrations + tools/first-setup.mjs SQL on a fresh local D1, and the Worker
// started WITHOUT TEST_MODE, as a real home would be.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { SETUP_BASE: BASE, SETUP_HOME, SETUP_PHONE, SETUP_MANAGER, SETUP_PIN } = process.env

async function call(method, url, { body, token, headers = {} } = {}) {
  const h = { ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  if (body !== undefined) h['Content-Type'] = 'application/json'
  const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}

test('first setup: the manager PIN signs in, info has the home with sample false, the test routes are 404, and a resident added through settings has no (SAMPLE)', async () => {
  assert.ok(BASE && SETUP_PIN, 'run through tests/run.mjs')
  const info = await call('GET', '/api/info', { headers: { 'X-Test-Now': '2030-01-01T12:00:00Z' } })
  assert.equal(info.status, 200)
  assert.deepEqual([info.body.home_name, info.body.sample, info.body.phone, info.body.retention_days], [SETUP_HOME, false, SETUP_PHONE, 30])
  assert.notEqual(info.body.now, '2030-01-01T12:00:00.000Z', 'X-Test-Now is ignored without TEST_MODE')

  const signin = await call('POST', '/api/signin', { body: { pin: SETUP_PIN } })
  assert.equal(signin.status, 200, JSON.stringify(signin.body))
  assert.deepEqual([signin.body.role, signin.body.staff.name], ['manager', SETUP_MANAGER])
  assert.equal((await call('POST', '/api/signin', { body: { pin: '7314' } })).status, 401, 'no SAMPLE PIN exists')
  const token = signin.body.token

  const s = (await call('GET', '/api/settings', { token })).body.settings
  assert.deepEqual(s.home, {
    home_name: SETUP_HOME, phone: SETUP_PHONE, sample: false, retention_days: 30, max_visitors_per_resident: 2,
    after_hours_message: 'Visiting hours are over for now. If you need to see someone, please call the unit.',
    desk_message: "Please see the nurse's desk.", screening_enabled: false, screening_stop_message: '',
  })
  assert.deepEqual([s.units, s.residents, s.notices, s.screening_questions], [[], [], [], []])
  assert.deepEqual(s.staff.map((x) => [x.name, x.role, x.active]), [[SETUP_MANAGER, 'manager', true]])

  for (const [method, url, body] of [['POST', '/api/test/reset'], ['POST', '/api/test/maintenance'], ['POST', '/api/test/seed', { scenario: 'demo' }]]) {
    assert.equal((await call(method, url, { body })).status, 404, url)
  }

  const unit = await call('POST', '/api/settings/units', { token, body: { name: 'Check wing', hours: [{ open: '00:00', close: '24:00' }] } })
  assert.equal(unit.status, 201, JSON.stringify(unit.body))
  const resident = await call('POST', '/api/settings/residents', { token, body: { first_name: 'Check', last_initial: 't', room: '1', unit_id: unit.body.id } })
  assert.equal(resident.status, 201, JSON.stringify(resident.body))
  assert.equal(resident.body.settings.residents[0].name, 'Check T.')
  const found = await call('GET', '/api/visitor/residents?q=check')
  assert.deepEqual(found.body.residents.map((r) => r.name), ['Check T.'])
  assert.equal((await call('GET', '/api/visitor/start')).body.sample, false)
})
