// Day log and contact list against the real Worker, with visits on Sep 13 and Sep 14 on Harbour and Lighthouse set up through the API
// with X-Test-Now (always moving forward). Negative control: negative-csv-stale-unit.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  NOW, at, STAFF_PIN, fresh, tap, api, bearer, staffToken, buildingViaApi, visitorSignInViaApi, visitorSignOutViaApi, assertNoThirdParty,
} from '../helpers.mjs'
import { staffSignsIn, openTab, visitor, visitIds } from './staff-helpers.mjs'

const T13 = (hm) => at(`2026-09-13T${hm}:00-02:30`)
const T14 = (hm) => at(`2026-09-14T${hm}:00-02:30`)

/** Sep 13: Linda on Harbour (auto at 9:00 PM), Paul on Lighthouse (signs himself out at 4:00 PM).
 *  Sep 14: Grace on Lighthouse (staff sign her out at 2:30 PM), Tom on Harbour (still in at 3:00 PM). */
async function twoDays(request) {
  await visitorSignInViaApi(request, visitor('Linda P.', '709-555-0111', 'r_mary'), { now: T13('15:00') })
  const paul = await visitorSignInViaApi(request, visitor('Paul O.', '709-555-0114', 'r_frank'), { now: T13('15:10') })
  await visitorSignOutViaApi(request, paul.token, { now: T13('16:00') })
  await visitorSignInViaApi(request, visitor('Grace B.', '709-555-0115', 'r_rose'), { now: T14('14:00') })
  const t = await staffToken(request, STAFF_PIN, { now: T14('14:30') })
  const graceId = visitIds(await buildingViaApi(request, t, { now: T14('14:30') }))['Grace B. (SAMPLE)']
  const out = await api(request, 'POST', `/api/staff/visits/${graceId}/signout`, {}, bearer(t), { now: T14('14:30') })
  expect(out.status, 'staff sign Grace out').toBe(200)
  await visitorSignInViaApi(request, visitor('Tom K.', '709-555-0112', 'r_george'), { now: T14('15:00') })
}

const ids = (list) => list.map((v) => v.id ?? v.visit_id)

test("the day log shows exactly that day's visits with the right Out words, Previous goes to Sep 13, and the unit filter narrows it", async ({ page, context, request }) => {
  await fresh(context, request)
  await twoDays(request)
  const token = await staffToken(request)
  const dayLog = async (date, unit = 'all') => (await api(request, 'GET', `/api/staff/visits?date=${date}&unit=${unit}`, undefined, bearer(token))).body

  await staffSignsIn(page)
  await openTab(page, 'Day log')
  await expect(page.locator('#log-date')).toHaveValue('2026-09-14')
  const sep14 = await dayLog('2026-09-14')
  expect(sep14.visits.map((v) => v.visitor_name)).toEqual(['Grace B. (SAMPLE)', 'Tom K. (SAMPLE)'])
  const rows = page.locator('#log-table tbody [data-log-visit]')
  await expect(rows).toHaveCount(sep14.count)
  expect(await rows.evaluateAll((rs) => rs.map((r) => r.dataset.logVisit)), 'exactly the API day log for Sep 14, in order').toEqual(ids(sep14.visits))
  await expect(page.locator('#log-count')).toHaveText('2 visits')
  const grace = rows.filter({ hasText: 'Grace B. (SAMPLE)' })
  await expect(grace.locator('.log-out')).toHaveText('2:30 PMStaff')
  await expect(grace.locator('.log-out .kind')).toHaveText('Staff')
  await expect(rows.filter({ hasText: 'Tom K. (SAMPLE)' }).locator('.log-out')).toHaveText('Still in')

  await tap(page, page.locator('#log-prev'), 'Previous')
  await expect(page.locator('#log-date')).toHaveValue('2026-09-13')
  await expect(page.locator('#log-heading')).toHaveText('Day log · Sun Sep 13')
  const sep13 = await dayLog('2026-09-13')
  await expect(rows).toHaveCount(sep13.count)
  expect(await rows.evaluateAll((rs) => rs.map((r) => r.dataset.logVisit)), 'exactly the API day log for Sep 13').toEqual(ids(sep13.visits))
  await expect(rows.filter({ hasText: 'Linda P. (SAMPLE)' }).locator('.log-out')).toHaveText('9:00 PMAuto')
  await expect(rows.filter({ hasText: 'Paul O. (SAMPLE)' }).locator('.log-out')).toHaveText('4:00 PMVisitor')

  await page.locator('#log-unit').selectOption('u_harbour')
  const harbour13 = await dayLog('2026-09-13', 'u_harbour')
  await expect(rows).toHaveCount(harbour13.count)
  expect(harbour13.count).toBe(1)
  await expect(rows.first()).toContainText('Linda P. (SAMPLE)')
  await expect(page.locator('#log-count')).toHaveText('1 visit')
  assertNoThirdParty(context)
})

test("the contact list for Sep 13 to 14 on Harbour wing shows the API's count, and Download CSV saves the API's exact bytes and filename", async ({ page, context, request }) => {
  await fresh(context, request)
  await twoDays(request)
  const token = await staffToken(request)
  const query = 'from=2026-09-13&to=2026-09-14&unit=u_harbour'

  await staffSignsIn(page)
  await openTab(page, 'Contact list')
  await page.locator('#contacts-from').fill('2026-09-13')
  await page.locator('#contacts-to').fill('2026-09-14')
  await page.locator('#contacts-unit').selectOption('u_harbour')
  await tap(page, page.locator('#contacts-show'), 'Show')
  const json = (await api(request, 'GET', `/api/staff/contacts?${query}`, undefined, bearer(token))).body
  expect(json.rows.map((r) => r.visitor_name)).toEqual(['Linda P. (SAMPLE)', 'Tom K. (SAMPLE)'])
  await expect(page.locator('#contacts-count')).toHaveText(`${json.count} visits`)
  const rows = page.locator('#contacts-table tbody [data-contact-row]')
  await expect(rows).toHaveCount(json.count)
  expect(await rows.evaluateAll((rs) => rs.map((r) => r.dataset.contactRow))).toEqual(ids(json.rows))

  const res = await request.fetch(`/api/staff/contacts.csv?${query}`, { headers: { ...bearer(token), 'X-Test-Now': NOW } })
  expect(res.status()).toBe(200)
  const apiBytes = await res.body()
  const apiName = /filename="([^"]+)"/.exec(res.headers()['content-disposition'])[1]
  expect(apiName).toBe('visitor-contacts-u_harbour-2026-09-13-to-2026-09-14.csv')

  const [download] = await Promise.all([page.waitForEvent('download'), tap(page, page.locator('#download-contacts'), 'Download CSV')])
  const saved = readFileSync(await download.path())
  expect(saved.equals(apiBytes), `the downloaded CSV is byte for byte the API's\n--- saved:\n${saved}\n--- API:\n${apiBytes}`).toBe(true)
  expect(download.suggestedFilename(), "the file is named as the API names it").toBe(apiName)
  await expect(page.locator('#contacts-status')).toHaveText(`Downloaded ${apiName}`)
  assertNoThirdParty(context)
})
