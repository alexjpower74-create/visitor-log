// (e) The copy deletes at age >= retention (one day early) → the age-30-kept test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'retention-boundary',
  why: 'maintenance.js keptFrom keeps only ages below the setting (deletes at age >= retention_days)',
  patches: [{
    file: 'src/maintenance.js',
    from: 'export const keptFrom = (today, days) => addDays(today, -days)',
    to: 'export const keptFrom = (today, days) => addDays(today, -(days - 1))',
  }],
  args: ['--api-only', '--grep', '^retention: age 30 kept'],
  expectRed: ['retention: age 30 kept — the Aug 1 visit is in the day log at Aug 31 11:59 PM, and at Sep 1 12:00 AM it is gone from the day log and from D1'],
}))
