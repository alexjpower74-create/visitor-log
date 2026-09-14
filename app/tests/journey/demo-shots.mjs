// Screenshots of the running demo for docs/shots/ (the screens pwshot cannot reach: behind a PIN keypad, or a visitor step).
// Lead-owned. Not a test. Run against `npm run demo`:
//   node tests/journey/demo-shots.mjs            (from app/; BASE defaults to http://127.0.0.1:8401)
// Real taps on the keypads and buttons, both engines, phone 390 and tablet 1024. It changes nothing a person would see in the
// demo: no visitor is signed in, no roll call is started, nothing is saved (a staff session row is the only thing written).
import { chromium, webkit } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://127.0.0.1:8401'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'shots')
const DEVICES = {
  390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  1024: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
}
const STAFF_TABS = ['In the building', 'Roll call', 'Day log', 'Contact list', 'Sign someone in']
const SETTINGS_TABS = ['Notices', 'Screening', 'Visits and privacy', 'Units and hours', 'Residents', 'Staff', 'Door sign']
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

mkdirSync(OUT, { recursive: true })
const written = []

async function snap(page, name) {
  await page.waitForTimeout(700)
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' })
  written.push(path.basename(file))
}

async function keypad(page, pin) {
  for (const d of pin) await page.locator(`button.key[data-key="${d}"]`).tap()
  await page.locator('#pin-enter').tap()
}

async function tabs(page, names, prefix) {
  for (const name of names) {
    await page.getByRole('tab', { name }).tap()
    await snap(page, `${prefix}-${slug(name)}`)
  }
}

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch()
  for (const width of [390, 1024]) {
    const tag = `${engineName}-${width}`

    // Staff (PIN 2580, Carl B.): every tab as the demo shows it.
    let context = await browser.newContext({ ...DEVICES[width], baseURL: BASE })
    let page = await context.newPage()
    await page.goto('/staff/')
    await snap(page, `staff-keypad-${tag}`)
    await keypad(page, '2580')
    await page.getByRole('tab', { name: 'In the building' }).waitFor()
    await tabs(page, STAFF_TABS, `staff-${tag}`)
    await context.close()

    // Settings (manager PIN 7314, Donna R.): every tab, nothing saved.
    context = await browser.newContext({ ...DEVICES[width], baseURL: BASE })
    page = await context.newPage()
    await page.goto('/settings/')
    await keypad(page, '7314')
    await page.getByRole('tab', { name: 'Notices' }).waitFor()
    await tabs(page, SETTINGS_TABS, `settings-${tag}`)
    await context.close()

    // A visitor up to Agnes's outbreak notice on Cove unit (the demo's notice), without signing in.
    if (width === 390) {
      context = await browser.newContext({ ...DEVICES[width], baseURL: BASE })
      page = await context.newPage()
      await page.goto('/')
      await page.locator('#name').tap()
      await page.keyboard.insertText('Pat R. (SAMPLE)')
      await page.locator('#phone').tap()
      await page.keyboard.insertText('709-555-0190')
      await page.locator('#continue').tap()
      await page.locator('#search').tap()
      await page.keyboard.insertText('ag')
      await snap(page, `visitor-search-${tag}`)
      await page.locator('button.resident[data-resident="r_agnes"]').tap()
      // Her details drawn (the name is filled in when the answer arrives). Inside Cove unit's hours this is the outbreak notice
      // with "I have read it"; after 7:00 PM it is the outside-hours refusal, which also shows the notice.
      await page.locator('#resident-name').filter({ hasText: /\S/ }).waitFor()
      await snap(page, `visitor-agnes-cove-outbreak-${tag}`)
      await context.close()
    }
  }
  await browser.close()
}

console.log(`wrote ${written.length} screenshots to docs/shots/:\n  ${written.join('\n  ')}`)
