// The contact list for a date range and unit, as JSON and as CSV. Nothing past retention, even before maintenance deletes it.
import { CONTACTS_HEADER, csvText } from './csv.js'
import { bad, json, notFound } from './http.js'
import { keptFrom, retentionDays } from './maintenance.js'
import { dateLabel, daysBetween, isValidDate, timeLabel } from './time.js'
import { loadWorld, outOf, residentName } from './world.js'

export const SIGNED_OUT = { visitor: 'Visitor', staff: 'Staff', auto: 'Auto at closing' }

function readQuery(c, w) {
  const p = c.url.searchParams
  const from = p.get('from') || ''
  const to = p.get('to') || ''
  if (!isValidDate(from)) throw bad('from', 'Pick a real date.')
  if (!isValidDate(to)) throw bad('to', 'Pick a real date.')
  if (from > to) throw bad('to', 'The end date is before the start date.')
  if (daysBetween(from, to) > 366) throw bad('from', 'Pick dates no more than 366 days apart.')
  const unit = p.get('unit') || 'all'
  if (unit !== 'all' && !w.unitsById.has(unit)) throw notFound("We can't find that unit.")
  return { from, to, unit }
}

async function contactRows(c) {
  const w = await loadWorld(c.db)
  const q = readQuery(c, w)
  const kept = keptFrom(c.today, retentionDays(w.home))
  const { results } = await c.db.prepare('SELECT * FROM visits WHERE date >= ? AND date <= ? ORDER BY date, in_at, id')
    .bind(q.from > kept ? q.from : kept, q.to).all()
  const rows = results
    .filter((v) => q.unit === 'all' || v.unit_id === q.unit)
    .map((v) => {
      const r = w.residentsById.get(v.resident_id)
      const u = w.unitsById.get(v.unit_id)
      const out = outOf(v, c.nowIso)
      return {
        visit_id: v.id, date: v.date, date_label: dateLabel(v.date), unit_name: u ? u.name : '', resident_name: r ? residentName(r, w.home) : '',
        room: r ? r.room : '', visitor_name: v.visitor_name, visitor_phone: v.phone, in_label: timeLabel(v.in_at),
        out_label: out.out_at ? timeLabel(out.out_at) : null, signed_out: out.out_kind ? SIGNED_OUT[out.out_kind] : 'Still in',
        signed_in_by: v.method === 'staff' ? v.signed_in_by : 'QR code',
      }
    })
  return { q, rows }
}

export async function contacts(c) {
  const { q, rows } = await contactRows(c)
  return json({ from: q.from, to: q.to, unit: q.unit, count: rows.length, rows })
}

export async function contactsCsv(c) {
  const { q, rows } = await contactRows(c)
  const lines = [CONTACTS_HEADER, ...rows.map((r) => [r.date, r.unit_name, r.resident_name, r.room, r.visitor_name, r.visitor_phone,
    r.in_label, r.out_label || '', r.signed_out, r.signed_in_by])]
  return new Response(csvText(lines), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="visitor-contacts-${q.unit === 'all' ? 'all-units' : q.unit}-${q.from}-to-${q.to}.csv"`,
    },
  })
}
