// The printable door sign against the real Worker. The QR is decoded from a real screenshot with jsQR. Negative control:
// negative-qr-wrong-path.
import { test, expect } from '@playwright/test'
import { BASE, HOME, fresh, decodeQr, assertNoThirdParty } from '../helpers.mjs'

test('the door sign QR decodes to the sign-in page, with the home name and SAMPLE', async ({ page, context, request }) => {
  await fresh(context, request)
  await page.goto('/settings/door-sign/')
  await expect(page.locator('#door-home')).toHaveText(HOME)
  await expect(page.locator('#door-sample')).toBeVisible()
  await expect(page.locator('#door-sample')).toHaveText('SAMPLE')
  await expect(page.getByRole('heading', { name: 'Visitors: please sign in and out' })).toBeVisible()
  await expect(page.getByText("Point your phone's camera at this code")).toBeVisible()
  await expect(page.getByText('No app needed.')).toBeVisible()
  const qr = page.locator('#door-qr')
  const box = await qr.boundingBox()
  expect(box.width, 'the QR is at least 240 px').toBeGreaterThanOrEqual(240)
  expect(await decodeQr(qr), 'the door QR opens the sign-in page').toBe(`${BASE}/`)
  await expect(page.locator('#door-url')).toHaveText(`${BASE}/`)
  assertNoThirdParty(context)
})

test('printed, the door sign is white and the Print button is hidden', async ({ page, context, request }) => {
  await fresh(context, request)
  await page.goto('/settings/door-sign/')
  await expect(page.locator('#door-home')).toHaveText(HOME)
  await expect(page.locator('#print-sign')).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#print-sign')).toBeHidden()
  const bg = await page.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor])
  expect(bg, 'white page and body under print').toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 255)'])
  expect(await page.locator('.aurora').count(), 'no aurora on the door sign').toBe(0)
  await expect(page.locator('#door-home')).toBeVisible()
  await expect(page.locator('#door-sample')).toBeVisible()
  expect(await decodeQr(page.locator('#door-qr')), 'the QR still decodes in print').toBe(`${BASE}/`)
  assertNoThirdParty(context)
})
