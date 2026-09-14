// Development-only stand-in for the Worker, loaded by api.js when the page has ?mock=1. Same shapes as docs/API.md, SAMPLE data
// only, kept in localStorage so a reload or a move between /staff/ and /settings/ keeps it. Every Playwright test runs against the
// real Worker, never this. The mock's clock is fixed (Mon Sep 14 2026, 4:05 PM NDT) unless the page has ?mocknow=2026-09-14T21:30.
// ?mockreset=1 starts again from the seed.

const KEY = 'visitor-log:mock-state'
const ZONE = 'America/St_Johns'
const OFFSET = '-02:30' // NDT: the mock only lives in September 2026
const params = new URLSearchParams(location.search)
const CLOCK = params.get('mocknow') || '2026-09-14T16:05'
const nowIso = () => new Date(`${CLOCK}:00${OFFSET}`).toISOString()

// ---------- time ----------
const pad = (n) => String(n).padStart(2, '0')
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
function inst(date, hm) {
  if (hm === '24:00') return inst(addDays(date, 1), '00:00')
  return new Date(`${date}T${hm}:00${OFFSET}`).toISOString()
}
const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function local(iso) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` }
}
function hmLabel(hm) {
  if (hm === '24:00') return 'midnight'
  let [H, M] = hm.split(':').map(Number)
  const ap = H < 12 ? 'AM' : 'PM'
  H = H % 12 || 12
  return `${H}:${pad(M)} ${ap}`
}
const timeLabel = (iso) => (iso ? hmLabel(local(iso).hm) : null)
const utc = (date) => new Date(`${date}T12:00:00Z`)
const dateLabel = (date) => { const d = utc(date); return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }
const longLabel = (date) => { const d = utc(date); return `${LONG_DAYS[d.getUTCDay()]}, ${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }
function hoursLabel(hours) {
  if (hours.length === 1 && hours[0].open === '00:00' && hours[0].close === '24:00') return 'Open all day'
  const parts = hours.map((w) => `${hmLabel(w.open)} to ${hmLabel(w.close)}`)
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}
const openAt = (hours, hm) => hours.some((w) => w.open <= hm && hm < w.close)

// ---------- state ----------
function seed() {
  const s = {
    home: {
      home_name: 'SAMPLE Harbourview Care Home (demo)', phone: '709-555-0142', sample: true, retention_days: 30, max_visitors_per_resident: 2,
      after_hours_message: 'Visiting hours are over for now. If you need to see someone, please call the unit.',
      desk_message: "Please see the nurse's desk.", screening_enabled: false, screening_stop_message: '',
    },
    questions: [],
    units: [
      { id: 'u_harbour', name: 'Harbour wing', hours: [{ open: '08:00', close: '11:30' }, { open: '13:30', close: '21:00' }], active: true },
      { id: 'u_lighthouse', name: 'Lighthouse wing', hours: [{ open: '00:00', close: '24:00' }], active: true },
      { id: 'u_cove', name: 'Cove unit', hours: [{ open: '10:00', close: '19:00' }], active: true },
    ],
    residents: [
      ['r_mary', 'Mary', 'S', '101', 'u_harbour'], ['r_george', 'George', 'P', '104', 'u_harbour'], ['r_ellen', 'Ellen', 'W', '108', 'u_harbour', true],
      ['r_frank', 'Frank', 'O', '201', 'u_lighthouse'], ['r_rose', 'Rose', 'B', '205', 'u_lighthouse'], ['r_walter', 'Walter', 'K', '210', 'u_lighthouse'],
      ['r_margaret', 'Margaret', 'L', '212', 'u_lighthouse'], ['r_agnes', 'Agnes', 'D', '301', 'u_cove'], ['r_bill', 'Bill', 'H', '304', 'u_cove'],
    ].map(([id, first_name, last_initial, room, unit_id, by]) => ({ id, first_name, last_initial, room, unit_id, by_arrangement: !!by, active: true })),
    staff: [
      { id: 's_donna', name: 'Donna R. (SAMPLE)', role: 'manager', pin: '7314', active: true },
      { id: 's_carl', name: 'Carl B. (SAMPLE)', role: 'staff', pin: '2580', active: true },
      { id: 's_amira', name: 'Amira H. (SAMPLE)', role: 'staff', pin: '4691', active: true },
    ],
    notices: [
      { id: 'n_1', unit_id: null, severity: 'info', active: true, created_at: inst('2026-09-12', '09:10'),
        message: 'SAMPLE notice: the side door is closed for painting this week. Please use the main entrance.' },
      { id: 'n_2', unit_id: 'u_cove', severity: 'outbreak', active: true, created_at: inst('2026-09-13', '08:40'),
        message: 'SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask and clean your hands before you go in.' },
    ],
    visits: [],
    roll_calls: [],
    seq: 100,
  }
  const T = '2026-09-14'
  const Y = '2026-09-13'
  const add = (o) => addVisit(s, o)
  add({ name: 'Linda P. (SAMPLE)', phone: '709-555-0111', resident_id: 'r_mary', date: T, hm: '11:00' })
  add({ name: 'Tom K. (SAMPLE)', phone: '709-555-0112', resident_id: 'r_george', date: T, hm: '14:05' })
  add({ name: 'Jenny W. (SAMPLE)', phone: '', resident_id: 'r_mary', date: T, hm: '15:10', by: 'Carl B. (SAMPLE)' })
  add({ name: 'Paul O. (SAMPLE)', phone: '709-555-0114', resident_id: 'r_frank', date: T, hm: '13:20' })
  add({ name: 'Grace B. (SAMPLE)', phone: '709-555-0115', resident_id: 'r_rose', date: T, hm: '15:45' })
  add({ name: 'Sam K. (SAMPLE)', phone: '709-555-0116', resident_id: 'r_walter', date: T, hm: '09:15', out: '10:40', kind: 'visitor' })
  add({ name: 'Nora D. (SAMPLE)', phone: '709-555-0117', resident_id: 'r_agnes', date: T, hm: '10:30', out: '12:00', kind: 'staff' })
  add({ name: 'Ruth S. (SAMPLE)', phone: '709-555-0118', resident_id: 'r_bill', date: T, hm: '17:30' })
  add({ name: 'Colin P. (SAMPLE)', phone: '709-555-0119', resident_id: 'r_george', date: T, hm: '19:40' })
  add({ name: 'Brenda O. (SAMPLE)', phone: '709-555-0120', resident_id: 'r_george', date: Y, hm: '19:30' })
  add({ name: 'Wayne L. (SAMPLE)', phone: '709-555-0121', resident_id: 'r_margaret', date: Y, hm: '14:00', out: '15:00', kind: 'visitor' })
  add({ name: 'Peggy D. (SAMPLE)', phone: '709-555-0122', resident_id: 'r_agnes', date: Y, hm: '16:20', out: '17:05', kind: 'staff' })
  return s
}

let resetDone = false
function load() {
  if (params.get('mockreset') === '1' && !resetDone) { resetDone = true; const s = seed(); save(s); return s }
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.home) return s } catch {}
  const s = seed()
  save(s)
  return s
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {} }
const nextId = (s, prefix) => `${prefix}_${++s.seq}`

function addVisit(s, { name, phone, resident_id, date, hm, out, kind, by, screened = false }) {
  const r = s.residents.find((x) => x.id === resident_id)
  const u = s.units.find((x) => x.id === r.unit_id)
  const in_at = inst(date, hm)
  const times = visitTimes(u, in_at)
  const v = {
    id: nextId(s, 'v'), visitor_name: name, visitor_phone: phone, resident_id, unit_id: u.id, date, in_at, ...times,
    out_at: out ? inst(date, out) : null, out_kind: out ? kind : null, method: by ? 'staff' : 'qr', signed_in_by: by || null, screened,
  }
  s.visits.push(v)
  return v
}

function visitTimes(unit, in_at) {
  const { date, hm } = local(in_at)
  const wins = unit.hours
  const closing = inst(date, wins.at(-1).close)
  const auto_out_at = in_at < closing ? closing : inst(addDays(date, 1), '00:00')
  const inside = wins.find((w) => w.open <= hm && hm < w.close)
  const later = wins.find((w) => w.open > hm)
  const due_at = inside ? inst(date, inside.close) : later ? inst(date, later.close) : auto_out_at
  return { due_at, auto_out_at }
}

// ---------- shapes ----------
const unitOf = (s, id) => s.units.find((u) => u.id === id)
const residentName = (s, r) => `${r.first_name} ${r.last_initial}.${s.home.sample ? ' (SAMPLE)' : ''}`
const SEV_LABEL = { info: 'Notice', restricted: 'Visiting restricted', outbreak: 'Outbreak' }
const SEV_ORDER = { outbreak: 0, restricted: 1, info: 2 }
function noticeOut(s, n, extra = false) {
  const u = n.unit_id ? unitOf(s, n.unit_id) : null
  const base = { id: n.id, unit: u ? { id: u.id, name: u.name } : null, severity: n.severity, severity_label: SEV_LABEL[n.severity], message: n.message }
  return extra ? { ...base, active: n.active, created_at: n.created_at, created_label: `${dateLabel(local(n.created_at).date)}, ${timeLabel(n.created_at)}` } : base
}
const activeNotices = (s, unitId) => s.notices.filter((n) => n.active && (n.unit_id === null || n.unit_id === unitId))
  .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.created_at < b.created_at ? 1 : -1))

const retained = (s, v, now) => {
  const today = local(now).date
  const age = (utc(today) - utc(v.date)) / 86400000
  return age <= s.home.retention_days
}
const effective = (v, now) => (!v.out_at && v.auto_out_at <= now ? { ...v, out_at: v.auto_out_at, out_kind: 'auto' } : v)
const isIn = (v, t) => v.in_at <= t && (!v.out_at || v.out_at > t) && v.auto_out_at > t

function staffVisit(s, v, now) {
  const e = effective(v, now)
  const r = s.residents.find((x) => x.id === v.resident_id)
  const u = unitOf(s, v.unit_id)
  const shownOut = e.out_at && e.out_at <= now ? e.out_at : null
  return {
    id: v.id, visitor_name: v.visitor_name, visitor_phone: v.visitor_phone, resident: { id: r.id, name: residentName(s, r), room: r.room },
    unit: { id: u.id, name: u.name }, date: v.date, date_label: dateLabel(v.date), in_at: v.in_at, in_label: timeLabel(v.in_at),
    due_at: v.due_at, due_label: timeLabel(v.due_at), overdue: isIn(v, now) && now >= v.due_at,
    out_at: shownOut, out_label: timeLabel(shownOut), out_kind: shownOut ? e.out_kind : null,
    method: v.method, signed_in_by: v.signed_in_by, screened: v.screened,
  }
}

function settingsOut(s) {
  return {
    home: { ...s.home },
    screening_questions: s.questions.map((q) => ({ ...q })),
    units: s.units.map((u) => ({ id: u.id, name: u.name, hours: u.hours, hours_label: hoursLabel(u.hours), active: u.active })),
    residents: [...s.residents].sort((a, b) => a.first_name.localeCompare(b.first_name) || a.room.localeCompare(b.room))
      .map((r) => ({ id: r.id, first_name: r.first_name, last_initial: r.last_initial, name: residentName(s, r), room: r.room, unit_id: r.unit_id, by_arrangement: r.by_arrangement, active: r.active })),
    notices: [...s.notices].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((n) => noticeOut(s, n, true)),
    staff: s.staff.map((m) => ({ id: m.id, name: m.name, role: m.role, active: m.active })),
  }
}

function rollOut(s, rc, now) {
  const end = rc.ended_at || now
  const entries = s.visits
    .filter((v) => isIn(v, rc.started_at) || (v.in_at > rc.started_at && v.in_at <= end))
    .map((v) => {
      const e = effective(v, now)
      const r = s.residents.find((x) => x.id === v.resident_id)
      const u = unitOf(s, v.unit_id)
      const mark = rc.marks[v.id]
      const out = e.out_at && e.out_at <= now ? e.out_at : null
      return {
        visit_id: v.id, visitor_name: v.visitor_name, visitor_phone: v.visitor_phone, resident_name: residentName(s, r), room: r.room,
        unit: { id: u.id, name: u.name }, in_label: timeLabel(v.in_at), after_start: v.in_at > rc.started_at, out_label: timeLabel(out),
        found: !!mark, found_label: mark ? timeLabel(mark.at) : null, found_by: mark ? mark.by : null,
      }
    })
    .sort((a, b) => s.units.findIndex((u) => u.id === a.unit.id) - s.units.findIndex((u) => u.id === b.unit.id) || a.visitor_name.localeCompare(b.visitor_name))
  return {
    id: rc.id, started_at: rc.started_at, started_label: timeLabel(rc.started_at), started_by: rc.started_by,
    ended_at: rc.ended_at, ended_label: timeLabel(rc.ended_at), ended_by: rc.ended_by,
    total: entries.length, found: entries.filter((x) => x.found).length, entries,
  }
}

// ---------- http ----------
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
class Fail extends Error {
  constructor(status, code, error, field, extra) { super(error); this.resp = json(status, { error, code, ...(field ? { field } : {}), ...extra }) }
}
const bad = (field, error) => new Fail(400, 'bad_request', error, field)
const notFound = (error = "We can't find that.") => new Fail(404, 'not_found', error)

function auth(s, token, role) {
  const m = token && token.startsWith('mock-token-') && s.staff.find((x) => x.id === token.slice(11) && x.active)
  if (!m) throw new Fail(401, 'unauthorized', 'Please sign in again.')
  if (role === 'manager' && m.role !== 'manager') throw new Fail(403, 'forbidden', 'Only a manager can change the settings.')
  return m
}

function normalPhone(raw, field) {
  let d = String(raw ?? '').replace(/[\s\-.()]/g, '')
  if (d.startsWith('+1')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (!/^\d{10}$/.test(d)) throw bad(field, 'Please type a 10-digit phone number, like 709-555-0123.')
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}
function checkName(raw, field) {
  const n = String(raw ?? '').trim()
  if (n.length < 2 || n.length > 60 || !/\p{L}/u.test(n)) throw bad(field, 'Please type your name.')
  return n
}
function checkHours(hours) {
  const msg = "Visiting hours need a start before the end, and the times can't overlap."
  const ok = Array.isArray(hours) && hours.length >= 1 && hours.length <= 4 && hours.every((w, i) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(w.open) && (/^([01]\d|2[0-3]):[0-5]\d$/.test(w.close) || w.close === '24:00') && w.close !== '00:00' &&
    w.open < w.close && (i === 0 || hours[i - 1].close <= w.open))
  if (!ok) throw bad('hours', msg)
}

function csvField(value) {
  let v = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function contactsRows(s, q, now) {
  const today = local(now).date
  const from = q.get('from') || today
  const to = q.get('to') || today
  const unit = q.get('unit') || 'all'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw bad('from', 'Please pick a start date.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) throw bad('to', 'Please pick an end date.')
  if (from > to) throw bad('to', 'The end date is before the start date.')
  if (unit !== 'all' && !unitOf(s, unit)) throw notFound("We can't find that unit.")
  const kinds = { visitor: 'Visitor', staff: 'Staff', auto: 'Auto at closing' }
  const rows = s.visits.filter((v) => v.date >= from && v.date <= to && (unit === 'all' || v.unit_id === unit) && retained(s, v, now) && v.in_at <= now)
    .sort((a, b) => (a.in_at < b.in_at ? -1 : 1))
    .map((v) => {
      const sv = staffVisit(s, v, now)
      return {
        visit_id: v.id, date: v.date, date_label: dateLabel(v.date), unit_name: sv.unit.name, resident_name: sv.resident.name, room: sv.resident.room,
        visitor_name: v.visitor_name, visitor_phone: v.visitor_phone, in_label: sv.in_label, out_label: sv.out_label,
        signed_out: sv.out_kind ? kinds[sv.out_kind] : 'Still in', signed_in_by: v.signed_in_by || 'QR code',
      }
    })
  return { from, to, unit, count: rows.length, rows }
}

export async function handle(method, path, body = {}, token) {
  await new Promise((r) => setTimeout(r, 40))
  const s = load()
  const url = new URL(path, location.origin)
  try {
    const out = route(s, method, url.pathname, url.searchParams, body || {}, token, nowIso())
    save(s)
    return out
  } catch (e) {
    if (e.resp) return e.resp
    console.error('mock', e)
    return json(500, { error: 'The mock broke.', code: 'mock' })
  }
}

function route(s, method, p, q, body, token, now) {
  const { date: today, hm } = local(now)
  const M = (m, re) => method === m && p.match(re)
  let m

  if (M('GET', /^\/api\/info$/)) {
    return json(200, { home_name: s.home.home_name, sample: s.home.sample, phone: s.home.phone, zone: ZONE, retention_days: s.home.retention_days,
      today, date_label: dateLabel(today), long_label: longLabel(today), now, now_local: hm, time_label: hmLabel(hm) })
  }
  if (M('POST', /^\/api\/signin$/)) {
    const who = s.staff.find((x) => x.active && x.pin === String(body.pin))
    if (!who) throw new Fail(401, 'unauthorized', 'That PIN is not right.', 'pin')
    return json(200, { token: `mock-token-${who.id}`, role: who.role, staff: { id: who.id, name: who.name }, expires_at: new Date(Date.parse(now) + 12 * 3600e3).toISOString() })
  }
  if (M('POST', /^\/api\/signout$/)) { auth(s, token); return json(200, { ok: true }) }
  if (M('GET', /^\/api\/visitor\/start$/)) {
    return json(200, { home_name: s.home.home_name, sample: s.home.sample, phone: s.home.phone, retention_days: s.home.retention_days, today,
      date_label: dateLabel(today), time_label: hmLabel(hm), home_notices: activeNotices(s, '__none__').map((n) => noticeOut(s, n)),
      screening: { enabled: s.home.screening_enabled, questions: s.home.screening_enabled ? s.questions : [] } })
  }

  // ----- staff -----
  if (p.startsWith('/api/staff/')) {
    const me = auth(s, token)
    const units = s.units.filter((u) => u.active)
    if (M('GET', /^\/api\/staff\/building$/)) {
      const shown = [...units, ...s.units.filter((u) => !u.active && s.visits.some((v) => v.unit_id === u.id && isIn(v, now)))]
      const out = shown.map((u) => {
        const visits = s.visits.filter((v) => v.unit_id === u.id && isIn(v, now)).sort((a, b) => (a.in_at < b.in_at ? -1 : 1)).map((v) => staffVisit(s, v, now))
        return { id: u.id, name: u.name, active: u.active, hours_label: hoursLabel(u.hours), open_now: openAt(u.hours, hm), notices: activeNotices(s, u.id).map((n) => noticeOut(s, n)), count: visits.length, visits }
      })
      const auto_today = s.visits.filter((v) => v.date === today && !v.out_at && v.auto_out_at <= now).sort((a, b) => (a.auto_out_at < b.auto_out_at ? 1 : -1)).map((v) => staffVisit(s, v, now))
      const going = s.roll_calls.find((r) => !r.ended_at)
      const rc = going ? rollOut(s, going, now) : null
      return json(200, { now, date_label: dateLabel(today), time_label: hmLabel(hm), total: out.reduce((n, u) => n + u.count, 0), units: out, auto_today,
        roll_call: rc ? { id: rc.id, started_label: rc.started_label, total: rc.total, found: rc.found } : null })
    }
    if (M('GET', /^\/api\/staff\/residents$/)) {
      return json(200, {
        screening_enabled: s.home.screening_enabled,
        units: units.map((u) => ({ id: u.id, name: u.name, hours_label: hoursLabel(u.hours), open_now: openAt(u.hours, hm), restricted: activeNotices(s, u.id).some((n) => n.severity === 'restricted') })),
        residents: s.residents.filter((r) => r.active && unitOf(s, r.unit_id)?.active).sort((a, b) => a.first_name.localeCompare(b.first_name))
          .map((r) => ({ id: r.id, name: residentName(s, r), room: r.room, unit_id: r.unit_id, by_arrangement: r.by_arrangement })),
      })
    }
    if (M('POST', /^\/api\/staff\/visits$/)) {
      if (typeof body.resident_id !== 'string' || !body.resident_id) throw bad('resident_id', 'Please pick who they are visiting.')
      const name = String(body.visitor_name ?? '').trim()
      if (name.length < 2 || name.length > 60 || !/\p{L}/u.test(name)) throw bad('visitor_name', 'Please type their name.')
      const phone = String(body.visitor_phone ?? '').trim() ? normalPhone(body.visitor_phone, 'visitor_phone') : ''
      const r = s.residents.find((x) => x.id === body.resident_id && x.active)
      if (!r) throw notFound("We can't find that resident. Please see the nurse's desk.")
      if (s.home.screening_enabled && body.screened !== true) throw bad('screened', 'Ask the screening questions first. Only sign in a visitor who answered No to every one.')
      if (phone && s.visits.some((v) => v.visitor_phone === phone && isIn(v, now))) {
        const v = s.visits.find((x) => x.visitor_phone === phone && isIn(x, now))
        throw new Fail(409, 'already_in', `This phone number is already signed in, since ${timeLabel(v.in_at)}. Please sign out first.`)
      }
      const u = unitOf(s, r.unit_id)
      const rn = residentName(s, r)
      const warnings = []
      if (r.by_arrangement) warnings.push({ code: 'by_arrangement', message: `Visits with ${rn} are by arrangement only. ${s.home.desk_message}` })
      if (activeNotices(s, u.id).some((n) => n.severity === 'restricted')) warnings.push({ code: 'restricted_unit', message: `${u.name}: visitors can't sign themselves in right now. ${s.home.desk_message}` })
      if (!openAt(u.hours, hm)) warnings.push({ code: 'outside_hours', message: `${s.home.after_hours_message} Visiting hours on ${u.name}: ${hoursLabel(u.hours)}.` })
      const limit = s.home.max_visitors_per_resident
      if (limit && s.visits.filter((v) => v.resident_id === r.id && isIn(v, now)).length >= limit) {
        warnings.push({ code: 'resident_full', message: `${rn} already has ${limit === 1 ? '1 visitor' : `${limit} visitors`} signed in. Please wait until someone signs out. ${s.home.desk_message}` })
      }
      const v = addVisit(s, { name, phone, resident_id: r.id, date: today, hm, by: me.name, screened: s.home.screening_enabled })
      v.in_at = now
      Object.assign(v, visitTimes(u, now))
      return json(201, { visit: staffVisit(s, v, now), warnings })
    }
    if ((m = M('POST', /^\/api\/staff\/visits\/([^/]+)\/signout$/))) {
      const v = s.visits.find((x) => x.id === m[1])
      if (!v) throw notFound("We can't find that visit.")
      if (!isIn(v, now)) throw new Fail(409, 'not_in', 'That visitor is already signed out.')
      v.out_at = now
      v.out_kind = 'staff'
      return json(200, { visit: staffVisit(s, v, now) })
    }
    if (M('GET', /^\/api\/staff\/visits$/)) {
      const date = q.get('date') || today
      const unit = q.get('unit') || 'all'
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('date', 'Please pick a date.')
      if (unit !== 'all' && !unitOf(s, unit)) throw notFound("We can't find that unit.")
      const visits = s.visits.filter((v) => v.date === date && (unit === 'all' || v.unit_id === unit) && retained(s, v, now) && v.in_at <= now)
        .sort((a, b) => (a.in_at < b.in_at ? -1 : 1)).map((v) => staffVisit(s, v, now))
      return json(200, { date, date_label: dateLabel(date), unit, count: visits.length, visits })
    }
    if (M('GET', /^\/api\/staff\/contacts$/)) return json(200, contactsRows(s, q, now))
    if (M('GET', /^\/api\/staff\/contacts\.csv$/)) {
      const c = contactsRows(s, q, now)
      const lines = ['Date,Unit,Resident,Room,Visitor,Phone,In,Out,Signed out,Signed in by',
        ...c.rows.map((r) => [r.date, r.unit_name, r.resident_name, r.room, r.visitor_name, r.visitor_phone, r.in_label, r.out_label || '', r.signed_out, r.signed_in_by].map(csvField).join(','))]
      return new Response(lines.map((l) => `${l}\r\n`).join(''), { status: 200, headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="visitor-contacts-${c.unit === 'all' ? 'all-units' : c.unit}-${c.from}-to-${c.to}.csv"`,
      } })
    }
    if (M('GET', /^\/api\/staff\/rollcall\/current$/)) {
      const going = s.roll_calls.find((r) => !r.ended_at)
      return json(200, { roll_call: going ? rollOut(s, going, now) : null })
    }
    if (M('POST', /^\/api\/staff\/rollcall$/)) {
      const going = s.roll_calls.find((r) => !r.ended_at)
      if (going) throw new Fail(409, 'bad_state', 'A roll call is already going.', null, { roll_call_id: going.id })
      const rc = { id: nextId(s, 'rc'), started_at: now, started_by: me.name, ended_at: null, ended_by: null, marks: {} }
      s.roll_calls.push(rc)
      return json(201, { roll_call: rollOut(s, rc, now) })
    }
    if ((m = p.match(/^\/api\/staff\/rollcall\/([^/]+)(\/found|\/end)?$/))) {
      const rc = s.roll_calls.find((r) => r.id === m[1])
      if (!rc) throw notFound("We can't find that roll call.")
      if (method === 'GET' && !m[2]) return json(200, { roll_call: rollOut(s, rc, now) })
      if (method === 'POST' && m[2] === '/found') {
        const out = rollOut(s, rc, now)
        if (!out.entries.some((e) => e.visit_id === body.visit_id)) throw notFound("We can't find that visitor on this roll call.")
        if (rc.ended_at) throw new Fail(409, 'bad_state', 'This roll call has ended.')
        if (body.found) rc.marks[body.visit_id] = { at: now, by: me.name }
        else delete rc.marks[body.visit_id]
        return json(200, { roll_call: rollOut(s, rc, now) })
      }
      if (method === 'POST' && m[2] === '/end') {
        if (rc.ended_at) throw new Fail(409, 'bad_state', 'This roll call has ended.')
        rc.ended_at = now
        rc.ended_by = me.name
        return json(200, { roll_call: rollOut(s, rc, now) })
      }
    }
    throw notFound()
  }

  // ----- settings -----
  if (p === '/api/settings' || p.startsWith('/api/settings/')) {
    auth(s, token, 'manager')
    const answer = (status = 200, extra = {}) => json(status, { ...extra, settings: settingsOut(s) })
    if (M('GET', /^\/api\/settings$/)) return answer()
    if (M('PUT', /^\/api\/settings\/home$/)) {
      const h = { ...s.home }
      if ('retention_days' in body) {
        if (!Number.isInteger(body.retention_days) || body.retention_days < 1 || body.retention_days > 365) throw bad('retention_days', 'Keep visitor records for 1 to 365 days.')
        h.retention_days = body.retention_days
      }
      if ('max_visitors_per_resident' in body) {
        const v = body.max_visitors_per_resident
        if (v !== null && (!Number.isInteger(v) || v < 1 || v > 20)) throw bad('max_visitors_per_resident', 'Pick 1 to 20 visitors, or leave it blank for no limit.')
        h.max_visitors_per_resident = v
      }
      for (const k of ['after_hours_message', 'desk_message']) {
        if (k in body) {
          const t = String(body[k] ?? '').trim()
          if (t.length < 1 || t.length > 300) throw bad(k, 'Write 1 to 300 characters.')
          h[k] = t
        }
      }
      if ('phone' in body) h.phone = String(body.phone ?? '').trim() ? normalPhone(body.phone, 'phone') : ''
      s.home = h
      return answer()
    }
    if (M('PUT', /^\/api\/settings\/screening$/)) {
      const qs = Array.isArray(body.questions) ? body.questions : []
      if (qs.length > 10 || qs.some((x) => String(x.text ?? '').trim().length < 5 || String(x.text).trim().length > 200)) {
        throw bad('questions', 'Each question needs 5 to 200 characters, and there can be at most 10.')
      }
      if (body.enabled && qs.length === 0) throw bad('questions', 'Add at least one question before you turn screening on.')
      if (body.enabled && !String(body.stop_message ?? '').trim()) throw bad('stop_message', 'Write what a visitor who answers Yes should do.')
      s.questions = qs.map((x) => ({ id: x.id && s.questions.some((o) => o.id === x.id) ? x.id : nextId(s, 'q'), text: String(x.text).trim() }))
      s.home.screening_enabled = !!body.enabled
      s.home.screening_stop_message = String(body.stop_message ?? '').trim()
      return answer()
    }
    if (M('POST', /^\/api\/settings\/notices$/)) {
      if (!SEV_LABEL[body.severity]) throw bad('severity', 'Pick what kind of notice this is.')
      const msg = String(body.message ?? '').trim()
      if (msg.length < 1 || msg.length > 300) throw bad('message', 'Write the notice in 1 to 300 characters.')
      if (body.unit_id !== null && body.unit_id !== undefined && !unitOf(s, body.unit_id)) throw notFound("We can't find that unit.")
      const n = { id: nextId(s, 'n'), unit_id: body.unit_id ?? null, severity: body.severity, message: msg, active: true, created_at: now }
      s.notices.push(n)
      return answer(201, { id: n.id })
    }
    if ((m = p.match(/^\/api\/settings\/notices\/([^/]+)$/))) {
      const i = s.notices.findIndex((n) => n.id === m[1])
      if (i < 0) throw notFound("We can't find that notice.")
      if (method === 'DELETE') { s.notices.splice(i, 1); return answer() }
      if (method === 'PUT') {
        const n = s.notices[i]
        if ('active' in body) n.active = !!body.active
        if ('message' in body) n.message = String(body.message)
        if ('severity' in body) n.severity = body.severity
        if ('unit_id' in body) n.unit_id = body.unit_id
        return answer()
      }
    }
    if (M('POST', /^\/api\/settings\/units$/)) {
      const name = String(body.name ?? '').trim()
      if (name.length < 1 || name.length > 40) throw bad('name', 'Give the unit a name of 1 to 40 characters.')
      if (s.units.some((u) => u.active && u.name.toLowerCase() === name.toLowerCase())) throw bad('name', 'Another unit already has that name.')
      checkHours(body.hours)
      const u = { id: nextId(s, 'u'), name, hours: body.hours, active: true }
      s.units.push(u)
      return answer(201, { id: u.id })
    }
    if ((m = M('PUT', /^\/api\/settings\/units\/([^/]+)$/))) {
      const u = unitOf(s, m[1])
      if (!u) throw notFound("We can't find that unit.")
      if ('name' in body) {
        const name = String(body.name ?? '').trim()
        if (name.length < 1 || name.length > 40) throw bad('name', 'Give the unit a name of 1 to 40 characters.')
        u.name = name
      }
      if ('hours' in body) { checkHours(body.hours); u.hours = body.hours }
      if ('active' in body) {
        if (!body.active && s.residents.some((r) => r.active && r.unit_id === u.id)) throw new Fail(409, 'bad_state', 'Move or remove the residents on this unit first.')
        u.active = !!body.active
      }
      return answer()
    }
    if (M('POST', /^\/api\/settings\/residents$/) || (m = M('PUT', /^\/api\/settings\/residents\/([^/]+)$/))) {
      const existing = m ? s.residents.find((r) => r.id === m[1]) : null
      if (m && !existing) throw notFound("We can't find that resident.")
      const r = existing ? { ...existing } : { id: nextId(s, 'r'), active: true, by_arrangement: false }
      const has = (k) => !existing || k in body
      if (has('first_name')) { const v = String(body.first_name ?? '').trim(); if (!/^[\p{L}][\p{L} '\-]{0,29}$/u.test(v)) throw bad('first_name', 'Type a first name (letters only).'); r.first_name = v }
      if (has('last_initial')) { const v = String(body.last_initial ?? '').trim(); if (!/^[A-Za-z]$/.test(v)) throw bad('last_initial', 'Type one letter for the last initial.'); r.last_initial = v.toUpperCase() }
      if (has('room')) { const v = String(body.room ?? '').trim(); if (!/^[A-Za-z0-9 \-]{1,10}$/.test(v)) throw bad('room', 'Type the room, like 101.'); r.room = v }
      if (has('unit_id')) { const u = unitOf(s, body.unit_id); if (!u || !u.active) throw bad('unit_id', 'Pick a unit.'); r.unit_id = u.id }
      if ('by_arrangement' in body) r.by_arrangement = !!body.by_arrangement
      if ('active' in body) r.active = !!body.active
      if (existing) Object.assign(existing, r)
      else s.residents.push(r)
      return answer(existing ? 200 : 201, existing ? {} : { id: r.id })
    }
    if (M('POST', /^\/api\/settings\/staff$/) || (m = M('PUT', /^\/api\/settings\/staff\/([^/]+)$/))) {
      const existing = m ? s.staff.find((x) => x.id === m[1]) : null
      if (m && !existing) throw notFound("We can't find that staff member.")
      const r = existing ? { ...existing } : { id: nextId(s, 's'), active: true }
      const has = (k) => !existing || k in body
      if (has('name')) { const v = String(body.name ?? '').trim(); if (v.length < 2 || v.length > 60) throw bad('name', 'Type their name.'); r.name = v }
      if (has('role')) { if (!['staff', 'manager'].includes(body.role)) throw bad('role', 'Pick Staff or Manager.'); r.role = body.role }
      if (has('pin')) {
        const v = String(body.pin ?? '')
        if (!/^\d{4,6}$/.test(v)) throw bad('pin', 'A PIN is 4 to 6 digits.')
        if (s.staff.some((x) => x.id !== r.id && x.active && x.pin === v)) throw new Fail(409, 'pin_taken', 'Another staff member already has that PIN. Pick a different one.', 'pin')
        r.pin = v
      }
      if ('active' in body) r.active = !!body.active
      const after = s.staff.map((x) => (x.id === r.id ? r : x))
      if (existing && !after.some((x) => x.active && x.role === 'manager')) throw new Fail(409, 'bad_state', 'The home needs at least one manager.')
      if (existing) Object.assign(existing, r)
      else s.staff.push(r)
      return answer(existing ? 200 : 201, existing ? {} : { id: r.id })
    }
    throw notFound()
  }
  throw notFound()
}
