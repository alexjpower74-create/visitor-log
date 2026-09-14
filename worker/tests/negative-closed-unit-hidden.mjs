// (q) The copy lists active units only, so a visitor on a closed unit disappears from the building → the closed-unit test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'closed-unit-hidden',
  why: 'staff.js building lists active units only (drops closed units that still have visitors in)',
  patches: [{
    file: 'src/staff.js',
    from: ', ...w.units.filter((u) => !u.active && inside.some((v) => v.unit_id === u.id))]',
    to: ']',
  }],
  args: ['--api-only', '--grep', '^building: a closed unit'],
  expectRed: ['building: a closed unit with a visitor still in stays on the list after the open units, marked closed, and counts in the total'],
}))
