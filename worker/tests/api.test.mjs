// M1 API suite against a real local Worker in TEST_MODE (tests/run.mjs starts it). Every test starts from a fresh SAMPLE home.
// Times are St. John's wall times on Mon Sep 14 2026 unless a date is given; within a test X-Test-Now only moves forward.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { beforeEach, test } from 'node:test'
import {
  addNotice, building, call, counts, d1, dayLog, HOME, nl, phone, PIN, reset, staffVisit, T3PM, token, unitOf, visitor,
} from './api-helpers.mjs'

beforeEach(reset)

const DESK = "Please see the nurse's desk."
const AFTER_HOURS = 'Visiting hours are over for now. If you need to see someone, please call the unit.'
const HARBOUR_HOURS = '8:00 AM to 11:30 AM and 1:30 PM to 9:00 PM'
const OUTSIDE_HARBOUR = `${AFTER_HOURS} Visiting hours on Harbour wing: ${HARBOUR_HOURS}.`
const OUTSIDE_COVE = `${AFTER_HOURS} Visiting hours on Cove unit: 10:00 AM to 7:00 PM.`
const BY_ARRANGEMENT = `Visits with Ellen W. (SAMPLE) are by arrangement only. ${DESK}`
const RESTRICTED_HARBOUR = `Harbour wing: visitors can't sign themselves in right now. ${DESK}`
const MARY_FULL = `Mary S. (SAMPLE) already has 2 visitors signed in. Please wait until someone signs out. ${DESK}`
const LINK_EXPIRED = 'This sign-out link has expired. It only works on the day of your visit.'
const VISIT_MISSING = "We can't find that visit. If you are still in the building, please tell the staff."
const SAMPLE_UNITS = ['u_harbour', 'u_lighthouse', 'u_cove']

const signin = (resident_id, now = T3PM, extra = {}) =>
  call('POST', '/api/visitor/signin', { body: { name: 'Linda P. (SAMPLE)', phone: phone(), resident_id, ...extra }, now })
const resident = (id, now = T3PM) => call('GET', `/api/visitor/residents/${id}`, { now })
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const visitsInD1 = () => Number(d1('SELECT COUNT(*) AS n FROM visits')[0].n)
const allVisits = (b) => b.units.flatMap((u) => u.visits)

// ---------- public, PINs and roles ----------

test('info: shape and Newfoundland time from X-Test-Now (noon, 11:59 PM, midnight)', async () => {
  const r = await call('GET', '/api/info')
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, {
    home_name: HOME, sample: true, phone: '709-555-0142', zone: 'America/St_Johns', retention_days: 30, today: '2026-09-14',
    date_label: 'Mon Sep 14', long_label: 'Monday, September 14', now: '2026-09-14T17:30:00.000Z', now_local: '15:00',
    time_label: '3:00 PM',
  })
  const noon = await call('GET', '/api/info', { now: nl('12:00') })
  assert.deepEqual([noon.body.now_local, noon.body.time_label], ['12:00', '12:00 PM'])
  const late = await call('GET', '/api/info', { now: nl('23:59:59') })
  assert.deepEqual([late.body.today, late.body.now_local, late.body.time_label], ['2026-09-14', '23:59', '11:59 PM'])
  const midnight = await call('GET', '/api/info', { now: nl('00:00', '2026-09-15') })
  assert.deepEqual([midnight.body.today, midnight.body.long_label, midnight.body.time_label], ['2026-09-15', 'Tuesday, September 15', '12:00 AM'])
})

test('staff sign-in: wrong PIN 401 field pin; the right PIN gives a 43-character token for 12 hours; sign out ends it', async () => {
  for (const pin of ['0000', '12', 'abcd', 7314, '', '73145']) {
    const r = await call('POST', '/api/signin', { body: { pin } })
    assert.equal(r.status, 401, `pin ${JSON.stringify(pin)}`)
    assert.deepEqual(r.body, { error: 'That PIN is not right.', code: 'unauthorized', field: 'pin' })
  }
  const r = await call('POST', '/api/signin', { body: { pin: PIN.carl } })
  assert.equal(r.status, 200)
  assert.match(r.body.token, /^[A-Za-z0-9_-]{43}$/)
  assert.deepEqual({ ...r.body, token: 'x' },
    { token: 'x', role: 'staff', staff: { id: 's_carl', name: 'Carl B. (SAMPLE)' }, expires_at: '2026-09-15T05:30:00.000Z' })
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.donna } })).body.role, 'manager')
  const session = d1('SELECT token_hash FROM sessions').map((s) => s.token_hash)
  assert.ok(session.includes(sha256(r.body.token)), 'D1 holds the SHA-256 of the staff token')
  assert.ok(!JSON.stringify(d1('SELECT * FROM sessions')).includes(r.body.token), 'and never the token')
  assert.equal((await call('GET', '/api/staff/building', { token: r.body.token, now: '2026-09-15T05:29:00.000Z' })).status, 200)
  const expired = await call('GET', '/api/staff/building', { token: r.body.token, now: '2026-09-15T05:30:00.000Z' })
  assert.deepEqual([expired.status, expired.body], [401, { error: 'Please sign in again.', code: 'unauthorized' }], '12 hours later')
  const amira = await token(PIN.amira, '2026-09-15T05:30:00.000Z')
  const out = await call('POST', '/api/signout', { token: amira, now: '2026-09-15T05:31:00.000Z' })
  assert.deepEqual([out.status, out.body], [200, { ok: true }])
  assert.equal((await call('GET', '/api/staff/building', { token: amira, now: '2026-09-15T05:32:00.000Z' })).status, 401)
})

test('roles: a staff token on /api/settings → 403 with the exact message; no token → 401; a manager gets both', async () => {
  const carl = await token(PIN.carl)
  const donna = await token(PIN.donna)
  const FORBIDDEN = { error: 'Only a manager can change the settings.', code: 'forbidden' }
  for (const [method, url, body] of [['GET', '/api/settings'], ['PUT', '/api/settings/home', { retention_days: 7 }],
    ['POST', '/api/settings/notices', { unit_id: null, severity: 'info', message: 'SAMPLE' }], ['GET', '/api/settings/nowhere']]) {
    const r = await call(method, url, { token: carl, body })
    assert.deepEqual([r.status, r.body], [403, FORBIDDEN], `${method} ${url}`)
  }
  for (const [method, url] of [['GET', '/api/settings'], ['GET', '/api/staff/building'], ['POST', '/api/signout']]) {
    const r = await call(method, url)
    assert.deepEqual([r.status, r.body], [401, { error: 'Please sign in again.', code: 'unauthorized' }], `${method} ${url} without a token`)
    assert.equal((await call(method, url, { token: 'not-a-real-token' })).status, 401, `${method} ${url} with a made-up token`)
  }
  assert.equal((await call('GET', '/api/settings', { token: donna })).status, 200)
  assert.equal((await call('GET', '/api/staff/building', { token: donna })).status, 200)
  assert.equal((await call('GET', '/api/settings')).body.retention_days, undefined)
  assert.equal((await call('GET', '/api/settings', { token: donna })).body.settings.home.retention_days, 30, 'the staff PUT changed nothing')
})

test('pin guard: 5 wrong PINs from one IP → 429, then even the right PIN 429; another X-Test-IP still works', async () => {
  const ip = 'guard-ip-1'
  for (let i = 1; i <= 5; i++) assert.equal((await call('POST', '/api/signin', { body: { pin: '0000' }, ip })).status, 401, `wrong PIN ${i}`)
  const TOO_MANY = { error: 'Too many tries. Wait 15 minutes, then try again.', code: 'rate_limited' }
  const sixth = await call('POST', '/api/signin', { body: { pin: '0000' }, ip })
  assert.deepEqual([sixth.status, sixth.body], [429, TOO_MANY])
  const right = await call('POST', '/api/signin', { body: { pin: PIN.carl }, ip, now: nl('15:14') })
  assert.deepEqual([right.status, right.body], [429, TOO_MANY], 'the right PIN is refused for the rest of the window')
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.carl }, ip: 'guard-ip-2', now: nl('15:14') })).status, 200)
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.carl }, ip, now: nl('15:15') })).status, 200, '15 minutes on')
})

// ---------- the visitor's start and search ----------

test('visitor start: home, retention and today; screening off → questions [] even with questions saved', async () => {
  const r = await call('GET', '/api/visitor/start')
  assert.deepEqual(r.body, {
    home_name: HOME, sample: true, phone: '709-555-0142', retention_days: 30, today: '2026-09-14', date_label: 'Mon Sep 14',
    time_label: '3:00 PM', home_notices: [], screening: { enabled: false, questions: [] },
  })
  const donna = await token(PIN.donna)
  const saved = await call('PUT', '/api/settings/screening',
    { token: donna, body: { enabled: false, stop_message: '', questions: [{ text: 'SAMPLE question: do you feel sick today?' }] } })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.equal(saved.body.settings.screening_questions.length, 1)
  assert.deepEqual((await call('GET', '/api/visitor/start')).body.screening, { enabled: false, questions: [] })
})

test('search: "ma" → Mary S. and Margaret L.; "m" → 400 field q; "10" → rooms 101, 104, 108; "mary s" → Mary', async () => {
  const q = (text) => call('GET', `/api/visitor/residents?q=${encodeURIComponent(text)}`)
  const ma = await q('ma')
  assert.equal(ma.status, 200)
  assert.deepEqual(ma.body.residents, [
    { id: 'r_margaret', name: 'Margaret L. (SAMPLE)', room: '212', unit: { id: 'u_lighthouse', name: 'Lighthouse wing' } },
    { id: 'r_mary', name: 'Mary S. (SAMPLE)', room: '101', unit: { id: 'u_harbour', name: 'Harbour wing' } },
  ])
  const SHORT = { error: 'Type at least 2 letters of their first name, or their room number.', code: 'bad_request', field: 'q' }
  for (const text of ['m', '  m  ', '', '1']) {
    const r = await q(text)
    assert.deepEqual([r.status, r.body], [400, SHORT], JSON.stringify(text))
  }
  const noQ = await call('GET', '/api/visitor/residents')
  assert.deepEqual([noQ.status, noQ.body], [400, SHORT])
  const rooms10 = (await q('10')).body.residents
  assert.deepEqual(rooms10.map((r) => r.room).sort(), ['101', '104', '108'], 'rooms starting with 10')
  assert.deepEqual(rooms10.map((r) => r.id), ['r_ellen', 'r_george', 'r_mary'], 'sorted by first name, then room')
  assert.deepEqual((await q('20')).body.residents.map((r) => r.id), ['r_frank', 'r_rose'])
  assert.deepEqual((await q('mary s')).body.residents.map((r) => r.id), ['r_mary'])
  assert.deepEqual((await q(' MARY S ')).body.residents.map((r) => r.id), ['r_mary'], 'trimmed, any case')
  assert.deepEqual((await q('mary l')).body.residents, [])
  assert.deepEqual((await q('zz')).body.residents, [])
})

test('search: an inactive resident is not found', { skip: 'M2: no M1 route can turn a resident off (PUT /api/settings/residents/:id is M2)' }, () => {})

test('resident answer: shape with hours and open_now; unknown → 404 with the exact message', async () => {
  const r = await resident('r_mary')
  assert.deepEqual(r.body, {
    resident: { id: 'r_mary', name: 'Mary S. (SAMPLE)', room: '101', unit: { id: 'u_harbour', name: 'Harbour wing', hours_label: HARBOUR_HOURS, open_now: true } },
    can_sign_in: true, reason: null, message: null, home_notices: [], unit_notices: [], needs_notice_confirm: false,
  })
  const missing = await resident('r_nobody')
  assert.deepEqual([missing.status, missing.body], [404, { error: "We can't find that resident. Please see the nurse's desk.", code: 'not_found' }])
})

// ---------- notices ----------

test('notice on the right unit: a Cove outbreak notice is in Agnes\'s unit_notices only, a whole-home notice only in home_notices; staff see it on the Cove card only; turned off it is gone everywhere', async () => {
  const donna = await token(PIN.donna)
  const carl = await token(PIN.carl)
  const OUTBREAK_TEXT = 'SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask and clean your hands before you go in.'
  const INFO_TEXT = 'SAMPLE notice: the side door is closed for painting this week. Please use the main entrance.'
  const outbreakId = await addNotice(donna, 'u_cove', 'outbreak', OUTBREAK_TEXT)
  const infoId = await addNotice(donna, null, 'info', INFO_TEXT, nl('15:01'))
  const OUTBREAK = { id: outbreakId, unit: { id: 'u_cove', name: 'Cove unit' }, severity: 'outbreak', severity_label: 'Outbreak', message: OUTBREAK_TEXT }
  const INFO = { id: infoId, unit: null, severity: 'info', severity_label: 'Notice', message: INFO_TEXT }
  const now = nl('15:02')

  const agnes = await resident('r_agnes', now)
  assert.deepEqual([agnes.body.unit_notices, agnes.body.needs_notice_confirm, agnes.body.home_notices], [[OUTBREAK], true, [INFO]])
  for (const id of ['r_frank', 'r_mary', 'r_george']) {
    const r = await resident(id, now)
    assert.deepEqual([r.body.unit_notices, r.body.needs_notice_confirm, r.body.home_notices], [[], false, [INFO]], id)
  }
  assert.deepEqual((await call('GET', '/api/visitor/start', { now })).body.home_notices, [INFO])

  const b = await building(carl, now)
  assert.deepEqual(unitOf(b, 'u_cove').notices, [OUTBREAK, INFO], 'outbreak first')
  assert.deepEqual(unitOf(b, 'u_harbour').notices, [INFO], 'the Cove notice is not on the Harbour card')
  assert.deepEqual(unitOf(b, 'u_lighthouse').notices, [INFO], 'nor on Lighthouse')

  const unconfirmed = await signin('r_agnes', now)
  assert.deepEqual([unconfirmed.status, unconfirmed.body],
    [400, { error: 'Please read the notice, then tap I have read it.', code: 'bad_request', field: 'notice_confirmed' }])
  const ag = await signin('r_agnes', now, { notice_confirmed: true })
  assert.equal(ag.status, 201, JSON.stringify(ag.body))
  assert.deepEqual([ag.body.visit.unit_notices, ag.body.visit.home_notices], [[OUTBREAK], [INFO]])
  const fr = await signin('r_frank', now)
  assert.equal(fr.status, 201, 'no confirmation needed on Lighthouse')
  assert.deepEqual(fr.body.visit.unit_notices, [])
  assert.deepEqual((await call('GET', `/api/visit/${fr.body.token}`, { now })).body.visit.unit_notices, [])

  const off = await call('PUT', `/api/settings/notices/${outbreakId}`, { token: donna, body: { active: false }, now: nl('15:03') })
  assert.equal(off.status, 200, JSON.stringify(off.body))
  assert.equal(off.body.settings.notices.find((n) => n.id === outbreakId).active, false, 'still listed in settings, off')
  const later = nl('15:04')
  const agnesOff = await resident('r_agnes', later)
  assert.deepEqual([agnesOff.body.unit_notices, agnesOff.body.needs_notice_confirm], [[], false])
  assert.deepEqual(unitOf(await building(carl, later), 'u_cove').notices, [INFO])
  assert.deepEqual((await call('GET', `/api/visit/${ag.body.token}`, { now: later })).body.visit.unit_notices, [])
  assert.equal((await signin('r_agnes', later)).status, 201, 'no confirmation once it is off')
})

test('restricted notice on Harbour wing: Mary 403 restricted_unit with the exact message while Frank signs in 201; staff can still sign Mary in', async () => {
  const donna = await token(PIN.donna)
  await addNotice(donna, 'u_harbour', 'restricted', 'SAMPLE notice: Harbour wing is closed to visitors today.')
  const mary = await signin('r_mary')
  assert.deepEqual([mary.status, mary.body], [403, { error: RESTRICTED_HARBOUR, code: 'restricted_unit' }])
  const detail = await resident('r_mary')
  assert.deepEqual([detail.body.can_sign_in, detail.body.reason, detail.body.message], [false, 'restricted_unit', RESTRICTED_HARBOUR])
  assert.equal((await signin('r_frank')).status, 201)
  const carl = await token(PIN.carl)
  const units = (await call('GET', '/api/staff/residents', { token: carl })).body.units
  assert.deepEqual(units.map((u) => [u.id, u.restricted]), [['u_harbour', true], ['u_lighthouse', false], ['u_cove', false]])
  const desk = await staffVisit(carl, 'r_mary')
  assert.deepEqual(desk.warnings, [{ code: 'restricted_unit', message: RESTRICTED_HARBOUR }])
  await addNotice(donna, null, 'restricted', 'SAMPLE notice: no visitors in the home today.', nl('15:01'))
  const frank = await signin('r_frank', nl('15:02'))
  assert.deepEqual([frank.status, frank.body.error], [403, `Lighthouse wing: visitors can't sign themselves in right now. ${DESK}`], 'a whole-home restriction')
})

// ---------- screening ----------

test('screening settings: on with no questions → 400 questions; with an empty stop message → 400 stop_message; each field; nothing saved on a refusal', async () => {
  const donna = await token(PIN.donna)
  const put = (body) => call('PUT', '/api/settings/screening', { token: donna, body })
  const Q = [{ text: 'SAMPLE question: do you feel sick today?' }]
  const refusals = [
    [{ enabled: true, stop_message: 'Please go home.', questions: [] }, 'questions', 'Add at least one question before you turn screening on.'],
    [{ enabled: true, stop_message: '', questions: Q }, 'stop_message', 'Write what a visitor who answers Yes should do.'],
    [{ enabled: true, stop_message: '   ', questions: Q }, 'stop_message', 'Write what a visitor who answers Yes should do.'],
    [{ enabled: false, stop_message: '', questions: [{ text: 'Sick' }] }, 'questions'],
    [{ enabled: false, stop_message: '', questions: [{ text: 'x'.repeat(201) }] }, 'questions'],
    [{ enabled: false, stop_message: '', questions: Array.from({ length: 11 }, (_, i) => ({ text: `SAMPLE question ${i}?` })) }, 'questions'],
    [{ enabled: false, stop_message: '', questions: 'none' }, 'questions'],
    [{ enabled: 'yes', stop_message: 'Go home.', questions: Q }, 'enabled'],
    [{ enabled: false, stop_message: 'x'.repeat(301), questions: Q }, 'stop_message'],
  ]
  for (const [body, field, message] of refusals) {
    const r = await put(body)
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80))
    assert.equal(r.body.field, field, JSON.stringify(body).slice(0, 80))
    if (message) assert.equal(r.body.error, message)
  }
  const unchanged = (await call('GET', '/api/settings', { token: donna })).body.settings
  assert.deepEqual([unchanged.home.screening_enabled, unchanged.home.screening_stop_message, unchanged.screening_questions], [false, '', []])
  const on = await put({ enabled: true, stop_message: 'SAMPLE: please go home.', questions: [{ text: 'SAMPLE question one?' }, { text: 'SAMPLE question two?' }] })
  assert.equal(on.status, 200, JSON.stringify(on.body))
  const qs = on.body.settings.screening_questions
  assert.deepEqual(qs.map((q) => q.text), ['SAMPLE question one?', 'SAMPLE question two?'])
  assert.equal(on.body.settings.home.screening_enabled, true)
  const kept = await put({ enabled: true, stop_message: 'SAMPLE: please go home.', questions: [{ id: qs[1].id, text: 'SAMPLE question two, edited?' }] })
  assert.deepEqual(kept.body.settings.screening_questions, [{ id: qs[1].id, text: 'SAMPLE question two, edited?' }], 'an id keeps its question')
})

test('screening: a yes stops the sign-in with the stop message byte for byte, and the building, the day log and D1 are unchanged; all no → screened', async () => {
  const donna = await token(PIN.donna)
  const carl = await token(PIN.carl)
  const STOP = "Please don't visit today.  Call the unit if you need to talk with someone — 709-555-0142. (SAMPLE)"
  const set = await call('PUT', '/api/settings/screening', {
    token: donna, body: { enabled: true, stop_message: STOP, questions: [{ text: 'SAMPLE: do you feel sick today?' }, { text: 'SAMPLE: were you told to stay home?' }] },
  })
  assert.equal(set.status, 200, JSON.stringify(set.body))
  const [q1, q2] = set.body.settings.screening_questions.map((q) => q.id)
  assert.deepEqual((await call('GET', '/api/visitor/start')).body.screening,
    { enabled: true, questions: [{ id: q1, text: 'SAMPLE: do you feel sick today?' }, { id: q2, text: 'SAMPLE: were you told to stay home?' }] })
  assert.equal((await signin('r_frank', T3PM, { answers: { [q1]: 'no', [q2]: 'no' } })).status, 201, 'someone is already in')

  const before = { total: (await building(carl)).total, log: (await dayLog(carl, '2026-09-14')).count, rows: visitsInD1() }
  assert.deepEqual(before, { total: 1, log: 1, rows: 1 })
  const none = await signin('r_mary', nl('15:01'))
  assert.deepEqual([none.status, none.body], [400, { error: 'Please answer every question.', code: 'bad_request', field: 'answers' }])
  assert.equal((await signin('r_mary', nl('15:01'), { answers: { [q1]: 'no' } })).body.field, 'answers', 'one unanswered')
  const yes = await call('POST', '/api/visitor/signin', {
    body: { name: 'Screened Out (SAMPLE)', phone: '709-555-0199', resident_id: 'r_mary', answers: { [q1]: 'no', [q2]: 'yes' } }, now: nl('15:02'),
  })
  assert.equal(yes.status, 403)
  assert.deepEqual(yes.body, { error: STOP, code: 'screening_stop' })
  assert.equal(Buffer.compare(Buffer.from(yes.body.error), Buffer.from(STOP)), 0, 'byte for byte')
  const after = { total: (await building(carl, nl('15:03'))).total, log: (await dayLog(carl, '2026-09-14', nl('15:03'))).count, rows: visitsInD1() }
  assert.deepEqual(after, before, 'a yes stores nothing')
  assert.deepEqual(d1("SELECT id FROM visits WHERE visitor_name = 'Screened Out (SAMPLE)' OR phone = '709-555-0199'"), [])

  const ok = await call('POST', '/api/visitor/signin', {
    body: { name: 'Screened In (SAMPLE)', phone: '709-555-0199', resident_id: 'r_mary', answers: { [q1]: 'no', [q2]: 'no' } }, now: nl('15:04'),
  })
  assert.equal(ok.status, 201, JSON.stringify(ok.body))
  const row = (await dayLog(carl, '2026-09-14', nl('15:05'))).visits.find((v) => v.visitor_name === 'Screened In (SAMPLE)')
  assert.equal(row.screened, true)
  assert.equal(JSON.stringify(d1('SELECT * FROM visits')).includes('"no"'), false, 'the answers themselves are not stored')
})

// ---------- hours, by arrangement, the limit, one phone ----------

test('hours: Mary at 12:00 PM and at 11:30 AM (the close minute) → 403 outside_hours; at 1:30 PM → 201; Frank at 3:00 AM → 201; Agnes at 7:00 PM → 403', async () => {
  assert.equal((await signin('r_frank', nl('03:00'))).status, 201, 'Lighthouse is open all day')
  assert.equal((await signin('r_mary', nl('11:29'))).status, 201, 'the last minute of the morning window')
  const close = await signin('r_mary', nl('11:30'))
  assert.deepEqual([close.status, close.body], [403, { error: OUTSIDE_HARBOUR, code: 'outside_hours' }], '11:30 AM is outside')
  const noon = await signin('r_mary', nl('12:00'))
  assert.deepEqual([noon.status, noon.body], [403, { error: OUTSIDE_HARBOUR, code: 'outside_hours' }])
  const detail = await resident('r_mary', nl('12:00'))
  assert.deepEqual([detail.body.resident.unit.open_now, detail.body.can_sign_in, detail.body.reason, detail.body.message],
    [false, false, 'outside_hours', OUTSIDE_HARBOUR])
  assert.equal((await signin('r_mary', nl('13:30'))).status, 201, 'the afternoon window opens at 1:30 PM')
  assert.equal((await signin('r_agnes', nl('18:59'))).status, 201)
  const agnes = await signin('r_agnes', nl('19:00'))
  assert.deepEqual([agnes.status, agnes.body], [403, { error: OUTSIDE_COVE, code: 'outside_hours' }])
})

test('by arrangement: Ellen → 403 with the exact message; staff sign Ellen in → 201 with warnings[0].code by_arrangement', async () => {
  const r = await signin('r_ellen')
  assert.deepEqual([r.status, r.body], [403, { error: BY_ARRANGEMENT, code: 'by_arrangement' }])
  const detail = await resident('r_ellen')
  assert.deepEqual([detail.body.can_sign_in, detail.body.reason, detail.body.message], [false, 'by_arrangement', BY_ARRANGEMENT])
  const carl = await token(PIN.carl)
  const desk = await staffVisit(carl, 'r_ellen', T3PM, { visitor_name: 'Walk-in Visitor (SAMPLE)' })
  assert.equal(desk.warnings[0].code, 'by_arrangement')
  assert.deepEqual(desk.warnings, [{ code: 'by_arrangement', message: BY_ARRANGEMENT }])
  assert.deepEqual([desk.visit.method, desk.visit.signed_in_by, desk.visit.visitor_phone, desk.visit.screened, desk.visit.resident.name],
    ['staff', 'Carl B. (SAMPLE)', '', false, 'Ellen W. (SAMPLE)'])
  assert.equal(counts(await building(carl)).u_harbour, 1)
})

test('visitor limit: two for Mary then a third → 409 resident_full; one signs out; the third → 201; a limit of 1 and no limit', async () => {
  const a = await visitor('r_mary')
  await visitor('r_mary', nl('15:01'))
  const detail = await resident('r_mary', nl('15:02'))
  assert.deepEqual([detail.body.can_sign_in, detail.body.reason, detail.body.message], [false, 'resident_full', MARY_FULL])
  const third = await signin('r_mary', nl('15:02'))
  assert.deepEqual([third.status, third.body], [409, { error: MARY_FULL, code: 'resident_full' }])
  assert.equal((await call('POST', `/api/visit/${a.token}/signout`, { now: nl('15:03') })).status, 200)
  assert.equal((await signin('r_mary', nl('15:04'))).status, 201, 'room again after one signs out')
  const donna = await token(PIN.donna, nl('15:05'))
  await call('PUT', '/api/settings/home', { token: donna, body: { max_visitors_per_resident: 1 }, now: nl('15:05') })
  assert.equal((await signin('r_george', nl('15:06'))).status, 201)
  assert.equal((await signin('r_george', nl('15:06'))).body.error,
    `George P. (SAMPLE) already has 1 visitor signed in. Please wait until someone signs out. ${DESK}`)
  await call('PUT', '/api/settings/home', { token: donna, body: { max_visitors_per_resident: null }, now: nl('15:07') })
  for (let i = 0; i < 3; i++) assert.equal((await signin('r_mary', nl('15:08'))).status, 201, 'no limit')
})

test('same phone twice → 409 already_in with the sign-in time, in any format; staff too; after signing out it works again', async () => {
  const first = await call('POST', '/api/visitor/signin', { body: { name: 'Pat (SAMPLE)', phone: '709-555-0177', resident_id: 'r_frank' } })
  assert.equal(first.status, 201)
  const again = await call('POST', '/api/visitor/signin', { body: { name: 'Pat (SAMPLE)', phone: '+1 (709) 555-0177', resident_id: 'r_rose' }, now: nl('15:05') })
  assert.deepEqual([again.status, again.body],
    [409, { error: 'This phone number is already signed in, since 3:00 PM. Please sign out first.', code: 'already_in' }])
  const carl = await token(PIN.carl, nl('15:05'))
  const desk = await call('POST', '/api/staff/visits', { token: carl, body: { resident_id: 'r_rose', visitor_name: 'Pat (SAMPLE)', visitor_phone: '7095550177' }, now: nl('15:05') })
  assert.deepEqual([desk.status, desk.body.code], [409, 'already_in'])
  await call('POST', `/api/visit/${first.body.token}/signout`, { now: nl('15:06') })
  assert.equal((await call('POST', '/api/visitor/signin', { body: { name: 'Pat (SAMPLE)', phone: '709.555.0177', resident_id: 'r_rose' }, now: nl('15:07') })).status, 201)
})

test('visitor sign-in details: name, phone, resident_id and an unknown resident are refused with their field, and nothing is stored', async () => {
  const cases = [
    [{ name: ' A ', phone: '709-555-0101', resident_id: 'r_frank' }, 400, 'Please type your name.', 'name'],
    [{ name: '1234', phone: '709-555-0101', resident_id: 'r_frank' }, 400, 'Please type your name.', 'name'],
    [{ phone: '709-555-0101', resident_id: 'r_frank' }, 400, 'Please type your name.', 'name'],
    [{ name: 'Pat (SAMPLE)', phone: '555-0101', resident_id: 'r_frank' }, 400, 'Please type a 10-digit phone number, like 709-555-0123.', 'phone'],
    [{ name: 'Pat (SAMPLE)', phone: '709-555-0101' }, 400, 'Please pick who you are visiting.', 'resident_id'],
    [{ name: 'Pat (SAMPLE)', phone: '709-555-0101', resident_id: 'r_nobody' }, 404, "We can't find that resident. Please see the nurse's desk."],
  ]
  for (const [body, status, error, field] of cases) {
    const r = await call('POST', '/api/visitor/signin', { body })
    assert.deepEqual([r.status, r.body], [status, { error, code: status === 404 ? 'not_found' : 'bad_request', ...(field ? { field } : {}) }], JSON.stringify(body))
  }
  assert.equal(visitsInD1(), 0)
  const r = await call('POST', '/api/visitor/signin', { body: { name: '  Pat Power (SAMPLE)  ', phone: '1 709 555 0101', resident_id: 'r_frank' } })
  assert.deepEqual([r.status, r.body.visit.visitor_name], [201, 'Pat Power (SAMPLE)'])
  assert.deepEqual(d1('SELECT phone FROM visits'), [{ phone: '709-555-0101' }])
})

// ---------- in the building: across midnight, overdue ----------

// The events are the brief's. Counted exactly as docs/API.md defines "in the building": at 8:59 PM one Harbour visitor
// (two in at 2:00 PM, one out at 3:00 PM) and one Lighthouse visitor. The brief's "8:59 PM total 3 (Harbour 2)" and
// "9:00 PM total 2" do not add up for these events; see docs/build-report-vl1.md.
test('count across midnight auto sign-out: Harbour auto at 9:00 PM, the late Harbour and the Lighthouse visits auto at 12:00 AM; the day log keeps all four', async () => {
  const a = await visitor('r_mary', nl('14:00'))
  const b = await visitor('r_george', nl('14:00'))
  const carl = await token(PIN.carl, nl('14:00'))
  const aId = allVisits(await building(carl, nl('14:01'))).find((v) => v.visitor_name === a.visit.visitor_name).id
  const bOut = await call('POST', `/api/visit/${b.token}/signout`, { now: nl('15:00') })
  assert.equal(bOut.body.visit.out_kind, 'visitor')
  const l = await visitor('r_frank', nl('20:00'))

  const at859 = await building(carl, nl('20:59'))
  assert.deepEqual([at859.total, counts(at859)], [2, { u_harbour: 1, u_lighthouse: 1, u_cove: 0 }])

  const at9 = await building(carl, nl('21:00'))
  assert.deepEqual([at9.total, counts(at9)], [1, { u_harbour: 0, u_lighthouse: 1, u_cove: 0 }])
  assert.deepEqual(at9.auto_today.map((v) => [v.id, v.out_kind, v.out_label]), [[aId, 'auto', '9:00 PM']])
  assert.equal((await call('GET', `/api/visit/${a.token}`, { now: nl('21:00') })).body.visit.out_kind, 'auto')

  const late = await staffVisit(carl, 'r_mary', nl('22:00'))
  assert.deepEqual(late.warnings.map((w) => w.code), ['outside_hours'])
  assert.deepEqual([late.visit.due_label, late.visit.overdue], ['12:00 AM', false])

  const at1159 = await building(carl, nl('23:59'))
  assert.deepEqual([at1159.total, counts(at1159)], [2, { u_harbour: 1, u_lighthouse: 1, u_cove: 0 }])

  const midnight = nl('00:00', '2026-09-15')
  const at12 = await building(carl, midnight)
  assert.deepEqual([at12.total, counts(at12)], [0, { u_harbour: 0, u_lighthouse: 0, u_cove: 0 }])
  assert.deepEqual(at12.auto_today, [], 'a new day: nothing signed out automatically today yet')

  const log = await dayLog(carl, '2026-09-14', midnight)
  assert.equal(log.count, 4)
  const byName = Object.fromEntries(log.visits.map((v) => [v.visitor_name, [v.out_kind, v.out_label]]))
  assert.deepEqual(byName, {
    [a.visit.visitor_name]: ['auto', '9:00 PM'], [b.visit.visitor_name]: ['visitor', '3:00 PM'],
    [l.visit.visitor_name]: ['auto', '12:00 AM'], [late.visit.visitor_name]: ['auto', '12:00 AM'],
  })
  assert.deepEqual(d1('SELECT out_kind, COUNT(*) AS n FROM visits GROUP BY out_kind ORDER BY out_kind'),
    [{ out_kind: 'auto', n: 3 }, { out_kind: 'visitor', n: 1 }], 'maintenance wrote the automatic sign-outs')
})

test('overdue: Mary\'s visitor in at 11:00 AM → at 11:29 AM not overdue, at 11:30 AM overdue with due_label 11:30 AM; a Lighthouse visitor never overdue', async () => {
  await visitor('r_mary', nl('11:00'))
  await visitor('r_frank', nl('11:00'))
  const carl = await token(PIN.carl, nl('11:00'))
  const view = async (now) => {
    const b = await building(carl, now)
    return { mary: unitOf(b, 'u_harbour').visits[0], frank: unitOf(b, 'u_lighthouse').visits[0] }
  }
  const t1129 = await view(nl('11:29'))
  assert.deepEqual([t1129.mary.overdue, t1129.mary.due_label], [false, '11:30 AM'])
  const t1130 = await view(nl('11:30'))
  assert.deepEqual([t1130.mary.overdue, t1130.mary.due_label, t1130.mary.due_at], [true, '11:30 AM', nl('11:30')])
  assert.deepEqual([t1130.frank.overdue, t1130.frank.due_label], [false, '12:00 AM'])
  const t2059 = await view(nl('20:59'))
  assert.deepEqual([t2059.mary.overdue, t2059.frank.overdue], [true, false], 'still in at 8:59 PM, still overdue')
  const t2359 = await call('GET', '/api/staff/building', { token: await token(PIN.carl, nl('23:59')), now: nl('23:59') })
  assert.equal(unitOf(t2359.body, 'u_lighthouse').visits[0].overdue, false, 'Lighthouse: due at midnight, which is also auto sign-out')
})

test('building: every active unit in order, also with count 0; the StaffVisit shape', async () => {
  const carl = await token(PIN.carl)
  const empty = await building(carl)
  assert.deepEqual(empty.units.map((u) => [u.id, u.name, u.hours_label, u.open_now, u.count, u.visits, u.notices]), [
    ['u_harbour', 'Harbour wing', HARBOUR_HOURS, true, 0, [], []], ['u_lighthouse', 'Lighthouse wing', 'Open all day', true, 0, [], []],
    ['u_cove', 'Cove unit', '10:00 AM to 7:00 PM', true, 0, [], []],
  ])
  assert.deepEqual([empty.now, empty.date_label, empty.time_label, empty.total, empty.auto_today, empty.roll_call],
    [T3PM, 'Mon Sep 14', '3:00 PM', 0, [], null])
  const p = phone()
  await call('POST', '/api/visitor/signin', { body: { name: 'Linda P. (SAMPLE)', phone: p, resident_id: 'r_mary' } })
  const [v] = unitOf(await building(carl, nl('15:01')), 'u_harbour').visits
  assert.match(v.id, /^v_[0-9a-f]{16}$/)
  assert.deepEqual({ ...v, id: 'x' }, {
    id: 'x', visitor_name: 'Linda P. (SAMPLE)', visitor_phone: p, resident: { id: 'r_mary', name: 'Mary S. (SAMPLE)', room: '101' },
    unit: { id: 'u_harbour', name: 'Harbour wing' }, date: '2026-09-14', date_label: 'Mon Sep 14', in_at: T3PM, in_label: '3:00 PM',
    due_at: nl('21:00'), due_label: '9:00 PM', overdue: false, out_at: null, out_label: null, out_kind: null, method: 'qr',
    signed_in_by: null, screened: false,
  })
  assert.deepEqual(SAMPLE_UNITS, (await building(carl, nl('15:02'))).units.map((u) => u.id))
})

// ---------- the sign-out link ----------

test('sign-out link: the token is 43 base64url characters and D1 holds only its SHA-256', async () => {
  const v = await visitor('r_frank')
  assert.match(v.token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(v.out_url, `/out/?t=${v.token}`)
  assert.deepEqual(d1('SELECT token_hash FROM visits'), [{ token_hash: sha256(v.token) }])
  assert.equal(JSON.stringify(d1('SELECT * FROM visits')).includes(v.token), false, 'the token itself is nowhere in D1')
})

test('sign-out link: works until 11:59:59 PM, 410 at 12:00:00 AM on both routes', async () => {
  const v = await visitor('r_frank', nl('21:00'))
  const ok = await call('GET', `/api/visit/${v.token}`, { now: nl('23:59:59') })
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.deepEqual(ok.body.visit, {
    state: 'in', home_name: HOME, visitor_name: v.visit.visitor_name, resident: { name: 'Frank O. (SAMPLE)', room: '201', unit_name: 'Lighthouse wing' },
    date: '2026-09-14', date_label: 'Mon Sep 14', in_at: nl('21:00'), in_label: '9:00 PM', out_at: null, out_label: null, out_kind: null,
    home_notices: [], unit_notices: [], link_expires_at: '2026-09-15T02:30:00.000Z',
  })
  const EXPIRED = { error: LINK_EXPIRED, code: 'link_expired' }
  const gone = await call('GET', `/api/visit/${v.token}`, { now: nl('00:00:00', '2026-09-15') })
  assert.deepEqual([gone.status, gone.body], [410, EXPIRED])
  const tap = await call('POST', `/api/visit/${v.token}/signout`, { now: nl('00:00:00', '2026-09-15') })
  assert.deepEqual([tap.status, tap.body], [410, EXPIRED])
})

test('sign-out link: unknown token 404; sign out → out_kind visitor; again → already_out and out_at unchanged', async () => {
  for (const method of ['GET', 'POST']) {
    const r = await call(method, `/api/visit/${'A'.repeat(43)}${method === 'POST' ? '/signout' : ''}`)
    assert.deepEqual([r.status, r.body], [404, { error: VISIT_MISSING, code: 'not_found' }], method)
  }
  const v = await visitor('r_frank')
  const out = await call('POST', `/api/visit/${v.token}/signout`, { now: nl('15:40') })
  assert.equal(out.status, 200)
  assert.deepEqual([out.body.already_out, out.body.visit.state, out.body.visit.out_kind, out.body.visit.out_at, out.body.visit.out_label],
    [false, 'out', 'visitor', nl('15:40'), '3:40 PM'])
  const again = await call('POST', `/api/visit/${v.token}/signout`, { now: nl('15:45') })
  assert.deepEqual([again.status, again.body.already_out, again.body.visit.out_at, again.body.visit.out_kind], [200, true, nl('15:40'), 'visitor'])
  assert.equal((await call('GET', `/api/visit/${v.token}`, { now: nl('15:50') })).body.visit.state, 'out')
  assert.equal((await building(await token(PIN.carl, nl('15:50')), nl('15:50'))).total, 0)
})

test('sign-out link: a Harbour visitor who taps Sign out at 9:05 PM after closing → already_out true, out_kind auto at 9:00 PM', async () => {
  const v = await visitor('r_mary')
  const r = await call('POST', `/api/visit/${v.token}/signout`, { now: nl('21:05') })
  assert.equal(r.status, 200)
  assert.deepEqual([r.body.already_out, r.body.visit.state, r.body.visit.out_kind, r.body.visit.out_label, r.body.visit.out_at],
    [true, 'out', 'auto', '9:00 PM', nl('21:00')])
  const carl = await token(PIN.carl, nl('21:06'))
  assert.deepEqual((await dayLog(carl, '2026-09-14', nl('21:06'))).visits.map((x) => x.out_kind), ['auto'], 'the day stays as it was')
})

test('staff sign-out: 200 with out_kind staff, then 409 not_in; unknown visit 404; an auto-signed-out visit is 409', async () => {
  const carl = await token(PIN.carl)
  await visitor('r_frank')
  const [v] = unitOf(await building(carl), 'u_lighthouse').visits
  const out = await call('POST', `/api/staff/visits/${v.id}/signout`, { token: carl, now: nl('15:10') })
  assert.equal(out.status, 200, JSON.stringify(out.body))
  assert.deepEqual([out.body.visit.out_kind, out.body.visit.out_label, out.body.visit.id], ['staff', '3:10 PM', v.id])
  const again = await call('POST', `/api/staff/visits/${v.id}/signout`, { token: carl, now: nl('15:11') })
  assert.deepEqual([again.status, again.body], [409, { error: 'That visitor is already signed out.', code: 'not_in' }])
  const missing = await call('POST', '/api/staff/visits/v_nobody/signout', { token: carl, now: nl('15:11') })
  assert.deepEqual([missing.status, missing.body.code], [404, 'not_found'])
  await visitor('r_mary', nl('15:12'))
  const [m] = unitOf(await building(carl, nl('15:12')), 'u_harbour').visits
  const afterClose = await call('POST', `/api/staff/visits/${m.id}/signout`, { token: carl, now: nl('21:00') })
  assert.deepEqual([afterClose.status, afterClose.body.code], [409, 'not_in'])
})

// ---------- retention ----------

test('retention: age 30 kept — the Aug 1 visit is in the day log at Aug 31 11:59 PM, and at Sep 1 12:00 AM it is gone from the day log and from D1', async () => {
  await visitor('r_frank', nl('15:00', '2026-08-01'))
  await visitor('r_rose', nl('15:00', '2026-08-15'))
  const carl = await token(PIN.carl, nl('15:00', '2026-08-31'))
  assert.equal((await dayLog(carl, '2026-08-01', nl('15:00', '2026-08-31'))).count, 1, 'Aug 31: age 30, kept')
  assert.equal((await dayLog(carl, '2026-08-01', nl('23:59:59', '2026-08-31'))).count, 1, 'Aug 31 11:59:59 PM: still kept')
  assert.deepEqual(d1('SELECT date FROM visits ORDER BY date'), [{ date: '2026-08-01' }, { date: '2026-08-15' }])
  const sep1 = nl('00:00', '2026-09-01')
  assert.equal((await dayLog(carl, '2026-08-01', sep1)).count, 0, 'Sep 1: age 31, gone from the day log')
  assert.deepEqual(d1('SELECT date FROM visits ORDER BY date'), [{ date: '2026-08-15' }], 'and deleted from D1')
  assert.equal((await dayLog(carl, '2026-08-15', sep1)).count, 1)
})

test('retention: the manager sets 7; at Aug 23 the Aug 15 visit (age 8) is gone from the day log and D1 and the Aug 16 visit (age 7) is kept', async () => {
  await visitor('r_frank', nl('15:00', '2026-08-15'))
  await visitor('r_rose', nl('15:00', '2026-08-16'))
  const donna = await token(PIN.donna, nl('10:00', '2026-08-23'))
  const set = await call('PUT', '/api/settings/home', { token: donna, body: { retention_days: 7 }, now: nl('10:00', '2026-08-23') })
  assert.equal(set.status, 200, JSON.stringify(set.body))
  assert.equal(set.body.settings.home.retention_days, 7)
  assert.equal((await call('GET', '/api/info', { now: nl('10:00', '2026-08-23') })).body.retention_days, 7)
  const carl = await token(PIN.carl, nl('10:05', '2026-08-23'))
  assert.equal((await dayLog(carl, '2026-08-15', nl('10:05', '2026-08-23'))).count, 0, 'Aug 15 is age 8')
  assert.equal((await dayLog(carl, '2026-08-16', nl('10:05', '2026-08-23'))).count, 1, 'Aug 16 is age 7')
  assert.deepEqual(d1('SELECT date FROM visits ORDER BY date'), [{ date: '2026-08-16' }])
})

test('retention: 0 and 366 → 400 field retention_days with the exact message; 1 and 365 are saved', async () => {
  const donna = await token(PIN.donna)
  for (const days of [0, 366, -1, 7.5, 'seven', null]) {
    const r = await call('PUT', '/api/settings/home', { token: donna, body: { retention_days: days } })
    assert.deepEqual([r.status, r.body], [400, { error: 'Keep visitor records for 1 to 365 days.', code: 'bad_request', field: 'retention_days' }], String(days))
  }
  for (const days of [1, 365]) {
    assert.equal((await call('PUT', '/api/settings/home', { token: donna, body: { retention_days: days } })).body.settings.home.retention_days, days)
  }
})

test('test maintenance: returns what it signed out and deleted; a second run finds nothing', async () => {
  await visitor('r_frank', nl('15:00', '2026-08-01'))
  await visitor('r_mary', nl('15:00'))
  await visitor('r_rose', nl('15:00'))
  const first = await call('POST', '/api/test/maintenance', { now: nl('21:00') })
  assert.deepEqual([first.status, first.body], [200, { auto_signed_out: 2, deleted_visits: 1, deleted_roll_calls: 0 }],
    'Aug 1 (auto, then past retention) and Mary (9:00 PM) signed out; Aug 1 deleted; Rose is in until midnight')
  const second = await call('POST', '/api/test/maintenance', { now: nl('21:00') })
  assert.deepEqual(second.body, { auto_signed_out: 0, deleted_visits: 0, deleted_roll_calls: 0 })
  assert.deepEqual(d1('SELECT resident_id, out_kind FROM visits ORDER BY resident_id'),
    [{ resident_id: 'r_mary', out_kind: 'auto' }, { resident_id: 'r_rose', out_kind: null }])
})

// ---------- settings: home, notices ----------

test('settings: the whole object — home, questions, units in order, residents by first name, notices, staff', async () => {
  const donna = await token(PIN.donna)
  const s = (await call('GET', '/api/settings', { token: donna })).body.settings
  assert.deepEqual(Object.keys(s), ['home', 'screening_questions', 'units', 'residents', 'notices', 'staff'])
  assert.deepEqual(s.home, {
    home_name: HOME, phone: '709-555-0142', sample: true, retention_days: 30, max_visitors_per_resident: 2, after_hours_message: AFTER_HOURS,
    desk_message: DESK, screening_enabled: false, screening_stop_message: '',
  })
  assert.deepEqual(s.units[0], {
    id: 'u_harbour', name: 'Harbour wing', hours: [{ open: '08:00', close: '11:30' }, { open: '13:30', close: '21:00' }], hours_label: HARBOUR_HOURS, active: true,
  })
  assert.deepEqual(s.units.map((u) => u.id), SAMPLE_UNITS)
  assert.deepEqual(s.residents.map((r) => r.first_name), ['Agnes', 'Bill', 'Ellen', 'Frank', 'George', 'Margaret', 'Mary', 'Rose', 'Walter'])
  assert.deepEqual(s.residents.find((r) => r.id === 'r_ellen'),
    { id: 'r_ellen', first_name: 'Ellen', last_initial: 'W', name: 'Ellen W. (SAMPLE)', room: '108', unit_id: 'u_harbour', by_arrangement: true, active: true })
  assert.deepEqual(s.notices, [])
  assert.deepEqual(s.staff.map((x) => [x.id, x.role, x.active]), [['s_amira', 'staff', true], ['s_carl', 'staff', true], ['s_donna', 'manager', true]])
  assert.equal(JSON.stringify(s).includes('pin'), false, 'no PIN hash or salt in the settings')
})

test('settings home: each field validated (phone, retention, visitor limit, both messages); good values saved', async () => {
  const donna = await token(PIN.donna)
  const put = (body) => call('PUT', '/api/settings/home', { token: donna, body })
  const refusals = [
    [{ phone: '555' }, 'phone', 'Please type a 10-digit phone number, like 709-555-0123.'],
    [{ max_visitors_per_resident: 0 }, 'max_visitors_per_resident'], [{ max_visitors_per_resident: 21 }, 'max_visitors_per_resident'],
    [{ max_visitors_per_resident: 1.5 }, 'max_visitors_per_resident'],
    [{ after_hours_message: '' }, 'after_hours_message'], [{ after_hours_message: 'x'.repeat(301) }, 'after_hours_message'],
    [{ desk_message: '   ' }, 'desk_message'], [{ desk_message: 42 }, 'desk_message'],
    [{ retention_days: 7, desk_message: '' }, 'desk_message'],
  ]
  for (const [body, field, error] of refusals) {
    const r = await put(body)
    assert.deepEqual([r.status, r.body.field, r.body.code], [400, field, 'bad_request'], JSON.stringify(body).slice(0, 60))
    if (error) assert.equal(r.body.error, error)
  }
  assert.equal((await call('GET', '/api/settings', { token: donna })).body.settings.home.retention_days, 30, 'a refused write saves nothing')
  const ok = await put({ phone: '(709) 555-0199', retention_days: 14, max_visitors_per_resident: 3, after_hours_message: 'SAMPLE: we are closed.', desk_message: 'SAMPLE: ask at the desk.' })
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.deepEqual(ok.body.settings.home, {
    home_name: HOME, phone: '709-555-0199', sample: true, retention_days: 14, max_visitors_per_resident: 3,
    after_hours_message: 'SAMPLE: we are closed.', desk_message: 'SAMPLE: ask at the desk.', screening_enabled: false, screening_stop_message: '',
  })
  assert.equal((await put({ phone: '' })).body.settings.home.phone, '', 'no phone is allowed')
  assert.equal((await call('GET', '/api/visitor/start')).body.retention_days, 14)
  assert.equal((await signin('r_ellen')).body.error, 'Visits with Ellen W. (SAMPLE) are by arrangement only. SAMPLE: ask at the desk.')
})

test('settings notices: message, severity and unit validated; update, delete, unknown 404; visitors see outbreak, restricted, info, then newest first', async () => {
  const donna = await token(PIN.donna)
  const post = (body, now = T3PM) => call('POST', '/api/settings/notices', { token: donna, body, now })
  for (const [body, field] of [
    [{ unit_id: null, severity: 'info', message: '' }, 'message'], [{ unit_id: null, severity: 'info', message: 'x'.repeat(301) }, 'message'],
    [{ unit_id: null, severity: 'info' }, 'message'], [{ unit_id: null, severity: 'loud', message: 'SAMPLE' }, 'severity'],
    [{ unit_id: null, message: 'SAMPLE' }, 'severity'],
  ]) {
    const r = await post(body)
    assert.deepEqual([r.status, r.body.field], [400, field], JSON.stringify(body).slice(0, 60))
  }
  const noUnit = await post({ unit_id: 'u_nowhere', severity: 'info', message: 'SAMPLE' })
  assert.deepEqual([noUnit.status, noUnit.body], [404, { error: "We can't find that unit.", code: 'not_found' }])
  const created = await post({ unit_id: null, severity: 'info', message: '  SAMPLE: first info.  ' })
  assert.equal(created.status, 201)
  assert.match(created.body.id, /^n_[0-9a-f]{16}$/)
  assert.deepEqual(created.body.settings.notices, [{
    id: created.body.id, unit: null, severity: 'info', severity_label: 'Notice', message: 'SAMPLE: first info.', active: true, created_at: T3PM,
    created_label: 'Mon Sep 14, 3:00 PM',
  }])
  const id = created.body.id
  const put = (body, nid = id) => call('PUT', `/api/settings/notices/${nid}`, { token: donna, body })
  assert.equal((await put({ severity: 'bad' })).body.field, 'severity')
  assert.equal((await put({ active: 'no' })).body.field, 'active')
  assert.equal((await put({ message: '' })).body.field, 'message')
  assert.equal((await put({ unit_id: 'u_nowhere' })).status, 404)
  assert.deepEqual((await put({ unit_id: 'u_cove', severity: 'restricted', message: 'SAMPLE: Cove closed.' })).body.settings.notices[0],
    { id, unit: { id: 'u_cove', name: 'Cove unit' }, severity: 'restricted', severity_label: 'Visiting restricted', message: 'SAMPLE: Cove closed.', active: true, created_at: T3PM, created_label: 'Mon Sep 14, 3:00 PM' })
  assert.equal((await put({ unit_id: null })).body.settings.notices[0].unit, null)
  assert.deepEqual([(await put({}, 'n_nobody')).status, (await put({}, 'n_nobody')).body.error], [404, "We can't find that notice."])
  const del = await call('DELETE', `/api/settings/notices/${id}`, { token: donna })
  assert.deepEqual([del.status, del.body.settings.notices], [200, []])
  assert.equal((await call('DELETE', `/api/settings/notices/${id}`, { token: donna })).status, 404)

  await post({ unit_id: null, severity: 'info', message: 'SAMPLE: older info.' }, nl('15:01'))
  await post({ unit_id: null, severity: 'outbreak', message: 'SAMPLE: outbreak.' }, nl('15:02'))
  await post({ unit_id: null, severity: 'info', message: 'SAMPLE: newer info.' }, nl('15:03'))
  await post({ unit_id: null, severity: 'restricted', message: 'SAMPLE: restricted.' }, nl('15:04'))
  assert.deepEqual((await call('GET', '/api/visitor/start', { now: nl('15:05') })).body.home_notices.map((n) => n.message),
    ['SAMPLE: outbreak.', 'SAMPLE: restricted.', 'SAMPLE: newer info.', 'SAMPLE: older info.'])
  assert.deepEqual((await call('GET', '/api/settings', { token: donna, now: nl('15:05') })).body.settings.notices.map((n) => n.message),
    ['SAMPLE: restricted.', 'SAMPLE: newer info.', 'SAMPLE: outbreak.', 'SAMPLE: older info.'], 'settings: newest first')
})

// ---------- staff: residents, signing in, the day log ----------

test('staff residents: screening flag, units with restricted, active residents by first name with by_arrangement', async () => {
  const carl = await token(PIN.carl)
  const r = await call('GET', '/api/staff/residents', { token: carl })
  assert.equal(r.status, 200)
  assert.equal(r.body.screening_enabled, false)
  assert.deepEqual(r.body.units[0], { id: 'u_harbour', name: 'Harbour wing', hours_label: HARBOUR_HOURS, open_now: true, restricted: false })
  assert.deepEqual(r.body.residents.map((x) => x.name).slice(0, 3), ['Agnes D. (SAMPLE)', 'Bill H. (SAMPLE)', 'Ellen W. (SAMPLE)'])
  assert.deepEqual(r.body.residents.find((x) => x.id === 'r_ellen'), { id: 'r_ellen', name: 'Ellen W. (SAMPLE)', room: '108', unit_id: 'u_harbour', by_arrangement: true })
})

test('staff sign-in: visitor_name and visitor_phone validated; unknown resident 404; screening on needs screened; warnings listed in order', async () => {
  const carl = await token(PIN.carl)
  const post = (body, now = T3PM) => call('POST', '/api/staff/visits', { token: carl, body, now })
  assert.deepEqual((await post({ resident_id: 'r_mary', visitor_name: ' ' })).body, { error: 'Please type your name.', code: 'bad_request', field: 'visitor_name' })
  assert.deepEqual((await post({ resident_id: 'r_mary', visitor_name: 'Pat (SAMPLE)', visitor_phone: '12' })).body,
    { error: 'Please type a 10-digit phone number, like 709-555-0123.', code: 'bad_request', field: 'visitor_phone' })
  assert.deepEqual((await post({ resident_id: 'r_nobody', visitor_name: 'Pat (SAMPLE)' })).body, { error: "We can't find that resident.", code: 'not_found' })
  const withPhone = await post({ resident_id: 'r_frank', visitor_name: 'Pat (SAMPLE)', visitor_phone: '709 555 0166' })
  assert.deepEqual([withPhone.status, withPhone.body.visit.visitor_phone, withPhone.body.warnings], [201, '709-555-0166', []])

  const donna = await token(PIN.donna)
  await call('PUT', '/api/settings/screening', { token: donna, body: { enabled: true, stop_message: 'SAMPLE: go home.', questions: [{ text: 'SAMPLE question?' }] } })
  const unscreened = await post({ resident_id: 'r_frank', visitor_name: 'Kid (SAMPLE)' }, nl('15:01'))
  assert.deepEqual([unscreened.status, unscreened.body], [400, {
    error: 'Ask the screening questions first. Only sign in a visitor who answered No to every one.', code: 'bad_request', field: 'screened',
  }])
  const screened = await post({ resident_id: 'r_frank', visitor_name: 'Kid (SAMPLE)', screened: true }, nl('15:01'))
  assert.deepEqual([screened.status, screened.body.visit.screened], [201, true])
  await call('PUT', '/api/settings/screening', { token: donna, body: { enabled: false }, now: nl('15:02') })

  await addNotice(donna, 'u_harbour', 'restricted', 'SAMPLE: Harbour closed.', nl('15:02'))
  await staffVisit(carl, 'r_ellen', nl('22:00'))
  await staffVisit(carl, 'r_ellen', nl('22:00'))
  const all = await staffVisit(carl, 'r_ellen', nl('22:01'))
  assert.deepEqual(all.warnings.map((w) => w.code), ['by_arrangement', 'restricted_unit', 'outside_hours', 'resident_full'])
  assert.equal(all.warnings[2].message, OUTSIDE_HARBOUR)
  assert.equal(all.visit.overdue, false)
})

test('day log: today by default, the unit filter, a bad date 400, an unknown unit 404', async () => {
  const carl = await token(PIN.carl)
  await visitor('r_mary')
  await visitor('r_frank', nl('15:01'))
  const log = await call('GET', '/api/staff/visits', { token: carl, now: nl('15:02') })
  assert.deepEqual([log.status, log.body.date, log.body.date_label, log.body.unit, log.body.count], [200, '2026-09-14', 'Mon Sep 14', 'all', 2])
  assert.deepEqual(log.body.visits.map((v) => v.resident.id), ['r_mary', 'r_frank'], 'oldest first')
  const harbour = await dayLog(carl, '2026-09-14', nl('15:02'), 'u_harbour')
  assert.deepEqual([harbour.unit, harbour.count, harbour.visits[0].resident.id], ['u_harbour', 1, 'r_mary'])
  assert.equal((await dayLog(carl, '2026-09-13', nl('15:02'))).count, 0)
  for (const date of ['2026-02-30', 'yesterday', '2026-9-14']) {
    const r = await call('GET', `/api/staff/visits?date=${date}`, { token: carl, now: nl('15:02') })
    assert.deepEqual([r.status, r.body.field], [400, 'date'], date)
  }
  const unit = await call('GET', '/api/staff/visits?unit=u_nowhere', { token: carl, now: nl('15:02') })
  assert.deepEqual([unit.status, unit.body], [404, { error: "We can't find that unit.", code: 'not_found' }])
})

test('unknown API paths → 404 not_found in the error shape', async () => {
  const r = await call('GET', '/api/nothing-here')
  assert.deepEqual([r.status, r.body], [404, { error: 'There is nothing here.', code: 'not_found' }])
  assert.equal((await call('DELETE', '/api/info')).status, 404)
  const badJson = await fetch(`${process.env.API_BASE || 'http://127.0.0.1:8402'}/api/visitor/signin`, { method: 'POST', body: '{not json', headers: { 'X-Test-Now': T3PM } })
  assert.deepEqual([badJson.status, (await badJson.json()).field], [400, 'body'])
})
