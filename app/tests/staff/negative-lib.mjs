// Staff and settings negative controls (vl2). Adapted from Daycare Day Sheet's app/tests/door/negative-lib.mjs.
// Copies app/public/ and worker/ into app/.negative/<name>/ (git-ignored), breaks the COPY by exact text replacement, runs ONE named
// test from tests/staff/<spec> against a Worker started from the copy (E2E_WORKER_DIR, E2E_PORT 8407), and passes only if that test
// went red with every `expect` string in the output. Every run appends to app/tests/staff/negative-control.log.
// Exit codes: 0 red as intended · 1 NOT red (the check measured nothing) · 2 the break did not apply or could not run.
// A patch anchor that is missing or occurs more than once is a failure (2), never a pass. The shipped pages have no switch that
// turns a check off: only the copy is changed.
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(HERE, '..', '..')
const ROOT = path.resolve(APP, '..')
const LOG = process.env.NEG_LOG ? path.resolve(process.env.NEG_LOG) : path.join(HERE, 'negative-control.log')
const PORT = process.env.NEG_PORT || '8407'

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * name: folder under app/.negative/ and the log label ('stale-total').
 * why: the break in plain words.
 * patches: [{ file, from, to }] — file is under app/public/ ('staff/staff.js') or 'worker/…' for the Worker copy.
 * spec: file in tests/staff/ ('building.spec.mjs'); grep: the exact test title that must go red.
 * project: Playwright project (default chromium-tablet); expect: strings that must all appear in the output.
 */
export function staffNegative({ name, why, patches, spec, grep, project = 'chromium-tablet', expect = [] }) {
  const base = path.join(APP, '.negative', name)
  const header = `\n=== staff negative:${name} — ${new Date().toISOString()}\nbreak: ${why}\n`
  const stop = (result, code) => {
    appendFileSync(LOG, `${header}${result}\n`)
    rmSync(base, { recursive: true, force: true })
    console.error(`staff negative:${name}: ${result}`)
    return code
  }
  if (!Array.isArray(patches) || patches.length === 0) return stop('RESULT: BREAK DID NOT APPLY — no patches given', 2)
  if (!grep) return stop('RESULT: CANNOT RUN — no test title (grep) given', 2)

  rmSync(base, { recursive: true, force: true })
  mkdirSync(path.join(base, 'app'), { recursive: true })
  cpSync(path.join(APP, 'public'), path.join(base, 'app', 'public'), { recursive: true })
  if (existsSync(path.join(ROOT, 'worker'))) {
    mkdirSync(path.join(base, 'worker'), { recursive: true })
    for (const entry of readdirSync(path.join(ROOT, 'worker'))) {
      if (/^\.state-|^\.negative$|^\.wrangler$|^node_modules$/.test(entry)) continue
      cpSync(path.join(ROOT, 'worker', entry), path.join(base, 'worker', entry), { recursive: true })
    }
  }

  // Apply every break before anything runs; one that does not apply exactly once ends the control.
  for (const p of patches) {
    const file = p.file.startsWith('worker/') ? path.join(base, p.file) : path.join(base, 'app', 'public', p.file)
    if (!existsSync(file)) return stop(`RESULT: BREAK DID NOT APPLY — ${p.file} does not exist`, 2)
    if (p.from === p.to) return stop(`RESULT: BREAK DID NOT APPLY — the patch for ${p.file} changes nothing`, 2)
    const text = readFileSync(file, 'utf8')
    const count = text.split(p.from).length - 1
    if (count !== 1) return stop(`RESULT: BREAK DID NOT APPLY — "${p.from.slice(0, 80)}" found ${count} times in ${p.file}`, 2)
    writeFileSync(file, text.replace(p.from, () => p.to))
  }
  if (!existsSync(path.join(base, 'worker', 'wrangler.toml'))) return stop('RESULT: CANNOT RUN — no worker/wrangler.toml to copy (is vl1\'s Worker on this branch?)', 2)

  const args = ['playwright', 'test', `tests/staff/${spec}`, '--project', project, '--grep', escapeRegex(grep), '--workers', '1',
    '--reporter=list', '--output', path.join(base, 'results')]
  const r = spawnSync('npx', args, {
    cwd: APP, encoding: 'utf8', env: { ...process.env, E2E_PORT: PORT, E2E_WORKER_DIR: path.join(base, 'worker'), FORCE_COLOR: '0' },
  })
  const out = `${r.stdout}\n${r.stderr}`.split(ROOT + path.sep).join('')
  const namedTestFailed = out.split('\n').some((l) => /✘/.test(l) && l.includes(grep))
  const missing = expect.filter((s) => !out.includes(s))
  const red = r.status !== 0 && namedTestFailed && /\b1 failed\b/.test(out) && !/\b\d+ passed\b/.test(out) && missing.length === 0
  const lines = out.split('\n')
    .filter((l) => /✘|✓|passed|failed|Error:|Expected|Received|something else is on top|Locator:|expected to|unexpected value|no tests found/i.test(l))
    .slice(0, 30).join('\n')
  const result = red
    ? 'RESULT: RED as intended'
    : `RESULT: NOT RED — the check measured nothing (exit ${r.status}; named test failed: ${namedTestFailed}; missing: ${missing.join(' | ') || 'none'})`
  appendFileSync(LOG, `${header}patched: ${patches.map((p) => (p.file.startsWith('worker/') ? p.file : `app/public/${p.file}`)).join(', ')}\n` +
    `run: npx playwright test tests/staff/${spec} --project ${project} --grep "${grep}" (E2E_PORT ${PORT}, E2E_WORKER_DIR app/.negative/${name}/worker)\n${lines}\n${result}\n`)
  rmSync(base, { recursive: true, force: true })
  console.log(`${lines}\n${result}`)
  return red ? 0 : 1
}
