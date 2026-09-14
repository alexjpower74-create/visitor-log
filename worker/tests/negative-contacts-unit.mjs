// (l) The copy ignores the unit on the contact list → the unit filter test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'contacts-unit',
  why: 'contacts.js keeps every unit\'s visits whatever unit is asked for',
  patches: [{ file: 'src/contacts.js', from: ".filter((v) => q.unit === 'all' || v.unit_id === q.unit)", to: '.filter(() => true)' }],
  args: ['--api-only', '--grep', '^contacts: rows for a range'],
  expectRed: ['contacts: rows for a range across two dates, by date then time, and the unit filter; from > to, bad dates, too long a range, unknown unit'],
}))
