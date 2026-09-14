// (f) The copy cuts the sign-out link at UTC midnight (9:30 PM in Newfoundland in September) → the 11:59:59 PM test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'link-expiry',
  why: 'world.js linkExpiresAt is the UTC midnight after the visit date instead of the local midnight',
  patches: [{
    file: 'src/world.js',
    from: 'export const linkExpiresAt = (v) => localInstant(addDays(v.date, 1), 0, 0).toISOString()',
    to: 'export const linkExpiresAt = (v) => `${addDays(v.date, 1)}T00:00:00.000Z`',
  }],
  args: ['--api-only', '--grep', '^sign-out link: works until'],
  expectRed: ['sign-out link: works until 11:59:59 PM, 410 at 12:00:00 AM on both routes'],
}))
