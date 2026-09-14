// Negative control (h) qr-wrong-path: the copy's door sign QR encodes /staff/ instead of the sign-in page.
// Passes only if door-sign.spec's QR test goes red on the decode check.
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: 'qr-wrong-path',
  why: "the copy's door sign QR encodes location.origin + '/staff/'",
  spec: 'door-sign.spec.mjs',
  grep: 'the door sign QR decodes to the sign-in page, with the home name and SAMPLE',
  patches: [
    { file: 'settings/door-sign/door-sign.js', from: 'const url = `${location.origin}/`', to: 'const url = `${location.origin}/staff/`' },
  ],
  expect: ['the door QR opens the sign-in page'],
}))
