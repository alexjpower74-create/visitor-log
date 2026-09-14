// Visitor Log end-to-end suite. Lead-owned: slices ask the lead for changes in their report.
// Every spec runs against the real Worker (it serves app/public), started fresh by tests/start-worker.mjs on E2E_PORT
// with TEST_MODE=1. One worker: the specs share one D1.
//   vl2:  E2E_PORT=8403 npx playwright test tests/staff
//   vl1:  E2E_PORT=8404 npx playwright test tests/visit
//   lead: E2E_PORT=8408 npx playwright test tests/journey    QA: E2E_PORT=8409 npx playwright test
// E2E_WORKER_DIR points the server at a copy of worker/ (negative controls); default ../worker.
// Devices: visitors use their own phones (390 wide, touch). Staff use the nurse's-desk tablet (1024x768, touch) or a phone.
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 8403)

export const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  tablet: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
}

const engines = ['chromium', 'webkit']

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: './tests/results',
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/start-worker.mjs',
    url: `http://127.0.0.1:${PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { E2E_PORT: String(PORT), E2E_WORKER_DIR: process.env.E2E_WORKER_DIR || '' },
  },
  projects: engines.flatMap((e) => [
    { name: `${e}-390`, use: { browserName: e, ...DEVICES.phone }, testMatch: ['visit/**/*.spec.mjs', 'staff/**/*.spec.mjs'] },
    { name: `${e}-tablet`, use: { browserName: e, ...DEVICES.tablet }, testMatch: ['staff/**/*.spec.mjs', 'journey/**/*.spec.mjs'] },
  ]),
})
