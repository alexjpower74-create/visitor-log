// Settings routes that vl1's M1 Worker supports: sign-in role, notices, screening, retention. Real input on the page; a visitor's
// phone context reads the visitor API to check. Negative controls: negative-notice-unit, negative-example-saves.
import { test, expect } from '@playwright/test'
import {
  NOW, STAFF_PIN, EXAMPLE_SCREENING, fresh, newContext, tap, type, keypad, api, bearer, managerToken, addNoticeViaApi, assertNoThirdParty,
} from '../helpers.mjs'
import { managerOpensSettings, openTab } from './staff-helpers.mjs'

const OUTBREAK = 'SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask before you go in.'
const WHOLE = 'SAMPLE notice: the side door is closed for painting this week. Please use the main entrance.'
const EDITED = 'Do you have a fever or a new cough today?'

/** What a visitor's own phone gets for a resident (the visitor API, read only). */
async function visitorReads(browser, residentId) {
  const phone = await newContext(browser, 'phone')
  const r = await phone.request.get(`/api/visitor/residents/${residentId}`, { headers: { 'X-Test-Now': NOW } })
  expect(r.status(), `visitor GET ${residentId}`).toBe(200)
  const body = await r.json()
  assertNoThirdParty(phone)
  await phone.close()
  return body
}
const messages = (list) => list.map((n) => n.message)

test('a staff PIN on Settings shows "Only a manager can change the settings."', async ({ page, context, request }) => {
  await fresh(context, request)
  await page.goto('/settings/')
  await expect(page.getByRole('heading', { name: 'Manager sign in' })).toBeVisible()
  const refused = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/settings')
  await keypad(page, STAFF_PIN, page.locator('#pin-enter'))
  const r = await refused
  expect(r.status()).toBe(403)
  await expect(page.locator('#pin-error')).toHaveText('Only a manager can change the settings.')
  await expect(page.locator('#app')).toBeHidden()
  assertNoThirdParty(context)
})

test("an outbreak notice for Cove unit added by real input reaches Agnes's visitors and not Frank's", async ({ page, context, request, browser }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await page.locator('#notice-unit').selectOption('u_cove')
  await page.locator('#notice-severity').selectOption('outbreak')
  await expect(page.locator('#notice-severity-help')).toHaveText('Visitors see your message and must tap I have read it before they sign in.')
  await type(page, page.locator('#notice-message'), OUTBREAK)
  const created = page.waitForResponse((r) => r.url().endsWith('/api/settings/notices') && r.request().method() === 'POST')
  await tap(page, page.locator('#notice-add'), 'Add notice')
  expect((await created).status()).toBe(201)
  const row = page.locator('#notice-list [data-notice-row]')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(OUTBREAK)
  await expect(row).toContainText('Outbreak · Cove unit')

  const agnes = await visitorReads(browser, 'r_agnes')
  expect(messages(agnes.unit_notices), "Agnes's unit notices").toEqual([OUTBREAK])
  expect(agnes.unit_notices[0]).toMatchObject({ severity: 'outbreak', unit: { id: 'u_cove' } })
  expect(agnes.needs_notice_confirm).toBe(true)
  expect(agnes.home_notices).toEqual([])
  const frank = await visitorReads(browser, 'r_frank')
  expect(frank.unit_notices, "Frank's unit notices").toEqual([])
  expect(frank.home_notices).toEqual([])
  expect(frank.needs_notice_confirm).toBe(false)
  assertNoThirdParty(context)
})

test('a Whole home notice goes to home_notices for every visitor', async ({ page, context, request, browser }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await page.locator('#notice-unit').selectOption('')
  await expect(page.locator('#notice-unit option:checked')).toHaveText('Whole home')
  await page.locator('#notice-severity').selectOption('info')
  await type(page, page.locator('#notice-message'), WHOLE)
  const created = page.waitForResponse((r) => r.url().endsWith('/api/settings/notices') && r.request().method() === 'POST')
  await tap(page, page.locator('#notice-add'), 'Add notice')
  expect((await created).status()).toBe(201)

  for (const id of ['r_frank', 'r_agnes', 'r_mary']) {
    const v = await visitorReads(browser, id)
    expect(messages(v.home_notices), 'a Whole home notice reaches every visitor').toEqual([WHOLE])
    expect(v.unit_notices, `no unit notice for ${id}`).toEqual([])
  }
  assertNoThirdParty(context)
})

test('turning a notice off takes it away from visitors', async ({ page, context, request, browser }) => {
  await fresh(context, request)
  const id = await addNoticeViaApi(request, await managerToken(request), { unit_id: 'u_cove', severity: 'outbreak', message: OUTBREAK })
  expect(messages((await visitorReads(browser, 'r_agnes')).unit_notices)).toEqual([OUTBREAK])
  await managerOpensSettings(page)
  const toggle = page.locator(`[data-notice-row="${id}"] .notice-toggle`)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const put = page.waitForResponse((r) => r.url().endsWith(`/api/settings/notices/${id}`) && r.request().method() === 'PUT')
  await tap(page, toggle, 'notice On/Off')
  expect((await put).status()).toBe(200)
  await expect(page.locator(`[data-notice-row="${id}"] .notice-toggle`)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(`[data-notice-row="${id}"] .notice-toggle`)).toHaveText('Off')
  const agnes = await visitorReads(browser, 'r_agnes')
  expect(agnes.unit_notices, 'the notice is gone for visitors').toEqual([])
  expect(agnes.needs_notice_confirm).toBe(false)
  assertNoThirdParty(context)
})

test('Save with screening on and no questions shows the API message under the questions', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Screening')
  await expect(page.locator('#screening-enabled')).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('#question-list input.question-text')).toHaveCount(0)
  await tap(page, page.locator('#screening-enabled'), 'screening switch')
  await expect(page.locator('#screening-enabled')).toHaveAttribute('aria-checked', 'true')
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/settings/screening') && r.request().method() === 'PUT')
  await tap(page, page.locator('#screening-save'), 'Save')
  const r = await saved
  expect(r.status()).toBe(400)
  const body = await r.json()
  expect(body).toMatchObject({ field: 'questions', error: 'Add at least one question before you turn screening on.' })
  await expect(page.locator('[data-error-for="questions"]')).toHaveText(body.error)
  const s = await api(request, 'GET', '/api/settings', undefined, bearer(await managerToken(request)))
  expect(s.body.settings.home.screening_enabled).toBe(false)
  assertNoThirdParty(context)
})

test('Use the example fills the form but saves nothing and leaves the switch off', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Screening')
  const save = page.waitForRequest((r) => r.url().includes('/api/settings/screening') && r.method() === 'PUT', { timeout: 2000 }).catch(() => null)
  await tap(page, page.locator('#use-example'), 'Use the example')
  expect(await save, 'Use the example sent a save').toBeNull()
  const s = await api(request, 'GET', '/api/settings', undefined, bearer(await managerToken(request)))
  expect(s.body.settings.screening_questions, 'Use the example saved no questions').toEqual([])
  expect(s.body.settings.home).toMatchObject({ screening_enabled: false, screening_stop_message: '' })

  await expect(page.locator('#example-label')).toHaveText(EXAMPLE_SCREENING.label)
  const inputs = page.locator('#question-list input.question-text')
  await expect(inputs).toHaveCount(EXAMPLE_SCREENING.questions.length)
  for (const [i, q] of EXAMPLE_SCREENING.questions.entries()) await expect(inputs.nth(i)).toHaveValue(q)
  await expect(page.locator('#screening-stop')).toHaveValue(EXAMPLE_SCREENING.stop_message)
  await expect(page.locator('#screening-enabled')).toHaveAttribute('aria-checked', 'false')
  assertNoThirdParty(context)
})

test('edited questions saved with the switch on reach the API with screening on', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Screening')
  await tap(page, page.locator('#use-example'), 'Use the example')
  await type(page, page.locator('#question-list input.question-text').first(), EDITED, { clear: true })
  await tap(page, page.locator('#screening-enabled'), 'screening switch')
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/settings/screening') && r.request().method() === 'PUT')
  await tap(page, page.locator('#screening-save'), 'Save')
  expect((await saved).status()).toBe(200)
  await expect(page.locator('#screening-status')).toContainText('Saved')

  const s = (await api(request, 'GET', '/api/settings', undefined, bearer(await managerToken(request)))).body.settings
  expect(s.home.screening_enabled).toBe(true)
  expect(s.screening_questions.map((q) => q.text)).toEqual([EDITED, EXAMPLE_SCREENING.questions[1]])
  expect(s.home.screening_stop_message).toBe(EXAMPLE_SCREENING.stop_message)
  await expect(page.locator('#screening-enabled')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('#example-label')).toBeHidden()
  assertNoThirdParty(context)
})

test('retention 14 updates the line and the API', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Visits and privacy')
  await expect(page.locator('#retention-line')).toHaveText('Visitor records are deleted after 30 days.')
  await type(page, page.locator('#retention-days'), '14', { clear: true })
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/settings/home') && r.request().method() === 'PUT')
  await tap(page, page.locator('#visits-save'), 'Save')
  expect((await saved).status()).toBe(200)
  await expect(page.locator('#retention-line')).toHaveText('Visitor records are deleted after 14 days.')
  expect((await api(request, 'GET', '/api/info')).body.retention_days).toBe(14)
  assertNoThirdParty(context)
})

test('retention 0 shows the API message under the retention field', async ({ page, context, request }) => {
  await fresh(context, request)
  await managerOpensSettings(page)
  await openTab(page, 'Visits and privacy')
  await type(page, page.locator('#retention-days'), '0', { clear: true })
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/settings/home') && r.request().method() === 'PUT')
  await tap(page, page.locator('#visits-save'), 'Save')
  const r = await saved
  expect(r.status()).toBe(400)
  const body = await r.json()
  expect(body).toMatchObject({ field: 'retention_days', error: 'Keep visitor records for 1 to 365 days.' })
  await expect(page.locator('[data-error-for="retention_days"]')).toHaveText(body.error)
  await expect(page.locator('#retention-line')).toHaveText('Visitor records are deleted after 30 days.')
  expect((await api(request, 'GET', '/api/info')).body.retention_days).toBe(30)
  assertNoThirdParty(context)
})
