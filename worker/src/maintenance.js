// Maintenance, one idempotent function: auto sign-out, retention deletes, expired sessions and old PIN attempts.
// Runs from scheduled(), at the start of every /api/staff/* and /api/settings* request and both /api/visit/:token routes,
// and from POST /api/test/maintenance.
import { addDays, localDate, startOfDate } from './time.js'

// The home's retention period in days (30 before the home row exists).
export const retentionDays = (home) => (home ? home.retention_days : 30)

// The oldest visit date still kept today: age = today − date, kept while age <= days.
export const keptFrom = (today, days) => addDays(today, -days)

export async function maintenance(env, now) {
  const db = env.DB
  const nowIso = now.toISOString()
  const home = await db.prepare('SELECT retention_days FROM home WHERE id = 1').first()
  const cutoff = keptFrom(localDate(now), retentionDays(home))
  const cutoffInstant = startOfDate(cutoff).toISOString()
  const dayAgo = new Date(now.getTime() - 86400e3).toISOString()
  const [auto, visits, , rollCalls] = await db.batch([
    db.prepare("UPDATE visits SET out_at = auto_out_at, out_kind = 'auto' WHERE out_at IS NULL AND auto_out_at <= ?").bind(nowIso),
    db.prepare('DELETE FROM visits WHERE date < ?').bind(cutoff),
    db.prepare('DELETE FROM roll_call_entries WHERE roll_call_id IN (SELECT id FROM roll_calls WHERE started_at < ?)').bind(cutoffInstant),
    db.prepare('DELETE FROM roll_calls WHERE started_at < ?').bind(cutoffInstant),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso),
    db.prepare('DELETE FROM pin_attempts WHERE at < ?').bind(dayAgo),
  ])
  return { auto_signed_out: auto.meta.changes, deleted_visits: visits.meta.changes, deleted_roll_calls: rollCalls.meta.changes }
}
