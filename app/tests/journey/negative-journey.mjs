// Negative control for the whole-day journey. Lead-owned.
// Copies worker/ into app/.negative/journey/worker (git-ignored) with app/public linked beside it, breaks ONE thing in the copy
// (every active notice becomes a unit notice for every resident), runs the journey in chromium-tablet against the copy on
// E2E_PORT (default 8408), and passes (exit 0) only if the journey goes red at the check that Frank's visitor sees no outbreak
// notice. Red anywhere else is not this control's red (exit 1). A break that did not apply is exit 2. Appends to negative-control.log.
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKER = path.join(APP, '..', 'worker')
const ROOT = path.join(APP, '.negative', 'journey')
const COPY = path.join(ROOT, 'worker')
const LOG = path.join(APP, 'tests', 'journey', 'negative-control.log')
const PORT = process.env.E2E_PORT || '8408'
const SKIP = new Set(['.negative', '.wrangler', 'node_modules'])

const FILE = 'src/world.js'
const FROM = 'export const unitNoticesOf = (notices, unitId) => notices.filter((n) => n.unit_id === unitId)'
const TO = 'export const unitNoticesOf = (notices, unitId) => notices.filter(() => true)'
const WANT = />\s*\d+\s*\|\s*await expect\(grace\.getByText\(OUTBREAK\)\)\.toHaveCount\(0\)/

rmSync(ROOT, { recursive: true, force: true })
mkdirSync(COPY, { recursive: true })
for (const entry of readdirSync(WORKER)) {
  if (SKIP.has(entry) || entry.startsWith('.state-')) continue
  cpSync(path.join(WORKER, entry), path.join(COPY, entry), { recursive: true })
}
mkdirSync(path.join(ROOT, 'app'), { recursive: true })
symlinkSync(realpathSync(path.join(APP, 'public')), path.join(ROOT, 'app', 'public'))

const header = `\n=== negative:journey — ${new Date().toISOString()}\nbreak: ${FILE} unitNoticesOf returns every active notice for every resident\n`
const target = path.join(COPY, FILE)
const text = readFileSync(target, 'utf8')
const count = text.split(FROM).length - 1
if (count !== 1) {
  const msg = `${header}RESULT: BREAK DID NOT APPLY — anchor found ${count} times in ${FILE}\n`
  appendFileSync(LOG, msg)
  console.error(msg)
  rmSync(ROOT, { recursive: true, force: true })
  process.exit(2)
}
writeFileSync(target, text.replace(FROM, TO))

const run = spawnSync('npx', ['playwright', 'test', 'tests/journey', '--project=chromium-tablet', '--reporter=line'], {
  cwd: APP, encoding: 'utf8', env: { ...process.env, E2E_PORT: PORT, E2E_WORKER_DIR: COPY, NO_COLOR: '1', FORCE_COLOR: '0' },
})
const out = `${run.stdout || ''}${run.stderr || ''}`.split(ROOT).join('app/.negative/journey')
const red = run.status !== 0 && WANT.test(out)
const detail = out.split('\n').filter((l) => /✘|failed|Error:|expect\(|^\s*>\s*\d+ \|/.test(l)).slice(0, 25).join('\n')
const result = red
  ? `RESULT: RED as intended (exit ${run.status}) at: await expect(grace.getByText(OUTBREAK)).toHaveCount(0)`
  : `RESULT: NOT THIS CONTROL'S RED — exit ${run.status}; the failing line was ${WANT.test(out) ? 'the notice check' : 'somewhere else or nowhere'}`
const entry = `${header}run: E2E_PORT=${PORT} npx playwright test tests/journey --project=chromium-tablet (against the copy)\n${detail}\n${result}\n`
appendFileSync(LOG, entry)
console.log(entry)
rmSync(ROOT, { recursive: true, force: true })
process.exit(red ? 0 : 1)
