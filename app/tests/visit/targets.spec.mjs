// Tap targets on the visitor's phone pages at 390 in chromium and webkit: every visible button (and button-styled link) at least
// 56 px and what a tap actually hits, Sign in and Sign out at least 64 px tall, the SAMPLE badge, no sideways scroll, Sign in's
// contrast, and the sticky header never over Sign in or an answer button. Hit-tests use elementFromPoint (expectTapTarget).
import { test, expect } from '@playwright/test'
import {
  EXAMPLE_SCREENING, fresh, tap, type, managerToken, addNoticeViaApi, setScreeningViaApi, expectTapTarget, expectNoHorizontalScroll,
  contrastOf, assertNoThirdParty,
} from '../helpers.mjs'

async function everyButton(page, step) {
  const buttons = page.locator('button:visible, a.v-button:visible')
  const n = await buttons.count()
  expect(n, `${step}: buttons on this step`).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i)
    await expectTapTarget(page, b, 56, `${step}: "${(await b.textContent()).trim().slice(0, 40)}"`)
  }
  await expectNoHorizontalScroll(page)
}

async function tallEnough(locator, label) {
  const box = await locator.boundingBox()
  expect(box, `${label}: no box`).not.toBeNull()
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(64)
}

test('targets: every step at 390 — buttons 56 px and hit-tested, Sign in and Sign out 64 px, SAMPLE, no sideways scroll, contrast, the sticky header', async ({ page, context, request }) => {
  test.setTimeout(120_000)
  await fresh(context, request)
  const manager = await managerToken(request)
  await addNoticeViaApi(request, manager, { unit_id: 'u_cove', severity: 'outbreak', message: 'SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask and clean your hands before you go in.' })
  await addNoticeViaApi(request, manager, { unit_id: null, severity: 'info', message: 'SAMPLE notice: the side door is closed for painting this week. Please use the main entrance.' })
  // A busy day at the home: enough notices that the resident step is taller than the phone, so it really scrolls under the header.
  for (const [unit_id, message] of [[null, 'SAMPLE notice: the parking lot is being paved on Tuesday. Please park on the street.'],
    [null, 'SAMPLE notice: the coffee shop in the front lobby is closed until the end of the month.'],
    ['u_cove', 'SAMPLE notice: Cove unit has a family evening on Friday at 7:00 PM in the sunroom. Everyone is welcome.']]) {
    await addNoticeViaApi(request, manager, { unit_id, severity: 'info', message })
  }
  // Eight questions (the home may have up to 10): enough below the first answers for them to scroll up under the header.
  const QUESTIONS = [...EXAMPLE_SCREENING.questions, ...['have you been out of the province in the last two weeks',
    'has anyone in your house been sick in the last two days', 'do you have a rash you cannot explain',
    'have you had a sore throat since yesterday', 'have you been told to wait for a test result',
    'are you waiting to hear from public health'].map((q) => `SAMPLE question: ${q}?`)]
  await setScreeningViaApi(request, manager, { enabled: true, stop_message: EXAMPLE_SCREENING.stop_message, questions: QUESTIONS })

  await page.goto('/')
  await expect(page.getByText('Sign in to visit')).toBeVisible()
  await expect(page.locator('.sample-badge')).toBeVisible()
  await expect(page.locator('.sample-badge')).toHaveText('SAMPLE')
  await everyButton(page, 'details')
  await type(page, page.locator('#name'), 'Linda K. (SAMPLE)')
  await type(page, page.locator('#phone'), '709-555-0111')
  await tap(page, page.locator('#continue'), 'Continue')
  await expect(page.getByText('Who are you visiting?')).toBeVisible()
  await everyButton(page, 'search')
  await type(page, page.locator('#search'), 'ag')
  await expect(page.locator('button.resident')).toHaveCount(1)
  await everyButton(page, 'search results')
  await tap(page, page.locator('button.resident[data-resident="r_agnes"]'), 'Agnes')
  await expect(page.locator('#resident-name')).toHaveText('Agnes D. (SAMPLE)')
  await expect(page.locator('#screening .question')).toHaveCount(QUESTIONS.length)
  await everyButton(page, 'resident with a notice and screening')

  const signIn = page.locator('#sign-in')
  await tallEnough(signIn, 'Sign in')
  // The sticky header: scrolled so each sits at the top edge, Sign in and every answer button are still what a tap hits.
  let reachedTop = 0
  for (const target of [signIn, ...(await page.locator('button.answer').all())]) {
    await target.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    // Where it landed decides only whether the dangerous spot was reached; whether it is covered is decided by the hit-test below.
    const [top, headerBottom] = await target.evaluate((el) => [el.getBoundingClientRect().top, document.querySelector('[data-sticky-header]').getBoundingClientRect().bottom])
    if (top <= headerBottom + 40) reachedTop++
    const label = `under the sticky header: ${(await target.getAttribute('id')) || (await target.textContent()).trim()}`
    // A point just inside the top edge, not only the centre: a header taller than the scroll padding covers the top first.
    const box = await target.boundingBox()
    const topHit = await target.evaluate((el, [x, y]) => {
      const t = document.elementFromPoint(x, y)
      return t === el || el.contains(t) ? '' : t ? t.outerHTML.slice(0, 120) : 'nothing'
    }, [box.x + box.width / 2, box.y + 6])
    expect(topHit, `${label}: its top edge is covered`).toBe('')
    await expectTapTarget(page, target, 56, label)
  }
  expect(reachedTop, 'at least one target must reach the header, or the sticky header check measures nothing').toBeGreaterThanOrEqual(1)

  await tap(page, page.locator('#confirm-notice'), 'I have read it')
  await tap(page, page.locator('#screening .question').nth(0).locator('button.answer[data-answer="no"]'), 'No')
  await tap(page, page.locator('#screening .question').nth(1).locator('button.answer[data-answer="yes"]'), 'Yes')
  await expect(page.locator('#stop')).toBeVisible()
  await everyButton(page, 'stop')
  await tap(page, page.locator('#stop-back'), 'I tapped Yes by mistake')
  for (let i = 0; i < QUESTIONS.length; i++) await tap(page, page.locator('#screening .question').nth(i).locator('button.answer[data-answer="no"]'), 'No')
  await expect(signIn).toBeEnabled()
  expect(await contrastOf(signIn), 'Sign in contrast').toBeGreaterThanOrEqual(4.5)
  await tap(page, signIn, 'Sign in')

  await expect(page.locator('#signed-in')).toBeVisible()
  await expect(page.locator('.sample-badge')).toBeVisible()
  await everyButton(page, 'signed in')
  await tallEnough(page.locator('#sign-out'), 'Sign out')
  await tap(page, page.locator('#sign-out'), 'Sign out')
  await expect(page.locator('#signed-out')).toBeVisible()
  await everyButton(page, 'signed out')

  await page.goto('/')
  await expect(page.locator('#name')).toHaveValue('Linda K. (SAMPLE)')
  await everyButton(page, 'details, remembered')
  await tap(page, page.locator('#continue'), 'Continue')
  await type(page, page.locator('#search'), 'el')
  await tap(page, page.locator('button.resident[data-resident="r_ellen"]'), 'Ellen')
  await expect(page.locator('#blocked')).toBeVisible()
  await everyButton(page, 'blocked')

  await page.goto(`/out/?t=${'A'.repeat(43)}`)
  await expect(page.locator('#link-error')).toBeVisible()
  await expect(page.locator('.sample-badge')).toBeVisible()
  await everyButton(page, 'link error')

  await page.goto('/privacy/')
  await expect(page.locator('.sample-badge')).toBeVisible()
  await expect(page.locator('#privacy')).toContainText('30 days')
  await everyButton(page, 'privacy')
  assertNoThirdParty(context)
})
