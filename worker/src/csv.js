// CSV for the contact list. Pure. CRLF after every line, quoting per docs/API.md, and a formula guard so a spreadsheet never
// runs a cell.
export const CONTACTS_HEADER = ['Date', 'Unit', 'Resident', 'Room', 'Visitor', 'Phone', 'In', 'Out', 'Signed out', 'Signed in by']

const FORMULA_START = /^[=+\-@\t\r]/

export function cell(value) {
  let s = value === null || value === undefined ? '' : String(value)
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csvText = (rows) => rows.map((r) => `${r.map(cell).join(',')}\r\n`).join('')
