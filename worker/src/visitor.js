// The visitor's routes (no account, no token) and the two sign-out link routes.
import { randomId, randomToken, sha256Hex } from './auth.js'
import { hoursLabel, openNow } from './hours.js'
import { ApiError, bad, json, notFound } from './http.js'
import { blockReasons, decideVisitorSignIn, MSG, normalizePhone } from './rules.js'
import { dateLabel, localHHMM, timeLabel } from './time.js'
import {
  activeResident, byFirstName, homeNoticesOf, insertVisit, linkExpiresAt, loadWorld, newVisitRow, noticesFor, noticeView, openVisits,
  outOf, residentName, unitNoticesOf, visitorVisitView,
} from './world.js'

export const SEARCH_MESSAGE = 'Type at least 2 letters of their first name, or their room number.'
export const VISIT_MISSING = "We can't find that visit. If you are still in the building, please tell the staff."
export const LINK_EXPIRED = 'This sign-out link has expired. It only works on the day of your visit.'

export const residentCount = async (c, residentId) => (await openVisits(c.db, c.nowIso, 'AND resident_id = ?', [residentId])).length

// { in_label } of this phone number's visit in the building, or null.
export async function phoneVisit(c, phone) {
  const v = (await openVisits(c.db, c.nowIso, 'AND phone = ?', [phone]))[0]
  return v ? { in_label: timeLabel(v.in_at) } : null
}

export async function visitorStart(c) {
  const w = await loadWorld(c.db)
  return json({
    home_name: w.home.home_name, sample: w.home.sample, phone: w.home.phone, retention_days: w.home.retention_days, today: c.today,
    date_label: dateLabel(c.today), time_label: timeLabel(c.now), home_notices: homeNoticesOf(w.notices).map((n) => noticeView(n, w)),
    // The stop message comes with the questions so a "Yes" can stop the sign-in on the phone without sending anything.
    screening: {
      enabled: w.home.screening_enabled, questions: w.home.screening_enabled ? w.questions : [],
      stop_message: w.home.screening_enabled ? w.home.screening_stop_message : '',
    },
  })
}

export async function searchResidents(c) {
  const q = (c.url.searchParams.get('q') || '').trim()
  if (q.length < 2) throw bad('q', SEARCH_MESSAGE)
  const w = await loadWorld(c.db)
  const lower = q.toLowerCase()
  const rooms = /^\d+$/.test(q)
  const residents = w.residents
    .filter((r) => activeResident(w, r.id))
    .filter((r) => (rooms ? r.room.startsWith(q)
      : r.first_name.toLowerCase().startsWith(lower) || `${r.first_name} ${r.last_initial}`.toLowerCase().startsWith(lower)))
    .sort(byFirstName)
    .slice(0, 8)
    .map((r) => {
      const u = w.unitsById.get(r.unit_id)
      return { id: r.id, name: residentName(r, w.home), room: r.room, unit: { id: u.id, name: u.name } }
    })
  return json({ residents })
}

export async function residentDetail(c) {
  const w = await loadWorld(c.db)
  const found = activeResident(w, c.params.id)
  if (!found) throw notFound(MSG.resident_missing)
  const { resident, unit } = found
  const notices = noticesFor(w.notices, unit.id)
  const reasons = blockReasons({
    resident, unit, home: w.home, notices, nowLocal: localHHMM(c.now), residentCount: await residentCount(c, resident.id),
  })
  const first = reasons[0] || null
  return json({
    resident: {
      id: resident.id, name: resident.name, room: resident.room,
      unit: { id: unit.id, name: unit.name, hours_label: hoursLabel(unit.hours), open_now: openNow(unit.hours, localHHMM(c.now)) },
    },
    can_sign_in: !first, reason: first ? first.code : null, message: first ? first.message : null,
    home_notices: homeNoticesOf(w.notices).map((n) => noticeView(n, w)),
    unit_notices: unitNoticesOf(w.notices, unit.id).map((n) => noticeView(n, w)),
    needs_notice_confirm: notices.some((n) => n.severity === 'outbreak'),
  })
}

// Checks 1–10 in rules.js; a refused sign-in stores nothing.
export async function visitorSignin(c) {
  const body = await c.body()
  const w = await loadWorld(c.db)
  const found = activeResident(w, body.resident_id)
  const phone = normalizePhone(body.phone)
  const d = decideVisitorSignIn({
    body, resident: found ? found.resident : null, unit: found ? found.unit : null, home: w.home,
    notices: found ? noticesFor(w.notices, found.unit.id) : [], questions: w.questions, nowLocal: localHHMM(c.now),
    residentCount: found ? await residentCount(c, found.resident.id) : 0, phoneVisit: phone ? await phoneVisit(c, phone) : null,
  })
  if (!d.ok) throw new ApiError(d.status, d.code, d.message, d.field ? { field: d.field } : {})
  const token = randomToken()
  const v = newVisitRow({
    id: randomId('v'), tokenHash: await sha256Hex(token), name: d.name, phone: d.phone, resident: found.resident, unit: found.unit,
    now: c.now, date: c.today, method: 'qr', signedInBy: null, screened: d.screened,
  })
  await insertVisit(c.db, v)
  return json({ token, out_url: `/out/?t=${token}`, visit: visitorVisitView(v, w, c.nowIso) }, 201)
}

async function visitByToken(c) {
  const v = await c.db.prepare('SELECT * FROM visits WHERE token_hash = ?').bind(await sha256Hex(c.params.token)).first()
  if (!v) throw notFound(VISIT_MISSING)
  if (c.nowIso >= linkExpiresAt(v)) throw new ApiError(410, 'link_expired', LINK_EXPIRED)
  return v
}

export async function visitGet(c) {
  const v = await visitByToken(c)
  return json({ visit: visitorVisitView(v, await loadWorld(c.db), c.nowIso) })
}

// Already out (by the visitor, staff or auto) → already_out: true and nothing changes.
export async function visitSignout(c) {
  const v = await visitByToken(c)
  const w = await loadWorld(c.db)
  if (outOf(v, c.nowIso).out_at !== null) return json({ visit: visitorVisitView(v, w, c.nowIso), already_out: true })
  const r = await c.db.prepare("UPDATE visits SET out_at = ?, out_kind = 'visitor' WHERE id = ? AND out_at IS NULL")
    .bind(c.nowIso, v.id).run()
  const after = await c.db.prepare('SELECT * FROM visits WHERE id = ?').bind(v.id).first()
  return json({ visit: visitorVisitView(after, w, c.nowIso), already_out: r.meta.changes === 0 })
}
