// Sign someone in (staff at the desk), against the real Worker. The API sets up screening and is read to check.
import { test, expect } from '@playwright/test'
import {
  EXAMPLE_SCREENING, fresh, tap, type, api, bearer, staffToken, managerToken, buildingViaApi, setScreeningViaApi, assertNoThirdParty,
} from '../helpers.mjs'
import { staffSignsIn, openTab } from './staff-helpers.mjs'

test('Ellen with no phone: the by-arrangement warning shows and the visit is in the building, signed in by staff', async ({ page, context, request }) => {
  await fresh(context, request)
  await staffSignsIn(page)
  await openTab(page, 'Sign someone in')
  await expect(page.locator('#manual-resident option[value="r_ellen"]')).toHaveText('Ellen W. (SAMPLE), Room 108, by arrangement')
  await page.locator('#manual-resident').selectOption('r_ellen')
  await type(page, page.locator('#manual-name'), 'Jean W. (SAMPLE)')
  await expect(page.locator('#manual-phone')).toHaveValue('')
  await tap(page, page.locator('#manual-submit'), 'Sign in')

  await expect(page.locator('#manual-warnings')).toContainText("Visits with Ellen W. (SAMPLE) are by arrangement only. Please see the nurse's desk.")
  await expect(page.locator('#manual-result')).toHaveText('Signed in Jean W. (SAMPLE) at 3:00 PM')

  const b = await buildingViaApi(request, await staffToken(request))
  const v = b.units.find((u) => u.id === 'u_harbour').visits.find((x) => x.visitor_name === 'Jean W. (SAMPLE)')
  expect(v, 'the visit is in the building on Harbour wing').toBeTruthy()
  expect(v).toMatchObject({ method: 'staff', visitor_phone: '', signed_in_by: 'Carl B. (SAMPLE)', resident: { id: 'r_ellen' } })

  await openTab(page, 'In the building')
  const row = page.locator(`[data-visit="${v.id}"]`)
  await expect(row).toContainText('Signed in by staff')
  await expect(row).toContainText('No phone')
  assertNoThirdParty(context)
})

test('no resident and no name shows the resident error under the picker; a resident and no name shows "Please type their name."', async ({ page, context, request }) => {
  await fresh(context, request)
  await staffSignsIn(page)
  await openTab(page, 'Sign someone in')
  await expect(page.locator('#manual-resident')).toHaveValue('')
  await expect(page.locator('#manual-name')).toHaveValue('')

  let answer = page.waitForResponse((r) => r.url().endsWith('/api/staff/visits') && r.request().method() === 'POST')
  await tap(page, page.locator('#manual-submit'), 'Sign in with nothing picked')
  let r = await answer
  expect(r.status()).toBe(400)
  expect(await r.json()).toMatchObject({ field: 'resident_id', error: 'Please pick who they are visiting.' })
  await expect(page.locator('[data-error-for="resident_id"]'), 'the resident error under #manual-resident').toHaveText('Please pick who they are visiting.')
  await expect(page.locator('#manual-resident + [data-error-for="resident_id"]')).toBeVisible()
  await expect(page.locator('[data-error-for="visitor_name"]')).toHaveText('')

  await page.locator('#manual-resident').selectOption('r_mary')
  answer = page.waitForResponse((r) => r.url().endsWith('/api/staff/visits') && r.request().method() === 'POST')
  await tap(page, page.locator('#manual-submit'), 'Sign in with no name')
  r = await answer
  expect(r.status()).toBe(400)
  expect(await r.json()).toMatchObject({ field: 'visitor_name', error: 'Please type their name.' })
  await expect(page.locator('[data-error-for="visitor_name"]'), 'the name error under #manual-name').toHaveText('Please type their name.')
  await expect(page.locator('#manual-name + [data-error-for="visitor_name"]')).toBeVisible()
  await expect(page.locator('[data-error-for="resident_id"]')).toHaveText('')
  expect((await buildingViaApi(request, await staffToken(request))).total, 'nothing was recorded').toBe(0)
  assertNoThirdParty(context)
})

test('with screening on, Sign in without the screened box shows the API message and records nothing; with it, the visit is recorded', async ({ page, context, request }) => {
  await fresh(context, request)
  await setScreeningViaApi(request, await managerToken(request), { enabled: true, stop_message: EXAMPLE_SCREENING.stop_message, questions: EXAMPLE_SCREENING.questions })
  await staffSignsIn(page)
  await openTab(page, 'Sign someone in')
  await expect(page.locator('#manual-screening')).toBeVisible()
  for (const q of EXAMPLE_SCREENING.questions) await expect(page.locator('#manual-questions')).toContainText(q)

  await page.locator('#manual-resident').selectOption('r_frank')
  await type(page, page.locator('#manual-name'), 'Sam K. (SAMPLE)')
  await expect(page.locator('#manual-screened')).not.toBeChecked()
  const refused = page.waitForResponse((r) => r.url().endsWith('/api/staff/visits') && r.request().method() === 'POST')
  await tap(page, page.locator('#manual-submit'), 'Sign in without the box')
  const r = await refused
  expect(r.status()).toBe(400)
  const body = await r.json()
  expect(body).toMatchObject({ field: 'screened', error: 'Ask the screening questions first. Only sign in a visitor who answered No to every one.' })
  await expect(page.locator('[data-error-for="screened"]'), 'the API message under the box').toHaveText(body.error)
  await expect(page.locator('#manual-result')).toHaveText('')

  const token = await staffToken(request)
  expect((await buildingViaApi(request, token)).total, 'nothing in the building').toBe(0)
  const log = await api(request, 'GET', '/api/staff/visits', undefined, bearer(token))
  expect(log.body.count, 'nothing in the day log').toBe(0)

  await tap(page, page.locator('#manual-screened'), 'screened box')
  await expect(page.locator('#manual-screened')).toBeChecked()
  await tap(page, page.locator('#manual-submit'), 'Sign in with the box')
  await expect(page.locator('#manual-result')).toHaveText('Signed in Sam K. (SAMPLE) at 3:00 PM')
  await expect(page.locator('[data-error-for="screened"]')).toHaveText('')
  const b = await buildingViaApi(request, token)
  expect(b.total).toBe(1)
  expect(b.units.find((u) => u.id === 'u_lighthouse').visits[0]).toMatchObject({ visitor_name: 'Sam K. (SAMPLE)', screened: true, method: 'staff' })
  assertNoThirdParty(context)
})
