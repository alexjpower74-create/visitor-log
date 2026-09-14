// (j) The copy has no last-manager guard → the last-manager test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'last-manager',
  why: 'people.js putStaff lets the last active manager be turned off or made staff',
  patches: [{ file: 'src/people.js', from: "    if (others.n === 0) throw conflict('bad_state', LAST_MANAGER)\n", to: '    // negative control: no last-manager guard\n' }],
  args: ['--api-only', '--grep', '^staff: turning off the last manager'],
  expectRed: ['staff: turning off the last manager → 409, and so does making them staff; with a second manager both work; a turned-off PIN no longer signs in'],
}))
