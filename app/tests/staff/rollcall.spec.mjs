// Fire-drill roll call against the real Worker: the desk starts it by real taps, a second staff phone ticks, both see each other's
// ticks through the 3 s poll. Negative control: negative-local-tick.
import { test, expect } from '@playwright/test'
import {
  NOW, at, STAFF2_PIN, fresh, newContext, setNow, tap, api, bearer, staffToken, buildingViaApi, visitorSignInViaApi, assertNoThirdParty,
} from '../helpers.mjs'
import { staffSignsIn, openTab, visitor, signInVisitors, visitIds } from './staff-helpers.mjs'

const LINDA = visitor('Linda P.', '709-555-0111', 'r_mary')
const PAUL = visitor('Paul O.', '709-555-0114', 'r_frank')
const NORA = visitor('Nora D.', '709-555-0117', 'r_agnes')
const GRACE = visitor('Grace B.', '709-555-0115', 'r_rose')
const GRACE_IN = at('2026-09-14T15:03:00-02:30')
const LATER = at('2026-09-14T15:05:00-02:30')

test('a roll call started by real taps on the desk takes ticks from a second phone within one poll, lists a late arrival, and refuses ticks once ended', async ({ page, context, request, browser }) => {
  test.setTimeout(90_000)
  await fresh(context, request)
  await signInVisitors(request, [LINDA, PAUL, NORA])
  const ids = visitIds(await buildingViaApi(request, await staffToken(request)))
  const desk = page
  const progress = desk.locator('#roll-call-progress')

  await staffSignsIn(desk)
  await openTab(desk, 'Roll call')
  await tap(desk, desk.locator('#start-roll-call'), 'Start roll call')
  await expect(desk.locator('#confirm-roll-call')).toBeVisible()
  const started = desk.waitForResponse((r) => r.url().endsWith('/api/staff/rollcall') && r.request().method() === 'POST')
  await tap(desk, desk.locator('#confirm-roll-call'), 'Yes, start')
  const rollCallId = (await (await started).json()).roll_call.id
  await expect(progress).toHaveText('0 of 3 found')
  await expect(desk.locator('[data-roll]')).toHaveCount(3)

  // Amira on her own phone opens the roll call and ticks Paul.
  const phoneCtx = await newContext(browser, 'phone')
  const phone = await phoneCtx.newPage()
  await staffSignsIn(phone, STAFF2_PIN)
  await openTab(phone, 'Roll call')
  await expect(phone.locator('#roll-call-progress')).toHaveText('0 of 3 found')
  await tap(phone, phone.locator(`[data-roll="${ids['Paul O. (SAMPLE)']}"] button.found`), 'Found (phone)')
  await expect(phone.locator('#roll-call-progress')).toHaveText('1 of 3 found')

  await expect(progress, "the second phone's tick reaches the desk within one poll").toHaveText('1 of 3 found', { timeout: 5000 })
  const paulRow = desk.locator(`[data-roll="${ids['Paul O. (SAMPLE)']}"]`)
  await expect(paulRow.locator('button.found')).toHaveAttribute('aria-pressed', 'true')
  await expect(paulRow.locator('.found-by')).toContainText('Found by Amira H. (SAMPLE)')

  // The desk ticks Linda.
  await tap(desk, desk.locator(`[data-roll="${ids['Linda P. (SAMPLE)']}"] button.found`), 'Found (desk)')
  await expect(progress).toHaveText('2 of 3 found')
  await expect(desk.locator(`[data-roll="${ids['Linda P. (SAMPLE)']}"] .found-by`)).toContainText('Found by Carl B. (SAMPLE)')

  // Grace signs in after the start (3:03 PM). The roll call ends at 3:05 PM: API.md lists visits signed in *before* ended_at, so
  // a sign-in at the very instant of the end would not be on it (found on the first run, where both were 3:05 PM).
  await visitorSignInViaApi(request, GRACE, { now: GRACE_IN })
  await setNow(context, LATER)
  await setNow(phoneCtx, LATER)
  const graceId = visitIds(await buildingViaApi(request, await staffToken(request, undefined, { now: LATER }), { now: LATER }))['Grace B. (SAMPLE)']
  const graceRow = desk.locator(`[data-roll="${graceId}"]`)
  await expect(graceRow, 'the late arrival appears within one poll').toContainText('Came in after the roll call started', { timeout: 5000 })
  await expect(progress).toHaveText('2 of 4 found')

  // End it: the desk reads Ended, the ticks are off, and the API refuses a tick.
  await tap(desk, desk.locator('#end-roll-call'), 'End roll call')
  await tap(desk, desk.locator('#confirm-end-roll-call'), 'Yes, end it')
  await expect(progress).toHaveText('Ended 3:05 PM · 2 of 4 found')
  const ticks = desk.locator('[data-roll] button.found')
  await expect(ticks).toHaveCount(4)
  for (let i = 0; i < 4; i++) await expect(ticks.nth(i)).toBeDisabled()
  const refused = await api(request, 'POST', `/api/staff/rollcall/${rollCallId}/found`, { visit_id: graceId, found: true },
    bearer(await staffToken(request, undefined, { now: LATER })), { now: LATER })
  expect(refused.status, 'a tick after the end is refused').toBe(409)
  expect(refused.body).toMatchObject({ code: 'bad_state', error: 'This roll call has ended.' })
  await expect(phone.locator('#roll-call-progress'), 'the phone sees the end within one poll').toHaveText('Ended 3:05 PM · 2 of 4 found', { timeout: 5000 })

  assertNoThirdParty(phoneCtx)
  await phoneCtx.close()
  assertNoThirdParty(context)
  expect(NOW).toBe('2026-09-14T17:30:00Z')
})
