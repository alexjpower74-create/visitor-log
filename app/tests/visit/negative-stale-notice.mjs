// (m) The copy does not clear #unit-notices when a different resident is picked → the "Back, pick Frank" check must go red.
import { visitNegative } from './negative-lib.mjs'
import { TITLES } from './titles.mjs'

process.exit(visitNegative({
  name: 'stale-notice',
  why: 'sign-in.js pick() no longer clears #unit-notices before showing the next resident',
  patches: [{ file: 'visit/sign-in.js', from: '  unitNotices.replaceChildren()\n', to: '' }],
  grep: TITLES.notice,
  expect: ['[data-severity="outbreak"]'],
}))
