// Property: the in-building count equals sign-ins minus sign-outs, where a visit also counts as out once its auto_out_at
// has passed. 200 seeded events over 3 days in time order, 40 checkpoints between them, against the real Worker.
// The model below is the test's own reading of docs/API.md (closing: Harbour wing 9:00 PM, Lighthouse wing midnight;
// signed in after closing: the next midnight). It uses only time.js for wall times, never the Worker's hours.js or world.js.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDays, localDate, localHHMM, localInstant } from '../src/time.js'
import { call, PIN, reset } from './api-helpers.mjs'

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UNIT = {
  r_mary: 'u_harbour', r_george: 'u_harbour', r_ellen: 'u_harbour',
  r_frank: 'u_lighthouse', r_rose: 'u_lighthouse', r_walter: 'u_lighthouse', r_margaret: 'u_lighthouse',
}
const LIGHTHOUSE = ['r_frank', 'r_rose', 'r_walter', 'r_margaret']
const HARBOUR_VISITOR = ['r_mary', 'r_george'] // Ellen is by arrangement: staff only
const STAFF_ANY = Object.keys(UNIT)
const LIMIT = 2
const PHONES = Array.from({ length: 100 }, (_, i) => `709-555-01${String(i).padStart(2, '0')}`)

const harbourOpen = (ms) => {
  const hm = localHHMM(ms)
  return (hm >= '08:00' && hm < '11:30') || (hm >= '13:30' && hm < '21:00')
}
function modelAutoOut(unit, inMs) {
  const date = localDate(inMs)
  const midnight = localInstant(addDays(date, 1), 0, 0).getTime()
  const closing = unit === 'u_harbour' ? localInstant(date, 21, 0).getTime() : midnight
  return inMs < closing ? closing : midnight
}
const inAt = (v, T) => v.in <= T && (v.out === null || v.out > T) && v.auto > T

test('count property: 200 seeded events over 3 days; at 40 checkpoints total and every unit count equal the model, never negative', async () => {
  await reset()
  const rand = mulberry32(20260914)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const start = localInstant('2026-09-14', 0, 0).getTime()
  const end = localInstant('2026-09-17', 0, 0).getTime()
  const minutes = new Set()
  while (minutes.size < 240) minutes.add(Math.floor((rand() * (end - start)) / 60000))
  const times = [...minutes].sort((a, b) => a - b).map((m) => start + m * 60000)
  const checkpoints = new Set()
  while (checkpoints.size < 40) checkpoints.add(Math.floor(rand() * 240))

  const visits = []
  const stats = { visitorIn: 0, staffIn: 0, outByToken: 0, outByStaff: 0, nonEmptyCheckpoints: 0 }
  let staffToken = null
  let staffExpires = 0
  const staff = async (T) => {
    if (!staffToken || T >= staffExpires - 60000) {
      const r = await call('POST', '/api/signin', { body: { pin: PIN.carl }, now: new Date(T).toISOString() })
      assert.equal(r.status, 200)
      staffToken = r.body.token
      staffExpires = Date.parse(r.body.expires_at)
    }
    return staffToken
  }
  const staffSignIn = async (T, now, i) => {
    const id = pick(STAFF_ANY)
    const r = await call('POST', '/api/staff/visits',
      { token: await staff(T), body: { resident_id: id, visitor_name: `Desk visitor ${i} (SAMPLE)`, visitor_phone: '' }, now })
    assert.equal(r.status, 201, `event ${i} staff sign-in ${id} at ${now}: ${JSON.stringify(r.body)}`)
    visits.push({ id: r.body.visit.id, name: r.body.visit.visitor_name, resident: id, unit: UNIT[id], in: T, auto: modelAutoOut(UNIT[id], T), out: null, token: null, phone: '' })
    stats.staffIn++
  }

  for (let i = 0; i < times.length; i++) {
    const T = times[i]
    const now = new Date(T).toISOString()
    if (checkpoints.has(i)) {
      const r = await call('GET', '/api/staff/building', { token: await staff(T), now })
      assert.equal(r.status, 200)
      const expected = { u_harbour: 0, u_lighthouse: 0, u_cove: 0 }
      for (const v of visits) if (inAt(v, T)) expected[v.unit]++
      const got = Object.fromEntries(r.body.units.map((u) => [u.id, u.count]))
      assert.deepEqual(got, expected, `checkpoint ${i} at ${now}: unit counts`)
      assert.equal(r.body.total, expected.u_harbour + expected.u_lighthouse + expected.u_cove, `checkpoint ${i} at ${now}: total`)
      assert.ok(r.body.total >= 0 && Object.values(got).every((n) => n >= 0), 'never negative')
      if (r.body.total > 0) stats.nonEmptyCheckpoints++
      continue
    }
    const inside = visits.filter((v) => inAt(v, T))
    const roll = rand()
    if (roll < 0.35 && inside.length) {
      const v = pick(inside)
      if (v.token && rand() < 0.6) {
        const r = await call('POST', `/api/visit/${v.token}/signout`, { now })
        assert.deepEqual([r.status, r.body.already_out], [200, false], `event ${i} token sign-out at ${now}: ${JSON.stringify(r.body)}`)
        stats.outByToken++
      } else {
        const token = await staff(T)
        if (!v.id) {
          const b = await call('GET', '/api/staff/building', { token, now })
          v.id = b.body.units.flatMap((u) => u.visits).find((x) => x.visitor_name === v.name).id
        }
        const r = await call('POST', `/api/staff/visits/${v.id}/signout`, { token, now })
        assert.equal(r.status, 200, `event ${i} staff sign-out at ${now}: ${JSON.stringify(r.body)}`)
        stats.outByStaff++
      }
      v.out = T
    } else if (roll < 0.75) {
      const residents = [...LIGHTHOUSE, ...(harbourOpen(T) ? HARBOUR_VISITOR : [])]
        .filter((id) => inside.filter((v) => v.resident === id).length < LIMIT)
      const used = new Set(inside.map((v) => v.phone))
      const phones = PHONES.filter((p) => !used.has(p))
      if (!residents.length || !phones.length) {
        await staffSignIn(T, now, i)
        continue
      }
      const id = pick(residents)
      const phone = pick(phones)
      const name = `Visitor ${i} (SAMPLE)`
      const r = await call('POST', '/api/visitor/signin', { body: { name, phone, resident_id: id }, now })
      assert.equal(r.status, 201, `event ${i} visitor sign-in ${id} at ${now}: ${JSON.stringify(r.body)}`)
      visits.push({ id: null, name, resident: id, unit: UNIT[id], in: T, auto: modelAutoOut(UNIT[id], T), out: null, token: r.body.token, phone })
      stats.visitorIn++
    } else {
      await staffSignIn(T, now, i)
    }
  }

  // The property must have had something to measure.
  const autoOuts = visits.filter((v) => v.out === null && v.auto <= end).length
  const msg = JSON.stringify({ ...stats, autoOuts })
  assert.ok(stats.visitorIn >= 40 && stats.staffIn >= 20, `enough sign-ins: ${msg}`)
  assert.ok(stats.outByToken >= 5 && stats.outByStaff >= 5, `enough sign-outs of each kind: ${msg}`)
  assert.ok(autoOuts >= 10, `enough automatic sign-outs: ${msg}`)
  assert.ok(stats.nonEmptyCheckpoints >= 20, `enough checkpoints with people in: ${msg}`)
  console.log(`count property: ${msg}`)
})
