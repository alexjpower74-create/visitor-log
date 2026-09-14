// Negative control (d) notice-unit: the copy's notice form sends the first unit when Whole home is picked.
// Passes only if settings-m1.spec.mjs "a Whole home notice goes to home_notices for every visitor" goes red for that reason. Run: node tests/staff/negative-notice-unit.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "notice-unit",
  why: "the copy's notice form sends the first unit when Whole home is picked",
  spec: "settings-m1.spec.mjs",
  grep: "a Whole home notice goes to home_notices for every visitor",
  patches: [
    { file: "settings/settings.js", from: "      unit_id: unit === '' ? null : unit,", to: "      unit_id: unit === '' ? activeUnits()[0].id : unit," },
  ],
  expect: ["a Whole home notice reaches every visitor"],
}))
