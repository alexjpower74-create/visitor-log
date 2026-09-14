// Pure: the visitor sign-in decision in docs/API.md's order, and phone normalising.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockReasons, decideVisitorSignIn, normalizePhone } from '../src/rules.js'

const HOME = {
  desk_message: "Please see the nurse's desk.",
  after_hours_message: 'Visiting hours are over for now. If you need to see someone, please call the unit.',
  max_visitors_per_resident: 2, screening_enabled: false, screening_stop_message: "Please don't visit today.",
}
const HARBOUR = { id: 'u_harbour', name: 'Harbour wing', hours: [{ open: '08:00', close: '11:30' }, { open: '13:30', close: '21:00' }] }
const MARY = { id: 'r_mary', name: 'Mary S. (SAMPLE)', by_arrangement: false }
const QUESTIONS = [{ id: 'q1', text: 'Question one?' }, { id: 'q2', text: 'Question two?' }]

// Everything fine: Linda signs in for Mary at 3:00 PM.
const ok = () => ({
  body: { name: 'Linda P. (SAMPLE)', phone: '709-555-0101', resident_id: 'r_mary' },
  resident: MARY, unit: HARBOUR, home: { ...HOME }, notices: [], questions: [], nowLocal: '15:00', residentCount: 0, phoneVisit: null,
})

const codeOf = (d) => (d.ok ? 'ok' : d.field ? `${d.code}:${d.field}` : d.code)

test('all well: ok, the phone stored as 709-555-0123, screened false with screening off', () => {
  assert.deepEqual(decideVisitorSignIn(ok()), { ok: true, name: 'Linda P. (SAMPLE)', phone: '709-555-0101', screened: false })
  const s = ok()
  s.home.screening_enabled = true
  s.questions = QUESTIONS
  s.body.answers = { q1: 'no', q2: 'no' }
  assert.deepEqual(decideVisitorSignIn(s), { ok: true, name: 'Linda P. (SAMPLE)', phone: '709-555-0101', screened: true })
})

test('every reason in order when all of them apply at once: fixing each reveals the next', () => {
  const s = ok()
  Object.assign(s, {
    body: { name: ' ', phone: '12', resident_id: '', answers: { q1: 'yes' } }, resident: null,
    notices: [{ severity: 'restricted' }, { severity: 'outbreak' }], nowLocal: '12:00', residentCount: 2,
    phoneVisit: { in_label: '2:05 PM' }, questions: QUESTIONS,
  })
  s.home.screening_enabled = true
  const seen = []
  const fixes = [
    () => (s.body.name = 'Linda P. (SAMPLE)'),
    () => (s.body.phone = '(709) 555-0101'),
    () => (s.body.resident_id = 'r_ellen'),
    () => (s.resident = { id: 'r_ellen', name: 'Ellen W. (SAMPLE)', by_arrangement: true }),
    () => (s.resident = MARY),
    () => (s.notices = [{ severity: 'outbreak' }]),
    () => (s.nowLocal = '15:00'),
    () => (s.body.answers = { q1: 'yes', q2: 'no' }),
    () => (s.body.answers = { q1: 'no', q2: 'no' }),
    () => (s.body.notice_confirmed = true),
    () => (s.residentCount = 1),
    () => (s.phoneVisit = null),
  ]
  seen.push(codeOf(decideVisitorSignIn(s)))
  for (const fix of fixes) {
    fix()
    seen.push(codeOf(decideVisitorSignIn(s)))
  }
  assert.deepEqual(seen, [
    'bad_request:name', 'bad_request:phone', 'bad_request:resident_id', 'not_found', 'by_arrangement', 'restricted_unit',
    'outside_hours', 'bad_request:answers', 'screening_stop', 'bad_request:notice_confirmed', 'resident_full', 'already_in', 'ok',
  ])
})

test('each reason alone, with its status and exact message', () => {
  const one = (change) => {
    const s = ok()
    change(s)
    return decideVisitorSignIn(s)
  }
  const refused = (d) => ({ status: d.status, code: d.code, message: d.message, field: d.field })
  assert.deepEqual(refused(one((s) => (s.body.name = 'A'))), { status: 400, code: 'bad_request', message: 'Please type your name.', field: 'name' })
  assert.equal(one((s) => (s.body.name = '12')).field, 'name', 'needs a letter')
  assert.equal(one((s) => (s.body.name = 'x'.repeat(61))).field, 'name', '61 characters')
  assert.equal(one((s) => (s.body.name = `  ${'x'.repeat(60)}  `)).ok, true, '60 characters after trimming')
  assert.deepEqual(refused(one((s) => (s.body.phone = '555-0101'))),
    { status: 400, code: 'bad_request', message: 'Please type a 10-digit phone number, like 709-555-0123.', field: 'phone' })
  assert.deepEqual(refused(one((s) => delete s.body.resident_id)),
    { status: 400, code: 'bad_request', message: 'Please pick who you are visiting.', field: 'resident_id' })
  assert.deepEqual(refused(one((s) => (s.resident = null))),
    { status: 404, code: 'not_found', message: "We can't find that resident. Please see the nurse's desk.", field: undefined })
  assert.deepEqual(refused(one((s) => (s.resident = { id: 'r_ellen', name: 'Ellen W. (SAMPLE)', by_arrangement: true }))),
    { status: 403, code: 'by_arrangement', message: "Visits with Ellen W. (SAMPLE) are by arrangement only. Please see the nurse's desk.", field: undefined })
  assert.deepEqual(refused(one((s) => (s.notices = [{ severity: 'restricted' }]))),
    { status: 403, code: 'restricted_unit', message: "Harbour wing: visitors can't sign themselves in right now. Please see the nurse's desk.", field: undefined })
  assert.deepEqual(refused(one((s) => (s.nowLocal = '12:00'))), {
    status: 403, code: 'outside_hours', field: undefined,
    message: 'Visiting hours are over for now. If you need to see someone, please call the unit. Visiting hours on Harbour wing: 8:00 AM to 11:30 AM and 1:30 PM to 9:00 PM.',
  })
  const screening = (answers) => one((s) => {
    s.home.screening_enabled = true
    s.questions = QUESTIONS
    s.body.answers = answers
  })
  assert.deepEqual(refused(screening(undefined)), { status: 400, code: 'bad_request', message: 'Please answer every question.', field: 'answers' })
  assert.equal(screening({ q1: 'no' }).field, 'answers', 'one question unanswered')
  assert.equal(screening({ q1: 'no', q2: 'maybe' }).field, 'answers')
  assert.deepEqual(refused(screening({ q1: 'no', q2: 'yes' })), { status: 403, code: 'screening_stop', message: "Please don't visit today.", field: undefined })
  assert.equal(one((s) => (s.body.answers = { q1: 'yes' })).ok, true, 'screening off: answers are ignored')
  assert.deepEqual(refused(one((s) => (s.notices = [{ severity: 'outbreak' }]))),
    { status: 400, code: 'bad_request', message: 'Please read the notice, then tap I have read it.', field: 'notice_confirmed' })
  assert.equal(one((s) => { s.notices = [{ severity: 'outbreak' }]; s.body.notice_confirmed = 'true' }).field, 'notice_confirmed', 'only true confirms')
  assert.equal(one((s) => { s.notices = [{ severity: 'info' }] }).ok, true, 'an info notice needs no confirmation')
  assert.deepEqual(refused(one((s) => (s.residentCount = 2))), {
    status: 409, code: 'resident_full', field: undefined,
    message: "Mary S. (SAMPLE) already has 2 visitors signed in. Please wait until someone signs out. Please see the nurse's desk.",
  })
  assert.equal(one((s) => { s.home.max_visitors_per_resident = 1; s.residentCount = 1 }).message,
    "Mary S. (SAMPLE) already has 1 visitor signed in. Please wait until someone signs out. Please see the nurse's desk.")
  assert.equal(one((s) => { s.home.max_visitors_per_resident = null; s.residentCount = 50 }).ok, true, 'no limit never refuses')
  assert.deepEqual(refused(one((s) => (s.phoneVisit = { in_label: '2:05 PM' }))), {
    status: 409, code: 'already_in', field: undefined, message: 'This phone number is already signed in, since 2:05 PM. Please sign out first.',
  })
})

test('blockReasons lists checks 3, 4, 5 and 9 in order (the staff warnings and the resident answer)', () => {
  const codes = blockReasons({
    resident: { name: 'Ellen W. (SAMPLE)', by_arrangement: true }, unit: HARBOUR, home: HOME,
    notices: [{ severity: 'info' }, { severity: 'restricted' }], nowLocal: '22:00', residentCount: 2,
  }).map((r) => r.code)
  assert.deepEqual(codes, ['by_arrangement', 'restricted_unit', 'outside_hours', 'resident_full'])
  assert.deepEqual(blockReasons({ resident: MARY, unit: HARBOUR, home: HOME, notices: [], nowLocal: '15:00', residentCount: 1 }), [])
})

test('phone normalising: (709) 555-0123, +1 709 555 0123, 17095550123 ok; 9 and 11 digits refused', () => {
  assert.equal(normalizePhone('(709) 555-0123'), '709-555-0123')
  assert.equal(normalizePhone('+1 709 555 0123'), '709-555-0123')
  assert.equal(normalizePhone('17095550123'), '709-555-0123')
  assert.equal(normalizePhone('709.555.0123'), '709-555-0123')
  assert.equal(normalizePhone('7095550123'), '709-555-0123')
  assert.equal(normalizePhone('709555012'), null, '9 digits')
  assert.equal(normalizePhone('70955501234'), null, '11 digits without a leading 1')
  assert.equal(normalizePhone('+2 709 555 0123'), null)
  assert.equal(normalizePhone('709-555-012a'), null)
  assert.equal(normalizePhone(7095550123), null, 'a number, not text')
  assert.equal(normalizePhone(''), null)
})
