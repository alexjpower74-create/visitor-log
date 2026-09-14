# Visitor Log: build report (vl-lead)

Overnight build 2026-09-14. Lead `vl-lead` (Opus xhigh), slices `vl1` (Worker + visitor pages) and `vl2` (staff pages + settings),
both Opus medium, run with Rig in herdr tabs. Local only: nothing deployed, nothing sent, SAMPLE home and people only.
Every number below was measured in a QA worktree pinned to the sha shown (`rig qa --ref <sha> --port 8409`), never in a slice's own
tree. Pass/fail comes from each command's own exit code, echoed inside the run.

## Final QA

_Not run yet._

## QA history

### 1. main `3885c0c` (vl1 M1 Worker core + vl2 M1 pages merged), 18:00

Command: `rig qa --ref 3885c0c --port 8409 --run 'cd worker && PORT=8409 npm test …; echo WORKER_EXIT=$?; NEG_PORT=8409 npm run negative …; echo NEGATIVE_EXIT=$?'`

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Worker unit (time, hours, rules, retention) | 23 | 0 | 0 |
| Worker on an empty D1 | 1 | 0 | 0 |
| Worker API + count property (`wrangler dev --local`, `TEST_MODE`) | 36 | 0 | 1 (inactive resident search: no M1 route can turn a resident off) |
| Worker negative controls | 7 red of 7 | | |

`WORKER_EXIT=0`, `NEGATIVE_EXIT=0`. Each control's red was read in `worker/tests/negative-control.log`: every one failed on an
assertion about the broken behaviour (screening: expected 403, got 201; link expiry: expected 200 at 11:59:59 PM, got 410; retention
setting: expected 0 rows, got 1; retention boundary: expected 1 row, got 0; notice unit, auto-out and hours: deep-equal mismatches),
none on a connection error or a Worker that failed to start. No 84xx port was left listening.

Before merging vl1 M1 the lead read `worker/src/world.js` (the one "in the building at T" rule), `rules.js` (the visitor sign-in checks
in API.md's order) and `maintenance.js` (auto sign-out and the retention cutoff `date < today − retention_days`). Before merging vl2 M1
the lead read `app/public/common/api.js`, checked every `/api/…` path the staff and settings pages call against API.md, and looked at
the tablet and 390 "In the building" screenshots.

### 2. main `fc76437` (vl2 M1b polish + vl1 M2 Worker merged), 18:24

Command: `rig qa --ref fc76437 --port 8409 --run 'cd worker && PORT=8409 npm test …; echo WORKER_EXIT=$?; NEG_PORT=8409 npm run negative …; echo NEGATIVE_EXIT=$?; RED_COUNT…; CONN_ERRORS…'`

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Worker unit (csv, hours, retention, rules, time) | 26 | 0 | 0 |
| Worker on an empty D1 | 1 | 0 | 0 |
| Worker API M1 + count property + M2 | 48 | 0 | 0 |
| Worker first setup (the tool's SQL, Worker **without** `TEST_MODE`) | 1 | 0 | 0 |
| Worker negative controls (M1 a–g, M2 h–l) | 12 red of 12 | | |

`WORKER_EXIT=0`, `NEGATIVE_EXIT=0`, `RED_COUNT=12`, no connection errors in the control output, `rig qa` exit 0, QA ports free after.
Before merging vl1 M2 the lead read `worker/src/rollcall.js` (the list is recomputed from visits; a second Start is refused by the
insert itself) and `csv.js`. `worker/tools/first-setup.mjs` holds literal control bytes in a regex (git shows it as binary); vl1 fixes
it in M3 with escapes.

**A QA run that did not run.** The first attempt at this QA (18:22) never tested anything: QA 1's negative controls had appended to
`worker/tests/negative-control.log`, a tracked file, in the QA worktree, so `rig qa` could not check out `fc76437`, and the command's
trailing `echo` still printed "done" with exit 0. Caught by reading the output, not the exit code. Every later QA run first shows the QA
worktree's `git status`, restores that log, and reports `rig qa`'s own exit code.

### 3. main `823f7f7` (vl2 M2 staff specs merged), 18:45

Command: `rig qa --ref 823f7f7 --port 8409 --run '…'` (QA worktree `git status` shown and tracked logs restored first; `app/node_modules` linked).

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Worker unit | 26 | 0 | 0 |
| Worker on an empty D1 | 1 | 0 | 0 |
| Worker API M1 + property + M2 | 48 | 0 | 0 |
| Worker first setup (no `TEST_MODE`) | 1 | 0 | 0 |
| Worker negative controls | 12 red of 12 | | |
| Playwright staff pages (26 tests × chromium/webkit × 390/tablet) | 104 | 0 | 0 |
| Staff page negative controls (stale-total, no-overdue, overlay, notice-unit, example-saves, header-see-through, time-wraps, stacked-buttons) | 8 red of 8 | | |

Every exit code 0 (`WORKER_EXIT`, `NEGATIVE_EXIT`, `STAFF_E2E_EXIT`, `STAFF_NEGATIVE_EXIT`, `rig qa`); QA ports free after.

Notes from the slices' reports that belong in the record:
- vl2: `elementFromPoint` cannot catch a see-through sticky header (the header is on top either way), so the header check asserts an
  opaque background and that assertion is what went red. In **mobile WebKit** Playwright has no mouse wheel and no touch drag, so that
  one test scrolls with `window.scrollBy` there, recorded as a test annotation; Chromium uses a real wheel. Known gap: script, not input.
- vl1: its first "the sticky header never covers a button" check passed while the 112 px header covered buttons (fixed 96 px scroll
  padding): the page was too short for a button to reach the header. The check was given a guard that a target must reach the header
  (red: "measures nothing"), then 8 screening questions so it could (red: "its top edge is covered"), then the fix (padding follows the
  measured header) and control (r).
- vl1 found the lead's journey spec failing at the roll-call step: `getByText(/1 of 1 found/)` matched two elements (strict mode).
  Narrowed to `#roll-call-progress` (bccf7ff). Its untracked run of the fixed journey passed in both tablet engines.

### 4. main `bccf7ff` (vl1 M3 visitor pages + the first journey fix), 18:57

First run of the whole Playwright suite and of every control. Command as QA 3, plus `npx playwright test` (all specs), the visitor
controls (`NEG_PORT=8409`) and `tests/journey/negative-journey.mjs`.

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Worker unit / empty D1 / API / first setup | 26 / 1 / 49 / 1 | 0 | 0 |
| Worker negative controls (a–l + q closed-unit-hidden) | 13 red of 13 | | |
| Playwright, all specs (chromium-390 34, webkit-390 34, chromium-tablet 27, webkit-tablet 27) | 122 | 0 | 0 |
| Staff page negative controls | 8 red of 8 | | |
| Visitor page negative controls (stale-notice, yes-posts, overlay, forget-me, header-covers) | 5 red of 5 | | |
| **Journey negative control** | **stayed green** | | |

**The journey's check measured nothing.** The control gives every resident every notice in a Worker copy; the journey still passed.
The visitor page draws `unit_notices` as the API sends them, so the break did reach the page. The journey's step 7 asserted
`getByText(OUTBREAK)` count 0 *before* anything proved Frank's details had loaded, so it passed on a page that had not drawn them yet.
Fix 1 (`6b5bbb8`): assert `#resident-name` is "Frank O. (SAMPLE)" and `#sign-in` is enabled (the page sets both in the same step that
draws the unit's notices), then the zero count. Re-run at `6b5bbb8`: **the control went red exactly at that line** (114).
The same fix made step 13 honest, and it then failed in both engines for two real reasons in the spec: Chromium's `fill` on the day-log
date raced the tab's first load (which set the date back to today: 0 rows), and in WebKit the clock jump of a month had expired the
desk's 12-hour staff session, so the page was correctly back at the keypad. Fix 2 waits for the heading of today before moving, taps
Previous (real input), signs the desk in again after the jump, and waits for the "Mon Sep 14" heading (drawn from the answer with its
rows) before counting zero rows. Re-run pinned at `516a3e2` (19:04): **journey 2 passed** (chromium-tablet 13.6 s, webkit-tablet
19.5 s), **journey negative control red as intended** at `await expect(grace.getByText(OUTBREAK)).toHaveCount(0)`.

### Cross-review rounds (defects found across the slice boundary)

- **vl1 read vl2's M1 pages** (before its M2): every request body and query matched; three Worker-side calls taken from it
  (a unit's own name, the last-manager guard on a role change, date and unit fields).
- **vl2 read vl1's M1 Worker** (before its M2): two staff sign-in mismatches (resident not checked first; the visitor's wording on
  the staff name). Both were already fixed in vl1 M2.
- **vl1 drove vl2's M2 pages against the real Worker** (18:46–18:56, merged 6c3d0bb), both engines at 1024 and 390, 117 checks per
  engine. Right: counts, overdue, a roll call ticked from two phones at the same moment counted once, day log, CSV byte for byte,
  every field error, every PLAN.md word. **Four defects a person would hit, routed to vl2 as M4:** (1) a closed unit with a visitor
  still in shows a green "Open" pill; (2) "0 in the building" shows before the first answer, a guessed zero on a slow tablet; (3) a
  refused Show leaves the previous contact list under the new dates; (4) the 390 header cuts "(SAMPLE)" off the staff name.
- **The lead's journey spec** was run by vl1 and failed at a strict-mode locator on the roll call page; fixed (bccf7ff).

## Known gaps

- **One test scrolls with script in WebKit.** vl2's sticky-header check scrolls with `window.scrollBy` in mobile WebKit, because
  Playwright has no mouse wheel or touch drag there (recorded as a test annotation); Chromium scrolls with a real wheel.
- **Tested in Playwright's phone and tablet emulation** (390 wide and 1024×768, chromium + webkit), not on a real phone at a real door
  or a real nurse's-desk tablet.
- **No rate limit on visitor sign-ins.** Anyone who can open the sign-in page could fill the log with made-up visits. The resident
  search needs 2 characters and returns at most 8 names, but someone patient could still list the residents two letters at a time.
- **The sign-out link is a capability link.** Anyone holding a visitor's link can sign that visit out until midnight. It never shows
  the phone number or another visit.
- **An automatic sign-out at closing may catch someone who is still inside.** The staff page lists those as "not confirmed" so a
  count of zero is never trusted blindly.
- **Visiting hours are the same every day** (1 to 4 windows per unit): no weekday, weekend or holiday schedule.
- **One sign-in is one person.** Children and anyone without a phone are signed in at the desk.
- **No offline mode.** A visitor needs data or Wi-Fi at the door, and the desk needs the Worker.
- **Staff sessions last 12 hours** (by design): a desk tablet goes back to the keypad after a shift.
- **"Deleted" means deleted from the live database.** D1's Time Travel can restore a database to an earlier point for its window.
- **No privacy review yet.** The privacy notice's wording and the retention period need the home's privacy officer (PHIA / ATIPPA as
  they apply) before real visitors use it.

## Contract changes made during the build

- vl2 asked what a staff sign-in with no resident returns → API.md: 400 `field: "resident_id"`, checked first (6be6cde).
- vl1 found the lead's across-midnight counts in PLAN.md were wrong (2 at 8:59 PM, 1 at 9:00 PM, not 3 and 2); PLAN.md fixed, the rule
  unchanged. API.md gained the `created_label` format, form-value numbers, `""` for the whole home / no limit, and the staff sign-in
  check order (508c11a).
- vl1's M2 found that closing a unit would drop a visitor who is still in from the building view and the fire-drill total. Decided:
  the building view also lists a closed unit that still has visitors in, with `active` on each unit (DECISIONS #18). The same commit
  made vl1's calls contract where API.md was silent: bad contact-list dates on `from`/`to`, a closed or unknown unit on `unit_id`,
  staff name and role fields, the last-manager guard on a role change, a unit keeping its own name when edited (ead4387).
