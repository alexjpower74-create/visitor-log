// M1 smoke run and screenshots of every staff and settings tab at 390 and 1024, against the mock (?mock=1) on the vl2 dev
// server (tests/staff/serve-mock.mjs, port 8401). Not a test of the Worker: the Playwright specs in this folder do that.
// It fails (exit 1) on any page error, a console error, a poll that closes an open confirmation, a CSV download without the
// API's filename, or a door sign QR that does not decode to <origin>/.
//   node tests/staff/shots-mock.mjs [chromium|webkit|all]
// Chromium shots go to tests/staff/shots/; WebKit shots to tests/results/vl2-webkit-shots/ (git-ignored) for looking at.
import { chromium, webkit } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { DEVICES } from '../../playwright.config.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = `http://127.0.0.1:${process.env.PORT || 8401}`
const which = process.argv[2] || 'all'
const engines = { chromium, webkit }
const problems = []

function fail(msg) { problems.push(msg); console.error(`  FAIL ${msg}`) }

async function run(engineName, kind) {
  const label = `${engineName}-${kind === 'phone' ? '390' : 'tablet'}`
  const outDir = engineName === 'chromium' ? path.join(HERE, 'shots') : path.join(HERE, '..', 'results', 'vl2-webkit-shots')
  mkdirSync(outDir, { recursive: true })
  const browser = await engines[engineName].launch()
  const context = await browser.newContext({ ...DEVICES[kind], baseURL: BASE, acceptDownloads: true })
  const page = await context.newPage()
  page.on('pageerror', (e) => fail(`${label} page error: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) fail(`${label} console: ${m.text()}`) })
  const shot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`) }) }
  const tab = (name) => page.getByRole('tab', { name, exact: true }).click()
  console.log(label)

  // ----- staff -----
  await page.goto('/staff/?mock=1&mockreset=1')
  await page.locator('button.key[data-key="1"]').waitFor()
  for (const d of '1111') await page.locator(`button.key[data-key="${d}"]`).click()
  await page.locator('#pin-enter').click()
  await page.locator('#pin-error').filter({ hasText: 'That PIN is not right.' }).waitFor()
  await shot('staff-signin')
  for (const d of '7314') await page.locator(`button.key[data-key="${d}"]`).click()
  await page.locator('#pin-enter').click()
  await page.locator('#building-total').waitFor()
  await page.locator('[data-visit]').first().waitFor()
  await shot('staff-building')

  // an open confirmation survives a poll (5 s)
  const row = page.locator('[data-unit="u_lighthouse"] [data-visit]').first()
  const rowId = await row.getAttribute('data-visit')
  await row.locator('button.sign-out-visit').click()
  await page.locator(`[data-visit="${rowId}"] button.confirm-sign-out`).waitFor()
  await shot('staff-building-confirm')
  await page.waitForTimeout(6000)
  if (!(await page.locator(`[data-visit="${rowId}"] button.confirm-sign-out`).isVisible())) fail(`${label} a poll closed the open confirmation`)
  const totalBefore = Number((await page.locator('#building-total .total-number').textContent()).trim())
  await page.locator(`[data-visit="${rowId}"] button.confirm-sign-out`).click()
  await page.locator(`[data-visit="${rowId}"]`).waitFor({ state: 'detached' })
  const totalAfter = Number((await page.locator('#building-total .total-number').textContent()).trim())
  if (totalAfter !== totalBefore - 1) fail(`${label} total ${totalBefore} → ${totalAfter} after a sign-out`)

  await tab('Roll call')
  await page.locator('#start-roll-call').waitFor()
  await shot('staff-rollcall-none')
  await page.locator('#start-roll-call').click()
  await page.locator('#confirm-roll-call').click()
  await page.locator('#roll-call-progress').filter({ hasText: /^0 of \d+ found$/ }).waitFor()
  await page.locator('[data-roll] button.found').first().click()
  await page.locator('#roll-call-progress').filter({ hasText: /^1 of \d+ found$/ }).waitFor()
  await shot('staff-rollcall-going')

  await tab('Day log')
  await page.locator('[data-log-visit]').first().waitFor()
  await shot('staff-daylog')
  await page.locator('#log-prev').click()
  await page.locator('#log-heading').filter({ hasText: 'Sep 13' }).waitFor()

  await tab('Contact list')
  await page.locator('#contacts-from').fill('2026-09-13')
  await page.locator('#contacts-show').click()
  await page.locator('[data-contact-row]').first().waitFor()
  await shot('staff-contacts')
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-contacts').click()])
  const name = download.suggestedFilename()
  if (name !== 'visitor-contacts-all-units-2026-09-13-to-2026-09-14.csv') fail(`${label} CSV filename ${name}`)
  const csv = readFileSync(await download.path(), 'utf8')
  if (!csv.startsWith('Date,Unit,Resident,Room,Visitor,Phone,In,Out,Signed out,Signed in by\r\n')) fail(`${label} CSV header`)

  await tab('Sign someone in')
  await page.locator('#manual-resident option[value="r_ellen"]').waitFor({ state: 'attached' })
  await page.locator('#manual-resident').selectOption('r_ellen')
  await page.locator('#manual-name').fill('Kevin W. (SAMPLE)')
  await page.locator('#manual-submit').click()
  await page.locator('#manual-warnings li').first().waitFor()
  const warn = await page.locator('#manual-warnings').textContent()
  if (!warn.includes("Visits with Ellen W. (SAMPLE) are by arrangement only. Please see the nurse's desk.")) fail(`${label} manual warning: ${warn}`)
  await shot('staff-signin-someone')

  // ----- settings -----
  await page.goto('/settings/?mock=1')
  await page.getByRole('tab', { name: 'Notices', exact: true }).waitFor()
  await page.locator('#notice-unit').selectOption('u_harbour')
  await page.locator('#notice-severity').selectOption('restricted')
  await page.locator('#notice-message').fill('SAMPLE notice: Harbour wing visits are at the nurse\'s desk today.')
  await page.locator('#notice-add').click()
  await page.locator('#notice-status').filter({ hasText: 'Notice added' }).waitFor()
  await shot('settings-notices')

  await tab('Screening')
  await page.locator('#screening-enabled').click()
  await page.locator('#screening-save').click()
  await page.locator('[data-error-for="questions"]').filter({ hasText: 'Add at least one question' }).waitFor()
  await page.locator('#screening-enabled').click()
  await page.locator('#use-example').click()
  await page.locator('#example-label').waitFor()
  await shot('settings-screening')

  await tab('Visits and privacy')
  await page.locator('#retention-days').fill('0')
  await page.locator('#visits-save').click()
  await page.locator('[data-error-for="retention_days"]').filter({ hasText: 'Keep visitor records for 1 to 365 days.' }).waitFor()
  await page.locator('#retention-days').fill('14')
  await page.locator('#visits-save').click()
  await page.locator('#retention-line').filter({ hasText: 'Visitor records are deleted after 14 days.' }).waitFor()
  await shot('settings-visits')

  await tab('Units and hours')
  await page.locator('[data-unit-row]').first().waitFor()
  await page.locator('[data-unit-row="u_harbour"] .unit-edit').click()
  await shot('settings-units')
  await page.locator('#unit-cancel').click()

  await tab('Residents')
  await page.locator('[data-resident-row]').first().waitFor()
  await shot('settings-residents')

  await tab('Staff')
  await page.locator('#staff-name').fill('Dave P. (SAMPLE)')
  await page.locator('#staff-pin').fill('2580')
  await page.locator('#staff-save').click()
  await page.locator('[data-error-for="pin"]').filter({ hasText: 'already has that PIN' }).waitFor()
  await shot('settings-staff')

  await tab('Door sign')
  await page.locator('.qr-preview').waitFor()
  await shot('settings-doorsign')

  await page.goto('/settings/door-sign/?mock=1')
  await page.locator('#door-home').filter({ hasText: 'SAMPLE Harbourview' }).waitFor()
  const png = PNG.sync.read(await page.locator('#door-qr').screenshot())
  const qr = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height)
  if (qr?.data !== `${BASE}/`) fail(`${label} door QR decodes to ${qr?.data}`)
  await shot('door-sign')
  await page.emulateMedia({ media: 'print' })
  if (await page.locator('#print-sign').isVisible()) fail(`${label} Print button shows in print`)
  await page.emulateMedia({ media: 'screen' })

  await browser.close()
}

for (const e of which === 'all' ? ['chromium', 'webkit'] : [which]) {
  for (const kind of ['phone', 'tablet']) {
    try { await run(e, kind) } catch (err) { fail(`${e}-${kind} stopped: ${err.message.split('\n').slice(0, 4).join(' | ')}`) }
  }
}
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall good')
process.exit(problems.length ? 1 : 0)
