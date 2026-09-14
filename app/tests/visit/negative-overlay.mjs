// (o) A transparent cover over #sign-out → the tap() hit-test must go red.
import { visitNegative } from './negative-lib.mjs'
import { TITLES } from './titles.mjs'

process.exit(visitNegative({
  name: 'overlay',
  why: 'visit.js puts a transparent full-screen cover over the signed-in screen, so a tap on Sign out hits the cover',
  patches: [{
    file: 'visit/visit.js',
    from: "  const signOut = h('button', { type: 'button', id: 'sign-out', class: 'v-button v-primary v-big' }, 'Sign out')\n",
    to: "  const signOut = h('button', { type: 'button', id: 'sign-out', class: 'v-button v-primary v-big' }, 'Sign out')\n" +
      "  document.body.append(h('div', { class: 'cover', style: 'position:fixed;inset:0;z-index:50;background:transparent' }))\n",
  }],
  grep: TITLES.first,
  expect: ['something else is on top'],
}))
