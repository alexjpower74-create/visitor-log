// (d) The copy always keeps 30 days whatever the home sets → the retention 7 test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'retention-setting',
  why: 'maintenance.js retentionDays ignores the home setting and always answers 30',
  patches: [{
    file: 'src/maintenance.js',
    from: 'export const retentionDays = (home) => (home ? home.retention_days : 30)',
    to: 'export const retentionDays = () => 30',
  }],
  args: ['--api-only', '--grep', '^retention: the manager sets 7'],
  expectRed: ['retention: the manager sets 7; at Aug 23 the Aug 15 visit (age 8) is gone from the day log and D1 and the Aug 16 visit (age 7) is kept'],
}))
