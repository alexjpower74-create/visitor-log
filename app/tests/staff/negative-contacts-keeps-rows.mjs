// Negative control (M4) contacts-keeps-rows: the copy's refused Show leaves the earlier table and count on screen.
// Passes only if log-contacts.spec.mjs "a refused Show clears the earlier table and count" goes red for that reason. Run: node tests/staff/negative-contacts-keeps-rows.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "contacts-keeps-rows",
  why: "the copy's refused Show leaves the earlier table and count on screen",
  spec: "log-contacts.spec.mjs",
  grep: "a refused Show clears the earlier table and count",
  patches: [
    { file: "staff/staff.js", from: "    $('#contacts-count').textContent = ''\n    $('#contacts-table tbody').replaceChildren(h('tr', { class: 'empty-row' }, h('td', { colspan: 10 }, 'No list for these dates.')))\n", to: "" },
  ],
  expect: ["no rows stay after a refused Show"],
}))
