// Shared steps for the vl2 specs (staff pages and settings). Real input only, through the lead's helpers in ../helpers.mjs.
import { expect } from '@playwright/test'
import { keypad, tap, MANAGER_PIN, STAFF_PIN, visitorSignInViaApi } from '../helpers.mjs'

/** Staff sign in on the keypad; lands on In the building. */
export async function staffSignsIn(page, pin = STAFF_PIN) {
  await page.goto('/staff/')
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
  await keypad(page, pin, page.locator('#pin-enter'))
  await expect(page.getByRole('tab', { name: 'In the building', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#building-total')).toBeVisible()
}

/** The manager signs in on Settings; lands on Notices. */
export async function managerOpensSettings(page, pin = MANAGER_PIN) {
  await page.goto('/settings/')
  await expect(page.getByRole('heading', { name: 'Manager sign in' })).toBeVisible()
  await keypad(page, pin, page.locator('#pin-enter'))
  await expect(page.getByRole('tab', { name: 'Notices', exact: true })).toHaveAttribute('aria-selected', 'true')
}

export async function openTab(page, name) {
  const t = page.getByRole('tab', { name, exact: true })
  await tap(page, t, `${name} tab`)
  await expect(t).toHaveAttribute('aria-selected', 'true')
}

export const totalNumber = (page) => page.locator('#building-total .total-number')

/** A SAMPLE visitor for visitorSignInViaApi. */
export const visitor = (name, phone, resident_id) => ({ name: `${name} (SAMPLE)`, phone, resident_id })

export async function signInVisitors(request, list, opts) {
  for (const v of list) await visitorSignInViaApi(request, v, opts)
}

/** visitor name → visit id, from a GET /api/staff/building answer. */
export const visitIds = (b) => Object.fromEntries(b.units.flatMap((u) => u.visits.map((v) => [v.visitor_name, v.id])))
