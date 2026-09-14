// In the building, against the real Worker (E2E_PORT=8403 npx playwright test tests/staff). Real taps and the keypad; the API sets
// up visitors and is read to check. Negative controls: negative-stale-total, negative-no-overdue, negative-overlay.
import { test, expect } from '@playwright/test'
import {
  at, fresh, setNow, tap, keypad, staffToken, managerToken, buildingViaApi, visitorSignInViaApi, addNoticeViaApi, sevColour, SEV_RGB,
  assertNoThirdParty,
} from '../helpers.mjs'
import { staffSignsIn, totalNumber, visitor, signInVisitors, visitIds } from './staff-helpers.mjs'

const LINDA = visitor('Linda P.', '709-555-0111', 'r_mary')
const TOM = visitor('Tom K.', '709-555-0112', 'r_george')
const PAUL = visitor('Paul O.', '709-555-0114', 'r_frank')
const GRACE = visitor('Grace B.', '709-555-0115', 'r_rose')
const NORA = visitor('Nora D.', '709-555-0117', 'r_agnes')

test('a wrong PIN shows "That PIN is not right." and the API answered 401', async ({ page, context, request }) => {
  await fresh(context, request)
  await page.goto('/staff/')
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
  const answer = page.waitForResponse((r) => r.url().endsWith('/api/signin') && r.request().method() === 'POST')
  await keypad(page, '1111', page.locator('#pin-enter'))
  const r = await answer
  expect(r.status(), 'the wrong PIN is a 401').toBe(401)
  const body = await r.json()
  expect(body).toMatchObject({ error: 'That PIN is not right.', code: 'unauthorized', field: 'pin' })
  await expect(page.locator('#pin-error')).toHaveText('That PIN is not right.')
  await expect(page.locator('#app')).toBeHidden()
  assertNoThirdParty(context)
})

test('visitors signed in through the API show on their unit cards with counts and a total equal to the API', async ({ page, context, request }) => {
  await fresh(context, request)
  await signInVisitors(request, [LINDA, TOM, PAUL, GRACE, NORA])
  await staffSignsIn(page)
  const b = await buildingViaApi(request, await staffToken(request))
  expect(b.units.map((u) => [u.id, u.count]), 'the setup put 2 on Harbour, 2 on Lighthouse, 1 on Cove').toEqual([['u_harbour', 2], ['u_lighthouse', 2], ['u_cove', 1]])
  await expect(totalNumber(page)).toHaveText(String(b.total))
  await expect(page.locator('#building-total')).toHaveText(`${b.total} in the building`)
  for (const u of b.units) {
    const card = page.locator(`[data-unit="${u.id}"]`)
    await expect(card.locator('.unit-count'), `${u.name} count`).toHaveText(String(u.count))
    await expect(card.locator('[data-visit]'), `${u.name} rows`).toHaveCount(u.visits.length)
    for (const v of u.visits) {
      const row = card.locator(`[data-visit="${v.id}"]`)
      await expect(row).toContainText(v.visitor_name)
      await expect(row).toContainText(`Visiting ${v.resident.name}, Room ${v.resident.room}`)
      await expect(row).toContainText(`In since ${v.in_label}`)
    }
  }
  assertNoThirdParty(context)
})

test('Sign out by real taps: the row leaves, the unit count and the total drop at once, and the API agrees', async ({ page, context, request }) => {
  await fresh(context, request)
  await signInVisitors(request, [LINDA, PAUL, GRACE])
  await staffSignsIn(page)
  const token = await staffToken(request)
  const paulId = visitIds(await buildingViaApi(request, token))['Paul O. (SAMPLE)']
  const row = page.locator(`[data-visit="${paulId}"]`)
  await expect(totalNumber(page)).toHaveText('3')
  await expect(page.locator('[data-unit="u_lighthouse"] .unit-count')).toHaveText('2')

  await tap(page, row.locator('button.sign-out-visit'), 'Sign out Paul')
  await expect(row.locator('.confirm')).toContainText('Sign out Paul O. (SAMPLE)?')
  await tap(page, row.locator('button.confirm-sign-out'), 'Yes, sign out')
  // "At once": well inside one 5 s poll.
  await expect(row, 'the row leaves').toHaveCount(0, { timeout: 2000 })
  await expect(page.locator('[data-unit="u_lighthouse"] .unit-count'), 'the unit count drops with the row').toHaveText('1', { timeout: 2000 })
  await expect(totalNumber(page), 'the total drops with the row').toHaveText('2', { timeout: 2000 })

  const after = await buildingViaApi(request, token)
  expect(after.total).toBe(2)
  expect(after.units.find((u) => u.id === 'u_lighthouse').count).toBe(1)
  expect(visitIds(after)['Paul O. (SAMPLE)'], 'the API no longer has Paul in the building').toBeUndefined()
  // and a poll keeps it that way
  await page.waitForResponse((r) => r.url().includes('/api/staff/building'), { timeout: 8000 })
  await expect(totalNumber(page)).toHaveText('2')
  assertNoThirdParty(context)
})

test('Cancel leaves the visitor signed in', async ({ page, context, request }) => {
  await fresh(context, request)
  await signInVisitors(request, [PAUL])
  await staffSignsIn(page)
  const token = await staffToken(request)
  const paulId = visitIds(await buildingViaApi(request, token))['Paul O. (SAMPLE)']
  const row = page.locator(`[data-visit="${paulId}"]`)
  await tap(page, row.locator('button.sign-out-visit'), 'Sign out Paul')
  await tap(page, row.locator('.confirm button.cancel'), 'Cancel')
  await expect(row.locator('.confirm')).toHaveCount(0)
  await expect(row.locator('button.sign-out-visit')).toBeVisible()
  await expect(totalNumber(page)).toHaveText('1')
  expect((await buildingViaApi(request, token)).total).toBe(1)
  assertNoThirdParty(context)
})

test('a Harbour visitor in at 11:00 AM is overdue within one poll of 11:30 AM', async ({ page, context, request }) => {
  const AT_11 = at('2026-09-14T11:00:00-02:30')
  await fresh(context, request, { now: AT_11 })
  await visitorSignInViaApi(request, LINDA, { now: AT_11 })
  await staffSignsIn(page)
  const row = page.locator('[data-unit="u_harbour"] [data-visit]')
  await expect(row).toHaveCount(1)
  await expect(row).toHaveAttribute('data-overdue', 'false')
  await expect(row.locator('.overdue-chip')).toHaveCount(0)

  await setNow(context, at('2026-09-14T11:30:00-02:30'))
  await expect(row, 'overdue within one 5 s poll').toHaveAttribute('data-overdue', 'true', { timeout: 7000 })
  await expect(row.locator('.overdue-chip'), 'overdue within one 5 s poll').toHaveText('Overdue since 11:30 AM')
  assertNoThirdParty(context)
})

test('at 9:00 PM the Harbour visitor leaves the card and is listed as signed out automatically', async ({ page, context, request }) => {
  await fresh(context, request)
  await signInVisitors(request, [LINDA, PAUL])
  await staffSignsIn(page)
  await expect(page.locator('[data-unit="u_harbour"] [data-visit]')).toHaveCount(1)
  await expect(page.locator('#auto-today')).toBeHidden()

  await setNow(context, at('2026-09-14T21:00:00-02:30'))
  await expect(page.locator('[data-unit="u_harbour"] [data-visit]'), 'gone from Harbour within one poll').toHaveCount(0, { timeout: 7000 })
  await expect(page.locator('[data-unit="u_harbour"] .empty-unit')).toHaveText('Nobody is signed in on this unit.')
  const auto = page.locator('#auto-today')
  await expect(auto).toContainText('Signed out automatically at closing today (not confirmed)')
  await expect(auto.locator('li')).toHaveCount(1)
  await expect(auto).toContainText('Linda P. (SAMPLE)')
  await expect(auto).toContainText('9:00 PM')
  await expect(page.locator('[data-unit="u_lighthouse"] [data-visit]')).toHaveCount(1)
  await expect(totalNumber(page)).toHaveText('1')
  assertNoThirdParty(context)
})

test('a notice on Cove unit shows on the Cove card only, a whole-home notice once above the cards', async ({ page, context, request }) => {
  await fresh(context, request)
  const m = await managerToken(request)
  const cove = await addNoticeViaApi(request, m, { unit_id: 'u_cove', severity: 'outbreak', message: 'SAMPLE notice: Cove unit is on outbreak precautions.' })
  const home = await addNoticeViaApi(request, m, { unit_id: null, severity: 'info', message: 'SAMPLE notice: the side door is closed for painting.' })
  await staffSignsIn(page)

  const onCove = page.locator(`[data-unit="u_cove"] [data-notice="${cove}"]`)
  await expect(onCove).toContainText('SAMPLE notice: Cove unit is on outbreak precautions.')
  await expect(onCove).toContainText('Outbreak · Cove unit')
  await expect(onCove).toHaveAttribute('data-severity', 'outbreak')
  expect(await sevColour(onCove)).toBe(SEV_RGB.outbreak)
  await expect(page.locator(`[data-notice="${cove}"]`), 'the Cove notice appears once').toHaveCount(1)
  for (const u of ['u_harbour', 'u_lighthouse']) {
    await expect(page.locator(`[data-unit="${u}"] [data-notice]`), `no notice on ${u}`).toHaveCount(0)
  }
  await expect(page.locator(`[data-notice="${home}"]`), 'the whole-home notice appears once').toHaveCount(1)
  await expect(page.locator(`#building-notices [data-notice="${home}"]`)).toContainText('SAMPLE notice: the side door is closed for painting.')
  assertNoThirdParty(context)
})

test('a poll that lands while a confirmation is open does not close it', async ({ page, context, request }) => {
  await fresh(context, request)
  await signInVisitors(request, [PAUL])
  await staffSignsIn(page)
  const token = await staffToken(request)
  const paulId = visitIds(await buildingViaApi(request, token))['Paul O. (SAMPLE)']
  const row = page.locator(`[data-visit="${paulId}"]`)
  await tap(page, row.locator('button.sign-out-visit'), 'Sign out Paul')
  await expect(row.locator('button.confirm-sign-out')).toBeVisible()

  // A change only the next poll can bring, then wait until that poll has rendered it.
  await visitorSignInViaApi(request, GRACE)
  const graceId = visitIds(await buildingViaApi(request, token))['Grace B. (SAMPLE)']
  await expect(page.locator(`[data-visit="${graceId}"]`), 'a poll landed and rendered').toBeVisible({ timeout: 8000 })
  await expect(page.locator('[data-unit="u_lighthouse"] .unit-count')).toHaveText('2')

  await expect(row.locator('.confirm'), 'the confirmation is still open').toContainText('Sign out Paul O. (SAMPLE)?')
  await tap(page, row.locator('button.confirm-sign-out'), 'Yes, sign out after the poll')
  await expect(row).toHaveCount(0, { timeout: 2000 })
  await expect(totalNumber(page)).toHaveText('1', { timeout: 2000 })
  assertNoThirdParty(context)
})
