// Negative control (M4) closed-ignores-active: the copy ignores a unit's active flag, so a closed unit gets no Unit closed pill and keeps its Open pill.
// Passes only if building.spec.mjs "a closed unit with a visitor still in shows "Unit closed" and no Open pill, and signing that visitor out removes the card" goes red for that reason. Run: node tests/staff/negative-closed-ignores-active.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "closed-ignores-active",
  why: "the copy ignores a unit's active flag, so a closed unit gets no Unit closed pill and keeps its Open pill",
  spec: "building.spec.mjs",
  grep: "a closed unit with a visitor still in shows \"Unit closed\" and no Open pill, and signing that visitor out removes the card",
  patches: [
    { file: "staff/staff.js", from: "  const unitClosed = u.active === false", to: "  const unitClosed = false" },
  ],
  expect: ["a closed unit is marked Unit closed"],
}))
