// Reads shared by the routes, the "in the building" rule, and the JSON shapes of docs/API.md "Objects".
import { autoOutAt, dueAt } from './hours.js'
import { addDays, dateLabel, localInstant, timeLabel } from './time.js'

export const HOME_DEFAULTS = {
  home_name: '', phone: '', sample: false, retention_days: 30, max_visitors_per_resident: 2,
  after_hours_message: 'Visiting hours are over for now. If you need to see someone, please call the unit.',
  desk_message: "Please see the nurse's desk.", screening_enabled: false, screening_stop_message: '',
}

export const SEVERITY_LABELS = { info: 'Notice', restricted: 'Visiting restricted', outbreak: 'Outbreak' }
const SEVERITY_ORDER = { outbreak: 0, restricted: 1, info: 2 }

const homeOf = (row) => (row ? {
  home_name: row.home_name, phone: row.phone, sample: row.sample === 1, retention_days: row.retention_days,
  max_visitors_per_resident: row.max_visitors_per_resident, after_hours_message: row.after_hours_message,
  desk_message: row.desk_message, screening_enabled: row.screening_enabled === 1, screening_stop_message: row.screening_stop_message,
} : { ...HOME_DEFAULTS })

// The whole home in one consistent read: home (defaults before the row exists), units in order, residents, notices, questions.
export async function loadWorld(db) {
  const [home, units, residents, notices, questions] = await db.batch([
    db.prepare('SELECT * FROM home WHERE id = 1'),
    db.prepare('SELECT * FROM units ORDER BY position, name'),
    db.prepare('SELECT * FROM residents'),
    db.prepare('SELECT * FROM notices'),
    db.prepare('SELECT * FROM screening_questions ORDER BY position, id'),
  ])
  const w = {
    hasHome: home.results.length > 0,
    home: homeOf(home.results[0]),
    units: units.results.map((u) => ({ id: u.id, name: u.name, hours: JSON.parse(u.hours), position: u.position, active: u.active === 1 })),
    residents: residents.results.map((r) => ({ ...r, by_arrangement: r.by_arrangement === 1, active: r.active === 1 })),
    allNotices: notices.results.map((n) => ({ ...n, active: n.active === 1 })),
    questions: questions.results.map((q) => ({ id: q.id, text: q.text })),
  }
  w.unitsById = new Map(w.units.map((u) => [u.id, u]))
  w.residentsById = new Map(w.residents.map((r) => [r.id, r]))
  w.notices = sortNotices(w.allNotices.filter((n) => n.active))
  return w
}

// By first name, then room.
export const byFirstName = (a, b) =>
  a.first_name.toLowerCase().localeCompare(b.first_name.toLowerCase()) || a.room.localeCompare(b.room)

export const residentName = (r, home) => `${r.first_name} ${r.last_initial}.${home.sample ? ' (SAMPLE)' : ''}`

// The active resident and their active unit, or null.
export function activeResident(w, id) {
  const r = typeof id === 'string' ? w.residentsById.get(id) : null
  const u = r && w.unitsById.get(r.unit_id)
  return r && r.active && u && u.active ? { resident: { ...r, name: residentName(r, w.home) }, unit: u } : null
}

// ---------- notices ----------

// Outbreak, restricted, info, then newest first.
export const sortNotices = (list) => [...list].sort((a, b) =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0) ||
  (a.id < b.id ? 1 : -1))

export const homeNoticesOf = (notices) => notices.filter((n) => n.unit_id === null)
export const unitNoticesOf = (notices, unitId) => notices.filter((n) => n.unit_id === unitId)
// What applies to a unit: the whole home's notices and the unit's own.
export const noticesFor = (notices, unitId) => notices.filter((n) => n.unit_id === null || n.unit_id === unitId)

export function noticeView(n, w) {
  const u = n.unit_id ? w.unitsById.get(n.unit_id) : null
  return {
    id: n.id, unit: n.unit_id ? { id: n.unit_id, name: u ? u.name : '' } : null, severity: n.severity,
    severity_label: SEVERITY_LABELS[n.severity], message: n.message,
  }
}

// ---------- visits: in the building, out, the link ----------

// In the building at instant t (ISO): in_at <= t, not signed out by t, and auto_out_at still ahead.
export const inBuildingAt = (v, t) => v.in_at <= t && (v.out_at === null || v.out_at > t) && v.auto_out_at > t

// How a visit reads at t: a passed auto_out_at with no out_at is signed out, 'auto', at auto_out_at.
export function outOf(v, t) {
  if (v.out_at !== null) return { out_at: v.out_at, out_kind: v.out_kind }
  if (v.auto_out_at <= t) return { out_at: v.auto_out_at, out_kind: 'auto' }
  return { out_at: null, out_kind: null }
}

// The sign-out link works until the next local midnight after in_at.
export const linkExpiresAt = (v) => localInstant(addDays(v.date, 1), 0, 0).toISOString()

// Visits that could be in the building at t (the rule itself is applied in JS by inBuildingAt).
export async function openVisits(db, t, where = '', binds = []) {
  const { results } = await db.prepare(`SELECT * FROM visits WHERE (out_at IS NULL OR out_at > ?) ${where} ORDER BY in_at, id`)
    .bind(t, ...binds).all()
  return results.filter((v) => inBuildingAt(v, t))
}

export function visitorVisitView(v, w, t) {
  const r = w.residentsById.get(v.resident_id)
  const u = w.unitsById.get(v.unit_id)
  const out = outOf(v, t)
  return {
    state: out.out_at === null ? 'in' : 'out', home_name: w.home.home_name, visitor_name: v.visitor_name,
    resident: { name: r ? residentName(r, w.home) : '', room: r ? r.room : '', unit_name: u ? u.name : '' },
    date: v.date, date_label: dateLabel(v.date), in_at: v.in_at, in_label: timeLabel(v.in_at),
    out_at: out.out_at, out_label: out.out_at ? timeLabel(out.out_at) : null, out_kind: out.out_kind,
    home_notices: homeNoticesOf(w.notices).map((n) => noticeView(n, w)),
    unit_notices: unitNoticesOf(w.notices, v.unit_id).map((n) => noticeView(n, w)),
    link_expires_at: linkExpiresAt(v),
  }
}

export function staffVisitView(v, w, t) {
  const r = w.residentsById.get(v.resident_id)
  const u = w.unitsById.get(v.unit_id)
  const out = outOf(v, t)
  return {
    id: v.id, visitor_name: v.visitor_name, visitor_phone: v.phone,
    resident: { id: v.resident_id, name: r ? residentName(r, w.home) : '', room: r ? r.room : '' },
    unit: { id: v.unit_id, name: u ? u.name : '' }, date: v.date, date_label: dateLabel(v.date),
    in_at: v.in_at, in_label: timeLabel(v.in_at), due_at: v.due_at, due_label: timeLabel(v.due_at),
    overdue: inBuildingAt(v, t) && t >= v.due_at,
    out_at: out.out_at, out_label: out.out_at ? timeLabel(out.out_at) : null, out_kind: out.out_kind,
    method: v.method, signed_in_by: v.signed_in_by, screened: v.screened === 1,
  }
}

// The row for a new visit, with due_at and auto_out_at fixed from the unit's hours at sign-in.
export function newVisitRow({ id, tokenHash, name, phone, resident, unit, now, date, method, signedInBy, screened }) {
  return {
    id, token_hash: tokenHash, visitor_name: name, phone, resident_id: resident.id, unit_id: unit.id, in_at: now.toISOString(),
    date, due_at: dueAt(unit.hours, now).toISOString(), auto_out_at: autoOutAt(unit.hours, now).toISOString(), out_at: null, out_kind: null, method,
    signed_in_by: signedInBy, screened: screened ? 1 : 0,
  }
}

export async function insertVisit(db, v) {
  await db.prepare(`INSERT INTO visits (id, token_hash, visitor_name, phone, resident_id, unit_id, in_at, date, due_at, auto_out_at,
    out_at, out_kind, method, signed_in_by, screened) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`)
    .bind(v.id, v.token_hash, v.visitor_name, v.phone, v.resident_id, v.unit_id, v.in_at, v.date, v.due_at, v.auto_out_at, v.method,
      v.signed_in_by, v.screened).run()
}
