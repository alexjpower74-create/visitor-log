// Negative control (fix 2) time-wraps: the copy drops white-space: nowrap from .time, so a time can break before AM/PM.
// Passes only if targets.spec.mjs "hours labels keep each time on one line" goes red for that reason. Run: node tests/staff/negative-time-wraps.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "time-wraps",
  why: "the copy drops white-space: nowrap from .time, so a time can break before AM/PM",
  spec: "targets.spec.mjs",
  grep: "hours labels keep each time on one line",
  project: "chromium-390",
  patches: [
    { file: "common/style.css", from: ".time { white-space: nowrap; }", to: ".time { }" },
  ],
  expect: ["a time label broke across lines"],
}))
