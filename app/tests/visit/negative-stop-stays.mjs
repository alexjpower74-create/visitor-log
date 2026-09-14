// (s) The copy's answer() never hides #stop or brings Sign in back after a "Yes" is changed to "No" → the yes-then-no test must go red.
import { visitNegative } from './negative-lib.mjs'
import { TITLES } from './titles.mjs'

process.exit(visitNegative({
  name: 'stop-stays',
  why: 'sign-in.js answer() no longer hides #stop or shows #sign-in when no answer is "Yes" any more',
  patches: [{
    file: 'visit/sign-in.js',
    from: "  if (!Object.values(state.answers).includes('yes')) {\n    stop.hidden = true\n    signIn.hidden = false\n  }\n",
    to: '  // negative control: the stop message stays after a Yes is changed to No\n',
  }],
  grep: TITLES.yesThenNo,
  expect: ["locator('#stop')"],
}))
