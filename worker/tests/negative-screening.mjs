// (b) The copy ignores a screening "yes" → the screening test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'screening',
  why: 'rules.js decideVisitorSignIn no longer stops on a "yes" answer',
  patches: [{
    file: 'src/rules.js',
    from: "if (questions.some((q) => answers[q.id] === 'yes')) return refuse(403, 'screening_stop', home.screening_stop_message)",
    to: '// negative control: a "yes" is ignored',
  }],
  args: ['--api-only', '--grep', '^screening: a yes'],
  expectRed: ['screening: a yes stops the sign-in with the stop message byte for byte, and the building, the day log and D1 are unchanged; all no → screened'],
}))
