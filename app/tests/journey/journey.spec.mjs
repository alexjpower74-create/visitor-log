// The whole day at SAMPLE Harbourview Care Home, across both slices. Lead-owned.
// Runs in the tablet projects (chromium + webkit): the default context is the nurse's-desk tablet; visitors get their own phone
// contexts and the manager their own tablet context. Real input only; the API is read to check, and used to set up nothing
// that the page is meant to do.
//   E2E_PORT=8408 npx playwright test tests/journey
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  NOW, at, HOME, MANAGER_PIN, STAFF_PIN, EXAMPLE_SCREENING,
  fresh, newContext, setNow, tap, type, keypad, api, bearer, staffToken, assertNoThirdParty, shot,
} from '../helpers.mjs'

const T = {
  in: NOW, // Mon Sep 14 3:00 PM NDT
  out: at('2026-09-14T15:40:00-02:30'),
  evening: at('2026-09-14T21:05:00-02:30'),
  nextDay: at('2026-09-15T00:00:00-02:30'),
  pastRetention: at('2026-10-15T09:00:00-02:30'), // Sep 14 is 31 days old: past the default 30
}
const OUTBREAK = 'SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask before you go in.'

/** A visitor on their own phone: name, phone, pick the resident. Leaves the page on the step after picking. */
async function visitorPicks(page, { name, phone, search, residentId }) {
  await page.goto('/')
  await expect(page.getByText('Sign in to visit')).toBeVisible()
  await type(page, page.locator('#name'), name)
  await type(page, page.locator('#phone'), phone)
  await tap(page, page.locator('#continue'), 'Continue')
  await expect(page.getByText('Who are you visiting?')).toBeVisible()
  await type(page, page.locator('#search'), search)
  await tap(page, page.locator(`button.resident[data-resident="${residentId}"]`), residentId)
}

async function staffSignsIn(page, pin) {
  await page.goto('/staff/')
  await expect(page.getByText('Staff sign in')).toBeVisible()
  await keypad(page, pin, page.locator('#pin-enter'))
  await expect(page.getByRole('tab', { name: 'In the building' })).toBeVisible()
}

const totalIs = (page, n) => expect(page.locator('#building-total')).toContainText(String(n), { timeout: 12_000 })

test('a whole day: sign in, roll call, sign out, an outbreak notice on one unit, screening, contacts, closing, retention', async ({ page, context, request, browser }, testInfo) => {
  test.setTimeout(300_000)
  await fresh(context, request)
  const desk = page
  const phones = []
  const phone = async (now = T.in) => { const c = await newContext(browser, 'phone', { now }); phones.push(c); return [c, await c.newPage()] }

  // 1. Linda scans the door QR and signs in to see Mary on Harbour wing.
  const [lindaCtx, linda] = await phone()
  await visitorPicks(linda, { name: 'Linda K. (SAMPLE)', phone: '709-555-0111', search: 'ma', residentId: 'r_mary' })
  await tap(linda, linda.locator('#sign-in'), 'Sign in')
  await expect(linda.locator('#signed-in')).toBeVisible()
  await expect(linda.locator('#in-time')).toHaveText('3:00 PM')
  await expect(linda).toHaveURL(/\/out\/\?t=/)
  await shot(linda, testInfo, 'journey', '01-linda-signed-in')

  // 2. The nurse's desk sees her on Harbour wing.
  await staffSignsIn(desk, STAFF_PIN)
  await totalIs(desk, 1)
  await expect(desk.locator('[data-unit="u_harbour"] [data-visit]')).toContainText('Linda K. (SAMPLE)')
  await shot(desk, testInfo, 'journey', '02-desk-in-the-building')

  // 3. A fire drill: start a roll call, find Linda, end it.
  await tap(desk, desk.getByRole('tab', { name: 'Roll call' }), 'Roll call tab')
  await tap(desk, desk.locator('#start-roll-call'), 'Start roll call')
  await tap(desk, desk.locator('#confirm-roll-call'), 'confirm start')
  await expect(desk.locator('#roll-call-progress')).toContainText('0 of 1 found')
  await tap(desk, desk.locator('[data-roll] button.found').first(), 'Found')
  await expect(desk.locator('#roll-call-progress')).toContainText('1 of 1 found')
  await tap(desk, desk.locator('#end-roll-call'), 'End roll call')
  await tap(desk, desk.locator('#confirm-end-roll-call'), 'confirm end')
  await expect(desk.locator('#roll-call-progress')).toContainText('1 of 1 found')

  // 4. Linda signs out on her phone on the way out; the desk count drops.
  await setNow(lindaCtx, T.out)
  await tap(linda, linda.locator('#sign-out'), 'Sign out')
  await expect(linda.locator('#signed-out')).toContainText('Signed out at 3:40 PM.')
  await setNow(context, T.out)
  await tap(desk, desk.getByRole('tab', { name: 'In the building' }), 'In the building tab')
  await totalIs(desk, 0)

  // 5. The manager puts up an outbreak notice for Cove unit, in the home's own words.
  const mgrCtx = await newContext(browser, 'tablet', { now: T.out })
  const mgr = await mgrCtx.newPage()
  await mgr.goto('/settings/')
  await keypad(mgr, MANAGER_PIN, mgr.locator('#pin-enter'))
  await tap(mgr, mgr.getByRole('tab', { name: 'Notices' }), 'Notices tab')
  await mgr.locator('#notice-unit').selectOption('u_cove')
  await mgr.locator('#notice-severity').selectOption('outbreak')
  await type(mgr, mgr.locator('#notice-message'), OUTBREAK)
  await tap(mgr, mgr.locator('#notice-add'), 'Add notice')
  await expect(mgr.locator('[data-notice-row]')).toHaveCount(1)

  // 6. Paul visits Agnes on Cove unit: he sees the notice and must confirm it.
  const [, paul] = await phone(T.out)
  await visitorPicks(paul, { name: 'Paul D. (SAMPLE)', phone: '709-555-0122', search: 'ag', residentId: 'r_agnes' })
  const notice = paul.locator('#unit-notices [data-severity="outbreak"]')
  await expect(notice).toContainText(OUTBREAK)
  await expect(paul.locator('#sign-in')).toBeDisabled()
  await tap(paul, paul.locator('#confirm-notice'), 'I have read it')
  await tap(paul, paul.locator('#sign-in'), 'Sign in')
  await expect(paul.locator('#signed-in')).toBeVisible()
  const paulOutUrl = paul.url()

  // 7. Grace visits Frank on Lighthouse wing: no outbreak notice anywhere.
  const [, grace] = await phone(T.out)
  await visitorPicks(grace, { name: 'Grace F. (SAMPLE)', phone: '709-555-0133', search: 'fr', residentId: 'r_frank' })
  // Positive first: Frank's details have arrived and been drawn (the page fills the name and enables Sign in in the same step that
  // draws his unit's notices). Without this the "no outbreak" count below passes on a page that has not loaded yet.
  await expect(grace.locator('#resident-name')).toHaveText('Frank O. (SAMPLE)')
  await expect(grace.locator('#sign-in')).toBeEnabled()
  await expect(grace.getByText(OUTBREAK)).toHaveCount(0)
  await tap(grace, grace.locator('#sign-in'), 'Sign in')
  await expect(grace.locator('#signed-in')).toBeVisible()

  // 8. The manager turns screening on, starting from the example and changing a question to the home's own words.
  await tap(mgr, mgr.getByRole('tab', { name: 'Screening' }), 'Screening tab')
  await tap(mgr, mgr.locator('#use-example'), 'Use the example')
  await expect(mgr.locator('#example-label')).toHaveText(EXAMPLE_SCREENING.label)
  await type(mgr, mgr.locator('input.question-text').first(), 'Do you feel sick today?', { clear: true })
  await tap(mgr, mgr.locator('#screening-enabled'), 'screening switch')
  await tap(mgr, mgr.locator('#screening-save'), 'Save')
  const mToken = await staffToken(request, MANAGER_PIN, { now: T.out })
  await expect.poll(async () => (await api(request, 'GET', '/api/settings', undefined, bearer(mToken), { now: T.out })).body.settings.home.screening_enabled).toBe(true)

  // 9. Tom answers Yes to a question: he is stopped with the home's words and nothing is recorded.
  const [, tom] = await phone(T.out)
  const posts = []
  tom.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/visitor/signin')) posts.push(r.url()) })
  await visitorPicks(tom, { name: 'Tom B. (SAMPLE)', phone: '709-555-0144', search: 'ge', residentId: 'r_george' })
  const questions = tom.locator('#screening .question')
  await expect(questions).toHaveCount(2)
  await tap(tom, questions.nth(0).locator('button.answer[data-answer="no"]'), 'No')
  await tap(tom, questions.nth(1).locator('button.answer[data-answer="yes"]'), 'Yes')
  await expect(tom.locator('#stop')).toHaveText(new RegExp(EXAMPLE_SCREENING.stop_message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await expect(tom.locator('#sign-in')).toBeHidden()
  expect(posts, 'a Yes must not send a sign-in').toEqual([])
  const staff = await staffToken(request, STAFF_PIN, { now: T.out })
  expect((await api(request, 'GET', '/api/staff/building', undefined, bearer(staff), { now: T.out })).body.total).toBe(2)

  // 10. The contact list for today: the desk downloads the CSV, and it is exactly what the API gives.
  await tap(desk, desk.getByRole('tab', { name: 'Contact list' }), 'Contact list tab')
  await tap(desk, desk.locator('#contacts-show'), 'Show')
  await expect(desk.locator('#contacts-count')).toContainText('3')
  const [download] = await Promise.all([desk.waitForEvent('download'), tap(desk, desk.locator('#download-contacts'), 'Download CSV')])
  const csv = readFileSync(await download.path(), 'utf8')
  const apiCsv = await api(request, 'GET', '/api/staff/contacts.csv?from=2026-09-14&to=2026-09-14&unit=all', undefined, bearer(staff), { now: T.out })
  expect(csv).toBe(apiCsv.body)
  expect(csv).toContain('Linda K. (SAMPLE)')
  expect(csv).toContain('Paul D. (SAMPLE)')
  expect(csv).toContain('Grace F. (SAMPLE)')
  expect(csv).not.toContain('Tom B.')

  // 11. Evening: Cove unit closed at 7:00 PM, so Paul was signed out automatically and the desk is told it is not confirmed.
  await setNow(context, T.evening)
  await tap(desk, desk.getByRole('tab', { name: 'In the building' }), 'In the building tab')
  await totalIs(desk, 1) // Grace, Lighthouse wing is open all day
  await expect(desk.locator('#auto-today')).toContainText('Signed out automatically at closing today (not confirmed)')
  await expect(desk.locator('#auto-today')).toContainText('Paul D. (SAMPLE)')
  await expect(desk.locator('#auto-today')).toContainText('7:00 PM')
  await shot(desk, testInfo, 'journey', '03-desk-evening-auto')

  // 12. The next day Paul's sign-out link is dead, and nobody from yesterday is in the building.
  const [, paulNextDay] = await phone(T.nextDay)
  await paulNextDay.goto(paulOutUrl)
  await expect(paulNextDay.locator('#link-error')).toHaveText(/This sign-out link has expired\. It only works on the day of your visit\./)
  await expect(paulNextDay.getByText('Agnes')).toHaveCount(0)
  await setNow(context, T.nextDay)
  await totalIs(desk, 0)

  // 13. The next day the Sep 14 day log still lists the day's three visits (Tom was never recorded)...
  await tap(desk, desk.getByRole('tab', { name: 'Day log' }), 'Day log tab')
  await desk.locator('#log-date').fill('2026-09-14')
  await expect(desk.locator('[data-log-visit]')).toHaveCount(3, { timeout: 12_000 })
  // ...and 31 days later they are gone. Reload Sep 14 under the new clock (Previous, then Next): the rows must fall from 3 to 0,
  // so a screen that never reloaded cannot pass.
  await setNow(context, T.pastRetention)
  await tap(desk, desk.locator('#log-prev'), 'Previous day')
  await expect(desk.locator('#log-date')).toHaveValue('2026-09-13')
  await tap(desk, desk.locator('#log-next'), 'Next day')
  await expect(desk.locator('#log-date')).toHaveValue('2026-09-14')
  await expect(desk.locator('[data-log-visit]')).toHaveCount(0, { timeout: 12_000 })
  const later = await staffToken(request, STAFF_PIN, { now: T.pastRetention })
  const contacts = await api(request, 'GET', '/api/staff/contacts?from=2026-09-14&to=2026-09-14&unit=all', undefined, bearer(later), { now: T.pastRetention })
  expect(contacts.body.count).toBe(0)
  await expect(desk.getByText(HOME)).toBeVisible()

  assertNoThirdParty(context)
  for (const c of [...phones, mgrCtx]) assertNoThirdParty(c)
  await Promise.all([...phones, mgrCtx].map((c) => c.close()))
})
