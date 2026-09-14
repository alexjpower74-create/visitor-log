# Build report — vl2 (staff pages and settings)

## M1 — pages (DONE, 2026-09-14, merged as 23c63e8)

### What I built
- `app/public/common/`: `api.js` (same-origin fetch per docs/API.md, token in `localStorage` `visitor-log:staff-token`, who signed in
  in `visitor-log:staff-who`, a 401 clears both and sends the page back to the keypad, errors keep the API's `error`/`field`, CSV
  download through a Blob with the API's filename), `keypad.js` (`button.key[data-key]`, Clear, `#pin-enter`, `#pin-error`
  `role="alert"`, 64 px), `ui.js` (DOM builder, notice card, tabs with `role="tab"` and `#tab=` in the hash, errors placed under
  `[data-error-for="<field>"]`, inline confirm, poller, date arithmetic on `YYYY-MM-DD` strings only), `qr.js` (canvas QR from the
  vendored library, 4-module quiet zone), `style.css`, and `api.mock.js` (development only, `?mock=1`, same shapes as API.md).
- `/staff/`: keypad "Staff sign in"; sticky header (`data-sticky-header`) with home + SAMPLE, the API's date and time, staff name,
  Settings for a manager, Sign out. Tabs:
  - **In the building**: `#building-total`, roll call banner, a card per unit `[data-unit]` (hours, Open/Closed, notices, `.unit-count`),
    rows `[data-visit][data-overdue]` with tel link, "In since", "Signed in by staff", "Overdue since <due_label>", Sign out →
    inline "Sign out <name>?" `button.confirm-sign-out` / Cancel; `#auto-today`. Polls 5 s. Rows are reconciled by id: a row with an
    open confirmation, under a finger (pointerdown → 400 ms after pointerup) or holding focus is never replaced or moved; a poll
    that was in flight when a sign-out happened is discarded. After a sign-out the row, its unit count and the total drop at once
    from the answer, then the page re-reads the building.
  - **Roll call**: `#start-roll-call` → `#confirm-roll-call`; `#roll-call-progress`, entries grouped by unit `[data-roll]` with
    `button.found` (`aria-pressed`, 64 px) "Found"/"Not found yet", after-start tag, "Signed out at", who found them; red edge until
    found; `#end-roll-call` → `#confirm-end-roll-call`; "Ended 3:20 PM · 5 of 5 found" (ticks disabled). Polls 3 s with the same
    row locking. A roll call ended on another device still shows as ended here.
  - **Day log**: `#log-prev`, `#log-date`, `#log-next` (off at today), `#log-unit`, `#log-count`, `#log-table` rows `[data-log-visit]`,
    Out as "9:00 PM Auto" / "Still in".
  - **Contact list**: `#contacts-from`/`#contacts-to` (today from the API), `#contacts-unit`, `#contacts-show` → `#contacts-count` + table
    `[data-contact-row]`; `#download-contacts` reads the pickers at the moment of the tap; retention line from `/api/info`.
  - **Sign someone in**: `#manual-resident` grouped by unit ("Ellen W. (SAMPLE), Room 108, by arrangement"), `#manual-name`,
    `#manual-phone`, screening questions (texts from `GET /api/visitor/start`) + `#manual-screened` when on, `#manual-submit`,
    `#manual-result` "Signed in <visitor_name> at <in_label>", `#manual-warnings`.
- `/settings/`: keypad "Manager sign in"; a staff PIN signs in and the keypad shows the API's 403 text. Tabs Notices, Screening,
  Visits and privacy, Units and hours, Residents, Staff, Door sign with every id in PLAN.md's Design. Lists re-render from each
  write's `settings`; forms being typed in are not overwritten. "Use the example" fills questions and stop message and shows
  `#example-label`, never saves or flips the switch. Time inputs cannot hold `24:00`, so a window ending at 12:00 AM is sent as
  `24:00` (and `24:00` is shown as 00:00, with a hint on the form).
- `/settings/door-sign/`: white letter page, home name + SAMPLE from `GET /api/info` (no token), "Visitors: please sign in and out",
  "Point your phone's camera at this code", `#door-qr` canvas (≥ 240 px) for `location.origin + "/"`, the address, "No app needed.",
  `#print-sign` (`.no-print`).
- `app/tests/staff/serve-mock.mjs` (static dev server, 127.0.0.1:8401) and `app/tests/staff/shots-mock.mjs` (smoke + screenshots).

### Verified, and how it could have failed
`node tests/staff/shots-mock.mjs all` against the mock on 8401, chromium and webkit, phone 390 and tablet 1024: **all good** in all
four. It drives every tab by clicks and fails on: any page error or console error; a wrong PIN not showing "That PIN is not right.";
**a 5 s poll closing an open sign-out confirmation** (waits 6 s with it open); the total not dropping by exactly one after a
sign-out; roll call progress not reading "0 of N found" then "1 of N found"; the day log's Previous not showing Sep 13; the CSV
download's suggested filename not being `visitor-contacts-all-units-2026-09-13-to-2026-09-14.csv` or its header not exact with CRLF;
the manual sign-in for Ellen not showing the by-arrangement warning word for word; the screening Save with the switch on and no
questions not showing the message under the questions; retention 0 not showing its message under `#retention-days` and 14 not
updating the line; a taken PIN not showing under `#staff-pin`; **the door sign QR not decoding (jsQR on a real screenshot) to
`http://127.0.0.1:8401/`**; `#print-sign` visible under print media.
- The script did go red once for a real reason: the first mock reset its data on every request when the page had `?mockreset=1`,
  so the sign-out and roll call waits timed out in both projects. Fixed in the mock; that is evidence the waits can fail.
- **Not proven red yet:** the poll-closes-confirmation and total-drops checks in this smoke script have not been run against a
  deliberately broken copy. The real negative controls (`stale-total`, `overlay`, …) are M2 work against the Worker.
  The M1 results come from the mock, not the Worker.
- Screenshots: `app/tests/staff/shots/chromium-{390,tablet}-*.png` (every tab). WebKit copies go to the git-ignored
  `app/tests/results/vl2-webkit-shots/`.

### Questions for the lead — ANSWERED (vl-lead, M1 merge)
1. Staff sign-in with no resident → 400 `field: "resident_id"` "Please pick who they are visiting." (API.md 6be6cde). The page already
   places it under `#manual-resident`; the mock still answers 404 for `""` (development only, left as is).
2. Keep who signed in in `localStorage`; no `/api/me`. 3. One token for `/staff/` and `/settings/` is right.
- Cobalt's memory is not needed for this build; I do not read outside the worktree. `node_modules` symlink ignored on main (eea6203).

## M1b — polish round (DONE, 2026-09-14)

Rebased on main (23c63e8) first.

### What changed
- **a) Phone header and tabs.** At ≤ 600 px the sticky header is two lines: home name (ellipsis) + SAMPLE; then the time only (the
  date part hides), the staff name (ellipsis), and 44 px Settings / Staff pages and Sign out. Measured 79 px at 390 on chromium
  (was 145). Tabs are one row that scrolls sideways inside itself (hidden scrollbar, bleeds to the screen edges inside the page
  gutter); choosing a tab scrolls it to the middle of the row (`ui.js` `mountTabs`, `tablist.scrollLeft`, never the page). Tablet
  layout unchanged (screenshot compared).
- **b) Notices.** Whole-home notices (`unit: null`, collected from the building answer, de-duplicated by id) show once in
  `#building-notices` above the unit cards; a card shows only notices whose `unit.id` is its own.
- **c) Settings lists.** Closed units under a collapsed "Closed (n)" with `button.unit-reopen` "Put back"; removed residents under
  "Removed (n)" with `button.resident-restore` "Put back"; staff turned off under "Turned off (n)" with `button.staff-toggle` "Turn on".
  Each is a `<details data-section="units-closed|residents-removed|staff-off">` (44 px summary) that stays open across re-renders.
  Put back is `PUT … { active: true }`; an API refusal shows in that row.
- **d) `app/tests/staff/negative-lib.mjs`** — `staffNegative({ name, why, patches, spec, grep, project = 'chromium-tablet', expect })`.
  Copies `app/public/` and `worker/` into `app/.negative/<name>/` (the Worker copy's `../app/public` is the patched pages), applies every
  patch before anything runs (anchor must occur exactly once; a missing file, a missing or repeated anchor, or a patch that changes
  nothing → exit 2 and logged, never a pass), runs `npx playwright test tests/staff/<spec> --project <p> --grep <escaped title>
  --workers 1` with `E2E_PORT` 8407 (`NEG_PORT` overrides) and `E2E_WORKER_DIR`, passes (exit 0) only if the output has "1 failed", no
  "passed", a ✘ line with that exact title, and every `expect` string; otherwise exit 1 "NOT RED — the check measured nothing". Appends to
  `app/tests/staff/negative-control.log` (`NEG_LOG` overrides), removes the copy.

### Verified, and how it could have failed
- `shots-mock.mjs all` (8401, mock), chromium + webkit × 390 + tablet: **all good**. New checks: phone header ≤ 96 px and header buttons
  ≥ 44 px on every tab of both pages; tabs on one row; the chosen tab hit-tests to itself (elementFromPoint at its centre); no sideways
  page scroll; the painting notice exactly once and inside `#building-notices`, Cove's card has only the Cove notice, Harbour and
  Lighthouse cards none; a unit added, closed → found under Closed → Put back → back in the list; Bill removed → under Removed and not
  in the list → Put back → back; Amira turned off → under Turned off → Turn on → back.
- **Made red:** the same script against the M1 pages (`git archive 23c63e8 app/public` into `app/.negative/m1-public`, served on 8407
  with `PUBLIC_DIR`, shots to an ignored folder) went red with 24 problems, including "whole-home notice shown 3 times (above the cards:
  false)", "unit notices: {…"others":2}", "header is 145.328125 px tall", "tabs on 2 rows" (staff) and "3 rows" (settings), and the
  Closed section not found. **Not made red:** the "chosen tab is in view" hit-test (on M1 every wrapped tab is visible anyway).
- **negative-lib, without a spec** (the Worker is not on main): a self-check with `NEG_LOG` in `app/.negative/` gave exit 2 for a
  missing anchor, an anchor found 2 times (`.unit-grid {` in staff.css), a missing file, and a no-op patch; a good anchor applied and
  then stopped at "CANNOT RUN — no worker/wrangler.toml". **Not yet proven:** the red/not-red decision on a real Playwright run; the
  first M2 control will be the first run.
- Screenshots looked at before committing: chromium 390 and tablet In the building, chromium 390 and tablet Residents with Removed
  open, webkit 390 In the building.

### Left undone / known gaps
- No Playwright specs or negative controls yet (M2/M3; they need vl1's Worker). No `negative-all.mjs` yet (app/package.json's
  `negative:staff` points at it; I add it with the first control in M2).
- At 390 the Residents rows put Remove on a second line under Change (buttons wrap in the row). Readable; not changed.
- The mock still refuses a missing `resident_id` with 404 instead of API.md's new 400. Development only.

## Cross-review of vl1 M1 (read only, 2026-09-14, main at f29980d)

Read `worker/src/*.js` against docs/API.md (including 6be6cde and 508c11a) for every route and field the staff pages and settings
call. I did not edit vl1's files.

### Mismatches with API.md
1. **`POST /api/staff/visits` does not check a missing resident first** (`staff.js` `staffSignIn`, lines 54–66). API.md: `resident_id`
   missing or `""` → 400 `field: "resident_id"` "Please pick who they are visiting.", and the order is resident missing, name, phone,
   unknown resident (404), `screened`, `already_in`. The Worker checks name, then phone, then answers `""` with 404 "We can't find
   that resident." (no `field`). Seen from the page: an empty form shows "Please type your name." under the name, not the resident
   error under `#manual-resident`; a named visitor with no resident picked gets the 404 text in `#manual-error`.
2. **`POST /api/staff/visits` name error uses the visitor's words** (`staff.js` line 58 `MSG.name` = "Please type your name."). API.md
   for the staff route: `field: "visitor_name"` "Please type their name.".
   My M2 specs do not assert either message (they would be red against this Worker); `manual.spec` asserts only what M2's list
   names. vl1 to fix; I add the missing-resident check to `manual.spec` once it is on main.

### Checked and matching (what my pages rely on)
- Errors: `{ error, code, field? }` from `ApiError.extra`; wrong PIN 401 `field: "pin"` "That PIN is not right."; no/expired token 401
  "Please sign in again."; staff token on `/api/settings*` 403 "Only a manager can change the settings." (role checked before the route
  is matched, so it holds for every settings path).
- `GET /api/info`: `sample` boolean, `retention_days`, `today`, `date_label`, `time_label`.
- `GET /api/staff/building`: every active unit in order with `count: 0` when empty; `visits` oldest first; `total` = sum; unit `notices`
  = whole home + own (the page now shows `unit: null` ones once above the cards); `auto_today` today's auto sign-outs newest first;
  `roll_call: null` always in M1.
- `StaffVisit`: `visitor_phone` is `""` for no phone (not null); `signed_in_by` null for QR, the staff name for staff; `screened`,
  `overdue` booleans; `out_label`/`out_kind` null while in; `due_label` always a label.
- `GET /api/staff/residents`: `screening_enabled`, units with `restricted`, active residents by first name with `by_arrangement`.
- `POST /api/staff/visits`: `warnings` `[{ code, message }]` in checks 3, 4, 5, 9 order with the visitor messages; a blank or
  whitespace phone is no phone; `screened !== true` with screening on → 400 `field: "screened"` with the exact message.
- `POST /api/staff/visits/:id/signout`: 409 `not_in` "That visitor is already signed out." (also for a passed auto sign-out).
- `GET /api/staff/visits`: bad date 400 `field: "date"` ("Pick a real date."); unknown unit 404; nothing older than retention.
- `GET /api/settings`: `active` booleans on units, residents, staff; `max_visitors_per_resident` null for no limit; notices newest
  first with `created_label` "Mon Sep 14, 3:00 PM"; inactive rows included.
- `PUT /api/settings/home`: digit strings accepted; `max_visitors_per_resident` `null` or `""` = no limit; retention message exact;
  `phone: ""` allowed.
- `PUT /api/settings/screening`: `enabled` must be a boolean (the page sends one); questions checked before the stop message, so the
  switch-on-no-questions Save shows "Add at least one question before you turn screening on." under the questions; an `id` that
  exists is kept.
- Notices: `unit_id` `null`/`""` = whole home, unknown unit 404 (no field; the page shows it in `#notice-error`); `active` must be a
  boolean on PUT; DELETE answers `{ settings }`.
- The 24:00 window (`hours.js`): `"24:00"` is the only hour 24; close `00:00` is refused (close ≥ 00:01), so the page's rule "a time input
  of 00:00 in To is sent as 24:00" is needed and matches; `hoursLabel` reads "midnight"; `autoOutAt`/`openNow` treat 24:00 as the next
  midnight. Unit writes are M2, so this is read, not exercised.
- `GET /api/visitor/start` (the manual tab's question texts): `questions` only while screening is on.

### What M1 answers 404 (M2 work) and how the pages behave until then
Roll call (`/api/staff/rollcall*`), contacts JSON and CSV, and settings units / residents / staff writes are not routed: after the role
check and maintenance the Worker answers 404 `not_found` "There is nothing here.". The pages show that text as is: the Roll call tab in
`#load-error` (every 3 s poll), Show and Download CSV under the contact form, Save / Put back / Turn off on Units, Residents and Staff
in the form or the row. Nothing breaks; those specs wait for M3.

## M2 — Playwright against the real Worker (DONE, 2026-09-14)

Rebased on main (f29980d, vl1 M1 Worker merged). Cross-review above committed first (8703aa2).

### Specs (`app/tests/staff/`, `E2E_PORT=8403 npx playwright test tests/staff`)
**104 passed, 0 failed, 0 skipped** — 26 tests × chromium-390, chromium-tablet, webkit-390, webkit-tablet, 5.4 min, one Worker.
- `building.spec.mjs` (8): wrong PIN text + 401 body via `waitForResponse`; API visitors on the right cards with `.unit-count`,
  `#building-total` and every row equal to `GET /api/staff/building`; Sign out by real taps → row, unit count and total drop within
  2 s (inside one poll) and the API agrees, still so after a poll; Cancel leaves it; Harbour in at 11:00 AM → `data-overdue="true"` and
  "Overdue since 11:30 AM" within 7 s of `setNow` 11:30 AM; `setNow` 9:00 PM → gone from Harbour, in `#auto-today` with "9:00 PM";
  a Cove notice on the Cove card only (`sevColour` = outbreak) and a whole-home notice once in `#building-notices`; a poll that brings
  a new visitor while a confirmation is open leaves it open, and Yes, sign out still works after.
- `manual.spec.mjs` (2): Ellen with no phone → the by-arrangement warning word for word, "Signed in Jean W. (SAMPLE) at 3:00 PM", the
  API has `method: "staff"`, `visitor_phone: ""`, signed in by Carl, and the row shows "Signed in by staff"; screening on → Sign in
  without the box shows the API's 400 text under `#manual-screened`, building total 0 and day log count 0; with the box → recorded,
  `screened: true`.
- `settings-m1.spec.mjs` (9): staff PIN → 403 "Only a manager can change the settings."; outbreak for Cove by real input → a phone
  context's `GET /api/visitor/residents/r_agnes` has it in `unit_notices` (and `needs_notice_confirm`), `r_frank` has none; Whole home →
  `home_notices` for Frank, Agnes and Mary, no unit notice; turn off → gone for visitors; switch on + no questions → the API's message
  under the questions; Use the example → no PUT within 2 s, `GET /api/settings` still no questions and off, label, inputs and stop
  message exact, switch off; edit + switch on + Save → the API has the edited questions and `enabled: true`; retention 14 → the line
  and `/api/info`; retention 0 → the API's message under `#retention-days`, still 30.
- `targets.spec.mjs` (7): SAMPLE on `/staff/` (keypad and signed in), `/settings/`, `/settings/door-sign/`; every visible button and
  `a.button` on the staff keypad, In the building (also with a confirmation open), Roll call, Day log, Contact list, Sign someone in,
  the settings keypad, all seven settings tabs and the door sign is ≥ 44 px (≥ 64 px for keys, Enter, Clear, row Sign out and its Yes,
  Sign in, roll call buttons) and hit-tests to itself (`expectTapTarget`), with no sideways scroll on each; contrast of Sign in, Show and
  Add notice ≥ 4.5; the sticky header (below); hours labels keep each time on one line; resident rows put Change and Remove side by side.
- `button.found` ≥ 64 px is in the size rule but no roll call can be started on the M1 Worker, so it is not measured yet (M3).
- To measure a button the spec scrolls it to the middle of the screen with `scrollIntoView` before `expectTapTarget` (reading sizes and
  hit-tests only; no app state is set).

### The three screenshot fixes
1. **Opaque sticky header.** `.app-header` background is `var(--ground)` (was `rgba(11, 16, 32, 0.78)` behind a blur). Test: a row's
   Sign out is scrolled until its middle is at the header's middle; `elementFromPoint` there is inside the header; the header's computed
   background alpha is 1; `tap()` on that Sign out still opens its confirmation. Note: `elementFromPoint` alone cannot catch a see-through
   header (the header element is on top either way), so the alpha check is the part that goes red. Scrolling: real `mouse.wheel` in
   Chromium; Playwright's mobile WebKit has no wheel ("Mouse wheel is not supported in mobile WebKit"), no touch drag, and ArrowDown
   presses did not move the page (tried, red), so in WebKit only the page is scrolled with `window.scrollBy`, recorded as a test annotation.
2. **Times stay together.** `timeText()` in `ui.js` wraps each "9:00 PM" / "midnight" in `span.time` (`white-space: nowrap`), used for the
   unit hours on In the building, "In since", and the Units and hours rows; `textContent` is unchanged (the spec compares it to the API's
   `hours_label`). Test: every `.time` has exactly one client rect.
3. **Change and Remove side by side on a phone.** At ≤ 600 px a list row's words take the whole line and its buttons sit together under
   them. Test: Change and Remove tops differ by < 2 px on every resident row, both 44 px and hit-testing to themselves.
Screenshots retaken with the mock (`shots-mock.mjs all`, all good in both engines); looked at chromium 390 In the building and Residents.

### Negative controls (`app/tests/staff/negative-*.mjs`, `node tests/staff/negative-all.mjs`, port 8407) — 8 of 8 RED as intended
Full output in `app/tests/staff/negative-control.log`. Each copies `app/public` + `worker` into `app/.negative/<name>/`, patches one
anchor that must occur exactly once, runs the one named test, and passes only on "1 failed" with that title and the expected words.
| control | break (in the copy) | test that went red | red output |
|---|---|---|---|
| (a) stale-total | `#building-total` rendered once, never again | building: Sign out by real taps… | `Error: the total drops with the row` Expected "2" Received "3" |
| (b) no-overdue | `data-overdue` always "false", no chip | building: …overdue within one poll of 11:30 AM | `Error: overdue within one 5 s poll` Expected "true" Received "false" |
| (c) overlay | transparent `::after` over every visit row | building: Sign out by real taps… | `tap(Sign out Paul) hit-test at 925,413: something else is on top` (received the `article.visit-row`) |
| (d) notice-unit | Whole home sends the first unit | settings-m1: a Whole home notice goes to home_notices… | `Error: a Whole home notice reaches every visitor` (home_notices empty) |
| (e) example-saves | Use the example also submits the form | settings-m1: Use the example fills the form but saves nothing… | `Error: Use the example sent a save` (a PUT request was seen) |
| fix 1 header-see-through | header background back to rgba(11, 16, 32, 0.78) | targets: the sticky header is opaque… (chromium-390) | `Error: the sticky header is opaque (background alpha 1)` Expected 1 Received 0.78 (red again after the WebKit scroll edit) |
| fix 2 time-wraps | `.time` loses `white-space: nowrap` | targets: hours labels keep each time on one line (chromium-390) | `Error: a time label broke across lines on In the building` |
| fix 3 stacked-buttons | phone row rule removed | targets: resident rows put Change and Remove side by side (chromium-390) | `Error: Change and Remove sit side by side` Expected < 2 Received 67.6 |
The M1b lib self-check (missing, repeated, no-op anchor → exit 2) stands; these are the lib's first real runs and its red decision held.

### Left undone / for the lead
- vl1: the two staff sign-in mismatches in the cross-review (missing `resident_id` not checked first; "Please type their name.").
  `manual.spec` gets those checks once the fix is on main.
- M3 specs (roll call, log and contacts, units / residents / staff, door sign) and controls (f)–(h) wait for vl1 M2.
- The WebKit scroll in the header test is script, not input (see fix 1); the lead may prefer a helper for it in `helpers.mjs`.

## M3 — roll call, day log and contacts, units / residents / staff, door sign (DONE, 2026-09-14)

Rebased on main (823f7f7: vl1 M2 merged at fc76437, contract ead4387). Read vl1's M2 routes (`rollcall.js`, `contacts.js`, `csv.js`,
`people.js`) against API.md before writing specs: what the pages send matches (boolean `found`, `from`/`to`/`unit` query, string PINs,
blank PIN kept on edit, `active` booleans), and every error field the specs read lands under its input.

### Specs (`E2E_PORT=8403 npx playwright test tests/staff`)
**160 passed, 0 failed, 0 skipped** — 40 tests × chromium-390, chromium-tablet, webkit-390, webkit-tablet, 8.5 min.
New since M2 (14 tests):
- `rollcall.spec.mjs` (1): three visitors via API; the desk starts the roll call by real taps → "0 of 3 found"; Amira on a second phone
  context (`STAFF2_PIN`) ticks Paul → the desk shows "1 of 3 found" within 5 s with "Found by Amira H. (SAMPLE)"; the desk ticks Linda
  ("Found by Carl B. (SAMPLE)", "2 of 3 found"); Grace signs in at 3:03 PM → "Came in after the roll call started", "2 of 4 found";
  End roll call at 3:05 PM → "Ended 3:05 PM · 2 of 4 found" on the desk and within 5 s on the phone, all four ticks disabled, and the
  API refuses a tick with 409 "This roll call has ended.".
  First run was red in both Chromium projects on the end count (2 of 3): the test signed Grace in at the same instant as the end, and
  API.md lists only visits signed in *before* `ended_at`. The test was wrong, not the page or the Worker; Grace now signs in at 3:03 PM.
- `log-contacts.spec.mjs` (2): visits on Sep 13 (Linda, Harbour, auto at closing; Paul, Lighthouse, signed out himself at 4:00 PM) and
  Sep 14 (Grace, Lighthouse, staff at 2:30 PM; Tom, Harbour, still in), set up with forward-moving `X-Test-Now`. Day log for Sep 14 = the
  API's visit ids in order, "2:30 PM Staff", "Still in", "2 visits"; Previous → Sep 13 ("Day log · Sun Sep 13") = the API's ids, "9:00 PM
  Auto", "4:00 PM Visitor"; unit filter Harbour → 1 visit. Contact list Sep 13–14 on Harbour wing = the API's count and row ids;
  **Download CSV by a real tap** → the saved file equals `GET /api/staff/contacts.csv` for the same range and unit byte for byte, and its
  suggested filename equals the API's `visitor-contacts-u_harbour-2026-09-13-to-2026-09-14.csv`.
- `settings-m3.spec.mjs` (7): a unit with two windows (typed and time inputs filled) → row "9:00 AM to 11:00 AM and 2:00 PM to 4:30 PM",
  Bill moved to it → the visitor API's `hours_label` is that; overlapping windows → the API's message under the hours and still 3 units;
  Nell with initial "q" → "Nell Q. (SAMPLE)" and found by `?q=nell`; Rose "Visits by arrangement only" → the visitor sign-in is 403
  `by_arrangement` with the exact message; Walter removed → 404 and not in search, listed under Removed; staff with PIN 2580 → 409 `pin_taken`
  message under `#staff-pin`, still 3 staff; turning off Donna → "The home needs at least one manager." in her row, still on.
- `door-sign.spec.mjs` (2): `decodeQr('#door-qr')` = `http://127.0.0.1:8403/` (QR ≥ 240 px), home name, SAMPLE, heading, "No app needed.";
  under print media `html` and `body` are white, `#print-sign` hidden, no aurora, name and SAMPLE visible, the QR still decodes.
- (1) `manual.spec.mjs` +1: nothing picked → 400 `resident_id` "Please pick who they are visiting." under `#manual-resident`, no name
  error; a resident and no name → 400 `visitor_name` "Please type their name." under `#manual-name`, the resident error cleared;
  nothing recorded.
- (2) `targets.spec.mjs` +1: a started roll call's three `button.found` are ≥ 64 px and hit-test to themselves (also after a tick), and
  every other button on the going roll call passes the 44/64 rule; in all four projects.

### (3) A closed unit with visitors still in (page only, per the lead; no spec yet)
`staff.js`: a unit with `active: false` gets `data-unit-active="false"`, a "Unit closed" pill (restricted colour) beside — not instead of —
the Open/Closed hours pill, a line "This unit is closed in Settings, but these visitors are still signed in. Sign them out as they
leave.", and an amber edge; its rows are the same rows with Sign out. The page renders units in the API's order, so the closed unit
comes after the open ones as the API sends it. The mock sends `active` and lists a closed unit that still has visitors in.
Shown with the mock by real clicks (remove Lighthouse's four residents, close it with Paul and Grace in): the card came after Harbour and
Cove, pill visible, hours pill "Open", 2 rows with 2 Sign out buttons, total still 5, no page errors —
`app/tests/staff/shots/chromium-{390,tablet}-staff-building-closed-unit.png`, looked at. Against the real Worker this waits for vl1's M3.

### Negative controls (`node tests/staff/negative-all.mjs`, port 8407) — 11 of 11 RED as intended
Full output in `app/tests/staff/negative-control.log` (it also keeps the M2 runs). The M2 eight went red again on this tree with the same
assertions. New:
| control | break (in the copy) | test that went red | red output |
|---|---|---|---|
| (f) local-tick | Found marks the row on this page only, sends nothing | rollcall: a roll call started by real taps… | `Error: the second phone's tick reaches the desk within one poll` Expected "1 of 3 found" Received "0 of 3 found" |
| (g) csv-stale-unit | Download CSV always asks for all units | log-contacts: the contact list for Sep 13 to 14 on Harbour wing… | `Error: the downloaded CSV is byte for byte the API's` Expected true Received false |
| (h) qr-wrong-path | the QR encodes `location.origin + '/staff/'` | door-sign: the door sign QR decodes to the sign-in page… | `Error: the door QR opens the sign-in page` Expected "http://127.0.0.1:8407/" Received "http://127.0.0.1:8407/staff/" |

### Screenshots
`shots-mock.mjs all` (mock, both engines, 390 and tablet): all good; every staff and settings tab re-taken into `app/tests/staff/shots/`
(chromium) plus the two closed-unit shots above.

### Left undone / for the lead
- The closed-unit spec waits for vl1's M3 and the lead's prompt.
- The WebKit `window.scrollBy` in the sticky-header test stays the recorded exception.

## M4 — vl1's four findings fixed, and a review of vl1's visitor pages (DONE, 2026-09-14)

Rebased on main (1ad8073, with vl1's closed-unit building answer 14afc3c and its hands-on review of my M2 pages).

### The four fixes, each with a spec on the real Worker and a control proved red
1. **A closed unit never reads "Open".** While a unit's `active` is false the card shows the "Unit closed" pill and a line saying the
   visitors are still signed in; the Open/Closed pill **and the hours line are hidden** (the retaken shot showed "Open all day" still on a
   closed Lighthouse wing, the same confusion, so the hours line went too). Rows and Sign out stay. Spec (`building.spec`): Nora in on
   Cove, Agnes and Bill removed and Cove closed via the API → the API lists Cove last with `active: false`; the card shows "Unit closed",
   the Open pill and hours are hidden, the card's text has no "Open", it comes after Harbour and Lighthouse, count 1, `#building-total` =
   the API; Sign out by taps → the card leaves and the API lists two units.
2. **No number before the first answer.** `#building-total` starts as "… in the building" (page text, and again whenever the keypad
   shows after a sign-out). Specs: the first `GET /api/staff/building` held with `page.route` → no digit in `#building-total`, released → the
   API's total; the first answer aborted → "Can't reach the visitor log. Check the connection and try again." in `#load-error`, still no
   digit, and the next poll brings the count and clears the error.
3. **A refused Show clears the list.** On a refused Show the table becomes "No list for these dates." and `#contacts-count` is empty.
   Spec (`log-contacts.spec`): Sep 13–14 → 4 rows, "4 visits"; From Sep 14, To Sep 13, Show → 400 `to` "The end date is before the start
   date." under To, no rows, no count.
4. **The staff name is whole at 390.** At ≤ 600 px the name has its own short line (13 px) under the home name, then the time and the
   44 px buttons; the header stays opaque and ≤ 96 px. Spec (`targets.spec`, every project): on `/staff/` and `/settings/` "Donna R.
   (SAMPLE)" is not cut (scrollWidth ≤ clientWidth), ends on screen, the header ≤ 96 px and `rgb(11, 16, 32)`, SAMPLE visible, header
   buttons ≥ 44 px and hit-tested, no sideways scroll. Retaken shots looked at: the name on its own line, "(SAMPLE)" readable.

### Numbers
- **Specs: 180 passed, 0 failed, 0 skipped** — 45 tests × chromium-390, chromium-tablet, webkit-390, webkit-tablet, 8.6 min
  (`E2E_PORT=8403 npx playwright test tests/staff`), run after the last page change.
- **Negative controls: 15 of 15 RED as intended** (`node tests/staff/negative-all.mjs`, port 8407); the eleven from M2/M3 went red again on
  the same assertions. New:

| control | break (in the copy) | test that went red | red output |
|---|---|---|---|
| closed-ignores-active | `const unitClosed = false` | building: a closed unit with a visitor still in… | `Error: a closed unit is marked Unit closed` locator `.unit-closed-pill` Expected visible, Received hidden |
| total-starts-at-zero | "0" in the page text **and** in the keypad reset | building: before the first building answer… | `Error: no number before the first answer` Expected pattern not /\d/, Received "0 in the building" |
| contacts-keeps-rows | the refused Show no longer clears table and count | log-contacts: a refused Show clears… | `Error: no rows stay after a refused Show` Expected 0, Received 4 |
| name-cut | the M3 phone header rules back (name shares the line, ellipsis) | targets: the staff name shows whole… (chromium-390) | `Error: staff: the staff name is not cut` Expected false, Received true |

- **A control that did not go red, recorded:** the first `total-starts-at-zero` put "0" back only in `staff/index.html`. The test stayed
  green (`RESULT: NOT RED — the check measured nothing`, in the log) because the keypad screen's reset already wrote "…" before sign-in,
  so the copy never showed 0. The page was right; the control broke the wrong place. It now breaks both places and went red.

### Review of vl1's visitor pages (read only, main at 1ad8073)
**How.** A throwaway script inside my worktree (`app/tests/staff/.review-visitor.mjs`, deleted after, never committed) started the real
Worker on 8401 through the lead's `start-worker.mjs` (`TEST_MODE=1`), reset the SAMPLE home, and drove `/`, `/out/?t=` and `/privacy/` on a
390 phone in chromium and webkit with real touch taps (hit-tested with `elementFromPoint`) and typed text. Notices and screening were set
through the API. Screenshots of every step went to a git-ignored folder, and I looked at them in both engines. The server was stopped.

**86 of 86 checks passed (43 per engine), the same in both engines:**
- **Step 1.** Header home name + SAMPLE; no aurora; labels "Your name" and "Your phone number" (`type="tel"`); "The home keeps your name
  and phone number for 30 days. Privacy", with `#privacy-link` to `/privacy/`. Continue with nothing typed → "Please type your name."
  right under the name field.
- **Step 2.** "Who are you visiting?", label "First name or room number", the under-2 hint, Back shows; "ma" → Margaret L. and Mary S.
  with "Room 101 · Harbour wing"; "zz" → "No one matches. Check the spelling, or ask at the nurse's desk.".
- **Refusals and notices.**
  - Ellen → `#blocked` (`role="alert"`) with the by-arrangement words, Pick someone else, no Sign in.
  - An outbreak on Cove → Agnes shows it, "I have read it", Sign in disabled until it is pressed (`aria-pressed` true).
  - Back, Frank → no outbreak notice anywhere and Sign in enabled.
- **Screening.** Yes → `#stop` with the stop message, Sign in hidden, no `POST /api/visitor/signin` sent; "I tapped Yes by mistake", No,
  Sign in → signed in.
- **Signed in.** `/out/?t=`, "Signed in", "3:00 PM", "Visiting Frank O. (SAMPLE), Room 201, Lighthouse wing", the keep line; Sign out full
  width and 64 px; opening `/` again shows the signed-in screen.
- **Signed out.** "Signed out", "Signed out at 3:00 PM.", "Thank you for visiting.", Sign in again. Back at `/` the name and phone are
  remembered; "Not you?" clears them and they stay clear after a reload.
- **Links and privacy.** An unknown token → `#link-error` with the API's words, a Sign in link, nothing about a visit; the old link of a
  signed-out visit shows the signed-out sentence. `/privacy/` has every PLAN heading and sentence, with "30 days, then it is deleted
  automatically.", "Staff at SAMPLE Harbourview Care Home (demo). This app does not send it anywhere." and "Questions: call 709-555-0142.";
  SAMPLE shows.
- **On every step:** every button ≥ 56 px, and hit-testing to itself; no sideways scroll at 390.

**Finding (from reading `visit/sign-in.js`, not driven):** after a screening "Yes", tapping "No" on the same question instead of "I tapped
Yes by mistake" leaves the stop box open. `answer()` only repaints and refreshes Sign in and never hides `#stop` or shows `#sign-in`. The
page then shows "No" pressed, the stop message, and no Sign in. Steps: screening on with one question; pick Frank; tap Yes; tap No. It is
safe (nothing is sent), but the words and the buttons disagree. Hiding `#stop` when every answer is "No" would match them. For vl1 to
decide; I did not edit vl1's files.

No other defect a person would hit. The screenshots read as PLAN's Design: a solid ground, large type, 56 px buttons, the notice card
with its 6 px severity edge, a dashed disabled Sign in, and the green check on Signed in.

### Left undone
- Nothing for vl2 in M4. The WebKit `window.scrollBy` in the sticky-header test stays the recorded exception.
