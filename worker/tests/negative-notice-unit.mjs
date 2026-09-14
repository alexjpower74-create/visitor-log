// (a) The copy puts every active notice in unit_notices → the right-unit test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'notice-unit',
  why: 'world.js unitNoticesOf returns every active notice instead of only the resident\'s unit\'s',
  patches: [{
    file: 'src/world.js',
    from: 'export const unitNoticesOf = (notices, unitId) => notices.filter((n) => n.unit_id === unitId)',
    to: 'export const unitNoticesOf = (notices, unitId) => notices',
  }],
  args: ['--api-only', '--grep', '^notice on the right unit'],
  expectRed: ["notice on the right unit: a Cove outbreak notice is in Agnes's unit_notices only, a whole-home notice only in home_notices; staff see it on the Cove card only; turned off it is gone everywhere"],
}))
