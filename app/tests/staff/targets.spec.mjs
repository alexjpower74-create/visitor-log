// Tap targets, SAMPLE, sideways scroll, contrast, the sticky header, time labels and phone row layout on the staff pages, settings
// and the door sign, in every staff project (chromium + webkit × 390 + tablet). Sizes come from boxes; occlusion only from
// elementFromPoint (expectTapTarget / tap). Negative controls: negative-overlay, negative-header-see-through, negative-time-wraps,
// negative-stacked-buttons.
import { test, expect } from '@playwright/test'
import {
  fresh, tap, keypad, staffToken, managerToken, buildingViaApi, addNoticeViaApi, expectTapTarget, expectNoHorizontalScroll, contrastOf,
  assertNoThirdParty,
} from '../helpers.mjs'
import { staffSignsIn, managerOpensSettings, openTab, visitor, signInVisitors } from './staff-helpers.mjs'

// 64 px: keypad keys, Sign in, Sign out and roll call ticks (PLAN Design). Everything else on these pages: 44 px.
const BIG = 'button.key, #pin-enter, #pin-clear, button.sign-out-visit, button.confirm-sign-out, #manual-submit, button.found, #start-roll-call, #confirm-roll-call, #end-roll-call, #confirm-end-roll-call'

async function checkButtons(page, label) {
  const all = page.locator('button:visible, a.button:visible')
  const n = await all.count()
  expect(n, `${label}: buttons on screen`).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    const b = all.nth(i)
    const big = await b.evaluate((el, sel) => el.matches(sel), BIG)
    const name = ((await b.textContent()) || '').trim() || (await b.getAttribute('aria-label')) || `button ${i}`
    // Bring it to the middle of the screen (and of a sideways tab row) before measuring, the way a person would look for it.
    await b.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await expectTapTarget(page, b, big ? 64 : 44, `${label}: "${name}"`)
  }
  await expectNoHorizontalScroll(page)
}

const LIGHTHOUSE = [
  visitor('Paul O.', '709-555-0114', 'r_frank'), visitor('Grace B.', '709-555-0115', 'r_rose'), visitor('Sam K.', '709-555-0116', 'r_walter'),
  visitor('Wayne L.', '709-555-0121', 'r_margaret'), visitor('Peggy O.', '709-555-0122', 'r_frank'), visitor('Ruth B.', '709-555-0118', 'r_rose'),
]
const HARBOUR = [visitor('Linda P.', '709-555-0111', 'r_mary'), visitor('Tom K.', '709-555-0112', 'r_george'), visitor('Colin S.', '709-555-0119', 'r_mary')]

test('SAMPLE shows on /staff/, /settings/ and /settings/door-sign/', async ({ page, context, request }) => {
  await fresh(context, request)
  await page.goto('/staff/')
  await expect(page.locator('.app-header .sample-badge')).toHaveText('SAMPLE')
  await expect(page.locator('.app-header .sample-badge')).toBeVisible()
  await staffSignsIn(page)
  await expect(page.locator('.app-header .sample-badge')).toBeVisible()
  await page.goto('/settings/')
  await expect(page.locator('.app-header .sample-badge')).toBeVisible()
  await expect(page.locator('.app-header .sample-badge')).toHaveText('SAMPLE')
  await page.goto('/settings/door-sign/')
  await expect(page.locator('#door-home')).toHaveText('SAMPLE Harbourview Care Home (demo)')
  await expect(page.locator('#door-sample')).toBeVisible()
  await expect(page.locator('#door-sample')).toHaveText('SAMPLE')
  assertNoThirdParty(context)
})

test('staff pages: every button is big enough and hit-tests to itself, and nothing scrolls sideways', async ({ page, context, request }) => {
  test.setTimeout(120_000)
  await fresh(context, request)
  await signInVisitors(request, [...HARBOUR.slice(0, 2), ...LIGHTHOUSE.slice(0, 2)])
  await page.goto('/staff/')
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
  await checkButtons(page, 'staff keypad')
  await keypad(page, '7314', page.locator('#pin-enter'))
  await expect(page.locator('[data-visit]')).toHaveCount(4)
  await checkButtons(page, 'In the building')

  const row = page.locator('[data-visit]').first()
  await tap(page, row.locator('button.sign-out-visit'), 'Sign out')
  await expect(row.locator('button.confirm-sign-out')).toBeVisible()
  await checkButtons(page, 'In the building, confirmation open')
  await tap(page, row.locator('.confirm button.cancel'), 'Cancel')

  await openTab(page, 'Roll call')
  await expect(page.locator('#start-roll-call')).toBeVisible()
  await checkButtons(page, 'Roll call')
  await openTab(page, 'Day log')
  await expect(page.locator('[data-log-visit]')).toHaveCount(4)
  await checkButtons(page, 'Day log')
  await openTab(page, 'Contact list')
  await expect(page.locator('#contacts-show')).toBeVisible()
  await checkButtons(page, 'Contact list')
  await openTab(page, 'Sign someone in')
  await expect(page.locator('#manual-resident option[value="r_ellen"]')).toBeAttached()
  await checkButtons(page, 'Sign someone in')
  assertNoThirdParty(context)
})

test('settings and door sign: every button is big enough and hit-tests to itself, and nothing scrolls sideways', async ({ page, context, request }) => {
  test.setTimeout(150_000)
  await fresh(context, request)
  await addNoticeViaApi(request, await managerToken(request), { unit_id: 'u_cove', severity: 'outbreak', message: 'SAMPLE notice: Cove unit is on outbreak precautions.' })
  await page.goto('/settings/')
  await expect(page.getByRole('heading', { name: 'Manager sign in' })).toBeVisible()
  await checkButtons(page, 'settings keypad')
  await keypad(page, '7314', page.locator('#pin-enter'))
  await expect(page.locator('[data-notice-row]')).toHaveCount(1)
  await checkButtons(page, 'Notices')
  await openTab(page, 'Screening')
  await tap(page, page.locator('#use-example'), 'Use the example')
  await expect(page.locator('#question-list .question-remove')).toHaveCount(2)
  await checkButtons(page, 'Screening')
  for (const [name, ready] of [['Visits and privacy', '#visits-save'], ['Units and hours', '[data-unit-row]'], ['Residents', '[data-resident-row]'], ['Staff', '[data-staff-row]'], ['Door sign', '#door-sign-link']]) {
    await openTab(page, name)
    await expect(page.locator(ready).first()).toBeVisible()
    await checkButtons(page, name)
  }
  await page.goto('/settings/door-sign/')
  await expect(page.locator('#door-home')).toHaveText('SAMPLE Harbourview Care Home (demo)')
  await checkButtons(page, 'door sign')
  assertNoThirdParty(context)
})

test('roll call ticks are at least 64 px and hit-test to themselves, with every other roll call button', async ({ page, context, request }) => {
  await fresh(context, request)
  await signInVisitors(request, [HARBOUR[0], LIGHTHOUSE[0], LIGHTHOUSE[1]])
  await staffSignsIn(page)
  await openTab(page, 'Roll call')
  await tap(page, page.locator('#start-roll-call'), 'Start roll call')
  await tap(page, page.locator('#confirm-roll-call'), 'confirm start')
  await expect(page.locator('#roll-call-progress')).toHaveText('0 of 3 found')
  const ticks = page.locator('[data-roll] button.found')
  await expect(ticks).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    await ticks.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await expectTapTarget(page, ticks.nth(i), 64, `Found button ${i + 1}`)
  }
  await checkButtons(page, 'Roll call going')
  await tap(page, ticks.first(), 'Found')
  await expect(page.locator('#roll-call-progress')).toHaveText('1 of 3 found')
  await expectTapTarget(page, page.locator('[data-roll] button.found[aria-pressed="true"]'), 64, 'Found button after the tick')
  assertNoThirdParty(context)
})

test('the primary buttons have contrast of at least 4.5', async ({ page, context, request }) => {
  await fresh(context, request)
  await staffSignsIn(page)
  await openTab(page, 'Sign someone in')
  expect(await contrastOf(page.locator('#manual-submit')), 'Sign in (staff)').toBeGreaterThanOrEqual(4.5)
  await openTab(page, 'Contact list')
  expect(await contrastOf(page.locator('#contacts-show')), 'Show').toBeGreaterThanOrEqual(4.5)
  await managerOpensSettings(page)
  expect(await contrastOf(page.locator('#notice-add')), 'Add notice').toBeGreaterThanOrEqual(4.5)
  assertNoThirdParty(context)
})

test('the sticky header is opaque and a Sign out scrolled under it can still be tapped', async ({ page, context, request, browserName }) => {
  await fresh(context, request)
  await signInVisitors(request, [...HARBOUR, ...LIGHTHOUSE])
  await staffSignsIn(page)
  await expect(page.locator('[data-visit]')).toHaveCount(HARBOUR.length + LIGHTHOUSE.length)
  const header = page.locator('[data-sticky-header]')
  const button = page.locator('[data-unit="u_harbour"] [data-visit]').first().locator('button.sign-out-visit')
  const hb = await header.boundingBox()
  const bb = await button.boundingBox()
  const midY = hb.y + hb.height / 2
  const bx = bb.x + bb.width / 2
  const underHeader = async () => {
    const b = await button.boundingBox()
    const c = b.y + b.height / 2
    return c > hb.y + 2 && c < hb.y + hb.height - 2
  }
  if (browserName === 'webkit') {
    // Playwright's mobile WebKit has no wheel ("Mouse wheel is not supported in mobile WebKit"), no touch drag, and arrow keys do
    // not scroll it (tried: the button never moved). So in WebKit only, the page is scrolled from script; what this test checks
    // (the header stays on top and opaque, and tap() still reaches the button) does not depend on how the page got there.
    test.info().annotations.push({ type: 'scroll', description: 'mobile WebKit: window.scrollBy, no real scroll input available' })
    await page.evaluate((dy) => window.scrollBy(0, dy), bb.y + bb.height / 2 - midY)
  } else {
    // Real wheel input: scroll the page until the button's middle sits at the header's middle.
    const vp = page.viewportSize()
    await page.mouse.move(vp.width / 2, vp.height * 0.75)
    await page.mouse.wheel(0, bb.y + bb.height / 2 - midY)
  }
  await expect.poll(underHeader, { message: 'the Sign out button scrolled under the header' }).toBe(true)

  const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-sticky-header]'), [bx, midY])
  expect(onTop, 'where the row passed under it, the header is on top').toBe(true)
  const alpha = await header.evaluate((el) => {
    const parts = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number)
    return parts.length === 4 ? parts[3] : parts.length === 3 ? 1 : 0
  })
  expect(alpha, 'the sticky header is opaque (background alpha 1), so nothing reads through it').toBe(1)

  await tap(page, button, 'Sign out under the header')
  await expect(page.locator('[data-unit="u_harbour"] [data-visit]').first().locator('button.confirm-sign-out')).toBeVisible()
  assertNoThirdParty(context)
})

test('hours labels keep each time on one line', async ({ page, context, request }) => {
  await fresh(context, request)
  await staffSignsIn(page)
  const b = await buildingViaApi(request, await staffToken(request))
  for (const u of b.units) await expect(page.locator(`[data-unit="${u.id}"] .unit-hours`)).toHaveText(u.hours_label)
  const times = page.locator('[data-unit] .unit-hours .time')
  expect(await times.count(), 'Harbour and Cove labels hold times').toBeGreaterThanOrEqual(6)
  const broken = await times.evaluateAll((els) => els.filter((e) => e.getClientRects().length !== 1).map((e) => e.textContent))
  expect(broken, 'a time label broke across lines on In the building').toEqual([])

  await managerOpensSettings(page)
  await openTab(page, 'Units and hours')
  const rowTimes = page.locator('[data-unit-row] .unit-hours-label .time')
  expect(await rowTimes.count()).toBeGreaterThanOrEqual(6)
  const brokenRows = await rowTimes.evaluateAll((els) => els.filter((e) => e.getClientRects().length !== 1).map((e) => e.textContent))
  expect(brokenRows, 'a time label broke across lines on Units and hours').toEqual([])
  assertNoThirdParty(context)
})

test('resident rows put Change and Remove side by side', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Residents')
  const rows = page.locator('#resident-list > [data-resident-row]')
  await expect(rows).toHaveCount(9)
  const gaps = await rows.evaluateAll((rs) => rs.map((r) => {
    const a = r.querySelector('.resident-edit').getBoundingClientRect()
    const b = r.querySelector('.resident-remove').getBoundingClientRect()
    return Math.abs(a.top - b.top)
  }))
  expect(Math.max(...gaps), 'Change and Remove sit side by side').toBeLessThan(2)
  const first = rows.first()
  await expectTapTarget(page, first.locator('.resident-edit'), 44, 'Change')
  await expectTapTarget(page, first.locator('.resident-remove'), 44, 'Remove')
  assertNoThirdParty(context)
})

test('the staff name shows whole, "(SAMPLE)" included, and the header stays at most 96 px', async ({ page, context, request }) => {
  await fresh(context, request)
  await staffSignsIn(page, '7314')
  for (const where of ['staff', 'settings']) {
    if (where === 'settings') {
      await page.goto('/settings/')
      await expect(page.getByRole('tab', { name: 'Notices', exact: true })).toBeVisible()
    }
    const who = page.locator('#who-name')
    await expect(who).toHaveText('Donna R. (SAMPLE)')
    const m = await who.evaluate((el) => {
      const header = document.querySelector('[data-sticky-header]')
      return { cut: el.scrollWidth > el.clientWidth + 1, right: el.getBoundingClientRect().right, vw: document.documentElement.clientWidth,
        height: header.getBoundingClientRect().height, bg: getComputedStyle(header).backgroundColor }
    })
    expect(m.cut, `${where}: the staff name is not cut`).toBe(false)
    expect(m.right, `${where}: the staff name ends on screen`).toBeLessThanOrEqual(m.vw)
    expect(m.height, `${where}: the header is at most 96 px`).toBeLessThanOrEqual(96)
    expect(m.bg, `${where}: the header is still opaque`).toBe('rgb(11, 16, 32)')
    await expect(page.locator('.app-header .sample-badge')).toBeVisible()
    for (const b of await page.locator('.who-line button:visible, .who-line a.button:visible').all()) await expectTapTarget(page, b, 44, `${where} header button`)
    await expectNoHorizontalScroll(page)
  }
  assertNoThirdParty(context)
})
