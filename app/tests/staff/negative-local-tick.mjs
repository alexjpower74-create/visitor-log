// Negative control (f) local-tick: the copy's Found button changes only the page and sends nothing.
// Passes only if rollcall.spec's roll call test goes red because the second phone's tick never reaches the desk.
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: 'local-tick',
  why: "the copy's Found button marks the row on this page only and sends no request",
  spec: 'rollcall.spec.mjs',
  grep: 'a roll call started by real taps on the desk takes ticks from a second phone within one poll, lists a late arrival, and refuses ticks once ended',
  patches: [
    { file: 'staff/staff.js',
      from: "    const answer = await api.post(`/api/staff/rollcall/${encodeURIComponent(rollCall.id)}/found`, { visit_id: id, found })\n    rollCall = answer.roll_call",
      to: "    const entries = rollCall.entries.map((x) => (x.visit_id === id ? { ...x, found } : x))\n    rollCall = { ...rollCall, entries, found: entries.filter((x) => x.found).length }" },
  ],
  expect: ["the second phone's tick reaches the desk within one poll"],
}))
