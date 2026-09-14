// Settings for units, residents and staff (role manager). Every write answers with the whole settings object.
import { hashPin, PIN_RE, randomId, randomSaltHex, sameHex } from './auth.js'
import { HOURS_MESSAGE, validHours } from './hours.js'
import { bad, conflict, json, notFound } from './http.js'
import { getSettings, settingsView } from './settings.js'
import { loadWorld } from './world.js'

export const UNIT_NAME = 'Give the unit a name of 1 to 40 characters.'
export const UNIT_TAKEN = 'Another open unit already has that name.'
export const UNIT_HAS_RESIDENTS = 'Move or remove the residents on this unit first.'
export const OPEN_UNIT = 'Pick an open unit.'
export const LAST_MANAGER = 'The home needs at least one manager.'
export const PIN_TAKEN = 'Another staff member already has that PIN. Pick a different one.'

const has = (b, k) => Object.prototype.hasOwnProperty.call(b, k)
const text = (v) => (typeof v === 'string' ? v.trim() : '')
function bool(b, field, message) {
  if (typeof b[field] !== 'boolean') throw bad(field, message)
  return b[field]
}

// ---------- units ----------

function unitName(b) {
  const name = text(b.name)
  if (name.length < 1 || name.length > 40) throw bad('name', UNIT_NAME)
  return name
}
const nameTaken = (w, name, exceptId = null) =>
  w.units.some((u) => u.active && u.id !== exceptId && u.name.toLowerCase() === name.toLowerCase())
function unitHours(b) {
  const hours = validHours(b.hours)
  if (!hours) throw bad('hours', HOURS_MESSAGE)
  return hours
}

export async function postUnit(c) {
  const b = await c.body()
  const w = await loadWorld(c.db)
  const name = unitName(b)
  if (nameTaken(w, name)) throw bad('name', UNIT_TAKEN)
  const hours = unitHours(b)
  const id = randomId('u')
  await c.db.prepare('INSERT INTO units (id, name, hours, position, active) VALUES (?, ?, ?, ?, 1)')
    .bind(id, name, JSON.stringify(hours), Math.max(0, ...w.units.map((u) => u.position)) + 1).run()
  return json({ id, settings: await settingsView(c.db) }, 201)
}

// A change to the hours applies to new visits; a visit keeps the due and auto sign-out times it was given at sign-in.
export async function putUnit(c) {
  const w = await loadWorld(c.db)
  const u = w.unitsById.get(c.params.id)
  if (!u) throw notFound("We can't find that unit.")
  const b = await c.body()
  const next = { name: u.name, hours: u.hours, active: u.active }
  if (has(b, 'name')) next.name = unitName(b)
  if (has(b, 'hours')) next.hours = unitHours(b)
  if (has(b, 'active')) next.active = bool(b, 'active', 'Open or close the unit.')
  if (next.active && nameTaken(w, next.name, u.id)) throw bad('name', UNIT_TAKEN)
  if (!next.active && w.residents.some((r) => r.active && r.unit_id === u.id)) throw conflict('bad_state', UNIT_HAS_RESIDENTS)
  await c.db.prepare('UPDATE units SET name = ?, hours = ?, active = ? WHERE id = ?')
    .bind(next.name, JSON.stringify(next.hours), next.active ? 1 : 0, u.id).run()
  return getSettings(c)
}

// ---------- residents ----------

function firstName(b) {
  const s = text(b.first_name)
  if (s.length < 1 || s.length > 30 || !/^[\p{L} '’-]+$/u.test(s) || !/\p{L}/u.test(s)) {
    throw bad('first_name', 'Type a first name of 1 to 30 letters. Spaces, hyphens and apostrophes are fine.')
  }
  return s
}
function lastInitial(b) {
  const s = text(b.last_initial)
  if (!/^[A-Za-z]$/.test(s)) throw bad('last_initial', 'Type one letter for the last name.')
  return s.toUpperCase()
}
function room(b) {
  const s = text(b.room)
  if (!/^[A-Za-z0-9 -]{1,10}$/.test(s)) throw bad('room', 'Type a room of 1 to 10 letters, numbers, spaces or hyphens.')
  return s
}
function openUnit(w, id) {
  const u = typeof id === 'string' ? w.unitsById.get(id) : null
  if (!u || !u.active) throw bad('unit_id', OPEN_UNIT)
  return u.id
}
const ARRANGEMENT = 'Say whether visits are by arrangement only.'

export async function postResident(c) {
  const b = await c.body()
  const w = await loadWorld(c.db)
  const r = {
    first_name: firstName(b), last_initial: lastInitial(b), room: room(b), unit_id: openUnit(w, b.unit_id),
    by_arrangement: has(b, 'by_arrangement') ? bool(b, 'by_arrangement', ARRANGEMENT) : false,
  }
  const id = randomId('r')
  await c.db.prepare(`INSERT INTO residents (id, first_name, last_initial, room, unit_id, by_arrangement, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)`).bind(id, r.first_name, r.last_initial, r.room, r.unit_id, r.by_arrangement ? 1 : 0).run()
  return json({ id, settings: await settingsView(c.db) }, 201)
}

export async function putResident(c) {
  const w = await loadWorld(c.db)
  const r = w.residentsById.get(c.params.id)
  if (!r) throw notFound("We can't find that resident.")
  const b = await c.body()
  const next = { ...r }
  if (has(b, 'first_name')) next.first_name = firstName(b)
  if (has(b, 'last_initial')) next.last_initial = lastInitial(b)
  if (has(b, 'room')) next.room = room(b)
  if (has(b, 'unit_id')) next.unit_id = openUnit(w, b.unit_id)
  if (has(b, 'by_arrangement')) next.by_arrangement = bool(b, 'by_arrangement', ARRANGEMENT)
  if (has(b, 'active')) next.active = bool(b, 'active', 'Keep or remove the resident.')
  if (next.active) openUnit(w, next.unit_id)
  await c.db.prepare('UPDATE residents SET first_name = ?, last_initial = ?, room = ?, unit_id = ?, by_arrangement = ?, active = ? WHERE id = ?')
    .bind(next.first_name, next.last_initial, next.room, next.unit_id, next.by_arrangement ? 1 : 0, next.active ? 1 : 0, r.id).run()
  return getSettings(c)
}

// ---------- staff ----------

function staffName(b) {
  const s = text(b.name)
  if (s.length < 1 || s.length > 60) throw bad('name', 'Type a name of 1 to 60 characters.')
  return s
}
function role(b) {
  if (b.role !== 'manager' && b.role !== 'staff') throw bad('role', 'Pick Manager or Staff.')
  return b.role
}
function pinOf(b) {
  if (typeof b.pin !== 'string' || !PIN_RE.test(b.pin)) throw bad('pin', 'A PIN is 4 to 6 digits.')
  return b.pin
}

// PINs are unique in the home, counting staff who are turned off (they may be turned on again).
async function pinTaken(db, pin, exceptId = null) {
  const { results } = await db.prepare('SELECT id, pin_hash, pin_salt FROM staff').all()
  for (const s of results) {
    if (s.id !== exceptId && sameHex(await hashPin(pin, s.pin_salt), s.pin_hash)) return true
  }
  return false
}

export async function postStaff(c) {
  const b = await c.body()
  const name = staffName(b)
  const r = role(b)
  const pin = pinOf(b)
  if (await pinTaken(c.db, pin)) throw conflict('pin_taken', PIN_TAKEN, { field: 'pin' })
  const id = randomId('s')
  const salt = randomSaltHex()
  await c.db.prepare('INSERT INTO staff (id, name, role, pin_hash, pin_salt, active) VALUES (?, ?, ?, ?, ?, 1)')
    .bind(id, name, r, await hashPin(pin, salt), salt).run()
  return json({ id, settings: await settingsView(c.db) }, 201)
}

export async function putStaff(c) {
  const s = await c.db.prepare('SELECT * FROM staff WHERE id = ?').bind(c.params.id).first()
  if (!s) throw notFound("We can't find that staff member.")
  const b = await c.body()
  const next = { name: s.name, role: s.role, active: s.active === 1 }
  if (has(b, 'name')) next.name = staffName(b)
  if (has(b, 'role')) next.role = role(b)
  if (has(b, 'active')) next.active = bool(b, 'active', 'Turn them on or off.')
  const pin = has(b, 'pin') ? pinOf(b) : null
  if (pin && await pinTaken(c.db, pin, s.id)) throw conflict('pin_taken', PIN_TAKEN, { field: 'pin' })
  // Turning off the last active manager, or making them staff, would lock everyone out of the settings.
  if (s.active === 1 && s.role === 'manager' && !(next.active && next.role === 'manager')) {
    const others = await c.db.prepare("SELECT COUNT(*) AS n FROM staff WHERE active = 1 AND role = 'manager' AND id != ?").bind(s.id).first()
    if (others.n === 0) throw conflict('bad_state', LAST_MANAGER)
  }
  const salt = pin ? randomSaltHex() : s.pin_salt
  const hash = pin ? await hashPin(pin, salt) : s.pin_hash
  await c.db.prepare('UPDATE staff SET name = ?, role = ?, active = ?, pin_hash = ?, pin_salt = ? WHERE id = ?')
    .bind(next.name, next.role, next.active ? 1 : 0, hash, salt, s.id).run()
  return getSettings(c)
}
