// (k) The copy never counts a wrong PIN → the 429 test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'ratelimit',
  why: 'auth.js recordWrongPin writes nothing, so wrong PINs are never counted',
  patches: [{
    file: 'src/auth.js',
    from: "  await c.db.prepare('INSERT INTO pin_attempts (ip, at) VALUES (?, ?)').bind(ipOf(c), c.nowIso).run()\n",
    to: '  // negative control: wrong PINs are not counted\n',
  }],
  args: ['--api-only', '--grep', '^pin guard'],
  expectRed: ['pin guard: 5 wrong PINs from one IP → 429, then even the right PIN 429; another X-Test-IP still works'],
}))
