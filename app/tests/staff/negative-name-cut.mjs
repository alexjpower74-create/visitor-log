// Negative control (M4) name-cut: the copy puts back the M3 phone header, where the staff name shares the line and is cut with an ellipsis.
// Passes only if targets.spec.mjs "the staff name shows whole, "(SAMPLE)" included, and the header stays at most 96 px" goes red for that reason. Run: node tests/staff/negative-name-cut.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "name-cut",
  why: "the copy puts back the M3 phone header, where the staff name shares the line and is cut with an ellipsis",
  spec: "targets.spec.mjs",
  grep: "the staff name shows whole, \"(SAMPLE)\" included, and the header stays at most 96 px",
  project: "chromium-390",
  patches: [
    { file: "common/style.css", from: "  .who-line { margin-left: 0; gap: 2px 8px; flex-wrap: wrap; min-width: 0; }", to: "  .who-line { margin-left: 0; gap: 8px; flex-wrap: nowrap; min-width: 0; }" },
    { file: "common/style.css", from: "  .who-line .who { order: -1; flex: 0 0 100%; font-size: 13px; line-height: 16px; }", to: "  .who-line .who { flex: 1 1 auto; min-width: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }" },
  ],
  expect: ["the staff name is not cut"],
}))
