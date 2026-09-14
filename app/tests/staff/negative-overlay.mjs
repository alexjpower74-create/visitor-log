// Negative control (c) overlay: the copy lays a transparent cover over every visit row, Sign out included.
// Passes only if building.spec.mjs "Sign out by real taps: the row leaves, the unit count and the total drop at once, and the API agrees" goes red for that reason. Run: node tests/staff/negative-overlay.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "overlay",
  why: "the copy lays a transparent cover over every visit row, Sign out included",
  spec: "building.spec.mjs",
  grep: "Sign out by real taps: the row leaves, the unit count and the total drop at once, and the API agrees",
  patches: [
    { file: "staff/staff.css", from: ".visit-row .sign-out-visit { align-self: center; min-height: var(--tap-big); }", to: ".visit-row .sign-out-visit { align-self: center; min-height: var(--tap-big); }\n.visit-row { position: relative; }\n.visit-row::after { content: \"\"; position: absolute; inset: 0; background: transparent; }" },
  ],
  expect: ["something else is on top"],
}))
