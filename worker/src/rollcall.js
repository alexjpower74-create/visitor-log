// Fire-drill roll call (staff routes). The list is worked out from the visits each time; the table holds only who was ticked.
import { randomId } from './auth.js'
import { bad, conflict, json, notFound } from './http.js'
import { addDays, localDate, timeLabel } from './time.js'
import { inBuildingAt, loadWorld, outOf, residentName } from './world.js'

const ALREADY_GOING = 'A roll call is already going.'
const ENDED = 'This roll call has ended.'

// Every visit in the building at started_at, plus every visit signed in after it (and, once ended, before ended_at).
export const onRollCall = (v, rc) =>
  inBuildingAt(v, rc.started_at) || (v.in_at > rc.started_at && (rc.ended_at === null || v.in_at < rc.ended_at))

export async function rollCallView(db, rc, w, nowIso) {
  const [visits, marks] = await db.batch([
    db.prepare('SELECT * FROM visits WHERE date >= ? ORDER BY in_at, id').bind(addDays(localDate(rc.started_at), -1)),
    db.prepare('SELECT * FROM roll_call_entries WHERE roll_call_id = ?').bind(rc.id),
  ])
  const markOf = new Map(marks.results.map((m) => [m.visit_id, m]))
  const order = new Map(w.units.map((u, i) => [u.id, i]))
  const entries = visits.results.filter((v) => onRollCall(v, rc)).map((v) => {
    const r = w.residentsById.get(v.resident_id)
    const u = w.unitsById.get(v.unit_id)
    const out = outOf(v, nowIso)
    const m = markOf.get(v.id)
    const found = !!m && m.found === 1
    return {
      visit_id: v.id, visitor_name: v.visitor_name, visitor_phone: v.phone, resident_name: r ? residentName(r, w.home) : '',
      room: r ? r.room : '', unit: { id: v.unit_id, name: u ? u.name : '' }, in_label: timeLabel(v.in_at),
      after_start: v.in_at > rc.started_at, out_label: out.out_at ? timeLabel(out.out_at) : null, found,
      found_label: found ? timeLabel(m.found_at) : null, found_by: found ? m.found_by : null,
    }
  }).sort((a, b) => (order.get(a.unit.id) ?? 1e9) - (order.get(b.unit.id) ?? 1e9) || a.visitor_name.localeCompare(b.visitor_name) ||
    a.visit_id.localeCompare(b.visit_id))
  return {
    id: rc.id, started_at: rc.started_at, started_label: timeLabel(rc.started_at), started_by: rc.started_by, ended_at: rc.ended_at,
    ended_label: rc.ended_at ? timeLabel(rc.ended_at) : null, ended_by: rc.ended_by, total: entries.length,
    found: entries.filter((e) => e.found).length, entries,
  }
}

export const currentRollCall = (db) => db.prepare('SELECT * FROM roll_calls WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').first()

// The summary on GET /api/staff/building.
export async function rollCallSummary(db, w, nowIso) {
  const rc = await currentRollCall(db)
  if (!rc) return null
  const v = await rollCallView(db, rc, w, nowIso)
  return { id: v.id, started_label: v.started_label, total: v.total, found: v.found }
}

async function findRollCall(c) {
  const rc = await c.db.prepare('SELECT * FROM roll_calls WHERE id = ?').bind(c.params.id).first()
  if (!rc) throw notFound("We can't find that roll call.")
  return rc
}

const answer = async (c, rc, status = 200) => json({ roll_call: await rollCallView(c.db, rc, await loadWorld(c.db), c.nowIso) }, status)

export async function rollCallCurrent(c) {
  const rc = await currentRollCall(c.db)
  return rc ? answer(c, rc) : json({ roll_call: null })
}

export async function rollCallStart(c) {
  const id = randomId('rc')
  const r = await c.db.prepare(`INSERT INTO roll_calls (id, started_at, started_by, ended_at, ended_by) SELECT ?, ?, ?, NULL, NULL
    WHERE NOT EXISTS (SELECT 1 FROM roll_calls WHERE ended_at IS NULL)`).bind(id, c.nowIso, c.staff.name).run()
  if (r.meta.changes === 0) {
    const going = await currentRollCall(c.db)
    throw conflict('bad_state', ALREADY_GOING, { roll_call_id: going ? going.id : null })
  }
  return answer(c, await findRollCall({ ...c, params: { id } }), 201)
}

export const rollCallGet = async (c) => answer(c, await findRollCall(c))

// Ticking someone found keeps whoever ticked first; unticking clears it.
export async function rollCallFound(c) {
  const rc = await findRollCall(c)
  if (rc.ended_at) throw conflict('bad_state', ENDED)
  const b = await c.body()
  if (typeof b.found !== 'boolean') throw bad('found', 'Say whether they were found.')
  const view = await rollCallView(c.db, rc, await loadWorld(c.db), c.nowIso)
  if (!view.entries.some((e) => e.visit_id === b.visit_id)) throw notFound('That visitor is not on this roll call.')
  if (b.found) {
    await c.db.prepare(`INSERT INTO roll_call_entries (roll_call_id, visit_id, found, found_at, found_by) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT (roll_call_id, visit_id) DO UPDATE SET found = 1, found_at = excluded.found_at, found_by = excluded.found_by
      WHERE roll_call_entries.found = 0`).bind(rc.id, b.visit_id, c.nowIso, c.staff.name).run()
  } else {
    await c.db.prepare('DELETE FROM roll_call_entries WHERE roll_call_id = ? AND visit_id = ?').bind(rc.id, b.visit_id).run()
  }
  return answer(c, rc)
}

export async function rollCallEnd(c) {
  const rc = await findRollCall(c)
  const r = await c.db.prepare('UPDATE roll_calls SET ended_at = ?, ended_by = ? WHERE id = ? AND ended_at IS NULL')
    .bind(c.nowIso, c.staff.name, rc.id).run()
  if (r.meta.changes === 0) throw conflict('bad_state', ENDED)
  return answer(c, await findRollCall(c))
}
