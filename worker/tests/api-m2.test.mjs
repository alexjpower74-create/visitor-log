// M2 API suite against a real local Worker in TEST_MODE: the staff sign-in order, units, residents and staff settings, roll call,
// contacts JSON and CSV, and the demo seed. Every test starts from a fresh SAMPLE home; within a test X-Test-Now only moves forward.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { DEMO_INFO, DEMO_OUTBREAK } from '../src/seed.js'
import { addDays } from '../src/time.js'
import { BASE, building, call, counts, d1, dayLog, nl, phone, PIN, reset, staffVisit, T3PM, token, unitOf, visitor } from './api-helpers.mjs'

beforeEach(reset)

const HOURS_MSG = "Visiting hours need a start before the end, and the times can't overlap."
const HEADER = 'Date,Unit,Resident,Room,Visitor,Phone,In,Out,Signed out,Signed in by'
const settingsOf = async (tok, now = T3PM) => (await call('GET', '/api/settings', { token: tok, now })).body.settings
const search = async (q, now = T3PM) => (await call('GET', `/api/visitor/residents?q=${encodeURIComponent(q)}`, { now })).body.residents

async function csvGet(qs, tok, now) {
  const r = await fetch(`${BASE}/api/staff/contacts.csv?${qs}`, { headers: { Authorization: `Bearer ${tok}`, 'X-Test-Now': now } })
  return { status: r.status, text: await r.text(), type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition') }
}

// The test's own CSV reader (one line, quoted fields with doubled quotes).
function parseCsvLine(line) {
  const out = []
  let i = 0
  while (i <= line.length) {
    if (line[i] === '"') {
      let s = ''
      i++
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { s += '"'; i += 2 } else { i++; break }
        } else s += line[i++]
      }
      out.push(s)
      i++
    } else {
      const j = line.indexOf(',', i)
      const end = j === -1 ? line.length : j
      out.push(line.slice(i, end))
      i = end + 1
    }
  }
  return out
}

// ---------- staff sign-in order ----------

test('staff sign-in order: no resident and no name → the resident_id error first; then the name, the phone, an unknown resident, screened, already_in', async () => {
  const carl = await token(PIN.carl)
  const post = (body, now = T3PM) => call('POST', '/api/staff/visits', { token: carl, body, now })
  const PICK = { error: 'Please pick who they are visiting.', code: 'bad_request', field: 'resident_id' }
  for (const body of [{}, { resident_id: '', visitor_name: '', visitor_phone: '12' }, { visitor_name: 'Pat (SAMPLE)' }, { resident_id: 7, visitor_name: '' }]) {
    const r = await post(body)
    assert.deepEqual([r.status, r.body], [400, PICK], JSON.stringify(body))
  }
  assert.deepEqual((await post({ resident_id: 'r_nobody', visitor_name: ' ', visitor_phone: '12' })).body,
    { error: 'Please type their name.', code: 'bad_request', field: 'visitor_name' })
  assert.equal((await post({ resident_id: 'r_nobody', visitor_name: 'Pat (SAMPLE)', visitor_phone: '12' })).body.field, 'visitor_phone')
  const missing = await post({ resident_id: 'r_nobody', visitor_name: 'Pat (SAMPLE)', visitor_phone: '' })
  assert.deepEqual([missing.status, missing.body.code], [404, 'not_found'])

  await staffVisit(carl, 'r_frank', T3PM, { visitor_phone: '709-555-0188' })
  const donna = await token(PIN.donna)
  const on = await call('PUT', '/api/settings/screening',
    { token: donna, body: { enabled: true, stop_message: 'SAMPLE: go home.', questions: [{ text: 'SAMPLE question?' }] }, now: nl('15:01') })
  assert.equal(on.status, 200)
  const body = { resident_id: 'r_rose', visitor_name: 'Pat (SAMPLE)', visitor_phone: '709-555-0188' }
  assert.equal((await post(body, nl('15:02'))).body.field, 'screened', 'screened before already_in')
  assert.equal((await post({ ...body, screened: true }, nl('15:02'))).body.code, 'already_in')
})

// ---------- units ----------

test('units: add with two windows, one to 24:00; each field validated; a name taken; an edit that keeps its own name', async () => {
  const donna = await token(PIN.donna)
  const post = (body) => call('POST', '/api/settings/units', { token: donna, body })
  const OK_HOURS = [{ open: '09:00', close: '17:00' }]
  const refusals = [
    [{ hours: OK_HOURS }, 'name', 'Give the unit a name of 1 to 40 characters.'],
    [{ name: '   ', hours: OK_HOURS }, 'name'],
    [{ name: 'x'.repeat(41), hours: OK_HOURS }, 'name'],
    [{ name: 'harbour WING', hours: OK_HOURS }, 'name', 'Another open unit already has that name.'],
    [{ name: 'Bay unit' }, 'hours', HOURS_MSG],
    [{ name: 'Bay unit', hours: [] }, 'hours', HOURS_MSG],
    [{ name: 'Bay unit', hours: [{ open: '09:00', close: '12:00' }, { open: '11:00', close: '14:00' }] }, 'hours', HOURS_MSG],
    [{ name: 'Bay unit', hours: [{ open: '12:00', close: '12:00' }] }, 'hours'],
    [{ name: 'Bay unit', hours: [{ open: '9:00', close: '12:00' }] }, 'hours'],
    [{ name: 'Bay unit', hours: [{ open: '', close: '' }] }, 'hours'],
    [{ name: 'Bay unit', hours: [{ open: '18:00', close: '00:00' }] }, 'hours', HOURS_MSG],
    [{ name: 'Bay unit', hours: ['01', '03', '05', '07', '09'].map((h) => ({ open: `${h}:00`, close: `${h}:30` })) }, 'hours'],
  ]
  for (const [body, field, error] of refusals) {
    const r = await post(body)
    assert.deepEqual([r.status, r.body.field, r.body.code], [400, field, 'bad_request'], JSON.stringify(body))
    if (error) assert.equal(r.body.error, error)
  }
  assert.equal((await settingsOf(donna)).units.length, 3, 'a refusal adds nothing')
  const added = await post({ name: '  Bay unit ', hours: [{ open: '18:00', close: '24:00' }, { open: '09:00', close: '12:00' }] })
  assert.equal(added.status, 201, JSON.stringify(added.body))
  assert.match(added.body.id, /^u_[0-9a-f]{16}$/)
  assert.deepEqual(added.body.settings.units.at(-1), {
    id: added.body.id, name: 'Bay unit', hours: [{ open: '09:00', close: '12:00' }, { open: '18:00', close: '24:00' }],
    hours_label: '9:00 AM to 12:00 PM and 6:00 PM to midnight', active: true,
  })
  const carl = await token(PIN.carl)
  assert.deepEqual((await building(carl)).units.map((u) => u.id), ['u_harbour', 'u_lighthouse', 'u_cove', added.body.id], 'a new unit goes last')
  const put = (id, body) => call('PUT', `/api/settings/units/${id}`, { token: donna, body })
  const edit = await put(added.body.id, { name: 'Bay unit', hours: [{ open: '00:00', close: '24:00' }] })
  assert.equal(edit.status, 200, 'an edit that sends its own name back is fine')
  assert.equal(edit.body.settings.units.at(-1).hours_label, 'Open all day')
  assert.equal((await put(added.body.id, { name: 'Cove Unit' })).body.field, 'name')
  assert.equal((await put(added.body.id, { hours: 'all day' })).body.field, 'hours')
  assert.equal((await put(added.body.id, { active: 'no' })).body.field, 'active')
  const missing = await put('u_nowhere', { name: 'X' })
  assert.deepEqual([missing.status, missing.body], [404, { error: "We can't find that unit.", code: 'not_found' }])
})

test('units: closing a unit with residents → 409; once closed its residents are not found and cannot come back to it; new hours do not move a visit already in', async () => {
  const donna = await token(PIN.donna)
  const carl = await token(PIN.carl)
  const put = (id, body, now = T3PM) => call('PUT', `/api/settings/units/${id}`, { token: donna, body, now })
  const agnes = await visitor('r_agnes') // Cove unit 10:00 AM to 7:00 PM: due and auto sign-out at 7:00 PM
  const closing = await put('u_cove', { active: false })
  assert.deepEqual([closing.status, closing.body], [409, { error: 'Move or remove the residents on this unit first.', code: 'bad_state' }])
  assert.equal((await put('u_cove', { hours: [{ open: '10:00', close: '16:00' }] }, nl('15:01'))).status, 200)
  assert.equal((await call('GET', '/api/visitor/residents/r_agnes', { now: nl('15:02') })).body.resident.unit.hours_label, '10:00 AM to 4:00 PM')
  const at1630 = await building(carl, nl('16:30'))
  assert.deepEqual([unitOf(at1630, 'u_cove').count, unitOf(at1630, 'u_cove').visits[0].due_label], [1, '7:00 PM'], 'the visit keeps the times it was given')
  assert.equal((await call('POST', `/api/visit/${agnes.token}/signout`, { now: nl('16:31') })).status, 200)
  for (const id of ['r_agnes', 'r_bill']) {
    assert.equal((await call('PUT', `/api/settings/residents/${id}`, { token: donna, body: { active: false }, now: nl('16:32') })).status, 200)
  }
  const closed = await put('u_cove', { active: false }, nl('16:33'))
  assert.equal(closed.status, 200, JSON.stringify(closed.body))
  assert.equal(closed.body.settings.units.find((u) => u.id === 'u_cove').active, false)
  const now = nl('16:34')
  assert.deepEqual((await building(carl, now)).units.map((u) => u.id), ['u_harbour', 'u_lighthouse'])
  assert.deepEqual((await call('GET', '/api/staff/residents', { token: carl, now })).body.units.map((u) => u.id), ['u_harbour', 'u_lighthouse'])
  assert.deepEqual(await search('ag', now), [])
  assert.equal((await call('GET', '/api/visitor/residents/r_agnes', { now })).status, 404)
  const back = await call('PUT', '/api/settings/residents/r_agnes', { token: donna, body: { active: true }, now })
  assert.deepEqual([back.status, back.body], [400, { error: 'Pick an open unit.', code: 'bad_request', field: 'unit_id' }])
  const reuse = await call('POST', '/api/settings/units', { token: donna, body: { name: 'Cove unit', hours: [{ open: '10:00', close: '19:00' }] }, now })
  assert.equal(reuse.status, 201, "a closed unit's name is free")
  assert.equal((await put('u_cove', { active: true }, now)).body.field, 'name', 'and the old unit cannot reopen under it')
  assert.equal((await dayLog(carl, '2026-09-14', now, 'u_cove')).count, 1, 'the day log still has its visits')
})

// ---------- residents ----------

test('residents: each field validated; the initial upper-cased; found by name and room; moved and made by arrangement; unknown 404', async () => {
  const donna = await token(PIN.donna)
  const post = (body) => call('POST', '/api/settings/residents', { token: donna, body })
  const base = { first_name: 'Olive', last_initial: 'o', room: '106', unit_id: 'u_harbour', by_arrangement: false }
  const refusals = [
    [{ first_name: '' }, 'first_name'], [{ first_name: 'x'.repeat(31) }, 'first_name'], [{ first_name: 'Ol1ve' }, 'first_name'],
    [{ first_name: "-'-" }, 'first_name'], [{ last_initial: '' }, 'last_initial'], [{ last_initial: 'ob' }, 'last_initial'],
    [{ last_initial: '1' }, 'last_initial'], [{ room: '' }, 'room'], [{ room: '12345678901' }, 'room'], [{ room: '10#' }, 'room'],
    [{ unit_id: 'u_nowhere' }, 'unit_id'], [{ unit_id: '' }, 'unit_id'], [{ by_arrangement: 'yes' }, 'by_arrangement'],
  ]
  for (const [change, field] of refusals) {
    const r = await post({ ...base, ...change })
    assert.deepEqual([r.status, r.body.field], [400, field], JSON.stringify(change))
  }
  assert.equal((await post({ ...base, first_name: '' })).body.error, 'Type a first name of 1 to 30 letters. Spaces, hyphens and apostrophes are fine.')
  assert.equal((await settingsOf(donna)).residents.length, 9, 'a refusal adds nothing')
  const added = await post(base)
  assert.equal(added.status, 201, JSON.stringify(added.body))
  const id = added.body.id
  assert.deepEqual(added.body.settings.residents.find((r) => r.id === id), {
    id, first_name: 'Olive', last_initial: 'O', name: 'Olive O. (SAMPLE)', room: '106', unit_id: 'u_harbour', by_arrangement: false, active: true,
  })
  for (const first of ['Mary-Jo', "D'Arcy", 'Zoë Anne']) assert.equal((await post({ ...base, first_name: first, room: '107' })).status, 201, first)
  const found = { id, name: 'Olive O. (SAMPLE)', room: '106', unit: { id: 'u_harbour', name: 'Harbour wing' } }
  assert.deepEqual(await search('ol'), [found])
  assert.deepEqual(await search('olive o'), [found])
  assert.deepEqual(await search('106'), [found])
  const moved = await call('PUT', `/api/settings/residents/${id}`, { token: donna, body: { unit_id: 'u_lighthouse', by_arrangement: true, last_initial: 'q', room: '220' } })
  assert.equal(moved.status, 200, JSON.stringify(moved.body))
  const answer = (await call('GET', `/api/visitor/residents/${id}`)).body
  assert.deepEqual([answer.resident.name, answer.resident.room, answer.resident.unit.name, answer.reason], ['Olive Q. (SAMPLE)', '220', 'Lighthouse wing', 'by_arrangement'])
  assert.equal((await call('PUT', `/api/settings/residents/${id}`, { token: donna, body: { active: 'no' } })).body.field, 'active')
  assert.equal((await call('PUT', '/api/settings/residents/r_nobody', { token: donna, body: { room: '1' } })).status, 404)
})

test('search: an inactive resident is not found', async () => {
  const donna = await token(PIN.donna)
  const carl = await token(PIN.carl)
  assert.deepEqual((await search('mary')).map((r) => r.id), ['r_mary'])
  const off = await call('PUT', '/api/settings/residents/r_mary', { token: donna, body: { active: false } })
  assert.equal(off.status, 200)
  assert.equal(off.body.settings.residents.find((r) => r.id === 'r_mary').active, false, 'still listed in settings')
  assert.deepEqual(await search('mary'), [])
  assert.deepEqual((await search('10')).map((r) => r.id), ['r_ellen', 'r_george'])
  const answer = await call('GET', '/api/visitor/residents/r_mary')
  assert.deepEqual([answer.status, answer.body.error], [404, "We can't find that resident. Please see the nurse's desk."])
  assert.equal((await call('POST', '/api/visitor/signin', { body: { name: 'Pat (SAMPLE)', phone: phone(), resident_id: 'r_mary' } })).status, 404)
  assert.equal((await call('POST', '/api/staff/visits', { token: carl, body: { resident_id: 'r_mary', visitor_name: 'Pat (SAMPLE)' } })).status, 404)
  assert.equal((await call('GET', '/api/staff/residents', { token: carl })).body.residents.some((r) => r.id === 'r_mary'), false)
  assert.equal((await call('PUT', '/api/settings/residents/r_mary', { token: donna, body: { active: true } })).status, 200)
  assert.deepEqual((await search('mary')).map((r) => r.id), ['r_mary'], 'back again')
})

// ---------- staff ----------

test('staff: add someone who can sign in; name, role and PIN validated; pin_taken on add and on change; a new PIN replaces the old', async () => {
  const donna = await token(PIN.donna)
  const post = (body) => call('POST', '/api/settings/staff', { token: donna, body })
  const put = (id, body) => call('PUT', `/api/settings/staff/${id}`, { token: donna, body })
  const base = { name: 'Gail T. (SAMPLE)', role: 'staff', pin: '8642' }
  for (const [change, field] of [[{ name: '' }, 'name'], [{ name: 'x'.repeat(61) }, 'name'], [{ role: 'boss' }, 'role'], [{ role: undefined }, 'role'],
    [{ pin: '12' }, 'pin'], [{ pin: '1234567' }, 'pin'], [{ pin: 8642 }, 'pin'], [{ pin: 'abcd' }, 'pin']]) {
    const r = await post({ ...base, ...change })
    assert.deepEqual([r.status, r.body.field], [400, field], JSON.stringify(change))
  }
  const TAKEN = { error: 'Another staff member already has that PIN. Pick a different one.', code: 'pin_taken', field: 'pin' }
  const taken = await post({ ...base, pin: PIN.carl })
  assert.deepEqual([taken.status, taken.body], [409, TAKEN])
  const added = await post(base)
  assert.equal(added.status, 201, JSON.stringify(added.body))
  const id = added.body.id
  assert.deepEqual(added.body.settings.staff.find((s) => s.id === id), { id, name: 'Gail T. (SAMPLE)', role: 'staff', active: true })
  const gail = await call('POST', '/api/signin', { body: { pin: '8642' } })
  assert.deepEqual([gail.status, gail.body.role, gail.body.staff], [200, 'staff', { id, name: 'Gail T. (SAMPLE)' }])
  assert.equal((await call('GET', '/api/settings', { token: gail.body.token })).status, 403)
  const clash = await put(id, { pin: PIN.donna })
  assert.deepEqual([clash.status, clash.body], [409, TAKEN])
  assert.equal((await put(id, { pin: '8642' })).status, 200, 'their own PIN again is not taken')
  assert.equal((await put(id, { pin: '9753' })).status, 200)
  assert.equal((await call('POST', '/api/signin', { body: { pin: '8642' } })).status, 401, 'the old PIN stops working')
  assert.equal((await call('POST', '/api/signin', { body: { pin: '9753' } })).status, 200)
  assert.equal((await put(id, { name: 'Gail T. (SAMPLE)', role: 'manager' })).status, 200)
  assert.equal((await call('GET', '/api/settings', { token: gail.body.token })).status, 200, 'the role is read on every request')
  assert.equal((await put(id, { active: 'no' })).body.field, 'active')
  assert.equal((await put('s_nobody', { name: 'X' })).status, 404)
})

test('staff: turning off the last manager → 409, and so does making them staff; with a second manager both work; a turned-off PIN no longer signs in', async () => {
  const donna = await token(PIN.donna)
  const put = (tok, id, body) => call('PUT', `/api/settings/staff/${id}`, { token: tok, body })
  const LAST = { error: 'The home needs at least one manager.', code: 'bad_state' }
  const off = await put(donna, 's_donna', { active: false })
  assert.deepEqual([off.status, off.body], [409, LAST])
  const demoted = await put(donna, 's_donna', { name: 'Donna R. (SAMPLE)', role: 'staff' })
  assert.deepEqual([demoted.status, demoted.body], [409, LAST])
  assert.deepEqual((await settingsOf(donna)).staff.find((s) => s.id === 's_donna'), { id: 's_donna', name: 'Donna R. (SAMPLE)', role: 'manager', active: true })
  assert.equal((await put(donna, 's_carl', { role: 'manager' })).status, 200)
  assert.equal((await put(donna, 's_donna', { active: false })).status, 200, 'Carl is a manager now')
  assert.equal((await call('GET', '/api/settings', { token: donna })).status, 401, "Donna's session stops")
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.donna } })).status, 401, 'and her PIN no longer signs in')
  const carl = await token(PIN.carl)
  const carlOff = await put(carl, 's_carl', { active: false })
  assert.deepEqual([carlOff.status, carlOff.body], [409, LAST], 'Carl is the last manager now')
  assert.equal((await put(carl, 's_amira', { active: false })).status, 200, 'staff can be turned off')
  assert.equal((await put(carl, 's_donna', { active: true })).status, 200)
  assert.equal((await put(carl, 's_carl', { role: 'staff' })).status, 200, 'with Donna back, Carl can be staff again')
})

// ---------- roll call ----------

test('roll call: three in, start → 3; a sign-in after the start → 4 with after_start; a sign-out during it stays with out_label; found by Carl and by Amira; unfound; a second start 409; end; found writes 409; current null after', async () => {
  const george = await visitor('r_george', nl('14:00'))
  await call('POST', `/api/visit/${george.token}/signout`, { now: nl('14:30') })
  const frank = await visitor('r_frank', nl('14:40'))
  const rose = await visitor('r_rose', nl('14:45'))
  const mary = await visitor('r_mary', nl('14:50'))
  const carl = await token(PIN.carl, nl('15:00'))
  const amira = await token(PIN.amira, nl('15:00'))
  const get = (url, tok, now) => call('GET', url, { token: tok, now })
  const post = (url, tok, now, body) => call('POST', url, { token: tok, now, body })
  assert.deepEqual((await get('/api/staff/rollcall/current', carl, nl('15:00'))).body, { roll_call: null })

  const started = await post('/api/staff/rollcall', carl, nl('15:10'))
  assert.equal(started.status, 201, JSON.stringify(started.body))
  const rc = started.body.roll_call
  assert.match(rc.id, /^rc_[0-9a-f]{16}$/)
  assert.deepEqual([rc.total, rc.found, rc.started_at, rc.started_label, rc.started_by, rc.ended_at, rc.ended_label, rc.ended_by],
    [3, 0, nl('15:10'), '3:10 PM', 'Carl B. (SAMPLE)', null, null, null])
  const names = (r) => r.entries.map((e) => e.visitor_name)
  assert.deepEqual(names(rc), [mary.visit.visitor_name, ...[frank.visit.visitor_name, rose.visit.visitor_name].sort((a, b) => a.localeCompare(b))],
    'unit order, then visitor name')
  const [maryEntry] = rc.entries
  assert.match(maryEntry.visit_id, /^v_/)
  assert.match(maryEntry.visitor_phone, /^709-555-01\d\d$/)
  assert.deepEqual({ ...maryEntry, visit_id: 'x', visitor_phone: 'p' }, {
    visit_id: 'x', visitor_name: mary.visit.visitor_name, visitor_phone: 'p', resident_name: 'Mary S. (SAMPLE)', room: '101',
    unit: { id: 'u_harbour', name: 'Harbour wing' }, in_label: '2:50 PM', after_start: false, out_label: null, found: false, found_label: null, found_by: null,
  })
  assert.equal(names(rc).includes(george.visit.visitor_name), false, 'signed out before the start: not listed')
  assert.deepEqual((await building(carl, nl('15:11'))).roll_call, { id: rc.id, started_label: '3:10 PM', total: 3, found: 0 })

  const second = await post('/api/staff/rollcall', amira, nl('15:12'))
  assert.deepEqual([second.status, second.body], [409, { error: 'A roll call is already going.', code: 'bad_state', roll_call_id: rc.id }])

  const walter = await visitor('r_walter', nl('15:15'))
  const after = (await get('/api/staff/rollcall/current', carl, nl('15:16'))).body.roll_call
  assert.equal(after.total, 4, 'the sign-in after the start is on the list')
  assert.deepEqual(after.entries.filter((e) => e.after_start).map((e) => e.visitor_name), [walter.visit.visitor_name])

  await call('POST', `/api/visit/${rose.token}/signout`, { now: nl('15:20') })
  const during = (await get(`/api/staff/rollcall/${rc.id}`, amira, nl('15:21'))).body.roll_call
  const entryOf = (r, v) => r.entries.find((e) => e.visitor_name === v.visit.visitor_name)
  assert.deepEqual([during.total, entryOf(during, rose).out_label], [4, '3:20 PM'], 'a sign-out during the roll call stays on the list')

  const tick = (tok, v, found, now) => post(`/api/staff/rollcall/${rc.id}/found`, tok, now, { visit_id: entryOf(during, v).visit_id, found })
  const t1 = await tick(carl, frank, true, nl('15:22'))
  assert.equal(t1.status, 200, JSON.stringify(t1.body))
  assert.deepEqual([t1.body.roll_call.found, entryOf(t1.body.roll_call, frank).found_by, entryOf(t1.body.roll_call, frank).found_label], [1, 'Carl B. (SAMPLE)', '3:22 PM'])
  const t2 = await tick(amira, mary, true, nl('15:23'))
  assert.deepEqual([t2.body.roll_call.found, entryOf(t2.body.roll_call, mary).found_by, entryOf(t2.body.roll_call, frank).found_by], [2, 'Amira H. (SAMPLE)', 'Carl B. (SAMPLE)'])
  const again = await tick(amira, frank, true, nl('15:24'))
  assert.deepEqual([again.body.roll_call.found, entryOf(again.body.roll_call, frank).found_by], [2, 'Carl B. (SAMPLE)'], 'a second tick keeps who found them first')
  const untick = await tick(amira, frank, false, nl('15:25'))
  assert.deepEqual([untick.body.roll_call.found, entryOf(untick.body.roll_call, frank).found, entryOf(untick.body.roll_call, frank).found_by], [1, false, null])
  assert.deepEqual((await building(carl, nl('15:26'))).roll_call, { id: rc.id, started_label: '3:10 PM', total: 4, found: 1 })

  const georgeId = (await dayLog(carl, '2026-09-14', nl('15:26'))).visits.find((v) => v.visitor_name === george.visit.visitor_name).id
  const notListed = await post(`/api/staff/rollcall/${rc.id}/found`, carl, nl('15:26'), { visit_id: georgeId, found: true })
  assert.deepEqual([notListed.status, notListed.body], [404, { error: 'That visitor is not on this roll call.', code: 'not_found' }])
  assert.equal((await post(`/api/staff/rollcall/${rc.id}/found`, carl, nl('15:26'), { visit_id: georgeId, found: 'yes' })).body.field, 'found')
  assert.equal((await get('/api/staff/rollcall/rc_nobody', carl, nl('15:26'))).status, 404)

  const ended = await post(`/api/staff/rollcall/${rc.id}/end`, amira, nl('15:30'))
  assert.equal(ended.status, 200)
  const e = ended.body.roll_call
  assert.deepEqual([e.ended_at, e.ended_label, e.ended_by, e.total, e.found], [nl('15:30'), '3:30 PM', 'Amira H. (SAMPLE)', 4, 1])
  const ENDED = { error: 'This roll call has ended.', code: 'bad_state' }
  const endAgain = await post(`/api/staff/rollcall/${rc.id}/end`, carl, nl('15:31'))
  assert.deepEqual([endAgain.status, endAgain.body], [409, ENDED])
  const lateTick = await tick(carl, mary, false, nl('15:31'))
  assert.deepEqual([lateTick.status, lateTick.body], [409, ENDED])

  await visitor('r_margaret', nl('15:35'))
  assert.equal((await get(`/api/staff/rollcall/${rc.id}`, carl, nl('15:36'))).body.roll_call.total, 4, 'a sign-in after the end is not added')
  assert.deepEqual((await get('/api/staff/rollcall/current', carl, nl('15:36'))).body, { roll_call: null })
  assert.equal((await building(carl, nl('15:36'))).roll_call, null)
  const next = await post('/api/staff/rollcall', carl, nl('15:40'))
  assert.deepEqual([next.status, next.body.roll_call.total, next.body.roll_call.found], [201, 4, 0], 'Frank, Mary, Walter and Margaret are in')
})

// ---------- contacts ----------

test('contacts: rows for a range across two dates, by date then time, and the unit filter; from > to, bad dates, too long a range, unknown unit', async () => {
  const frank = await visitor('r_frank', nl('10:00', '2026-09-13'))
  const mary = await visitor('r_mary', nl('14:00', '2026-09-13'))
  await call('POST', `/api/visit/${mary.token}/signout`, { now: nl('14:30', '2026-09-13') })
  const rose = await visitor('r_rose', nl('08:30'))
  const carl = await token(PIN.carl, nl('09:00'))
  const desk = await staffVisit(carl, 'r_george', nl('09:00'), { visitor_name: 'Desk Visitor (SAMPLE)' })
  assert.equal((await call('POST', `/api/staff/visits/${desk.visit.id}/signout`, { token: carl, now: nl('09:40') })).status, 200)
  const q = (qs, now = T3PM) => call('GET', `/api/staff/contacts?${qs}`, { token: carl, now })

  const all = await q('from=2026-09-13&to=2026-09-14&unit=all')
  assert.equal(all.status, 200, JSON.stringify(all.body))
  assert.deepEqual([all.body.from, all.body.to, all.body.unit, all.body.count], ['2026-09-13', '2026-09-14', 'all', 4])
  assert.deepEqual(all.body.rows.map((r) => r.visitor_name), [frank.visit.visitor_name, mary.visit.visitor_name, rose.visit.visitor_name, 'Desk Visitor (SAMPLE)'])
  const [f] = all.body.rows
  assert.match(f.visit_id, /^v_/)
  assert.match(f.visitor_phone, /^709-555-01\d\d$/)
  assert.deepEqual({ ...f, visit_id: 'x', visitor_phone: 'p' }, {
    visit_id: 'x', date: '2026-09-13', date_label: 'Sun Sep 13', unit_name: 'Lighthouse wing', resident_name: 'Frank O. (SAMPLE)', room: '201',
    visitor_name: frank.visit.visitor_name, visitor_phone: 'p', in_label: '10:00 AM', out_label: '12:00 AM', signed_out: 'Auto at closing', signed_in_by: 'QR code',
  })
  assert.deepEqual(all.body.rows.map((r) => [r.signed_out, r.out_label, r.signed_in_by]),
    [['Auto at closing', '12:00 AM', 'QR code'], ['Visitor', '2:30 PM', 'QR code'], ['Still in', null, 'QR code'], ['Staff', '9:40 AM', 'Carl B. (SAMPLE)']])

  const harbour = await q('from=2026-09-13&to=2026-09-14&unit=u_harbour')
  assert.deepEqual([harbour.body.unit, harbour.body.count, harbour.body.rows.map((r) => r.resident_name)],
    ['u_harbour', 2, ['Mary S. (SAMPLE)', 'George P. (SAMPLE)']])
  assert.deepEqual((await q('from=2026-09-13&to=2026-09-14&unit=u_lighthouse')).body.rows.map((r) => r.resident_name), ['Frank O. (SAMPLE)', 'Rose B. (SAMPLE)'])
  assert.equal((await q('from=2026-09-13&to=2026-09-14&unit=u_cove')).body.count, 0)
  assert.equal((await q('from=2026-09-14&to=2026-09-14')).body.count, 2, 'unit defaults to all')

  const refusals = [
    ['from=2026-09-14&to=2026-09-13', 'to', 'The end date is before the start date.'],
    ['from=&to=2026-09-14', 'from', 'Pick a start date.'], ['from=2026-02-30&to=2026-09-14', 'from'], ['to=2026-09-14', 'from'],
    ['from=2026-09-13&to=soon', 'to', 'Pick an end date.'],
    ['from=2025-09-12&to=2026-09-14', 'from', 'Pick dates no more than 366 days apart.'],
  ]
  for (const [qs, field, error] of refusals) {
    const r = await q(qs)
    assert.deepEqual([r.status, r.body.field, r.body.code], [400, field, 'bad_request'], qs)
    if (error) assert.equal(r.body.error, error)
  }
  assert.equal((await q('from=2025-09-13&to=2026-09-14')).status, 200, '366 days apart is allowed')
  const unit = await q('from=2026-09-13&to=2026-09-14&unit=u_nowhere')
  assert.deepEqual([unit.status, unit.body], [404, { error: "We can't find that unit.", code: 'not_found' }])
  assert.equal((await call('GET', '/api/staff/contacts?from=2026-09-13&to=2026-09-14')).status, 401)
})

test('contacts CSV: exact header, CRLF on every line, quoting and the formula guard, the Signed out and Signed in by words, the filename; the JSON rows and the CSV lines agree', async () => {
  const pO = phone()
  const obrien = await call('POST', '/api/visitor/signin', { body: { name: 'O\'Brien, "Junior" (SAMPLE)', phone: pO, resident_id: 'r_frank' }, now: nl('10:00') })
  assert.equal(obrien.status, 201, JSON.stringify(obrien.body))
  const formula = await call('POST', '/api/visitor/signin', { body: { name: '=HYPERLINK("x") (SAMPLE)', phone: phone(), resident_id: 'r_rose' }, now: nl('10:05') })
  assert.equal(formula.status, 201, JSON.stringify(formula.body))
  await call('POST', `/api/visit/${formula.body.token}/signout`, { now: nl('10:30') })
  const carl = await token(PIN.carl, nl('10:40'))
  const desk = await staffVisit(carl, 'r_walter', nl('10:40'), { visitor_name: '@Desk visitor (SAMPLE)', visitor_phone: '' })
  await call('POST', `/api/staff/visits/${desk.visit.id}/signout`, { token: carl, now: nl('11:00') })
  await visitor('r_mary', nl('14:00'))

  const now = nl('21:30')
  const carl2 = await token(PIN.carl, now)
  const qs = 'from=2026-09-14&to=2026-09-14&unit=all'
  const json = (await call('GET', `/api/staff/contacts?${qs}`, { token: carl2, now })).body
  const csv = await csvGet(qs, carl2, now)
  assert.equal(csv.status, 200, csv.text)
  assert.equal(csv.type, 'text/csv; charset=utf-8')
  assert.equal(csv.disposition, 'attachment; filename="visitor-contacts-all-units-2026-09-14-to-2026-09-14.csv"')
  assert.ok(csv.text.endsWith('\r\n'), 'CRLF after the last line')
  assert.equal(csv.text.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF')
  const lines = csv.text.split('\r\n').slice(0, -1)
  assert.equal(lines[0], HEADER)
  assert.equal(lines.length, 1 + json.count)
  assert.equal(json.count, 4)
  assert.ok(lines.includes(`2026-09-14,Lighthouse wing,Frank O. (SAMPLE),201,"O'Brien, ""Junior"" (SAMPLE)",${pO},10:00 AM,,Still in,QR code`), lines.join('\n'))
  assert.ok(lines.some((l) => l.includes(`,"'=HYPERLINK(""x"") (SAMPLE)",`) && l.endsWith(',10:05 AM,10:30 AM,Visitor,QR code')), `the formula is guarded:\n${lines.join('\n')}`)
  assert.ok(lines.some((l) => l.endsWith(",'@Desk visitor (SAMPLE),,10:40 AM,11:00 AM,Staff,Carl B. (SAMPLE)")), 'a leading @ is guarded; no phone is an empty cell')
  assert.ok(lines.some((l) => l.includes(',Mary S. (SAMPLE),101,') && l.endsWith(',2:00 PM,9:00 PM,Auto at closing,QR code')))
  const guard = (s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)
  assert.deepEqual(lines.slice(1).map(parseCsvLine), json.rows.map((r) => [r.date, r.unit_name, r.resident_name, r.room, guard(r.visitor_name),
    r.visitor_phone, r.in_label, r.out_label ?? '', r.signed_out, r.signed_in_by]), 'the CSV lines read back as the JSON rows')

  const harbour = await csvGet('from=2026-09-14&to=2026-09-14&unit=u_harbour', carl2, now)
  assert.equal(harbour.disposition, 'attachment; filename="visitor-contacts-u_harbour-2026-09-14-to-2026-09-14.csv"')
  assert.equal(harbour.text.split('\r\n').length, 3, 'the header and Mary')
  assert.equal((await csvGet('from=2026-09-01&to=2026-09-01&unit=all', carl2, now)).text, `${HEADER}\r\n`, 'the header only when there are no rows')
  const refused = await csvGet('from=2026-09-14&to=2026-09-13', carl2, now)
  assert.deepEqual([refused.status, JSON.parse(refused.text).field], [400, 'to'])
})

test('contacts: a visit past retention is in neither the JSON nor the CSV', async () => {
  const old = await visitor('r_frank', nl('15:00', '2026-08-01'))
  const kept = await visitor('r_rose', nl('15:00', '2026-08-02'))
  const now = nl('10:00', '2026-09-01')
  const carl = await token(PIN.carl, now)
  const qs = 'from=2026-08-01&to=2026-09-01&unit=all'
  const body = (await call('GET', `/api/staff/contacts?${qs}`, { token: carl, now })).body
  assert.deepEqual(body.rows.map((r) => r.visitor_name), [kept.visit.visitor_name], 'Aug 1 is age 31, Aug 2 is age 30')
  const csv = await csvGet(qs, carl, now)
  assert.equal(csv.text.includes(old.visit.visitor_name), false)
  assert.equal(csv.text.includes(kept.visit.visitor_name), true)
  assert.equal(csv.text.split('\r\n').length, 3)
})

// ---------- the demo seed ----------

test('seed: at 3:00 AM and at 3:00 PM at least 3 on Lighthouse; an overdue Harbour visitor at 3:00 PM; the last 20 days each have visits; out_url works', async () => {
  const seeded = {}
  for (const hhmm of ['03:00', '15:00']) {
    const now = nl(hhmm)
    const r = await call('POST', '/api/test/seed', { body: { scenario: 'demo' }, now })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.today, '2026-09-14')
    assert.match(r.body.out_url, /^\/out\/\?t=[A-Za-z0-9_-]{43}$/)
    const carl = await token(PIN.carl, now)
    const b = await building(carl, now)
    assert.ok(unitOf(b, 'u_lighthouse').count >= 3, `${hhmm}: ${unitOf(b, 'u_lighthouse').count} on Lighthouse`)
    assert.equal(b.total, Object.values(counts(b)).reduce((s, n) => s + n, 0))
    const overdue = b.units.flatMap((u) => u.visits).filter((v) => v.overdue)
    if (hhmm === '15:00') assert.deepEqual(overdue.map((v) => [v.unit.id, v.in_label, v.due_label]), [['u_harbour', '10:40 AM', '11:30 AM']])
    else assert.deepEqual(overdue, [])
    const visit = await call('GET', `/api/visit/${r.body.out_url.split('t=')[1]}`, { now })
    assert.deepEqual([visit.status, visit.body.visit.state, visit.body.visit.resident.unit_name], [200, 'in', 'Lighthouse wing'])
    const kinds = new Set()
    for (let d = 1; d <= 20; d++) {
      const log = await dayLog(carl, addDays('2026-09-14', -d), now)
      assert.ok(log.count >= 1, `${hhmm}: visits ${d} days ago`)
      log.visits.forEach((v) => kinds.add(v.out_kind))
      assert.ok(log.visits.every((v) => v.visitor_name.endsWith('(SAMPLE)')))
    }
    assert.deepEqual([...kinds].sort(), ['auto', 'staff', 'visitor'], 'signed out by the visitor, by staff and automatically')
    const today = await dayLog(carl, '2026-09-14', now)
    assert.ok(today.visits.some((v) => v.out_kind === 'visitor') && today.visits.some((v) => v.out_kind === 'staff'), 'today: one out by the visitor, one by staff')
    assert.ok(today.visits.every((v) => v.visitor_name.endsWith('(SAMPLE)')))
    const start = (await call('GET', '/api/visitor/start', { now })).body
    assert.deepEqual([start.home_notices.map((n) => n.message), start.screening.enabled], [[DEMO_INFO], false])
    assert.deepEqual((await call('GET', '/api/visitor/residents/r_agnes', { now })).body.unit_notices.map((n) => n.message), [DEMO_OUTBREAK])
    seeded[hhmm] = today.visits
  }
  assert.equal((await call('POST', '/api/test/seed', { body: { scenario: 'demo' }, now: nl('15:00') })).status, 200)
  assert.deepEqual((await dayLog(await token(PIN.carl, nl('15:00')), '2026-09-14', nl('15:00'))).visits, seeded['15:00'], 'the same now seeds the same visits')
  const other = await call('POST', '/api/test/seed', { body: { scenario: 'party' }, now: nl('15:00') })
  assert.deepEqual([other.status, other.body.field], [400, 'scenario'])
  assert.equal(d1("SELECT COUNT(*) AS n FROM visits WHERE visitor_name NOT LIKE '%(SAMPLE)'")[0].n, 0)
})
