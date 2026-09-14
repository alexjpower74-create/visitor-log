// (c) The copy never treats a passed auto_out_at as out → the across-midnight count test and the property must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'auto-out',
  why: 'world.js inBuildingAt and outOf ignore auto_out_at, and maintenance.js never writes the automatic sign-out',
  patches: [
    { file: 'src/world.js', from: '(v.out_at === null || v.out_at > t) && v.auto_out_at > t', to: '(v.out_at === null || v.out_at > t)' },
    { file: 'src/world.js', from: "if (v.auto_out_at <= t) return { out_at: v.auto_out_at, out_kind: 'auto' }", to: "if (false) return { out_at: v.auto_out_at, out_kind: 'auto' }" },
    { file: 'src/maintenance.js', from: 'WHERE out_at IS NULL AND auto_out_at <= ?', to: 'WHERE 0 AND auto_out_at <= ?' },
  ],
  args: ['--api-only', '--grep', '^count across midnight|^count property'],
  expectRed: [
    'count across midnight auto sign-out: Harbour auto at 9:00 PM, the late Harbour and the Lighthouse visits auto at 12:00 AM; the day log keeps all four',
    'count property: 200 seeded events over 3 days; at 40 checkpoints total and every unit count equal the model, never negative',
  ],
}))
