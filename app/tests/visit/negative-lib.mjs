// Visitor page negative controls (vl1). Adapted from vl2's app/tests/staff/negative-lib.mjs and Daycare Day Sheet's door controls.
// Copies app/public/ and worker/ into app/.negative/visit-<name>/ (git-ignored), breaks the COPY by exact text replacement, runs ONE
// named test from tests/visit/<spec> against a Worker started from the copy (E2E_WORKER_DIR, E2E_PORT from NEG_PORT, default 8406),
// and passes only if that test went red with every `expect` string in the output. Every run appends to
// app/tests/visit/negative-control.log. Exit codes: 0 red as intended · 1 NOT red (the check measured nothing) · 2 the break did not
// apply. The shipped pages have no switch that turns a check off: only the copy is changed.
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(HERE, '..', '..')
const ROOT = path.resolve(APP, '..')
const LOG = path.join(HERE, 'negative-control.log')
const PORT = process.env.NEG_PORT || '8406'

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// patches: [{ file (under app/public, or worker/…), from, to }]; spec: file in tests/visit/; grep: the exact title that must go red;
// project: default chromium-390; expect: strings that must all appear in the output.
export function visitNegative({ name, why, patches, spec = 'visit.spec.mjs', grep, project = 'chromium-390', expect = [] }) {
  const base = path.join(APP, '.negative', `visit-${name}`)
  const header = `\n=== visit negative:${name} — ${new Date().toISOString()}\nbreak: ${why}\n`
  const stop = (result, code) => {
    appendFileSync(LOG, `${header}${result}\n`)
    rmSync(base, { recursive: true, force: true })
    console.error(`visit negative:${name}: ${result}`)
    return code
  }

  rmSync(base, { recursive: true, force: true })
  mkdirSync(path.join(base, 'app'), { recursive: true })
  cpSync(path.join(APP, 'public'), path.join(base, 'app', 'public'), { recursive: true })
  mkdirSync(path.join(base, 'worker'), { recursive: true })
  for (const entry of readdirSync(path.join(ROOT, 'worker'))) {
    if (/^\.state-|^\.negative$|^\.wrangler$|^node_modules$|^\.logs$/.test(entry)) continue
    cpSync(path.join(ROOT, 'worker', entry), path.join(base, 'worker', entry), { recursive: true })
  }

  for (const p of patches) {
    const file = p.file.startsWith('worker/') ? path.join(base, p.file) : path.join(base, 'app', 'public', p.file)
    if (!existsSync(file)) return stop(`RESULT: BREAK DID NOT APPLY — ${p.file} does not exist`, 2)
    const text = readFileSync(file, 'utf8')
    const count = text.split(p.from).length - 1
    if (count !== 1) return stop(`RESULT: BREAK DID NOT APPLY — "${p.from.slice(0, 80)}" found ${count} times in ${p.file}`, 2)
    writeFileSync(file, text.replace(p.from, () => p.to))
  }

  const r = spawnSync('npx', ['playwright', 'test', `tests/visit/${spec}`, '--project', project, '--grep', escapeRegex(grep), '--workers', '1',
    '--reporter=list', '--output', path.join(base, 'results')], {
    cwd: APP, encoding: 'utf8', env: { ...process.env, E2E_PORT: PORT, E2E_WORKER_DIR: path.join(base, 'worker'), FORCE_COLOR: '0' },
  })
  const out = `${r.stdout}\n${r.stderr}`.split(ROOT + path.sep).join('')
  const namedTestFailed = out.split('\n').some((l) => /✘/.test(l) && l.includes(grep))
  const missing = expect.filter((s) => !out.includes(s))
  const red = r.status !== 0 && namedTestFailed && /\b1 failed\b/.test(out) && !/\b\d+ passed\b/.test(out) && missing.length === 0
  const lines = out.split('\n')
    .filter((l) => /✘|✓|passed|failed|Error:|Expected|Received|something else is on top|Locator:|expected to|unexpected value|a Yes must|no tests found/i.test(l))
    .slice(0, 30).join('\n')
  const result = red
    ? 'RESULT: RED as intended'
    : `RESULT: NOT RED — the check measured nothing (exit ${r.status}; named test failed: ${namedTestFailed}; missing: ${missing.join(' | ') || 'none'})`
  appendFileSync(LOG, `${header}patched: ${patches.map((p) => (p.file.startsWith('worker/') ? p.file : `app/public/${p.file}`)).join(', ')}\n` +
    `run: npx playwright test tests/visit/${spec} --project ${project} --grep "${grep}" (E2E_PORT ${PORT}, E2E_WORKER_DIR app/.negative/visit-${name}/worker)\n${lines}\n${result}\n`)
  rmSync(base, { recursive: true, force: true })
  console.log(`${lines}\n${result}`)
  return red ? 0 : 1
}
