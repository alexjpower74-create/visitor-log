// (n) The copy sends a "Yes" to the Worker like any answer (the server's 403 then shows the stop message) → the no-POST check must go red.
import { visitNegative } from './negative-lib.mjs'
import { TITLES } from './titles.mjs'

process.exit(visitNegative({
  name: 'yes-posts',
  why: 'sign-in.js answer() submits the sign-in on a "Yes" instead of stopping on the phone',
  patches: [{ file: 'visit/sign-in.js', from: '    showStop(state.start.screening.stop_message)\n    return\n', to: '    return submit()\n' }],
  grep: TITLES.screening,
  expect: ['a Yes must not send a sign-in'],
}))
