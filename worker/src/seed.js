// POST /api/test/seed { scenario: "demo" } (TEST_MODE only): the SAMPLE home with SAMPLE notices and SAMPLE visits for the demo.
// Everything but the sign-out tokens is the same for the same "now" (tokens are random so a link is never guessable).
import { randomToken, sha256Hex } from './auth.js'
import { autoOutAt, dueAt, openNow } from './hours.js'
import { resetSample, SAMPLE_RESIDENTS, SAMPLE_UNITS } from './sample.js'
import { addDays, localDate, localHHMM, localInstant, startOfDate } from './time.js'

export const DEMO_INFO = 'SAMPLE notice: the side door is closed for painting this week. Please use the main entrance.'
export const DEMO_OUTBREAK = 'SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask and clean your hands before you go in.'

const FIRST = ['Linda', 'Paul', 'Sheila', 'Wayne', 'Darlene', 'Kevin', 'Brenda', 'Gerard', 'Colleen', 'Terry', 'Maureen', 'Dennis']
const LAST = ['P', 'K', 'M', 'R', 'F', 'W', 'B', 'T', 'H']
const HOURS = Object.fromEntries(SAMPLE_UNITS.map((u) => [u.id, u.hours]))
const UNIT_OF = Object.fromEntries(SAMPLE_RESIDENTS.map(([id, , , , unit]) => [id, unit]))
const MIN = 60000
const floorMin = (ms) => Math.floor(ms / MIN) * MIN
const iso = (ms) => new Date(ms).toISOString()
const wall = (date, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return localInstant(date, h, m).getTime()
}

export async function seedDemo(c) {
  const db = c.db
  await resetSample(db)
  const now = c.now.getTime()
  const today = c.today
  const start = startOfDate(today).getTime()
  const nowLocal = localHHMM(now)
  const rows = []
  let outUrl = null

  // out: null (still in) | 'visitor' | 'staff' (at outMs) | 'auto' (at auto_out_at). deskBy: signed in by that staff member.
  async function add({ resident, inMs, out = null, outMs = null, deskBy = null, link = false }) {
    const n = rows.length + 1
    const unit = UNIT_OF[resident]
    const auto = autoOutAt(HOURS[unit], inMs).getTime()
    const token = deskBy ? null : randomToken()
    if (link) outUrl = `/out/?t=${token}`
    const outAt = out === 'auto' ? auto : out ? outMs : null
    rows.push([`v_demo_${String(n).padStart(3, '0')}`, token ? await sha256Hex(token) : null,
      `${FIRST[n % FIRST.length]} ${LAST[(n * 5) % LAST.length]}. (SAMPLE)`, deskBy && n % 2 === 0 ? '' : `709-555-01${String(n % 100).padStart(2, '0')}`,
      resident, unit, iso(inMs), localDate(inMs), iso(dueAt(HOURS[unit], inMs).getTime()), iso(auto), outAt === null ? null : iso(outAt), out,
      deskBy ? 'staff' : 'qr', deskBy, 0])
  }

  // Today, whatever the hour: three in on Lighthouse wing (open all day), one signed out by the visitor and one by staff.
  const back = (minutes) => Math.max(start, floorMin(now - minutes * MIN))
  const part = (f) => start + floorMin((now - start) * f)
  await add({ resident: 'r_frank', inMs: back(35), link: true })
  await add({ resident: 'r_rose', inMs: back(70) })
  await add({ resident: 'r_walter', inMs: back(105), deskBy: 'Carl B. (SAMPLE)' })
  await add({ resident: 'r_margaret', inMs: part(0.2), out: 'visitor', outMs: part(0.4) })
  await add({ resident: 'r_margaret', inMs: part(0.5), out: 'staff', outMs: part(0.6) })
  // Harbour wing's afternoon: someone from the morning window is still in (overdue since 11:30 AM).
  if (nowLocal >= '13:30' && nowLocal < '21:00') await add({ resident: 'r_mary', inMs: wall(today, '10:40') })
  if (nowLocal >= '08:00' && nowLocal < '11:30') await add({ resident: 'r_george', inMs: Math.max(wall(today, '08:00'), floorMin(now - 25 * MIN)) })
  if (nowLocal >= '21:00') await add({ resident: 'r_george', inMs: wall(today, '14:10'), out: 'auto' })
  if (openNow(HOURS.u_cove, nowLocal)) await add({ resident: 'r_agnes', inMs: Math.max(wall(today, '10:00'), floorMin(now - 30 * MIN)) })

  // Each of the last 20 days, inside each unit's hours: signed out by the visitor, by staff and automatically.
  for (let d = 1; d <= 20; d++) {
    const date = addDays(today, -d)
    const mm = (k) => String((d * k) % 50).padStart(2, '0')
    await add({ resident: 'r_rose', inMs: wall(date, `10:${mm(3)}`), out: 'visitor', outMs: wall(date, `11:${mm(3)}`) })
    await add({ resident: 'r_walter', inMs: wall(date, `14:${mm(7)}`), out: 'auto' })
    await add({ resident: 'r_mary', inMs: wall(date, `09:${mm(11)}`), out: 'staff', outMs: wall(date, `10:${mm(11)}`) })
    await add({ resident: 'r_george', inMs: wall(date, `15:${mm(13)}`), out: 'auto' })
    await add({ resident: 'r_bill', inMs: wall(date, '12:30'), out: 'staff', outMs: wall(date, '13:10'), deskBy: 'Amira H. (SAMPLE)' })
  }

  await db.batch([
    db.prepare("INSERT INTO notices (id, unit_id, severity, message, active, created_at) VALUES ('n_demo_info', NULL, 'info', ?, 1, ?)")
      .bind(DEMO_INFO, c.nowIso),
    db.prepare("INSERT INTO notices (id, unit_id, severity, message, active, created_at) VALUES ('n_demo_outbreak', 'u_cove', 'outbreak', ?, 1, ?)")
      .bind(DEMO_OUTBREAK, c.nowIso),
    ...rows.map((v) => db.prepare(`INSERT INTO visits (id, token_hash, visitor_name, phone, resident_id, unit_id, in_at, date, due_at,
      auto_out_at, out_at, out_kind, method, signed_in_by, screened) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...v)),
  ])
  return { today, out_url: outUrl }
}
