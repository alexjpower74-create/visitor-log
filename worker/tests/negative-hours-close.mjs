// (g) The copy lets a visitor in at the close minute → the 11:30 AM check must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'hours-close',
  why: 'hours.js openNow counts the close minute as inside (now_local <= close)',
  patches: [{
    file: 'src/hours.js',
    from: 'return hours.some((w) => minutesOf(w.open) <= t && t < minutesOf(w.close))',
    to: 'return hours.some((w) => minutesOf(w.open) <= t && t <= minutesOf(w.close))',
  }],
  args: ['--api-only', '--grep', '^hours: Mary at'],
  expectRed: ['hours: Mary at 12:00 PM and at 11:30 AM (the close minute) → 403 outside_hours; at 1:30 PM → 201; Frank at 3:00 AM → 201; Agnes at 7:00 PM → 403'],
}))
