// Negative control (a) stale-total: the copy renders #building-total once and never again, so a sign-out leaves the old total.
// Passes only if building.spec.mjs "Sign out by real taps: the row leaves, the unit count and the total drop at once, and the API agrees" goes red for that reason. Run: node tests/staff/negative-stale-total.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "stale-total",
  why: "the copy renders #building-total once and never again, so a sign-out leaves the old total",
  spec: "building.spec.mjs",
  grep: "Sign out by real taps: the row leaves, the unit count and the total drop at once, and the API agrees",
  patches: [
    { file: "staff/staff.js", from: "  $('#building-total').replaceChildren(h('span', { class: 'total-number' }, String(building.total)), ' in the building')", to: "  if (!$('#building-total').dataset.shown) { $('#building-total').replaceChildren(h('span', { class: 'total-number' }, String(building.total)), ' in the building'); $('#building-total').dataset.shown = '1' }" },
  ],
  expect: ["the total drops with the row"],
}))
