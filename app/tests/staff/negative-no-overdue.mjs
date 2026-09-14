// Negative control (b) no-overdue: the copy ignores overdue: every row is data-overdue=false and no Overdue chip is drawn.
// Passes only if building.spec.mjs "a Harbour visitor in at 11:00 AM is overdue within one poll of 11:30 AM" goes red for that reason. Run: node tests/staff/negative-no-overdue.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "no-overdue",
  why: "the copy ignores overdue: every row is data-overdue=false and no Overdue chip is drawn",
  spec: "building.spec.mjs",
  grep: "a Harbour visitor in at 11:00 AM is overdue within one poll of 11:30 AM",
  patches: [
    { file: "staff/staff.js", from: "'data-overdue': v.overdue ? 'true' : 'false'", to: "'data-overdue': 'false'" },
    { file: "staff/staff.js", from: "v.overdue ? h('span', { class: 'pill overdue overdue-chip' }", to: "false ? h('span', { class: 'pill overdue overdue-chip' }" },
  ],
  expect: ["overdue within one 5 s poll"],
}))
