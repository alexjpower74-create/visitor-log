// Visiting hours: 1 to 4 windows per unit, the same every day. Pure, so the unit tests run it in node.
import { addDays, clockLabel, localDate, localHHMM, localInstant } from './time.js'

export const HOURS_MESSAGE = "Visiting hours need a start before the end, and the times can't overlap."
export const OPEN_ALL_DAY = [{ open: '00:00', close: '24:00' }]

// "HH:MM" → minutes after midnight (0–1440), or null. "24:00" is the only hour 24.
export function minutesOf(hm) {
  const m = typeof hm === 'string' ? /^([01]\d|2[0-4]):([0-5]\d)$/.exec(hm) : null
  if (!m) return null
  const total = Number(m[1]) * 60 + Number(m[2])
  return total > 1440 ? null : total
}

// The windows sorted by open, or null when they break a rule: 1–4 windows, open 00:00–23:59, close 00:01–24:00,
// open < close, no overlap (touching is allowed).
export function validHours(hours) {
  if (!Array.isArray(hours) || hours.length < 1 || hours.length > 4) return null
  const windows = []
  for (const w of hours) {
    if (!w || typeof w !== 'object') return null
    const open = minutesOf(w.open)
    const close = minutesOf(w.close)
    if (open === null || close === null || open > 1439 || close < 1 || open >= close) return null
    windows.push({ open: w.open, close: w.close, o: open, c: close })
  }
  windows.sort((a, b) => a.o - b.o)
  for (let i = 1; i < windows.length; i++) if (windows[i].o < windows[i - 1].c) return null
  return windows.map(({ open, close }) => ({ open, close }))
}

// "8:00 AM", "midnight" for 24:00.
export function hmLabel(hm) {
  const t = minutesOf(hm)
  return t === 1440 ? 'midnight' : clockLabel(Math.floor(t / 60), t % 60)
}

// "8:00 AM to 11:30 AM and 1:30 PM to 9:00 PM"; "Open all day" for 00:00–24:00.
export function hoursLabel(hours) {
  if (hours.length === 1 && hours[0].open === '00:00' && hours[0].close === '24:00') return 'Open all day'
  const parts = hours.map((w) => `${hmLabel(w.open)} to ${hmLabel(w.close)}`)
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// open <= now_local < close: the close minute is outside.
export function openNow(hours, nowLocal) {
  const t = minutesOf(nowLocal)
  return hours.some((w) => minutesOf(w.open) <= t && t < minutesOf(w.close))
}

const atHM = (date, hm) => {
  const t = minutesOf(hm)
  return localInstant(date, Math.floor(t / 60), t % 60)
}

// Closing on the visit's date if in_at is before it; otherwise the next local midnight after in_at.
export function autoOutAt(hours, inAt) {
  const inMs = new Date(inAt).getTime()
  const date = localDate(inMs)
  const closing = atHM(date, hours[hours.length - 1].close)
  return inMs < closing.getTime() ? closing : localInstant(addDays(date, 1), 0, 0)
}

// The close of the window that holds in_at; else the close of the next window that day; else auto_out_at.
export function dueAt(hours, inAt) {
  const inMs = new Date(inAt).getTime()
  const date = localDate(inMs)
  const t = minutesOf(localHHMM(inMs))
  const w = hours.find((x) => minutesOf(x.open) <= t && t < minutesOf(x.close)) || hours.find((x) => minutesOf(x.open) > t)
  return w ? atHM(date, w.close) : autoOutAt(hours, inMs)
}
