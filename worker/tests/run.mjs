// `npm test`: pure unit tests, then the API suites against a fresh local Worker in TEST_MODE. Adapted from Daycare Day Sheet.
//   PORT (default 8402, inspector PORT+10). State in worker/.state-<PORT>, wiped first and removed after.
//   If something already answers on PORT, it is used as is and not stopped (unless --fresh).
//   --unit-only       unit tests only
//   --api-only        skip the unit tests
//   --grep <regex>    only API tests whose name matches
//   --fresh           refuse to reuse a Worker already answering on PORT (negative controls must test their own copy)
// Exit code is non-zero when anything fails. Local only: never --remote.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 8402)
const BASE = `http://127.0.0.1:${PORT}`
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' }
const reporter = process.env.TEST_REPORTER ? [`--test-reporter=${process.env.TEST_REPORTER}`] : []
// API suites, in order. api-empty.test.mjs runs first, on its own, before anything resets the D1.
const API_FILES = ['tests/api.test.mjs', 'tests/count-property.test.mjs', 'tests/api-m2.test.mjs']
const NOT_UNIT = new Set(['api-empty.test.mjs', ...API_FILES.map((f) => path.basename(f))])

function runNodeTests(files, extra = [], extraEnv = {}) {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...reporter, ...extra, ...files],
    { cwd: WORKER, stdio: 'inherit', env: { ...env, ...extraEnv } })
  return r.status === 0 ? 0 : 1
}

async function answers() {
  try {
    const r = await fetch(`${BASE}/api/info`, { signal: AbortSignal.timeout(1500) })
    return r.status > 0
  } catch {
    return false
  }
}

const wrangler = (argv) => spawnSync('wrangler', argv, { cwd: WORKER, stdio: ['ignore', 'ignore', 'inherit'], env }).status === 0

function freshState(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return wrangler(['d1', 'migrations', 'apply', 'visitor-log', '--local', '--persist-to', dir])
}

async function startWorker(dir) {
  const dev = spawn('wrangler', ['dev', '--local', '--port', String(PORT), '--inspector-port', String(PORT + 10), '--persist-to', dir,
    '--var', 'TEST_MODE:1', '--show-interactive-dev-session=false'],
  { cwd: WORKER, stdio: ['ignore', 'ignore', 'inherit'], env, detached: true })
  const t0 = Date.now()
  while (!(await answers())) {
    if (dev.exitCode !== null || Date.now() - t0 > 90000) {
      try { process.kill(-dev.pid, 'SIGTERM') } catch {}
      return null
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return dev
}

async function stopWorker(dev) {
  try { process.kill(-dev.pid, 'SIGTERM') } catch {}
  // Wait until the port is really free, so the next run cannot talk to this Worker.
  const t0 = Date.now()
  while ((await answers()) && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 200))
  if (await answers()) {
    try { process.kill(-dev.pid, 'SIGKILL') } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
}

let failed = 0

if (!flag('--api-only')) {
  const unit = readdirSync(path.join(WORKER, 'tests')).filter((f) => f.endsWith('.test.mjs') && !NOT_UNIT.has(f)).sort()
    .map((f) => path.join('tests', f))
  console.log(`\n== unit: ${unit.join(' ')}`)
  failed |= runNodeTests(unit)
}

if (!flag('--unit-only')) {
  const grep = opt('--grep')
  const grepArgs = grep ? [`--test-name-pattern=${grep}`] : []
  let reused = false
  let dev = null
  const STATE = path.join(WORKER, `.state-${PORT}`)
  if (await answers()) {
    if (flag('--fresh')) {
      console.error(`\n== api: REFUSED — something already answers on ${BASE} and --fresh was given`)
      process.exit(1)
    }
    reused = true
    console.log(`\n== api: using the Worker already answering on ${BASE}`)
  } else {
    console.log(`\n== api: fresh Worker on ${BASE} (state ${path.relative(WORKER, STATE)})`)
    if (!freshState(STATE)) {
      console.error('migrations failed')
      process.exit(1)
    }
    dev = await startWorker(STATE)
    if (!dev) {
      console.error('the Worker did not start')
      process.exit(1)
    }
  }
  // A freshly migrated D1 has no home row: checked first, before any test resets it, and only on a Worker this run started.
  if (!reused) failed |= runNodeTests(['tests/api-empty.test.mjs'], grepArgs, { API_BASE: BASE, STATE_DIR: STATE })
  else console.log('== api-empty: SKIPPED — the Worker on this port was not started by this run, so its D1 is not known to be empty')
  const files = API_FILES.filter((f) => existsSync(path.join(WORKER, f)))
  failed |= runNodeTests(files, grepArgs, { API_BASE: BASE, STATE_DIR: STATE })
  if (dev) {
    await stopWorker(dev)
    rmSync(STATE, { recursive: true, force: true })
  }
}

process.exit(failed ? 1 : 0)
