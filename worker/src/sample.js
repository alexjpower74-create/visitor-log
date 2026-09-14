// The SAMPLE home that POST /api/test/reset writes (docs/API.md "SAMPLE home"). Every person here is made up.
import { hashPin, randomSaltHex } from './auth.js'
import { HOME_DEFAULTS } from './world.js'

export const SAMPLE_HOME = {
  ...HOME_DEFAULTS, home_name: 'SAMPLE Harbourview Care Home (demo)', sample: true, phone: '709-555-0142', retention_days: 30,
  max_visitors_per_resident: 2,
}

export const SAMPLE_UNITS = [
  { id: 'u_harbour', name: 'Harbour wing', hours: [{ open: '08:00', close: '11:30' }, { open: '13:30', close: '21:00' }] },
  { id: 'u_lighthouse', name: 'Lighthouse wing', hours: [{ open: '00:00', close: '24:00' }] },
  { id: 'u_cove', name: 'Cove unit', hours: [{ open: '10:00', close: '19:00' }] },
]

// [id, first_name, last_initial, room, unit_id, by_arrangement]
export const SAMPLE_RESIDENTS = [
  ['r_mary', 'Mary', 'S', '101', 'u_harbour', false],
  ['r_george', 'George', 'P', '104', 'u_harbour', false],
  ['r_ellen', 'Ellen', 'W', '108', 'u_harbour', true],
  ['r_frank', 'Frank', 'O', '201', 'u_lighthouse', false],
  ['r_rose', 'Rose', 'B', '205', 'u_lighthouse', false],
  ['r_walter', 'Walter', 'K', '210', 'u_lighthouse', false],
  ['r_margaret', 'Margaret', 'L', '212', 'u_lighthouse', false],
  ['r_agnes', 'Agnes', 'D', '301', 'u_cove', false],
  ['r_bill', 'Bill', 'H', '304', 'u_cove', false],
]

export const SAMPLE_STAFF = [
  { id: 's_donna', name: 'Donna R. (SAMPLE)', role: 'manager', pin: '7314' },
  { id: 's_carl', name: 'Carl B. (SAMPLE)', role: 'staff', pin: '2580' },
  { id: 's_amira', name: 'Amira H. (SAMPLE)', role: 'staff', pin: '4691' },
]

// PBKDF2 is deliberately slow; the tests reset before every test, so each isolate hashes the SAMPLE PINs once.
const pinRows = new Map()
async function pinRow(s) {
  if (!pinRows.has(s.id)) {
    const salt = randomSaltHex()
    pinRows.set(s.id, { salt, hash: await hashPin(s.pin, salt) })
  }
  return pinRows.get(s.id)
}

export const WIPE_TABLES = ['roll_call_entries', 'roll_calls', 'visits', 'sessions', 'pin_attempts', 'notices', 'screening_questions',
  'residents', 'units', 'staff', 'home']

export async function resetSample(db) {
  const h = SAMPLE_HOME
  const staff = await Promise.all(SAMPLE_STAFF.map(async (s) => ({ ...s, ...(await pinRow(s)) })))
  await db.batch([
    ...WIPE_TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)),
    db.prepare(`INSERT INTO home (id, home_name, sample, phone, retention_days, max_visitors_per_resident, after_hours_message,
      desk_message, screening_enabled, screening_stop_message) VALUES (1, ?, 1, ?, ?, ?, ?, ?, 0, '')`)
      .bind(h.home_name, h.phone, h.retention_days, h.max_visitors_per_resident, h.after_hours_message, h.desk_message),
    ...SAMPLE_UNITS.map((u, i) => db.prepare('INSERT INTO units (id, name, hours, position, active) VALUES (?, ?, ?, ?, 1)')
      .bind(u.id, u.name, JSON.stringify(u.hours), i + 1)),
    ...SAMPLE_RESIDENTS.map(([id, first, initial, room, unit, arrangement]) => db.prepare(`INSERT INTO residents
      (id, first_name, last_initial, room, unit_id, by_arrangement, active) VALUES (?, ?, ?, ?, ?, ?, 1)`)
      .bind(id, first, initial, room, unit, arrangement ? 1 : 0)),
    ...staff.map((s) => db.prepare('INSERT INTO staff (id, name, role, pin_hash, pin_salt, active) VALUES (?, ?, ?, ?, ?, 1)')
      .bind(s.id, s.name, s.role, s.hash, s.salt)),
  ])
}
