// Every visitor page negative control, one after another. Exit 0 only if every one went red.
//   node tests/visit/negative-all.mjs   (from app/; NEG_PORT picks the port, default 8406)
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const NAMES = ['stale-notice', 'yes-posts', 'overlay', 'forget-me', 'header-covers']
const results = NAMES.map((n) => [n, spawnSync(process.execPath, [path.join(HERE, `negative-${n}.mjs`)], { stdio: 'inherit' }).status])
console.log('\n== visit negative controls')
for (const [n, code] of results) console.log(`${code === 0 ? 'RED (good)  ' : 'NOT RED (bad)'} visit negative:${n} exit ${code}`)
process.exit(results.every(([, code]) => code === 0) ? 0 : 1)
