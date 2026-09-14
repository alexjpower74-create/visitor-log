// Units, residents and staff settings against the real Worker (vl1 M2 routes). Real input on the page; the visitor API is read to check.
import { test, expect } from '@playwright/test'
import { fresh, tap, type, api, bearer, managerToken, assertNoThirdParty } from '../helpers.mjs'
import { managerOpensSettings, openTab } from './staff-helpers.mjs'

const isPost = (path) => (r) => new URL(r.url()).pathname === path && r.request().method() === 'POST'
const isPut = (path) => (r) => new URL(r.url()).pathname === path && r.request().method() === 'PUT'
const settingsOf = async (request) => (await api(request, 'GET', '/api/settings', undefined, bearer(await managerToken(request)))).body.settings

test("a unit added with two windows gives a resident moved to it that unit's hours_label on the visitor API", async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Units and hours')
  await type(page, page.locator('#unit-name'), 'SAMPLE Garden room')
  const windows = page.locator('#unit-windows .window')
  await windows.nth(0).locator('.window-open').fill('09:00')
  await windows.nth(0).locator('.window-close').fill('11:00')
  await tap(page, page.locator('#window-add'), 'Add a time')
  await expect(windows).toHaveCount(2)
  await windows.nth(1).locator('.window-open').fill('14:00')
  await windows.nth(1).locator('.window-close').fill('16:30')
  const created = page.waitForResponse(isPost('/api/settings/units'))
  await tap(page, page.locator('#unit-save'), 'Save unit')
  const r = await created
  expect(r.status()).toBe(201)
  const unitId = (await r.json()).id
  const label = '9:00 AM to 11:00 AM and 2:00 PM to 4:30 PM'
  await expect(page.locator(`[data-unit-row="${unitId}"] .unit-hours-label`)).toHaveText(label)

  await openTab(page, 'Residents')
  await tap(page, page.locator('[data-resident-row="r_bill"] .resident-edit'), 'Change Bill')
  await page.locator('#resident-unit').selectOption(unitId)
  const moved = page.waitForResponse(isPut('/api/settings/residents/r_bill'))
  await tap(page, page.locator('#resident-save'), 'Save resident')
  expect((await moved).status()).toBe(200)
  await expect(page.locator('[data-resident-row="r_bill"]')).toContainText('SAMPLE Garden room')

  const v = await api(request, 'GET', '/api/visitor/residents/r_bill')
  expect(v.status).toBe(200)
  expect(v.body.resident.unit).toMatchObject({ id: unitId, name: 'SAMPLE Garden room', hours_label: label })
  assertNoThirdParty(context)
})

test('overlapping windows show the API message under the hours and add nothing', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Units and hours')
  await type(page, page.locator('#unit-name'), 'SAMPLE Garden room')
  const windows = page.locator('#unit-windows .window')
  await windows.nth(0).locator('.window-open').fill('09:00')
  await windows.nth(0).locator('.window-close').fill('12:00')
  await tap(page, page.locator('#window-add'), 'Add a time')
  await windows.nth(1).locator('.window-open').fill('11:00')
  await windows.nth(1).locator('.window-close').fill('14:00')
  const refused = page.waitForResponse(isPost('/api/settings/units'))
  await tap(page, page.locator('#unit-save'), 'Save unit')
  const r = await refused
  expect(r.status()).toBe(400)
  const body = await r.json()
  expect(body).toMatchObject({ field: 'hours', error: "Visiting hours need a start before the end, and the times can't overlap." })
  await expect(page.locator('#unit-form [data-error-for="hours"]')).toHaveText(body.error)
  expect((await settingsOf(request)).units).toHaveLength(3)
  assertNoThirdParty(context)
})

test('a resident added with a lower-case initial is shown upper case and found by the visitor search', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Residents')
  await type(page, page.locator('#resident-first'), 'Nell')
  await type(page, page.locator('#resident-initial'), 'q')
  await type(page, page.locator('#resident-room'), '305')
  await page.locator('#resident-unit').selectOption('u_cove')
  const created = page.waitForResponse(isPost('/api/settings/residents'))
  await tap(page, page.locator('#resident-save'), 'Save resident')
  const r = await created
  expect(r.status()).toBe(201)
  const id = (await r.json()).id
  await expect(page.locator(`[data-resident-row="${id}"] .resident-name`)).toHaveText('Nell Q. (SAMPLE)')
  await expect(page.locator(`[data-resident-row="${id}"]`)).toContainText('Room 305 · Cove unit')

  const found = await api(request, 'GET', '/api/visitor/residents?q=nell')
  expect(found.status).toBe(200)
  expect(found.body.residents).toEqual([{ id, name: 'Nell Q. (SAMPLE)', room: '305', unit: { id: 'u_cove', name: 'Cove unit' } }])
  assertNoThirdParty(context)
})

test('"Visits by arrangement only" makes the visitor API refuse with by_arrangement', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Residents')
  await tap(page, page.locator('[data-resident-row="r_rose"] .resident-edit'), 'Change Rose')
  await expect(page.locator('#resident-arrangement')).not.toBeChecked()
  await tap(page, page.locator('#resident-arrangement'), 'Visits by arrangement only')
  await expect(page.locator('#resident-arrangement')).toBeChecked()
  const saved = page.waitForResponse(isPut('/api/settings/residents/r_rose'))
  await tap(page, page.locator('#resident-save'), 'Save resident')
  expect((await saved).status()).toBe(200)
  await expect(page.locator('[data-resident-row="r_rose"]')).toContainText('By arrangement')

  const refused = await api(request, 'POST', '/api/visitor/signin', { name: 'Kay B. (SAMPLE)', phone: '709-555-0130', resident_id: 'r_rose' })
  expect(refused.status).toBe(403)
  expect(refused.body).toMatchObject({ code: 'by_arrangement', error: "Visits with Rose B. (SAMPLE) are by arrangement only. Please see the nurse's desk." })
  assertNoThirdParty(context)
})

test('a removed resident is not found by visitors', async ({ page, context, request }) => {
  await fresh(context, request)
  expect((await api(request, 'GET', '/api/visitor/residents/r_walter')).status).toBe(200)
  await managerOpensSettings(page)
  await openTab(page, 'Residents')
  await tap(page, page.locator('#resident-list > [data-resident-row="r_walter"] .resident-remove'), 'Remove Walter')
  const removed = page.waitForResponse(isPut('/api/settings/residents/r_walter'))
  await tap(page, page.locator('[data-resident-row="r_walter"] .confirm-remove-resident'), 'Yes, remove')
  expect((await removed).status()).toBe(200)
  await expect(page.locator('#resident-list > [data-resident-row="r_walter"]')).toHaveCount(0)
  await expect(page.locator('[data-section="residents-removed"] [data-resident-row="r_walter"]')).toHaveCount(1)

  expect((await api(request, 'GET', '/api/visitor/residents/r_walter')).status, 'not found by id').toBe(404)
  const search = await api(request, 'GET', '/api/visitor/residents?q=wal')
  expect(search.body.residents.map((x) => x.id), 'not found by search').not.toContain('r_walter')
  assertNoThirdParty(context)
})

test('adding staff with a PIN someone already has shows the API message under the PIN', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Staff')
  await type(page, page.locator('#staff-name'), 'Dave P. (SAMPLE)')
  await page.locator('#staff-role').selectOption('staff')
  await type(page, page.locator('#staff-pin'), '2580')
  const refused = page.waitForResponse(isPost('/api/settings/staff'))
  await tap(page, page.locator('#staff-save'), 'Save staff')
  const r = await refused
  expect(r.status()).toBe(409)
  const body = await r.json()
  expect(body).toMatchObject({ code: 'pin_taken', field: 'pin', error: 'Another staff member already has that PIN. Pick a different one.' })
  await expect(page.locator('#staff-form [data-error-for="pin"]')).toHaveText(body.error)
  expect((await settingsOf(request)).staff).toHaveLength(3)
  assertNoThirdParty(context)
})

test('turning off the last manager shows the API message and leaves them on', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Staff')
  const refused = page.waitForResponse(isPut('/api/settings/staff/s_donna'))
  await tap(page, page.locator('[data-staff-row="s_donna"] .staff-toggle'), 'Turn off Donna')
  const r = await refused
  expect(r.status()).toBe(409)
  const body = await r.json()
  expect(body).toMatchObject({ code: 'bad_state', error: 'The home needs at least one manager.' })
  await expect(page.locator('[data-staff-row="s_donna"] .row-error')).toHaveText(body.error)
  expect((await settingsOf(request)).staff.find((s) => s.id === 's_donna').active).toBe(true)
  assertNoThirdParty(context)
})
