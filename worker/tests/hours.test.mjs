// Pure: visiting-hour windows, open_now, hours_label, due_at and auto_out_at.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoOutAt, dueAt, hoursLabel, openNow, validHours } from '../src/hours.js'
import { localInstant } from '../src/time.js'

const HARBOUR = [{ open: '08:00', close: '11:30' }, { open: '13:30', close: '21:00' }]
const LIGHTHOUSE = [{ open: '00:00', close: '24:00' }]
const COVE = [{ open: '10:00', close: '19:00' }]
const w = (open, close) => ({ open, close })
const at = (hhmm, date = '2026-09-14') => localInstant(date, ...hhmm.split(':').map(Number))
const iso = (d) => d.toISOString()

test('validation: good hours pass, sorted; overlap refused, touching allowed', () => {
  assert.deepEqual(validHours(HARBOUR), HARBOUR)
  assert.deepEqual(validHours([HARBOUR[1], HARBOUR[0]]), HARBOUR, 'sorted by open')
  assert.deepEqual(validHours(LIGHTHOUSE), LIGHTHOUSE)
  assert.equal(validHours([w('08:00', '12:00'), w('11:59', '14:00')]), null, 'overlap by a minute')
  assert.equal(validHours([w('08:00', '14:00'), w('09:00', '10:00')]), null, 'one inside another')
  assert.deepEqual(validHours([w('08:00', '12:00'), w('12:00', '14:00')]), [w('08:00', '12:00'), w('12:00', '14:00')], 'touching')
})

test('validation: open >= close, 0 and 5 windows, 24:00 only as a close, bad shapes', () => {
  assert.equal(validHours([w('12:00', '12:00')]), null, 'open = close')
  assert.equal(validHours([w('13:00', '12:00')]), null, 'open > close')
  assert.equal(validHours([]), null, '0 windows')
  assert.equal(validHours([w('01:00', '02:00'), w('03:00', '04:00'), w('05:00', '06:00'), w('07:00', '08:00'), w('09:00', '10:00')]), null, '5 windows')
  assert.ok(validHours([w('01:00', '02:00'), w('03:00', '04:00'), w('05:00', '06:00'), w('07:00', '08:00')]), '4 windows')
  assert.deepEqual(validHours([w('18:00', '24:00')]), [w('18:00', '24:00')], '24:00 close')
  assert.equal(validHours([w('24:00', '24:00')]), null, '24:00 open')
  assert.equal(validHours([w('08:00', '24:01')]), null)
  assert.equal(validHours([w('00:00', '00:00')]), null, 'close 00:00')
  assert.ok(validHours([w('00:00', '00:01')]), 'close 00:01')
  for (const bad of [null, 'x', [null], [w('8:00', '11:00')], [w('08:60', '11:00')], [{ open: '08:00' }], [w('25:00', '26:00')]]) {
    assert.equal(validHours(bad), null, JSON.stringify(bad))
  }
})

test('open_now: at open is in, at close is out', () => {
  assert.equal(openNow(HARBOUR, '08:00'), true)
  assert.equal(openNow(HARBOUR, '11:29'), true)
  assert.equal(openNow(HARBOUR, '11:30'), false, 'the close minute is outside')
  assert.equal(openNow(HARBOUR, '12:00'), false)
  assert.equal(openNow(HARBOUR, '13:30'), true)
  assert.equal(openNow(HARBOUR, '21:00'), false)
  assert.equal(openNow(HARBOUR, '07:59'), false)
  assert.equal(openNow(LIGHTHOUSE, '00:00'), true)
  assert.equal(openNow(LIGHTHOUSE, '23:59'), true)
  assert.equal(openNow(COVE, '19:00'), false)
})

test('hours_label: one, two and three windows, midnight, 12:00 AM and Open all day', () => {
  assert.equal(hoursLabel(COVE), '10:00 AM to 7:00 PM')
  assert.equal(hoursLabel(HARBOUR), '8:00 AM to 11:30 AM and 1:30 PM to 9:00 PM')
  assert.equal(hoursLabel([w('08:00', '10:00'), w('12:00', '14:00'), w('18:00', '24:00')]),
    '8:00 AM to 10:00 AM, 12:00 PM to 2:00 PM and 6:00 PM to midnight')
  assert.equal(hoursLabel([w('00:00', '12:00')]), '12:00 AM to 12:00 PM')
  assert.equal(hoursLabel(LIGHTHOUSE), 'Open all day')
  assert.equal(hoursLabel([w('00:00', '23:59')]), '12:00 AM to 11:59 PM', 'not all day')
})

test('due_at: in each window, between windows, before opening, after closing; open visiting', () => {
  assert.equal(iso(dueAt(HARBOUR, at('09:00'))), iso(at('11:30')), 'morning window')
  assert.equal(iso(dueAt(HARBOUR, at('11:29'))), iso(at('11:30')))
  assert.equal(iso(dueAt(HARBOUR, at('15:00'))), iso(at('21:00')), 'afternoon window')
  assert.equal(iso(dueAt(HARBOUR, at('12:00'))), iso(at('21:00')), 'between windows: the close of the next window')
  assert.equal(iso(dueAt(HARBOUR, at('07:00'))), iso(at('11:30')), 'before opening: the first window')
  assert.equal(iso(dueAt(HARBOUR, at('22:00'))), iso(at('00:00', '2026-09-15')), 'after closing: auto_out_at (midnight)')
  assert.equal(iso(dueAt(LIGHTHOUSE, at('15:00'))), iso(at('00:00', '2026-09-15')), 'open visiting: due at closing = midnight')
})

test('auto_out_at: before closing, at and after closing, open visiting, and on the fall-back day', () => {
  assert.equal(iso(autoOutAt(HARBOUR, at('09:00'))), iso(at('21:00')), 'closing = the close of the last window')
  assert.equal(iso(autoOutAt(HARBOUR, at('20:59'))), iso(at('21:00')))
  assert.equal(iso(autoOutAt(HARBOUR, at('21:00'))), iso(at('00:00', '2026-09-15')), 'at closing: the next midnight')
  assert.equal(iso(autoOutAt(HARBOUR, at('22:00'))), '2026-09-15T02:30:00.000Z', 'after closing: the next midnight')
  assert.equal(iso(autoOutAt(LIGHTHOUSE, at('03:00'))), '2026-09-15T02:30:00.000Z', 'open visiting: midnight')
  assert.equal(iso(autoOutAt(HARBOUR, at('15:00', '2026-11-01'))), '2026-11-02T00:30:00.000Z', '9:00 PM NST')
  assert.equal(iso(autoOutAt(LIGHTHOUSE, at('15:00', '2026-11-01'))), '2026-11-02T03:30:00.000Z', 'midnight NST')
})
