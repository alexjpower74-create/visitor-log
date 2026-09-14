// (i) The copy lists only the visits in the building at the start → the after-start roll call test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'rollcall-after-start',
  why: 'rollcall.js onRollCall drops the visits signed in after the roll call started',
  patches: [{
    file: 'src/rollcall.js',
    from: 'inBuildingAt(v, rc.started_at) || (v.in_at > rc.started_at && (rc.ended_at === null || v.in_at < rc.ended_at))',
    to: 'inBuildingAt(v, rc.started_at)',
  }],
  args: ['--api-only', '--grep', '^roll call:'],
  expectRed: ['roll call: three in, start → 3; a sign-in after the start → 4 with after_start; a sign-out during it stays with out_label; found by Carl and by Amira; unfound; a second start 409; end; found writes 409; current null after'],
}))
