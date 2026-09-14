// Negative control (fix 3) stacked-buttons: the copy drops the phone rule that gives a list row's words the whole line, so Remove wraps under Change.
// Passes only if targets.spec.mjs "resident rows put Change and Remove side by side" goes red for that reason. Run: node tests/staff/negative-stacked-buttons.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "stacked-buttons",
  why: "the copy drops the phone rule that gives a list row's words the whole line, so Remove wraps under Change",
  spec: "targets.spec.mjs",
  grep: "resident rows put Change and Remove side by side",
  project: "chromium-390",
  patches: [
    { file: "common/style.css", from: "  .list-row .grow { flex-basis: 100%; }", to: "  .list-row .grow { }" },
  ],
  expect: ["Change and Remove sit side by side"],
}))
