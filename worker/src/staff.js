// Staff routes (role staff or manager): in the building, residents, signing someone in and out, the day log.
import { randomId } from './auth.js'
import { hoursLabel, openNow } from './hours.js'
import { bad, conflict, json, notFound } from './http.js'
import { keptFrom, retentionDays } from './maintenance.js'
import { alreadyInMessage, blockReasons, cleanName, MSG, normalizePhone } from './rules.js'
import { dateLabel, isValidDate, localHHMM, timeLabel } from './time.js'
import {
  activeResident, byFirstName, inBuildingAt, insertVisit, loadWorld, newVisitRow, noticesFor, noticeView, openVisits, outOf,
  residentName, staffVisitView,
} from './world.js'
import { rollCallSummary } from './rollcall.js'
import { residentCount } from './visitor.js'

export async function building(c) {
  const w = await loadWorld(c.db)
  const t = c.nowIso
  const { results } = await c.db.prepare('SELECT * FROM visits WHERE out_at IS NULL OR out_at > ? OR date = ? ORDER BY in_at, id')
    .bind(t, c.today).all()
  const inside = results.filter((v) => inBuildingAt(v, t))
  const nowLocal = localHHMM(c.now)
  const units = w.units.filter((u) => u.active).map((u) => {
    const visits = inside.filter((v) => v.unit_id === u.id)
    return {
      id: u.id, name: u.name, hours_label: hoursLabel(u.hours), open_now: openNow(u.hours, nowLocal),
      notices: noticesFor(w.notices, u.id).map((n) => noticeView(n, w)), count: visits.length,
      visits: visits.map((v) => staffVisitView(v, w, t)),
    }
  })
  const autoToday = results.filter((v) => v.date === c.today && outOf(v, t).out_kind === 'auto')
    .sort((a, b) => (outOf(b, t).out_at.localeCompare(outOf(a, t).out_at) || b.in_at.localeCompare(a.in_at)))
  return json({
    now: t, date_label: dateLabel(c.today), time_label: timeLabel(c.now), total: units.reduce((s, u) => s + u.count, 0), units,
    auto_today: autoToday.map((v) => staffVisitView(v, w, t)),
    roll_call: await rollCallSummary(c.db, w, t),
  })
}

export async function staffResidents(c) {
  const w = await loadWorld(c.db)
  const nowLocal = localHHMM(c.now)
  return json({
    screening_enabled: w.home.screening_enabled,
    units: w.units.filter((u) => u.active).map((u) => ({
      id: u.id, name: u.name, hours_label: hoursLabel(u.hours), open_now: openNow(u.hours, nowLocal),
      restricted: noticesFor(w.notices, u.id).some((n) => n.severity === 'restricted'),
    })),
    residents: w.residents.filter((r) => activeResident(w, r.id)).sort(byFirstName)
      .map((r) => ({ id: r.id, name: residentName(r, w.home), room: r.room, unit_id: r.unit_id, by_arrangement: r.by_arrangement })),
  })
}

// Staff may sign someone in outside hours, for a by-arrangement resident, on a restricted unit or past the limit: recorded,
// with each warning that applied. Checks in API.md's order: resident missing, name, phone, unknown resident, screened, already_in.
export async function staffSignIn(c) {
  const body = await c.body()
  if (typeof body.resident_id !== 'string' || body.resident_id === '') throw bad('resident_id', 'Please pick who they are visiting.')
  const name = cleanName(body.visitor_name)
  if (!name) throw bad('visitor_name', 'Please type their name.')
  let phone = ''
  if (typeof body.visitor_phone === 'string' ? body.visitor_phone.trim() !== '' : body.visitor_phone != null) {
    phone = normalizePhone(body.visitor_phone)
    if (!phone) throw bad('visitor_phone', MSG.phone)
  }
  const w = await loadWorld(c.db)
  const found = activeResident(w, body.resident_id)
  if (!found) throw notFound("We can't find that resident.")
  if (w.home.screening_enabled && body.screened !== true) throw bad('screened', MSG.screened)
  if (phone) {
    const v = (await openVisits(c.db, c.nowIso, 'AND phone = ?', [phone]))[0]
    if (v) throw conflict('already_in', alreadyInMessage(timeLabel(v.in_at)))
  }
  const { resident, unit } = found
  const warnings = blockReasons({
    resident, unit, home: w.home, notices: noticesFor(w.notices, unit.id), nowLocal: localHHMM(c.now),
    residentCount: await residentCount(c, resident.id),
  }).map((r) => ({ code: r.code, message: r.message }))
  const v = newVisitRow({
    id: randomId('v'), tokenHash: null, name, phone, resident, unit, now: c.now, date: c.today, method: 'staff',
    signedInBy: c.staff.name, screened: w.home.screening_enabled,
  })
  await insertVisit(c.db, v)
  return json({ visit: staffVisitView(v, w, c.nowIso), warnings }, 201)
}

export async function staffSignOut(c) {
  const v = await c.db.prepare('SELECT * FROM visits WHERE id = ?').bind(c.params.id).first()
  if (!v) throw notFound("We can't find that visit.")
  const refused = () => conflict('not_in', 'That visitor is already signed out.')
  if (outOf(v, c.nowIso).out_at !== null) throw refused()
  const r = await c.db.prepare("UPDATE visits SET out_at = ?, out_kind = 'staff' WHERE id = ? AND out_at IS NULL")
    .bind(c.nowIso, v.id).run()
  if (r.meta.changes === 0) throw refused()
  const after = await c.db.prepare('SELECT * FROM visits WHERE id = ?').bind(v.id).first()
  return json({ visit: staffVisitView(after, await loadWorld(c.db), c.nowIso) })
}

// The day log: every visit with that local date, oldest first. Nothing past retention, even before maintenance deletes it.
export async function dayLog(c) {
  const date = c.url.searchParams.get('date') || c.today
  if (!isValidDate(date)) throw bad('date', 'Pick a real date.')
  const w = await loadWorld(c.db)
  const unit = c.url.searchParams.get('unit') || 'all'
  if (unit !== 'all' && !w.unitsById.has(unit)) throw notFound("We can't find that unit.")
  let visits = []
  if (date >= keptFrom(c.today, retentionDays(w.home))) {
    const { results } = await c.db.prepare(`SELECT * FROM visits WHERE date = ? ${unit === 'all' ? '' : 'AND unit_id = ?'}
      ORDER BY in_at, id`).bind(...(unit === 'all' ? [date] : [date, unit])).all()
    visits = results
  }
  return json({ date, date_label: dateLabel(date), unit, count: visits.length, visits: visits.map((v) => staffVisitView(v, w, c.nowIso)) })
}
