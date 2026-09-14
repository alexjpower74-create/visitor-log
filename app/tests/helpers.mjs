// Shared e2e helpers. Lead-owned: slices import them and ask the lead for changes in their report.
// REAL input only: tap() hit-tests the target's centre with elementFromPoint before a real touch or click, typing is
// page.keyboard, and evaluate is only ever used to read. Setting up data through the API is fine; the thing under test is
// always driven through the page. Adapted from Daycare Day Sheet.
import { expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { DEVICES } from '../playwright.config.mjs'

export const NOW = '2026-09-14T17:30:00Z' // Mon Sep 14 2026, 3:00 PM NDT: Harbour afternoon window, Lighthouse and Cove open
export const at = (localIso) => new Date(localIso).toISOString() // e.g. at('2026-09-14T21:00:00-02:30')
export const HOME = 'SAMPLE Harbourview Care Home (demo)'
export const MANAGER_PIN = '7314' // Donna R. (SAMPLE)
export const STAFF_PIN = '2580' // Carl B. (SAMPLE); Amira H. (SAMPLE) is 4691
export const STAFF2_PIN = '4691'
export const PORT = Number(process.env.E2E_PORT || 8403)
export const BASE = `http://127.0.0.1:${PORT}`
const HERE = path.dirname(fileURLToPath(import.meta.url))

/** The screening example from docs/API.md (the settings page's "Use the example"). */
export const EXAMPLE_SCREENING = {
  label: "Example only. Change the words to your home's own before you turn screening on.",
  questions: [
    'Do you feel sick today, for example with a fever, cough, vomiting or diarrhea?',
    'Has public health or a doctor told you to stay home right now?',
  ],
  stop_message: "Please don't visit today. Call the unit if you need to talk with someone.",
}

// ---------- context setup ----------
const LOCAL = new Set(['127.0.0.1', 'localhost'])
const isThirdParty = (url) => /^https?:$/.test(url.protocol) && !LOCAL.has(url.hostname)

/** Pinned server clock and a record of anything that tried to leave this computer. */
export async function guardContext(context, { now = NOW } = {}) {
  await context.setExtraHTTPHeaders({ 'X-Test-Now': now })
  const offenders = []
  context.__offenders = offenders
  await context.route(isThirdParty, (route) => {
    offenders.push(route.request().url())
    return route.abort()
  })
}

/** Move the server clock the pages see (every later request from this context carries it). Only ever forward. */
export async function setNow(context, now) {
  await context.setExtraHTTPHeaders({ 'X-Test-Now': now })
}

/** Fail when any request tried to reach a host other than 127.0.0.1. */
export function assertNoThirdParty(context) {
  expect(context.__offenders ?? [], 'requests that tried to leave 127.0.0.1').toEqual([])
}

/** Every test starts here: a clean SAMPLE home and a guarded context. */
export async function fresh(context, request, { now = NOW } = {}) {
  await guardContext(context, { now })
  const r = await request.post('/api/test/reset', { headers: { 'X-Test-Now': now } })
  expect(r.status(), 'POST /api/test/reset').toBe(200)
}

/** Another person on another device: 'phone' (a visitor, or staff on a phone) or 'tablet' (the nurse's desk). Same engine. */
export async function newContext(browser, kind, { now = NOW } = {}) {
  const context = await browser.newContext({ ...DEVICES[kind], baseURL: BASE })
  await guardContext(context, { now })
  return context
}

// ---------- real input ----------
export const isCoarse = (page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches)

async function hitTest(locator, x, y) {
  return locator.evaluate((el, [px, py]) => {
    const t = document.elementFromPoint(px, py)
    return t === el || el.contains(t) ? '' : t ? t.outerHTML.slice(0, 160) : 'nothing'
  }, [x, y])
}

/** Hit-test the centre with elementFromPoint, then a real touch (coarse pointer) or mouse click. */
export async function tap(page, locator, label = String(locator)) {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  let box = await locator.boundingBox()
  expect(box, `tap(${label}): no box`).not.toBeNull()
  // "In view" to Playwright includes under a sticky header, where a person could not tap it. Pages mark sticky headers
  // with data-sticky-header; only in that case scroll the target to the middle first. Anything else on top still fails.
  const headerBottom = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[data-sticky-header]')].map((h) => h.getBoundingClientRect().bottom)))
  if (box.y + box.height / 2 < headerBottom) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    box = await locator.boundingBox()
  }
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  expect(await hitTest(locator, x, y), `tap(${label}) hit-test at ${Math.round(x)},${Math.round(y)}: something else is on top`).toBe('')
  if (await isCoarse(page)) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** Tap into a field and type. clear: select what is there first so typing replaces it. */
export async function type(page, locator, text, { clear = false } = {}) {
  await tap(page, locator)
  await expect(locator).toBeFocused()
  const before = clear ? '' : await locator.inputValue()
  if (clear) { await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace') }
  // Touch projects send text the way a phone's on-screen keyboard does (insertText): Chromium's emulated touch silently drops
  // key presses typed straight after a touch tap (found on Firewood Orders). Mouse projects would use real key presses.
  if (await isCoarse(page)) await page.keyboard.insertText(String(text))
  else await page.keyboard.type(String(text))
  await expect(locator, 'type(): the field should hold what was typed').toHaveValue(before + String(text))
}

/** Tap PIN digits on an on-screen keypad (buttons .key[data-key]), then the submit button. */
export async function keypad(page, pin, submit) {
  for (const d of String(pin)) await tap(page, page.locator(`button.key[data-key="${d}"]`), `key ${d}`)
  if (submit) await tap(page, submit, 'keypad submit')
}

/** Size + hit-test for a tap target (size from the box is fine; occlusion only from elementFromPoint). */
export async function expectTapTarget(page, locator, min = 44, label = String(locator)) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box, `${label}: no box`).not.toBeNull()
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(min)
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(min)
  expect(await hitTest(locator, box.x + box.width / 2, box.y + box.height / 2), `${label}: something else is on top`).toBe('')
}

/** No sideways scroll on the page. */
export async function expectNoHorizontalScroll(page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw, 'page scrolls sideways').toBeLessThanOrEqual(cw)
}

/** WCAG contrast of an element's computed text colour on its first opaque background up the tree. */
export async function contrastOf(locator) {
  return locator.evaluate((el) => {
    const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number)
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fg = parse(getComputedStyle(el).color)
    let n = el; let bg = null
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n)
      const c = parse(cs.backgroundColor)
      if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) { bg = c; break }
      if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []
        const ratios = stops.map((s) => { const b = parse(s); const [a, d] = [lum(fg), lum(b)].sort((x, y) => y - x); return (a + 0.05) / (d + 0.05) })
        if (ratios.length) return Math.min(...ratios)
      }
      n = n.parentElement
    }
    bg = bg || [11, 16, 32]
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  })
}

/** The severity colour a person sees: the computed --sev colour on an element with data-severity, as "rgb(r, g, b)". */
export async function sevColour(locator) {
  return locator.evaluate((el) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--sev)'
    el.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
}
export const SEV_RGB = { info: 'rgb(165, 180, 252)', restricted: 'rgb(251, 191, 36)', outbreak: 'rgb(248, 113, 113)' }

// ---------- API setup helpers (setup only; never for the thing under test) ----------
export async function api(request, method, url, data, headers = {}, { now = NOW } = {}) {
  const r = await request.fetch(url, { method, data, headers: { 'X-Test-Now': now, ...headers } })
  let body = null
  const text = await r.text()
  try { body = JSON.parse(text) } catch { body = text }
  return { status: r.status(), body, type: r.headers()['content-type'] || '', headers: r.headers() }
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` })

export async function staffToken(request, pin = STAFF_PIN, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/signin', { pin }, { 'X-Test-IP': `setup-${pin}` }, { now })
  expect(r.status, `sign in with SAMPLE PIN ${pin}`).toBe(200)
  return r.body.token
}
export const managerToken = (request, opts) => staffToken(request, MANAGER_PIN, opts)

/** A visitor signs in through the API (setup). Returns { token, out_url, visit }. */
export async function visitorSignInViaApi(request, { name, phone, resident_id, answers, notice_confirmed }, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/visitor/signin', { name, phone, resident_id, answers, notice_confirmed }, {}, { now })
  expect(r.status, `visitorSignInViaApi ${resident_id}: ${JSON.stringify(r.body)}`).toBe(201)
  return r.body
}
export async function visitorSignOutViaApi(request, token, { now = NOW } = {}) {
  const r = await api(request, 'POST', `/api/visit/${token}/signout`, {}, {}, { now })
  expect(r.status, `visitorSignOutViaApi: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}
export async function buildingViaApi(request, token, { now = NOW } = {}) {
  const r = await api(request, 'GET', '/api/staff/building', undefined, bearer(token), { now })
  expect(r.status, `buildingViaApi: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}
/** Add a notice as the manager (setup). unit_id null = the whole home. Returns the notice id. */
export async function addNoticeViaApi(request, mToken, { unit_id = null, severity, message }, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/settings/notices', { unit_id, severity, message }, bearer(mToken), { now })
  expect(r.status, `addNoticeViaApi: ${JSON.stringify(r.body)}`).toBe(201)
  return r.body.id
}
/** Turn screening on or off as the manager (setup). Returns the settings. */
export async function setScreeningViaApi(request, mToken, { enabled, stop_message, questions }, { now = NOW } = {}) {
  const r = await api(request, 'PUT', '/api/settings/screening',
    { enabled, stop_message, questions: questions.map((q) => (typeof q === 'string' ? { text: q } : q)) }, bearer(mToken), { now })
  expect(r.status, `setScreeningViaApi: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body.settings
}

// ---------- QR codes ----------
/** Decode the QR code a person would scan: a real screenshot of the element, read with jsQR. Returns the text or null. */
export async function decodeQr(locator) {
  await expect(locator).toBeVisible()
  const png = PNG.sync.read(await locator.screenshot({ animations: 'disabled' }))
  const found = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height)
  return found ? found.data : null
}

// ---------- screenshots ----------
/** Viewport screenshot into app/tests/<dir>/shots/<project>-<name>.png (dir: visit | staff | journey). Viewport, not full page:
 *  full-page captures misplace sticky and fixed bars on phone screens (found on Firewood Orders). */
export async function shot(page, testInfo, dir, name) {
  const out = path.join(HERE, dir, 'shots')
  mkdirSync(out, { recursive: true })
  await page.waitForTimeout(60)
  await page.screenshot({ path: path.join(out, `${testInfo.project.name}-${name}.png`), animations: 'disabled' })
}
