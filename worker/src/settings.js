// Settings routes (role manager). Every write answers with the whole settings object.
import { randomId } from './auth.js'
import { hoursLabel } from './hours.js'
import { bad, json, notFound } from './http.js'
import { MSG, normalizePhone } from './rules.js'
import { dateLabel, localDate, timeLabel } from './time.js'
import { byFirstName, loadWorld, noticeView, residentName } from './world.js'

export const SEVERITIES = ['info', 'restricted', 'outbreak']
const NOTICE_MISSING = "We can't find that notice."
const UNIT_MISSING = "We can't find that unit."

export async function settingsView(db) {
  const w = await loadWorld(db)
  const { results: staff } = await db.prepare('SELECT id, name, role, active FROM staff ORDER BY name, id').all()
  const h = w.home
  return {
    home: {
      home_name: h.home_name, phone: h.phone, sample: h.sample, retention_days: h.retention_days,
      max_visitors_per_resident: h.max_visitors_per_resident, after_hours_message: h.after_hours_message, desk_message: h.desk_message,
      screening_enabled: h.screening_enabled, screening_stop_message: h.screening_stop_message,
    },
    screening_questions: w.questions,
    units: w.units.map((u) => ({ id: u.id, name: u.name, hours: u.hours, hours_label: hoursLabel(u.hours), active: u.active })),
    residents: [...w.residents].sort(byFirstName).map((r) => ({
      id: r.id, first_name: r.first_name, last_initial: r.last_initial, name: residentName(r, h), room: r.room, unit_id: r.unit_id,
      by_arrangement: r.by_arrangement, active: r.active,
    })),
    notices: [...w.allNotices].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).map((n) => ({
      ...noticeView(n, w), active: n.active, created_at: n.created_at,
      created_label: `${dateLabel(localDate(n.created_at))}, ${timeLabel(n.created_at)}`,
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role, active: s.active === 1 })),
  }
}

export const getSettings = async (c) => json({ settings: await settingsView(c.db) })

// An integer from a JSON number or a string of digits, else null.
const intOf = (x) => (Number.isInteger(x) ? x : typeof x === 'string' && /^\d+$/.test(x.trim()) ? Number(x) : null)
const has = (b, k) => Object.prototype.hasOwnProperty.call(b, k)

const message300 = (b, field, text) => {
  const s = typeof b[field] === 'string' ? b[field].trim() : ''
  if (s.length < 1 || s.length > 300) throw bad(field, text)
  return s
}

export async function putHome(c) {
  const b = await c.body()
  const sets = []
  if (has(b, 'phone')) {
    const phone = b.phone === '' ? '' : normalizePhone(b.phone)
    if (phone === null) throw bad('phone', MSG.phone)
    sets.push(['phone', phone])
  }
  if (has(b, 'retention_days')) {
    const n = intOf(b.retention_days)
    if (n === null || n < 1 || n > 365) throw bad('retention_days', 'Keep visitor records for 1 to 365 days.')
    sets.push(['retention_days', n])
  }
  if (has(b, 'max_visitors_per_resident')) {
    const raw = b.max_visitors_per_resident
    const n = raw === null || raw === '' ? null : intOf(raw)
    if ((raw !== null && raw !== '') && (n === null || n < 1 || n > 20)) {
      throw bad('max_visitors_per_resident', 'Allow 1 to 20 visitors per resident, or leave it blank for no limit.')
    }
    sets.push(['max_visitors_per_resident', n])
  }
  if (has(b, 'after_hours_message')) {
    sets.push(['after_hours_message', message300(b, 'after_hours_message', 'Write the after-hours message in 1 to 300 characters.')])
  }
  if (has(b, 'desk_message')) sets.push(['desk_message', message300(b, 'desk_message', 'Write the desk message in 1 to 300 characters.')])
  if (sets.length) {
    await c.db.prepare(`UPDATE home SET ${sets.map(([k]) => `${k} = ?`).join(', ')} WHERE id = 1`).bind(...sets.map(([, v]) => v)).run()
  }
  return getSettings(c)
}

// Replaces the list; a question sent with an existing id keeps it.
export async function putScreening(c) {
  const b = await c.body()
  const w = await loadWorld(c.db)
  let questions = w.questions
  if (has(b, 'questions')) {
    if (!Array.isArray(b.questions) || b.questions.length > 10) throw bad('questions', 'You can have up to 10 questions.')
    const existing = new Set(w.questions.map((q) => q.id))
    const used = new Set()
    questions = b.questions.map((q) => {
      const text = q && typeof q.text === 'string' ? q.text.trim() : ''
      if (text.length < 5 || text.length > 200) throw bad('questions', 'Each question needs 5 to 200 characters.')
      const id = q && typeof q.id === 'string' && existing.has(q.id) && !used.has(q.id) ? q.id : randomId('q')
      used.add(id)
      return { id, text }
    })
  }
  const enabled = has(b, 'enabled') ? b.enabled : w.home.screening_enabled
  if (typeof enabled !== 'boolean') throw bad('enabled', 'Turn screening on or off.')
  const stop = has(b, 'stop_message') ? b.stop_message : w.home.screening_stop_message
  if (typeof stop !== 'string' || stop.length > 300) {
    throw bad('stop_message', 'Write what a visitor who answers Yes should do, in up to 300 characters.')
  }
  if (enabled && questions.length === 0) throw bad('questions', 'Add at least one question before you turn screening on.')
  if (enabled && !stop.trim()) throw bad('stop_message', 'Write what a visitor who answers Yes should do.')
  await c.db.batch([
    c.db.prepare('DELETE FROM screening_questions'),
    ...questions.map((q, i) => c.db.prepare('INSERT INTO screening_questions (id, text, position) VALUES (?, ?, ?)').bind(q.id, q.text, i + 1)),
    c.db.prepare('UPDATE home SET screening_enabled = ?, screening_stop_message = ? WHERE id = 1').bind(enabled ? 1 : 0, stop),
  ])
  return getSettings(c)
}

const noticeMessage = (b) => message300(b, 'message', 'Write the notice in 1 to 300 characters.')
const noticeSeverity = (b) => {
  if (!SEVERITIES.includes(b.severity)) throw bad('severity', 'Pick Notice, Visiting restricted or Outbreak.')
  return b.severity
}
// null or "" is the whole home.
const noticeUnit = (b, w) => {
  if (b.unit_id === null || b.unit_id === undefined || b.unit_id === '') return null
  if (typeof b.unit_id !== 'string' || !w.unitsById.has(b.unit_id)) throw notFound(UNIT_MISSING)
  return b.unit_id
}

export async function postNotice(c) {
  const b = await c.body()
  const message = noticeMessage(b)
  const severity = noticeSeverity(b)
  const unitId = noticeUnit(b, await loadWorld(c.db))
  const id = randomId('n')
  await c.db.prepare('INSERT INTO notices (id, unit_id, severity, message, active, created_at) VALUES (?, ?, ?, ?, 1, ?)')
    .bind(id, unitId, severity, message, c.nowIso).run()
  return json({ id, settings: await settingsView(c.db) }, 201)
}

async function findNotice(c) {
  const n = await c.db.prepare('SELECT * FROM notices WHERE id = ?').bind(c.params.id).first()
  if (!n) throw notFound(NOTICE_MISSING)
  return n
}

export async function putNotice(c) {
  const n = await findNotice(c)
  const b = await c.body()
  const next = { unit_id: n.unit_id, severity: n.severity, message: n.message, active: n.active }
  if (has(b, 'message')) next.message = noticeMessage(b)
  if (has(b, 'severity')) next.severity = noticeSeverity(b)
  if (has(b, 'unit_id')) next.unit_id = noticeUnit(b, await loadWorld(c.db))
  if (has(b, 'active')) {
    if (typeof b.active !== 'boolean') throw bad('active', 'Turn the notice on or off.')
    next.active = b.active ? 1 : 0
  }
  await c.db.prepare('UPDATE notices SET unit_id = ?, severity = ?, message = ?, active = ? WHERE id = ?')
    .bind(next.unit_id, next.severity, next.message, next.active, n.id).run()
  return getSettings(c)
}

export async function deleteNotice(c) {
  const n = await findNotice(c)
  await c.db.prepare('DELETE FROM notices WHERE id = ?').bind(n.id).run()
  return getSettings(c)
}
