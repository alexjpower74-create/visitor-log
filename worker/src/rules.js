// The visitor sign-in decision, in docs/API.md's order. Pure: the Worker loads the facts, this decides.
import { hoursLabel, openNow } from './hours.js'

export const MSG = {
  name: 'Please type your name.',
  phone: 'Please type a 10-digit phone number, like 709-555-0123.',
  resident_id: 'Please pick who you are visiting.',
  resident_missing: "We can't find that resident. Please see the nurse's desk.",
  answers: 'Please answer every question.',
  notice_confirmed: 'Please read the notice, then tap I have read it.',
  screened: 'Ask the screening questions first. Only sign in a visitor who answered No to every one.',
}

export const byArrangementMessage = (residentName, desk) => `Visits with ${residentName} are by arrangement only. ${desk}`
export const restrictedMessage = (unitName, desk) => `${unitName}: visitors can't sign themselves in right now. ${desk}`
export const outsideHoursMessage = (afterHours, unitName, hours) =>
  `${afterHours} Visiting hours on ${unitName}: ${hoursLabel(hours)}.`
export const residentFullMessage = (residentName, n, desk) =>
  `${residentName} already has ${n === 1 ? '1 visitor' : `${n} visitors`} signed in. Please wait until someone signs out. ${desk}`
export const alreadyInMessage = (inLabel) => `This phone number is already signed in, since ${inLabel}. Please sign out first.`

// Trimmed, 2–60 characters, with a letter; else null.
export function cleanName(raw) {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  return name.length >= 2 && name.length <= 60 && /\p{L}/u.test(name) ? name : null
}

// Strip spaces, dashes, dots, brackets and a leading +1 or 1; exactly 10 digits → "709-555-0123"; else null.
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/[\s\-.()[\]]/g, '').replace(/^\+?1/, '')
  return /^\d{10}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : null
}

const refuse = (status, code, message, field) => ({ ok: false, status, code, message, ...(field ? { field } : {}) })

// Checks 3, 4, 5 and 9 for a resident, in order: what a visitor would be refused for (staff see them as warnings).
// resident { name, by_arrangement }, unit { name, hours }, home { desk_message, after_hours_message, max_visitors_per_resident },
// notices: the active notices that apply (whole home or this unit), nowLocal "HH:MM", residentCount: visits in the building.
export function blockReasons({ resident, unit, home, notices, nowLocal, residentCount }) {
  const out = []
  if (resident.by_arrangement) {
    out.push(refuse(403, 'by_arrangement', byArrangementMessage(resident.name, home.desk_message)))
  }
  if (notices.some((n) => n.severity === 'restricted')) {
    out.push(refuse(403, 'restricted_unit', restrictedMessage(unit.name, home.desk_message)))
  }
  if (!openNow(unit.hours, nowLocal)) {
    out.push(refuse(403, 'outside_hours', outsideHoursMessage(home.after_hours_message, unit.name, unit.hours)))
  }
  const limit = home.max_visitors_per_resident
  if (limit !== null && limit !== undefined && residentCount >= limit) {
    out.push(refuse(409, 'resident_full', residentFullMessage(resident.name, limit, home.desk_message)))
  }
  return out
}

const needsConfirm = (notices) => notices.some((n) => n.severity === 'outbreak')

// POST /api/visitor/signin, checks 1–10. resident is null when unknown or inactive. questions: the active screening questions.
// phoneVisit: null, or { in_label } of this phone's visit in the building. → { ok: true, name, phone, screened } or a refusal
// { ok: false, status, code, message, field? }.
export function decideVisitorSignIn({ body, resident, unit, home, notices, questions, nowLocal, residentCount, phoneVisit }) {
  const b = body && typeof body === 'object' ? body : {}
  const name = cleanName(b.name)
  if (!name) return refuse(400, 'bad_request', MSG.name, 'name')
  const phone = normalizePhone(b.phone)
  if (!phone) return refuse(400, 'bad_request', MSG.phone, 'phone')
  if (typeof b.resident_id !== 'string' || !b.resident_id) return refuse(400, 'bad_request', MSG.resident_id, 'resident_id')
  if (!resident) return refuse(404, 'not_found', MSG.resident_missing)

  const reasons = blockReasons({ resident, unit, home, notices, nowLocal, residentCount })
  const early = reasons.find((r) => r.code !== 'resident_full')
  if (early) return early

  const screening = home.screening_enabled === true
  if (screening) {
    const answers = b.answers && typeof b.answers === 'object' ? b.answers : {}
    if (questions.some((q) => answers[q.id] !== 'yes' && answers[q.id] !== 'no')) {
      return refuse(400, 'bad_request', MSG.answers, 'answers')
    }
    if (questions.some((q) => answers[q.id] === 'yes')) return refuse(403, 'screening_stop', home.screening_stop_message)
  }

  if (needsConfirm(notices) && b.notice_confirmed !== true) {
    return refuse(400, 'bad_request', MSG.notice_confirmed, 'notice_confirmed')
  }
  const full = reasons.find((r) => r.code === 'resident_full')
  if (full) return full
  if (phoneVisit) return refuse(409, 'already_in', alreadyInMessage(phoneVisit.in_label))
  return { ok: true, name, phone, screened: screening }
}
