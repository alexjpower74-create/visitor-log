// (r) The copy never measures the sticky header, so the scroll padding is 16 px and a button scrolled to the top edge sits under
// the header → the targets test's top-edge hit-test must go red. (Added in M3: the first version of that check could not fail.)
import { visitNegative } from './negative-lib.mjs'

process.exit(visitNegative({
  name: 'header-covers',
  why: "visit.js no longer keeps --header-h at the sticky header's height (scroll padding falls back to 16 px)",
  patches: [{ file: 'visit/visit.js', from: '\nkeepClearOfHeader()\n', to: '\n// negative control: the header is not measured\n' }],
  spec: 'targets.spec.mjs',
  grep: 'targets: every step at 390 — buttons 56 px and hit-tested, Sign in and Sign out 64 px, SAMPLE, no sideways scroll, contrast, the sticky header',
  expect: ['its top edge is covered'],
}))
