// (h) The copy has no formula guard in the CSV → the contacts CSV test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'csv-guard',
  why: 'csv.js cell no longer puts an apostrophe before a cell starting with =, +, -, @, tab or CR',
  patches: [{ file: 'src/csv.js', from: "  if (FORMULA_START.test(s)) s = `'${s}`\n", to: '  // negative control: no formula guard\n' }],
  args: ['--api-only', '--grep', '^contacts CSV'],
  expectRed: ['contacts CSV: exact header, CRLF on every line, quoting and the formula guard, the Signed out and Signed in by words, the filename; the JSON rows and the CSV lines agree'],
}))
