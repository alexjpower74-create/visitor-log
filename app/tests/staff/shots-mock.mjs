// Smoke run and screenshots of every staff and settings tab at 390 and 1024, against the mock (?mock=1) on the vl2 dev server
// (tests/staff/serve-mock.mjs, port 8401). Not a test of the Worker: the Playwright specs in this folder do that.
// It fails (exit 1) on any page error, a console error, a poll that closes an open confirmation, a CSV download without the
// API's filename, a door sign QR that does not decode to <origin>/, a phone header taller than 96 px, tabs that wrap or scroll the
// page sideways, a whole-home notice shown more than once, or a Put back / Turn on that does not come back.
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

/** Phone layout checks: header ≤ 96 px, tabs on one row, the chosen tab hit-tests to itself, no sideways page scroll. */
async function phoneLayout(page, label, tabName) {
  const r = await page.evaluate((name) => {
    const header = document.querySelector('[data-sticky-header]').getBoundingClientRect().height
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)))
    const tab = tabs.find((t) => t.textContent === name)
    const b = tab.getBoundingClientRect()
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    const buttons = [...document.querySelectorAll('.who-line button, .who-line .button')].filter((x) => x.offsetParent)
      .map((x) => Math.round(x.getBoundingClientRect().height))
    return { header, rows: tops.size, hit: hit === tab || tab.contains(hit), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, buttons }
  }, tabName)
  if (r.header > 96) fail(`${label} header is ${r.header} px tall`)
  if (r.rows !== 1) fail(`${label} tabs on ${r.rows} rows`)
  if (!r.hit) fail(`${label} tab "${tabName}" is not in view (hit-test)`)
  if (r.sw > r.cw) fail(`${label} page scrolls sideways (${r.sw} > ${r.cw})`)
  if (r.buttons.some((hgt) => hgt < 44)) fail(`${label} header buttons ${r.buttons.join(',')} px`)
}

async function run(engineName, kind) {
  const label = `${engineName}-${kind === 'phone' ? '390' : 'tablet'}`
  const phone = kind === 'phone'
  // SHOTS_DIR keeps a run against a copy (a negative check) from overwriting the real screenshots.
  const outDir = process.env.SHOTS_DIR ? path.resolve(process.env.SHOTS_DIR)
    : engineName === 'chromium' ? path.join(HERE, 'shots') : path.join(HERE, '..', 'results', 'vl2-webkit-shots')
  mkdirSync(outDir, { recursive: true })
  const browser = await engines[engineName].launch()
  const context = await browser.newContext({ ...DEVICES[kind], baseURL: BASE, acceptDownloads: true })
  const page = await context.newPage()
  page.on('pageerror', (e) => fail(`${label} page error: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) fail(`${label} console: ${m.text()}`) })
  const shot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`) }) }
  const tab = async (name) => {
    await page.getByRole('tab', { name, exact: true }).click()
    if (phone) await phoneLayout(page, `${label} ${name}`, name)
  }
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
  if (phone) await phoneLayout(page, `${label} building`, 'In the building')

  // whole-home notices once above the cards; a card shows only its own unit's notices
  const notices = await page.evaluate(() => ({
    home: document.querySelectorAll('#panel-building [data-notice="n_1"]').length,
    homeAbove: !!document.querySelector('#building-notices [data-notice="n_1"]'),
    cove: document.querySelectorAll('[data-unit="u_cove"] [data-notice]').length,
    coveOwn: !!document.querySelector('[data-unit="u_cove"] [data-notice="n_2"]'),
    others: document.querySelectorAll('[data-unit="u_harbour"] [data-notice], [data-unit="u_lighthouse"] [data-notice]').length,
  }))
  if (notices.home !== 1 || !notices.homeAbove) fail(`${label} whole-home notice shown ${notices.home} times (above the cards: ${notices.homeAbove})`)
  if (notices.cove !== 1 || !notices.coveOwn || notices.others !== 0) fail(`${label} unit notices: ${JSON.stringify(notices)}`)
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
  if (phone) await phoneLayout(page, `${label} settings`, 'Notices')
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
  // add a unit, close it → it moves under "Closed"; Put back → active again
  await page.locator('#unit-name').fill('SAMPLE Garden room')
  await page.locator('#unit-all-day').click()
  await page.locator('#unit-save').click()
  const garden = page.locator('#unit-list > [data-unit-row]').filter({ hasText: 'SAMPLE Garden room' })
  await garden.waitFor()
  await garden.locator('.unit-close').click()
  await garden.locator('.confirm-close').click()
  await page.locator('[data-section="units-closed"] summary').click()
  const closed = page.locator('[data-section="units-closed"] [data-unit-row]').filter({ hasText: 'SAMPLE Garden room' })
  await closed.waitFor()
  await page.locator('[data-unit-row="u_harbour"] .unit-edit').click()
  await shot('settings-units')
  await closed.locator('.unit-reopen').click()
  await page.locator('#unit-list > [data-unit-row]').filter({ hasText: 'SAMPLE Garden room' }).waitFor()
  await page.locator('#unit-cancel').click()

  await tab('Residents')
  await page.locator('[data-resident-row="r_bill"] .resident-remove').click()
  await page.locator('[data-resident-row="r_bill"] .confirm-remove-resident').click()
  await page.locator('[data-section="residents-removed"] summary').click()
  await page.locator('[data-section="residents-removed"] [data-resident-row="r_bill"]').waitFor()
  if (await page.locator('#resident-list > [data-resident-row="r_bill"]').count()) fail(`${label} removed resident still in the active list`)
  await page.locator('[data-section="residents-removed"]').scrollIntoViewIfNeeded()
  await shot('settings-residents')
  await page.locator('[data-section="residents-removed"] [data-resident-row="r_bill"] .resident-restore').click()
  await page.locator('#resident-list > [data-resident-row="r_bill"]').waitFor()

  await tab('Staff')
  await page.locator('[data-staff-row="s_amira"] .staff-toggle').click()
  await page.locator('[data-section="staff-off"] summary').click()
  await page.locator('[data-section="staff-off"] [data-staff-row="s_amira"]').waitFor()
  await page.locator('#staff-name').fill('Dave P. (SAMPLE)')
  await page.locator('#staff-pin').fill('2580')
  await page.locator('#staff-save').click()
  await page.locator('[data-error-for="pin"]').filter({ hasText: 'already has that PIN' }).waitFor()
  await shot('settings-staff')
  await page.locator('[data-section="staff-off"] [data-staff-row="s_amira"] .staff-toggle').click()
  await page.locator('#staff-list > [data-staff-row="s_amira"]').waitFor()

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
