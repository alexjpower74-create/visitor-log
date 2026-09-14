// Pure: CSV cells for the contact list (quoting, CRLF, the formula guard).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cell, CONTACTS_HEADER, csvText } from '../src/csv.js'

test('csv cells: plain text as is; commas, quotes, CR and LF quoted with quotes doubled; empty for null', () => {
  assert.equal(cell('Frank O. (SAMPLE)'), 'Frank O. (SAMPLE)')
  assert.equal(cell('O\'Brien, "Junior" (SAMPLE)'), '"O\'Brien, ""Junior"" (SAMPLE)"')
  assert.equal(cell('two\nlines'), '"two\nlines"')
  assert.equal(cell('a\rb'), '"a\rb"')
  assert.equal(cell(null), '')
  assert.equal(cell(undefined), '')
  assert.equal(cell(5), '5')
  assert.equal(cell('709-555-0101'), '709-555-0101', 'a dash inside is not a formula')
})

test('csv formula guard: a cell starting with =, +, -, @, tab or CR gets a leading apostrophe', () => {
  assert.equal(cell('=HYPERLINK("x") (SAMPLE)'), '"\'=HYPERLINK(""x"") (SAMPLE)"')
  assert.equal(cell('+1 (SAMPLE)'), "'+1 (SAMPLE)")
  assert.equal(cell('-2'), "'-2")
  assert.equal(cell('@Desk'), "'@Desk")
  assert.equal(cell('\tTab'), "'\tTab")
  assert.equal(cell('\rCR'), '"\'\rCR"')
})

test('csv text: CRLF after every line including the last; the contact list header', () => {
  assert.equal(csvText([CONTACTS_HEADER]), 'Date,Unit,Resident,Room,Visitor,Phone,In,Out,Signed out,Signed in by\r\n')
  assert.equal(csvText([['a', 'b'], ['c', '']]), 'a,b\r\nc,\r\n')
})
