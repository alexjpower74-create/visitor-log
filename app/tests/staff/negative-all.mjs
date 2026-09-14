// Every staff negative control in turn (npm run negative:staff). Exits 0 only if each one went red as intended (exit 0).
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(HERE, '..', '..')
const files = readdirSync(HERE).filter((f) => /^negative-.+\.mjs$/.test(f) && !['negative-lib.mjs', 'negative-all.mjs'].includes(f)).sort()
const results = []
for (const f of files) {
  console.log(`\n--- ${f}`)
  const r = spawnSync(process.execPath, [path.join(HERE, f)], { cwd: APP, stdio: 'inherit' })
  results.push([f, r.status])
}
console.log('\nstaff negative controls:')
for (const [f, s] of results) console.log(`  ${s === 0 ? 'RED as intended' : `NOT RED (exit ${s})`}  ${f}`)
const bad = results.filter(([, s]) => s !== 0).length
console.log(bad ? `${bad} of ${results.length} did not go red` : `${results.length} of ${results.length} went red`)
process.exit(bad ? 1 : 0)
