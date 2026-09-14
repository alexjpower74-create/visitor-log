// Pure: the retention cutoff. A visit's age = today (home-local) − its date; kept while age <= retention_days.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptFrom, retentionDays } from '../src/maintenance.js'
import { addDays, daysBetween, localDate } from '../src/time.js'

const kept = (visitDate, today, days) => visitDate >= keptFrom(today, days)

test('retention 30 on ordinary days: a Sep 14 visit is there all day Oct 14 and gone on Oct 15', () => {
  assert.equal(keptFrom('2026-10-14', 30), '2026-09-14')
  assert.equal(kept('2026-09-14', '2026-10-14', 30), true, 'age 30')
  assert.equal(kept('2026-09-14', '2026-10-15', 30), false, 'age 31')
  assert.equal(kept('2026-08-01', '2026-08-31', 30), true, 'Aug 1 at Aug 31 (age 30)')
  assert.equal(kept('2026-08-01', '2026-09-01', 30), false, 'Aug 1 at Sep 1 (age 31)')
})

test('retention 7 on ordinary days: age 7 kept, age 8 deleted', () => {
  assert.equal(keptFrom('2026-08-23', 7), '2026-08-16')
  assert.equal(kept('2026-08-16', '2026-08-23', 7), true)
  assert.equal(kept('2026-08-15', '2026-08-23', 7), false)
})

test('age = retention kept and retention + 1 deleted, for 1, 7, 30 and 365, whatever the date', () => {
  for (const days of [1, 7, 30, 365]) {
    for (const today of ['2026-01-01', '2026-03-01', '2026-11-01', '2027-03-14', '2028-02-29']) {
      const atLimit = addDays(today, -days)
      const past = addDays(today, -(days + 1))
      assert.equal(daysBetween(atLimit, today), days)
      assert.equal(kept(atLimit, today, days), true, `${days} days, today ${today}: ${atLimit} is age ${days}`)
      assert.equal(kept(past, today, days), false, `${days} days, today ${today}: ${past} is age ${days + 1}`)
      assert.equal(kept(today, today, days), true, 'today')
    }
  }
})

test('across the DST changes the cutoff moves at local midnight, not UTC midnight', () => {
  // Fall back: Nov 1 2026 starts at 02:30Z (NDT), Nov 2 at 03:30Z (NST).
  assert.equal(localDate('2026-11-02T03:29:59Z'), '2026-11-01')
  assert.equal(keptFrom(localDate('2026-11-02T03:29:59Z'), 30), '2026-10-02', '11:59:59 PM Nov 1: Oct 2 is age 30, kept')
  assert.equal(keptFrom(localDate('2026-11-02T03:30:00Z'), 30), '2026-10-03', '12:00 AM Nov 2: Oct 2 is age 31, gone')
  assert.equal(keptFrom(localDate('2026-11-02T02:30:00Z'), 30), '2026-10-02', 'an NDT-style midnight on Nov 2 is still Nov 1 locally')
  // Spring forward: Mar 14 2027 starts at 03:30Z (NST), Mar 15 at 02:30Z (NDT).
  assert.equal(keptFrom(localDate('2027-03-15T02:29:59Z'), 7), '2027-03-07')
  assert.equal(keptFrom(localDate('2027-03-15T02:30:00Z'), 7), '2027-03-08')
  assert.equal(kept('2027-03-07', localDate('2027-03-15T02:30:00Z'), 7), false)
})

test('retention days: the home setting, 30 before the home row exists', () => {
  assert.equal(retentionDays(null), 30)
  assert.equal(retentionDays({ retention_days: 7 }), 7)
})
