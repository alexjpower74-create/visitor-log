// (p) The copy never stores name and phone → the remembered check must go red.
import { visitNegative } from './negative-lib.mjs'
import { TITLES } from './titles.mjs'

process.exit(visitNegative({
  name: 'forget-me',
  why: 'sign-in.js remember() no longer saves name and phone on this phone',
  patches: [{ file: 'visit/sign-in.js', from: '  store.set(ME_KEY, JSON.stringify(me))\n', to: '  // negative control: name and phone are not stored\n' }],
  grep: TITLES.first,
  expect: ['toHaveValue'],
}))
