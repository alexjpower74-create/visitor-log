// Negative control (g) csv-stale-unit: the copy's Download CSV ignores the unit picker (always all units).
// Passes only if log-contacts.spec's contact list test goes red on the byte comparison.
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: 'csv-stale-unit',
  why: "the copy's Download CSV always asks for all units, whatever the unit picker says",
  spec: 'log-contacts.spec.mjs',
  grep: "the contact list for Sep 13 to 14 on Harbour wing shows the API's count, and Download CSV saves the API's exact bytes and filename",
  patches: [
    { file: 'staff/staff.js',
      from: "    const { filename } = await api.download(`/api/staff/contacts.csv?${contactsQuery()}`)",
      to: "    const { filename } = await api.download(`/api/staff/contacts.csv?${api.qs({ from: $('#contacts-from').value, to: $('#contacts-to').value, unit: 'all' })}`)" },
  ],
  expect: ["the downloaded CSV is byte for byte the API's"],
}))
