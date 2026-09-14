// The visitor's phone pages (vl1) at 390 in chromium and webkit, by real taps and typing, against the real Worker.
//   E2E_PORT=8404 npx playwright test tests/visit
// Every test starts with fresh() and ends with assertNoThirdParty(). The API sets up what the page is not testing and reads back
// what the page did; the thing under test is always driven through the page.
import { test, expect } from '@playwright/test'
import {
  at, EXAMPLE_SCREENING, HOME, SEV_RGB, fresh, newContext, setNow, tap, type, api, bearer, staffToken, managerToken,
  visitorSignInViaApi, buildingViaApi, addNoticeViaApi, setScreeningViaApi, sevColour, shot, assertNoThirdParty,
} from '../helpers.mjs'
import { TITLES } from './titles.mjs'

const T = (hhmm, date = '2026-09-14') => at(`${date}T${hhmm}:00-02:30`)
const OUTBREAK = 'SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask and clean your hands before you go in.'
const INFO = 'SAMPLE notice: the side door is closed for painting this week. Please use the main entrance.'
const RESTRICTED = 'SAMPLE notice: Harbour wing is closed to visitors today.'
const DESK = "Please see the nurse's desk."
const LINK_EXPIRED = 'This sign-out link has expired. It only works on the day of your visit.'


async function details(page, { name = 'Linda K. (SAMPLE)', phone = '709-555-0111' } = {}) {
  await page.goto('/')
  await expect(page.getByText('Sign in to visit')).toBeVisible()
  await type(page, page.locator('#name'), name)
  await type(page, page.locator('#phone'), phone)
  await tap(page, page.locator('#continue'), 'Continue')
  await expect(page.getByText('Who are you visiting?')).toBeVisible()
}

async function pick(page, search, id, name) {
  await type(page, page.locator('#search'), search, { clear: true })
  await tap(page, page.locator(`button.resident[data-resident="${id}"]`), name)
  await expect(page.locator('#resident-name')).toHaveText(name)
}

test(TITLES.first, async ({ page, context, request }, testInfo) => {
  await fresh(context, request)
  await page.goto('/')
  await expect(page.getByText('Sign in to visit')).toBeVisible()
  await expect(page.locator('#step-details')).toContainText('The home keeps your name and phone number for 30 days.')
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy/')
  await expect(page.locator('#not-you')).toBeHidden()
  await shot(page, testInfo, 'visit', '01-details')
  await type(page, page.locator('#name'), 'Linda K. (SAMPLE)')
  await type(page, page.locator('#phone'), '709-555-0111')
  await tap(page, page.locator('#continue'), 'Continue')
  await expect(page.getByText('Who are you visiting?')).toBeVisible()

  await type(page, page.locator('#search'), 'm')
  await expect(page.locator('#search-hint')).toHaveText('Type at least 2 letters of their first name, or their room number.')
  await type(page, page.locator('#search'), 'a')
  const results = page.locator('button.resident')
  await expect(results).toHaveCount(2)
  await expect(results.nth(0)).toContainText('Margaret L. (SAMPLE)')
  await expect(results.nth(1)).toContainText('Mary S. (SAMPLE)')
  await expect(results.nth(1)).toContainText('Room 101 · Harbour wing')
  await shot(page, testInfo, 'visit', '02-search')
  await tap(page, page.locator('button.resident[data-resident="r_mary"]'), 'Mary')
  await expect(page.locator('#resident-name')).toHaveText('Mary S. (SAMPLE)')
  await expect(page.locator('#sign-in')).toBeEnabled()
  await shot(page, testInfo, 'visit', '03-resident')

  await tap(page, page.locator('#sign-in'), 'Sign in')
  await expect(page.locator('#signed-in')).toBeVisible()
  await expect(page.locator('#in-time')).toHaveText('3:00 PM')
  await expect(page).toHaveURL(/\/out\/\?t=[A-Za-z0-9_-]{43}$/)
  await expect(page.locator('#signed-in')).toContainText('Visiting Mary S. (SAMPLE), Room 101, Harbour wing')
  await expect(page.locator('#signed-in')).toContainText('Keep this page. This sign-out link works until midnight tonight.')
  await shot(page, testInfo, 'visit', '04-signed-in')
  const staff = await staffToken(request)
  const harbour = (await buildingViaApi(request, staff)).units.find((u) => u.id === 'u_harbour')
  expect(harbour.visits.map((v) => [v.visitor_name, v.visitor_phone, v.in_label])).toEqual([['Linda K. (SAMPLE)', '709-555-0111', '3:00 PM']])

  await page.goto('/')
  await expect(page.locator('#signed-in')).toBeVisible()
  await expect(page).toHaveURL(/\/out\/\?t=[A-Za-z0-9_-]{43}$/)

  await setNow(context, T('15:40'))
  await tap(page, page.locator('#sign-out'), 'Sign out')
  await expect(page.locator('#signed-out')).toContainText('Signed out at 3:40 PM.')
  await expect(page.locator('#out-time')).toHaveText('3:40 PM')
  await expect(page.locator('#signed-out')).toContainText('Thank you for visiting.')
  await shot(page, testInfo, 'visit', '05-signed-out')
  expect((await buildingViaApi(request, staff, { now: T('15:40') })).total).toBe(0)
  const log = await api(request, 'GET', '/api/staff/visits?date=2026-09-14', undefined, bearer(staff), { now: T('15:40') })
  expect(log.body.visits.map((v) => [v.visitor_name, v.out_kind, v.out_label])).toEqual([['Linda K. (SAMPLE)', 'visitor', '3:40 PM']])

  await page.goto('/')
  await expect(page.getByText('Sign in to visit')).toBeVisible()
  await expect(page.locator('#name')).toHaveValue('Linda K. (SAMPLE)')
  await expect(page.locator('#phone')).toHaveValue('709-555-0111')
  await tap(page, page.locator('#not-you'), 'Not you?')
  await expect(page.locator('#name')).toHaveValue('')
  await expect(page.locator('#phone')).toHaveValue('')
  await page.reload()
  await expect(page.getByText('Sign in to visit')).toBeVisible()
  await expect(page.locator('#name')).toHaveValue('')
  await expect(page.locator('#phone')).toHaveValue('')
  await expect(page.locator('#not-you')).toBeHidden()
  assertNoThirdParty(context)
})

test(TITLES.notice, async ({ page, context, request }, testInfo) => {
  await fresh(context, request)
  const manager = await managerToken(request)
  await addNoticeViaApi(request, manager, { unit_id: 'u_cove', severity: 'outbreak', message: OUTBREAK })
  await addNoticeViaApi(request, manager, { unit_id: null, severity: 'info', message: INFO })

  await details(page)
  await expect(page.locator('#home-notices [data-severity="info"]')).toHaveCount(1)
  await expect(page.locator('#home-notices')).toContainText(INFO)
  await expect(page.getByText(OUTBREAK)).toHaveCount(0)

  await pick(page, 'ag', 'r_agnes', 'Agnes D. (SAMPLE)')
  const notice = page.locator('#unit-notices [data-severity="outbreak"]')
  await expect(notice).toContainText(OUTBREAK)
  await expect(notice).toContainText('Outbreak · Cove unit')
  expect(await sevColour(notice)).toBe(SEV_RGB.outbreak)
  await expect(page.locator('#sign-in')).toBeDisabled()
  await shot(page, testInfo, 'visit', '06-notice')
  await tap(page, page.locator('#confirm-notice'), 'I have read it')
  await expect(page.locator('#confirm-notice')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#sign-in')).toBeEnabled()

  // Back, and pick Frank on Lighthouse wing in the same page: nothing of Cove's notice may be left behind.
  await tap(page, page.locator('#back'), 'Back')
  await expect(page.getByText('Who are you visiting?')).toBeVisible()
  await pick(page, 'fr', 'r_frank', 'Frank O. (SAMPLE)')
  await expect(page.locator('[data-severity="outbreak"]')).toHaveCount(0)
  await expect(page.getByText(OUTBREAK)).toHaveCount(0)
  await expect(page.locator('#confirm-notice')).toBeHidden()
  await expect(page.locator('#sign-in')).toBeEnabled()
  await expect(page.locator('#home-notices')).toContainText(INFO)

  await tap(page, page.locator('#sign-in'), 'Sign in')
  await expect(page.locator('#signed-in')).toContainText(INFO)
  await expect(page.getByText(OUTBREAK)).toHaveCount(0)
  assertNoThirdParty(context)
})

test(TITLES.screening, async ({ page, context, request }, testInfo) => {
  await fresh(context, request)
  const manager = await managerToken(request)
  await setScreeningViaApi(request, manager, { enabled: true, stop_message: EXAMPLE_SCREENING.stop_message, questions: EXAMPLE_SCREENING.questions })
  const staff = await staffToken(request)
  const posts = []
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/visitor/signin')) posts.push(r.url()) })

  await details(page)
  await pick(page, 'ge', 'r_george', 'George P. (SAMPLE)')
  const questions = page.locator('#screening .question')
  await expect(questions).toHaveCount(2)
  await expect(questions.nth(0)).toContainText(EXAMPLE_SCREENING.questions[0])
  await expect(page.locator('#sign-in')).toBeDisabled()
  await tap(page, questions.nth(0).locator('button.answer[data-answer="no"]'), 'No')
  await expect(questions.nth(0).locator('button.answer[data-answer="no"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#sign-in')).toBeDisabled()
  await tap(page, questions.nth(1).locator('button.answer[data-answer="yes"]'), 'Yes')
  await expect(page.locator('#stop')).toBeVisible()
  await expect(page.locator('#stop-message')).toHaveText(EXAMPLE_SCREENING.stop_message)
  await expect(page.locator('#sign-in')).toBeHidden()
  await shot(page, testInfo, 'visit', '07-stop')
  await page.waitForTimeout(600) // time for a wrong page to send something
  expect(posts, 'a Yes must not send a sign-in').toEqual([])
  expect((await buildingViaApi(request, staff)).total).toBe(0)

  await tap(page, page.locator('#stop-back'), 'I tapped Yes by mistake')
  await expect(page.locator('#stop')).toBeHidden()
  await expect(page.locator('#screening button.answer[aria-pressed="true"]')).toHaveCount(0)
  await expect(page.locator('#sign-in')).toBeDisabled()
  await tap(page, questions.nth(0).locator('button.answer[data-answer="no"]'), 'No')
  await tap(page, questions.nth(1).locator('button.answer[data-answer="no"]'), 'No')
  await expect(page.locator('#sign-in')).toBeEnabled()
  await tap(page, page.locator('#sign-in'), 'Sign in')
  await expect(page.locator('#signed-in')).toBeVisible()
  expect(posts).toHaveLength(1)
  const building = await buildingViaApi(request, staff)
  expect(building.units.find((u) => u.id === 'u_harbour').visits.map((v) => [v.visitor_name, v.screened])).toEqual([['Linda K. (SAMPLE)', true]])
  assertNoThirdParty(context)
})

test(TITLES.yesThenNo, async ({ page, context, request }, testInfo) => {
  await fresh(context, request)
  const manager = await managerToken(request)
  await setScreeningViaApi(request, manager, { enabled: true, stop_message: EXAMPLE_SCREENING.stop_message, questions: EXAMPLE_SCREENING.questions })
  const staff = await staffToken(request)
  const posts = []
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/visitor/signin')) posts.push(r.url()) })

  await details(page, { name: 'Grace F. (SAMPLE)', phone: '709-555-0133' })
  await pick(page, 'fr', 'r_frank', 'Frank O. (SAMPLE)')
  const questions = page.locator('#screening .question')
  await expect(questions).toHaveCount(2)
  const answer = (i, value) => questions.nth(i).locator(`button.answer[data-answer="${value}"]`)

  await tap(page, answer(0, 'no'), 'No')
  await tap(page, answer(1, 'yes'), 'Yes')
  await expect(page.locator('#stop')).toBeVisible()
  await expect(page.locator('#sign-in')).toBeHidden()

  // The visitor changes their mind on the same question.
  await tap(page, answer(1, 'no'), 'No, on the same question')
  await expect(answer(1, 'no')).toHaveAttribute('aria-pressed', 'true')
  await expect(answer(1, 'yes')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#stop')).toBeHidden()
  await expect(page.locator('#sign-in')).toBeVisible()
  await expect(page.locator('#sign-in')).toBeEnabled()
  await shot(page, testInfo, 'visit', '15-yes-then-no')

  // While any answer is still "Yes", the stop message stays: two Yes, then one changed back to No.
  await tap(page, answer(0, 'yes'), 'Yes on the first question')
  await tap(page, answer(1, 'yes'), 'Yes on the second question')
  await tap(page, answer(1, 'no'), 'No on the second question')
  await expect(page.locator('#stop')).toBeVisible()
  await expect(page.locator('#sign-in')).toBeHidden()
  await tap(page, answer(0, 'no'), 'No on the first question')
  await expect(page.locator('#stop')).toBeHidden()
  await expect(page.locator('#sign-in')).toBeEnabled()

  await page.waitForTimeout(600) // time for a wrong page to send something
  expect(posts, 'nothing is sent before Sign in').toEqual([])
  expect((await buildingViaApi(request, staff)).total).toBe(0)
  await tap(page, page.locator('#sign-in'), 'Sign in')
  await expect(page.locator('#signed-in')).toBeVisible()
  expect(posts).toHaveLength(1)
  const lighthouse = (await buildingViaApi(request, staff)).units.find((u) => u.id === 'u_lighthouse')
  expect(lighthouse.visits.map((v) => [v.visitor_name, v.screened])).toEqual([['Grace F. (SAMPLE)', true]])
  assertNoThirdParty(context)
})

test(TITLES.blocked, async ({ page, context, request }, testInfo) => {
  await fresh(context, request)
  await details(page)
  await pick(page, 'el', 'r_ellen', 'Ellen W. (SAMPLE)')
  await expect(page.locator('#blocked')).toBeVisible()
  await expect(page.locator('#blocked')).toContainText(`Visits with Ellen W. (SAMPLE) are by arrangement only. ${DESK}`)
  await expect(page.locator('#sign-in')).toBeHidden()
  await shot(page, testInfo, 'visit', '08-blocked-arrangement')
  await tap(page, page.locator('#pick-else'), 'Pick someone else')
  await expect(page.getByText('Who are you visiting?')).toBeVisible()

  const manager = await managerToken(request)
  await addNoticeViaApi(request, manager, { unit_id: 'u_harbour', severity: 'restricted', message: RESTRICTED })
  await pick(page, 'ma', 'r_mary', 'Mary S. (SAMPLE)')
  await expect(page.locator('#blocked')).toContainText(`Harbour wing: visitors can't sign themselves in right now. ${DESK}`)
  await expect(page.locator('#blocked [data-severity="restricted"]')).toContainText(RESTRICTED)
  await expect(page.locator('#blocked')).not.toContainText('by arrangement')
  await expect(page.locator('#sign-in')).toBeHidden()
  await shot(page, testInfo, 'visit', '09-blocked-restricted')
  assertNoThirdParty(context)
})

test(TITLES.hours, async ({ page, context, request }, testInfo) => {
  await fresh(context, request, { now: T('12:00') })
  await details(page)
  await pick(page, 'ma', 'r_mary', 'Mary S. (SAMPLE)')
  await expect(page.locator('#blocked')).toContainText(
    'Visiting hours are over for now. If you need to see someone, please call the unit. Visiting hours on Harbour wing: 8:00 AM to 11:30 AM and 1:30 PM to 9:00 PM.')
  await expect(page.locator('#sign-in')).toBeHidden()
  await shot(page, testInfo, 'visit', '10-blocked-hours')
  assertNoThirdParty(context)
})

test(TITLES.link, async ({ page, context, request, browser }, testInfo) => {
  await fresh(context, request)
  const frank = await visitorSignInViaApi(request, { name: 'Paul D. (SAMPLE)', phone: '709-555-0122', resident_id: 'r_frank' })
  const rose = await visitorSignInViaApi(request, { name: 'Sheila M. (SAMPLE)', phone: '709-555-0123', resident_id: 'r_rose' })
  const george = await visitorSignInViaApi(request, { name: 'Wayne R. (SAMPLE)', phone: '709-555-0124', resident_id: 'r_george' })

  const other = await newContext(browser, 'phone')
  const phone2 = await other.newPage()
  await phone2.goto(frank.out_url)
  await expect(phone2.locator('#signed-in')).toBeVisible()
  await expect(phone2.locator('#in-time')).toHaveText('3:00 PM')
  await expect(phone2.locator('#signed-in')).toContainText('Visiting Frank O. (SAMPLE), Room 201, Lighthouse wing')
  await expect(phone2.locator('.sample-badge')).toBeVisible()
  await setNow(other, T('15:10'))
  await tap(phone2, phone2.locator('#sign-out'), 'Sign out')
  await expect(phone2.locator('#signed-out')).toContainText('Signed out at 3:10 PM.')

  const staff = await staffToken(request)
  const sheila = (await buildingViaApi(request, staff)).units.flatMap((u) => u.visits).find((v) => v.visitor_name === 'Sheila M. (SAMPLE)')
  expect((await api(request, 'POST', `/api/staff/visits/${sheila.id}/signout`, {}, bearer(staff), { now: T('15:20') })).status).toBe(200)
  await setNow(context, T('15:25'))
  await page.goto(rose.out_url)
  await expect(page.locator('#signed-out')).toContainText('Staff signed you out at 3:20 PM.')
  await expect(page.locator('#sign-out')).toHaveCount(0)
  await shot(page, testInfo, 'visit', '11-staff-signed-out')

  await setNow(context, T('21:05'))
  await page.goto(george.out_url)
  await expect(page.locator('#signed-out')).toContainText('You were signed out automatically at 9:00 PM when visiting hours ended.')
  await shot(page, testInfo, 'visit', '12-auto-signed-out')

  await setNow(context, T('00:00', '2026-09-15'))
  await page.goto(frank.out_url)
  await expect(page.locator('#link-error')).toHaveText(LINK_EXPIRED)
  await expect(page.getByText('Frank')).toHaveCount(0)
  await expect(page.getByText('Paul D.')).toHaveCount(0)
  await expect(page.locator('#signed-in, #signed-out')).toHaveText(['', ''])
  await expect(page.locator('#link-error-section a')).toHaveAttribute('href', '/')
  await shot(page, testInfo, 'visit', '13-link-expired')

  await page.goto(`/out/?t=${'A'.repeat(43)}`)
  await expect(page.locator('#link-error')).toHaveText("We can't find that visit. If you are still in the building, please tell the staff.")
  assertNoThirdParty(context)
  assertNoThirdParty(other)
  await other.close()
})

test(TITLES.privacy, async ({ page, context, request }, testInfo) => {
  await fresh(context, request)
  await page.goto('/privacy/')
  await expect(page.locator('#privacy')).toContainText('30 days, then it is deleted automatically.')
  await expect(page.locator('#privacy')).toContainText(`Staff at ${HOME}. This app does not send it anywhere.`)
  await expect(page.locator('#privacy')).toContainText('No health information about residents is stored, and your screening answers are not saved.')
  await expect(page.locator('#privacy')).toContainText('Questions: call 709-555-0142.')
  await expect(page.locator('.sample-badge')).toBeVisible()
  await shot(page, testInfo, 'visit', '14-privacy')

  const manager = await managerToken(request)
  expect((await api(request, 'PUT', '/api/settings/home', { retention_days: 14 }, bearer(manager))).status).toBe(200)
  await page.reload()
  await expect(page.locator('#privacy')).toContainText('14 days, then it is deleted automatically.')
  await page.goto('/')
  await expect(page.locator('#step-details')).toContainText('The home keeps your name and phone number for 14 days.')
  await tap(page, page.locator('#privacy-link'), 'Privacy')
  await expect(page).toHaveURL(/\/privacy\/$/)
  await expect(page.locator('#privacy')).toContainText('14 days, then it is deleted automatically.')
  assertNoThirdParty(context)
})
