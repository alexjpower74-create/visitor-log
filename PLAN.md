# Visitor Log: build contract

One plan file. It is the contract, and it lives at the repo root so every agent reads the same copy.
Then read `docs/API.md` (the contract between slices) and `DECISIONS.md`. `BRIEF.md` is the original brief. `AGENTS.md` has
ports and hard rules.

## The brief (Onyx for Alexander, 2026-09-14)
QR sign-in for visitors at a long-term care home, personal care home or group home in Newfoundland. A visitor scans the QR at the
door, signs in on their own phone (name, phone, who they're visiting, screening questions if the home has them turned on), sees the
home's notice banner (for example an outbreak on one unit), and signs out on the way out. Staff see who is in the building right now
(which matters in a fire drill or an outbreak) and can pull a contact list for any day and unit. Home settings behind a PIN: units,
residents (first name + last initial + room), visiting hours per unit, max visitors per resident, screening on/off and its wording
(none enabled by default; an example template marked as an example), a notice banner with severity (info / restricted unit /
outbreak; the home writes the words, the app never states health facts itself), restricted residents (visits by arrangement only →
"Please see the nurse's desk"). Staff side: in the building now (by unit, sign-in times, overdue), fire-drill roll call, day log,
contact list CSV for a date range + unit, manual sign-in for visitors without phones, auto sign-out at closing marked "auto".
Privacy: SAMPLE home "SAMPLE Harbourview Care Home (demo)" and SAMPLE people only, records auto-delete after the home's retention
period (default 30 days, shown in settings and the privacy notice), no health information about residents.

**Tests that matter:** the outbreak banner shows on the right unit only (negative control); a screening "yes" stops the sign-in;
the in-building count equals sign-ins minus sign-outs across midnight auto sign-out; retention deletes records older than the
setting (fake clock, negative control); journeys chromium + webkit at 390 and 1024 tablet.

## Design
Tokens are in `app/public/theme.css` (lead-owned; read it, do not edit it, style your pages in your own CSS). Alexander's approved
portfolio look: dark navy ground, tonal surfaces, hairlines, soft shadows, colour on data, pills and edges, never a loud backdrop
(`.aurora` at 0.2 is allowed on staff and settings pages, **never on the visitor pages, the door sign or print**). Harbour blue
accent. The severity colours are the loud ones and come only from `[data-severity]` in theme.css (`--sev`, `--on-sev`). System fonts.
No emoji as icons (inline SVG where an icon helps). Everything quiet under `prefers-reduced-motion`. Every screen shows the home name
with a visible `.sample-badge` "SAMPLE" while `sample` is true. Tap targets: **≥ 56 px on the visitor pages** (base type 18 px; many
visitors are older and standing in a doorway), ≥ 44 px on staff and settings, **≥ 64 px** for Sign in, Sign out, keypad keys and
roll call ticks. Sticky headers carry `data-sticky-header` (the `tap()` helper reads it). Print: white, `.no-print` on buttons and
navigation. Notices look the same everywhere: a card with a 6 px left edge in `--sev`, a pill with `severity_label` (and the unit name
when there is one), then the home's message as plain text.

- **Visitor sign-in `/` (phone 390 first).** Solid ground. Header: home name + SAMPLE. `#home-notices` above everything. Steps, each
  with a "Back" button (`#back`) except the first:
  1. **"Sign in to visit"**: `#name` ("Your name"), `#phone` ("Your phone number", `type="tel"`), a line "The home keeps your name
     and phone number for 30 days. Privacy" (days from the API; "Privacy" is `#privacy-link` to `/privacy/`), **Continue**
     (`#continue`). Name and phone are remembered on this phone (`localStorage` `visitor-log:me`) and filled in next time, with
     "Not you?" (`#not-you`) that clears both fields and the stored copy.
  2. **"Who are you visiting?"**: `#search` ("First name or room number"). Under 2 characters: "Type at least 2 letters of their first
     name, or their room number." Results as `button.resident[data-resident="<id>"]` (name large; "Room 101 · Harbour wing" under
     it). None: "No one matches. Check the spelling, or ask at the nurse's desk."
  3. **After picking** (`GET /api/visitor/residents/:id`): if `can_sign_in` is false, `#blocked` (`role="alert"`, red edge) with the
     API's `message`, the relevant notices, and "Pick someone else". Otherwise `#unit-notices` with the unit's notices (and nothing
     when there are none), then, when `needs_notice_confirm`, **I have read it** (`#confirm-notice`, `aria-pressed`); then, when
     screening is on, `#screening`: each question `.question[data-question="<id>"]` with two large buttons
     `button.answer[data-answer="no"]` "No" and `button.answer[data-answer="yes"]` "Yes" (`aria-pressed`). **A "Yes" at once shows
     `#stop`** (`role="alert"`) with the home's stop message, hides `#sign-in`, and sends nothing; "I tapped Yes by mistake"
     (`#stop-back`) clears the answers. **Sign in** (`#sign-in`, ≥ 64 px) is enabled only when every question is answered "No" and
     the notice (if any) is confirmed. When the chosen resident changes, `#unit-notices`, `#blocked`, the answers and the notice
     confirmation are cleared before anything new is shown.
  4. **Signed in** (the page moves to `/out/?t=<token>` with `history.replaceState`): `#signed-in` with a large inline-SVG check,
     "Signed in", the time `#in-time` ("3:00 PM"), "Visiting Mary S. (SAMPLE), Room 101, Harbour wing", the notices, **Sign out**
     (`#sign-out`, full width, ≥ 64 px) and "Keep this page. This sign-out link works until midnight tonight." The token is kept in
     `localStorage` `visitor-log:visit` so opening `/` again shows this screen while the visit is in.
  5. **Signed out** `#signed-out`: "Signed out", `#out-time`, and one sentence by `out_kind`: "Signed out at 3:40 PM." / "Staff
     signed you out at 3:40 PM." / "You were signed out automatically at 9:00 PM when visiting hours ended."; "Thank you for visiting."
     and "Sign in again" (to `/`).
  API errors show the API's `error` text as is in `#error` (`role="alert"`) beside the step, under the input named by `field`.
- **`/out/?t=<token>`**: loads the visit and shows `#signed-in` or `#signed-out` as above. A 404 or 410 shows `#link-error`
  (`role="alert"`) with the API's text and a "Sign in" link to `/`, and nothing about any visit.
- **`/privacy/`**: "What the home keeps": your name and phone number, who you visited, when you signed in and out. "Why": so staff
  know who is in the building, for example in a fire drill, and can reach visitors if they need to, for example during an outbreak.
  "How long": "<N> days, then it is deleted automatically." "Who sees it": staff at <home name>; this app does not send it anywhere.
  "On this phone": your name and phone number are saved on this phone so you don't have to type them again; "Not you?" removes them.
  "No health information about residents is stored, and your screening answers are not saved." "Questions: call <phone>."
- **Staff `/staff/` (tablet 1024×768 at the nurse's desk first; must work at 390).** "Staff sign in" keypad (`button.key`, 64 px).
  Header: home + SAMPLE, time, staff name, "Sign out" (`#staff-signout`), and for a manager "Settings" (`#settings-link`). Tabs
  (`role="tab"`): **In the building**, **Roll call**, **Day log**, **Contact list**, **Sign someone in**.
  - In the building: `#building-total` ("12 in the building", a very large number); a banner when a roll call is going ("Roll call
    going: 3 of 5 found", opens the tab); a card per unit `[data-unit="<id>"]` with the name, hours label, an Open/Closed pill, its
    notices as pills, and `.unit-count`; rows `[data-visit="<id>"]` with `data-overdue="true|false"`: visitor name, phone as a
    `tel:` link, "Visiting Mary S. (SAMPLE), Room 101", "In since 2:05 PM", a "Signed in by staff" tag for `method: "staff"`, an
    **Overdue** chip "Overdue since 11:30 AM" when `overdue`, and **Sign out** (`button.sign-out-visit`) → inline "Sign out Linda?"
    with `button.confirm-sign-out` "Yes, sign out" and "Cancel". Empty unit: "Nobody is signed in on this unit." `#auto-today`:
    "Signed out automatically at closing today (not confirmed)" with names and times. Polls every 5 s; never re-renders a row whose
    confirmation is open.
  - Roll call: no roll call → **Start roll call** (`#start-roll-call`) with an inline "Start a roll call now?" confirm
    (`#confirm-roll-call`). Going: `#roll-call-progress` ("3 of 5 found"), entries grouped by unit, each `[data-roll="<visit id>"]`
    with a large `button.found` (`aria-pressed`, ≥ 64 px) that reads "Found" or "Not found yet", "Came in after the roll call
    started", "Signed out at 3:10 PM", who ticked it; not-found rows have a red edge. **End roll call** (`#end-roll-call`, inline
    confirm `#confirm-end-roll-call`). Ended: "Ended 3:20 PM · 5 of 5 found". Polls every 3 s (several phones can tick at once).
  - Day log: `#log-prev`, `#log-date` (`type="date"`), `#log-next`, `#log-unit` ("All units" + each), `#log-count`, `#log-table` with
    rows `[data-log-visit="<id>"]`: In, Out ("9:00 PM Auto", "3:10 PM Staff"), visitor, phone, resident, room, unit, signed in by.
  - Contact list: `#contacts-from`, `#contacts-to` (dates, default today), `#contacts-unit`, **Show** (`#contacts-show`) →
    `#contacts-count` ("14 visits") and a table; **Download CSV** (`#download-contacts`) fetches the CSV with the token and saves it
    through a Blob link with the API's filename. The line "Visitor records are deleted after 30 days." (from the API).
  - Sign someone in: `#manual-resident` (a `<select>` grouped by unit; "Ellen W. (SAMPLE), by arrangement"), `#manual-name`,
    `#manual-phone` ("Leave blank if they have no phone"), when screening is on the questions and `#manual-screened` ("I asked the
    screening questions and every answer was No"), **Sign in** (`#manual-submit`); then `#manual-result` (`role="status"`) "Signed in
    Linda at 3:05 PM" and `#manual-warnings` with each warning's message.
- **Settings `/settings/` (tablet 1024 first; must work at 390).** Manager keypad sign-in (a staff PIN signs in but shows the API's
  403 text "Only a manager can change the settings."). Tabs (`role="tab"`): **Notices**, **Screening**, **Visits and privacy**,
  **Units and hours**, **Residents**, **Staff**, **Door sign**.
  - Notices: `#notice-unit` (`<select>`: "Whole home" with value `""`, then each unit), `#notice-severity` ("Notice", "Visiting
    restricted", "Outbreak", each with one line under the picker: "Visitors see your message." / "Visitors see your message and can't
    sign themselves in; they are sent to the nurse's desk." / "Visitors see your message and must tap I have read it before they
    sign in."), `#notice-message` ("Your words. Visitors see them exactly as you write them."), **Add notice** (`#notice-add`). List
    `[data-notice-row="<id>"]`: the notice as visitors see it, `button.notice-toggle` "On"/"Off" (`aria-pressed`),
    `button.notice-remove` with an inline confirm `button.confirm-remove`.
  - Screening: `#screening-enabled` (`role="switch"`, `aria-checked`), question inputs `input.question-text` each with a remove
    button, **Add a question** (`#question-add`), `#screening-stop` ("What should a visitor who answers Yes do?"), **Use the example**
    (`#use-example`) fills the form (not saved) and shows `#example-label` with the exact example label, **Save** (`#screening-save`).
  - Visits and privacy: `#retention-days`, `#max-visitors` (blank = no limit), `#after-hours-message`, `#desk-message`, `#home-phone`,
    **Save** (`#visits-save`); the line "Visitor records are deleted after <N> days."
  - Units and hours: rows `[data-unit-row="<id>"]`; a form with `#unit-name`, windows `.window` each with `input.window-open` and
    `input.window-close` (`type="time"`), "Add a time" (`#window-add`), "Open all day" (`#unit-all-day`), **Save** (`#unit-save`),
    and "Close this unit" on a row (inline confirm).
  - Residents: rows `[data-resident-row="<id>"]`; `#resident-first`, `#resident-initial`, `#resident-room`, `#resident-unit`,
    `#resident-arrangement` ("Visits by arrangement only"), **Save** (`#resident-save`), "Remove" on a row (inline confirm). The line
    "Only a first name, last initial and room. Don't add health information."
  - Staff: rows `[data-staff-row="<id>"]`; `#staff-name`, `#staff-role`, `#staff-pin`, **Save** (`#staff-save`), "Turn off" on a row.
  - Door sign: a preview and a link to `/settings/door-sign/`: a printable letter page, white, with the home name, "Visitors: please
    sign in and out", "Point your phone's camera at this code", the QR `#door-qr` (a `<canvas>` or `<img>`, ≥ 240 px, quiet zone
    kept) made with `app/public/vendor/qrcode.js` from `location.origin + "/"`, that address written under it, "No app needed.",
    and **Print** (`#print-sign`). No token needed to view the door sign page itself (it holds nothing private).

**Words (use exactly; tests read them):** "Sign in to visit", "Your name", "Your phone number", "Continue", "Not you?", "Privacy",
"Who are you visiting?", "No one matches. Check the spelling, or ask at the nurse's desk.", "Pick someone else", "I have read it",
"Yes", "No", "I tapped Yes by mistake", "Sign in", "Signed in", "Sign out", "Signed out",
"Keep this page. This sign-out link works until midnight tonight.", "Thank you for visiting.", "Sign in again", "Back",
"Staff sign in", "Enter", "Clear", "That PIN is not right.", "In the building", "Roll call", "Day log", "Contact list",
"Sign someone in", "Nobody is signed in on this unit.", "Overdue since", "Yes, sign out", "Cancel",
"Signed out automatically at closing today (not confirmed)", "Start roll call", "End roll call", "Found", "Not found yet",
"Came in after the roll call started", "All units", "Show", "Download CSV", "Settings", "Notices", "Screening",
"Visits and privacy", "Units and hours", "Residents", "Staff", "Door sign", "Whole home", "Notice", "Visiting restricted",
"Outbreak", "Add notice", "Use the example", "Add a question", "Save", "Open all day", "Visits by arrangement only", "Print".

**Hooks the lead's journey test relies on (keep these ids and attributes):** every id and attribute named in the Design above, plus
keypads `button.key[data-key="0".."9"]`, `#pin-enter`, errors in `#pin-error` (`role="alert"`), and tabs by their `role="tab"` names.

## Stack
- `worker/`: Cloudflare Worker, plain JS ESM, no build, **no npm dependencies** (use the `wrangler` on PATH, 4.131+).
  `worker/wrangler.toml`: name `visitor-log`, `main = "src/index.js"`, `compatibility_date = "2026-09-01"`, D1 binding `DB`
  (`database_name = "visitor-log"`, `database_id = "00000000-0000-0000-0000-000000000000"` with a comment that deploy replaces it,
  `migrations_dir = "migrations"`), `[triggers] crons = ["*/15 * * * *"]`, `[assets] directory = "../app/public"`,
  `binding = "ASSETS"`, `run_worker_first = ["/api/*"]`. **No `TEST_MODE` in `[vars]`, ever.**
- `app/public/`: plain HTML/JS/CSS served by the same Worker. No frameworks, no CDN, nothing loaded from another host.
  `app/public/vendor/qrcode.js` (qrcode-generator 2.0.4, MIT, global `qrcode`) is lead-owned: load it with a `<script>` tag.
- `app/tests/`: Playwright 1.63; `app/node_modules` is installed on main and the lead symlinks it into your worktree. Config
  (projects `chromium|webkit` × `390|tablet`: `visit/**` runs on 390; `staff/**` on 390 and tablet; `journey/**` on tablet), helpers
  (`fresh`, `newContext(browser, 'phone'|'tablet')`, `setNow`, `at`, `tap`, `type`, `keypad`, `expectTapTarget`,
  `expectNoHorizontalScroll`, `contrastOf`, `sevColour` + `SEV_RGB`, `api`, `bearer`, `staffToken`, `managerToken`,
  `visitorSignInViaApi`, `visitorSignOutViaApi`, `buildingViaApi`, `addNoticeViaApi`, `setScreeningViaApi`, `EXAMPLE_SCREENING`,
  `decodeQr`, `shot`, `assertNoThirdParty`) and `start-worker.mjs` are lead-owned: import them; ask in your report for changes.
  Every spec calls `fresh(context, request)` first and `assertNoThirdParty(context)` last. Real input only: taps and clicks through
  `tap()`, typing through `type()`, PINs through `keypad()`, downloads through a real tap and `page.waitForEvent('download')`; never
  set app state with `evaluate`. Native `<select>` and date/time inputs may use `selectOption` / `fill`. `setNow` only moves forward
  within a test (maintenance writes what it sees).
- Local dev everywhere: `wrangler dev --local --port <p> --inspector-port <p+10> --persist-to <dir>`; tests add `--var TEST_MODE:1`.
  Migrations: `wrangler d1 migrations apply visitor-log --local --persist-to <dir>` (from `worker/`).
- **Reference, read only:** `~/Projects/Daycare Day Sheet` is a finished sibling build with the same shape (Worker + D1, PIN
  keypads, tokens stored hashed, NL local time with DST, CSV with a formula guard, negative controls). Its `worker/src/time.js`,
  `auth.js`, `csv.js`, `worker/tests/run.mjs`, `worker/tests/negative-lib.mjs` + `negative-*.mjs` (copy the worker and break it),
  `worker/tools/first-setup.mjs` and `app/tests/door/negative-lib.mjs` (copy the pages and break them) are good patterns to copy and
  adapt. Never write in that folder, never run anything from it.
- **Ports (never use another):** vl1 Worker 8402 (inspector 8412), vl1 visit e2e 8404 (8414), vl1 negative copies 8405 (8415) and
  8406 (8416). vl2 dev 8401 (8411), vl2 e2e 8403 (8413), vl2 negative copy 8407 (8417). Lead 8408 (8418), QA 8409 (8419).
  Other crews run wrangler on this machine and hold the default inspector port 9229.

## Rules
- You own the files listed under your id and **nothing else**. If you need a change in someone else's file, say so in your report;
  do not reach in. `rig guard` enforces this. The lead owns `docs/API.md`: if the contract is wrong or unclear, write the question in
  your report and end your turn; do not invent a different contract.
- Verify, then commit, then report. Never leave a verified step uncommitted: a usage-limit pause lands mid-task with no warning.
- Your report goes in `docs/build-report-<your id>.md`, committed with your work: tests passed/failed/skipped, every negative control
  with the exact break and the red output, known gaps, and anything you want the lead to decide.
- Commit only your own paths: `git commit -- <paths>`. Never grade the shared tree; the lead's numbers come from `rig qa`.
- A check that cannot fail measured nothing. Every task below names its negative controls: make each red once, record it, restore.
  Controls break a **copy** (in `.negative/`, git-ignored), never the shipped code, and the shipped code has no switch that turns a guard
  off. A Worker copy keeps the relative `../app/public` (copy or symlink it beside the copied `worker/`). Each control exits 0 only if
  its check went red and appends its output to its folder's `negative-control.log`.
- **Milestones.** Finish the milestone, commit, update your report, and end your turn with a one-paragraph summary. The lead merges,
  sends a cross-review, then prompts you for the next milestone. Do not start the next one before that prompt.
- Local only: no deploy, no `--remote`, no `d1 create`, no `secret put`. Nothing is sent anywhere. If auto mode denies something,
  do not work around it; note it in your report and carry on.
- SAMPLE only: the home, residents (names end "(SAMPLE)" through the API), visitors (seed names end "(SAMPLE)") and staff. No devils or
  demons, no emoji icons, no real people or businesses, no photos, no addresses, no health information about anyone.
- No request to a third-party host from any page or test (the helpers fail a test on anything but 127.0.0.1).
- Keep scratch files inside your own worktree; never `/tmp`. Stop every server you start before you end a turn.

## Agents

### vl1 — Worker, D1 and the rules; the visitor's phone pages
Owns:
- worker/**
- app/public/index.html
- app/public/visit/**
- app/public/out/**
- app/public/privacy/**
- app/tests/visit/**
- docs/build-report-vl1.md

Report: docs/build-report-vl1.md

Task:
Implement `docs/API.md` exactly in `worker/src/` (suggested split: `index.js` router + `scheduled()`, `http.js` JSON/errors, `clock.js`
now/IP with the TEST_MODE rule, `time.js` NL local dates, labels, local time → instant and midnight via `Intl`, `hours.js` pure windows /
`open_now` / `hours_label` / `due_at` / `auto_out_at`, `rules.js` the pure visitor sign-in decision in API.md's order, `auth.js` PBKDF2
PINs, tokens, rate guard, `maintenance.js`, `csv.js`, `sample.js` the SAMPLE home, `seed.js` the demo). `npm test` = `node tests/run.mjs`
(adapt Daycare's): pure unit tests first, then wipe `worker/.state-<PORT>`, apply migrations there, start `wrangler dev --local --var
TEST_MODE:1` on `PORT` (default 8402, inspector +10) if nothing answers, run the API tests with `node --test`, stop what it started.
`npm run negative` runs every negative control (`NEG_PORT` overrides the port, default 8405). `npm run dev` = migrate + wrangler dev on 8402.

**M1 (Worker core; commit as soon as it is green, then stop):** `wrangler.toml`; `migrations/0001_init.sql` (home single row, units with
hours JSON and position, residents, staff with PIN hash + salt, sessions with `token_hash`, pin_attempts, notices, screening_questions,
visits with `token_hash`, `in_at`, `date`, `due_at`, `auto_out_at`, `out_at`, `out_kind`, `method`, `signed_in_by`, `screened`, roll_calls
and roll_call_entries (tables now, routes in M2), indexes on `visits(date)`, `visits(out_at, auto_out_at)`, `visits(phone)`); the SAMPLE home
written by `POST /api/test/reset` from `sample.js`. Routes: `GET /api/info`, `POST /api/signin`, `POST /api/signout`; every **visitor**
route; both **visit token** routes; `GET /api/staff/building`, `GET /api/staff/residents`, `POST /api/staff/visits`,
`POST /api/staff/visits/:id/signout`, `GET /api/staff/visits`; `GET /api/settings`, `PUT /api/settings/home`, `PUT /api/settings/screening`,
the three **notice** routes; `POST /api/test/reset`, `POST /api/test/maintenance`; `scheduled()` calling `maintenance`.
M1 unit tests: `tests/time.test.mjs` (labels incl. 12:00 AM / 12:00 PM; local date at 11:59 PM and 12:00 AM NDT; local "21:00" → instant on
Sep 14 2026 (NDT), Nov 1 2026 after fall-back (NST, `2026-11-02T00:30:00Z`) and Mar 14 2027 after spring-forward (`2027-03-14T23:30:00Z`);
the midnight after Nov 1 2026 is `2026-11-02T03:30:00Z`; the repeated and the missing hour per API.md); `tests/hours.test.mjs` (validation:
overlap, touching allowed, open ≥ close, 0 and 5 windows, `24:00`; `open_now` at open (in), at close (out); every `hours_label` form incl.
"Open all day" and three windows; `due_at` for a visit in each window, between windows, after closing; `auto_out_at` before and after
closing and for open visiting); `tests/rules.test.mjs` (the sign-in decision: every reason in API.md's order when several apply at once,
and each alone; phone normalising: `(709) 555-0123`, `+1 709 555 0123`, `17095550123` ok, 9 and 11 digits refused); `tests/retention.test.mjs`
(the cutoff date for retention 30 and 7 on ordinary days and across the DST change; age = retention kept, retention + 1 deleted).
M1 API tests (`tests/api.test.mjs`): info shape; an empty-D1 file (`tests/api-empty.test.mjs`, `sample: false`, run before any reset);
sign-in wrong PIN 401 `field: "pin"`; a staff token on `/api/settings` → 403 with the exact message; no token → 401; 5 wrong PINs → 429
then even the right one 429 (another `X-Test-IP` still works); the visitor start with screening off (`questions: []`); search ("ma" → Mary S.
and Margaret L.; "m" → 400 `field: "q"`; "10" → rooms 101, 104, 108; "mary s" → Mary; an inactive resident is not found once M2 can make
one, until then skip with a reason); **the notice on the right unit**: an outbreak notice on `u_cove` → `GET /api/visitor/residents/r_agnes`
has it in `unit_notices` with `needs_notice_confirm: true`, and `r_frank` (Lighthouse) and `r_mary` (Harbour) have `unit_notices: []` and
`needs_notice_confirm: false`; a whole-home info notice appears in `home_notices` for all three and in `/api/visitor/start`, never in
`unit_notices`; the staff building shows the Cove notice on the Cove card only; the notice turned off → gone everywhere; sign-in for Agnes
without `notice_confirmed` → 400, with it → 201 and `visit.unit_notices` holds the notice; a `restricted` notice on `u_harbour` → Mary 403
`restricted_unit` with the exact message while Frank signs in 201; **screening**: enabling with no questions → 400 `questions`, with an
empty stop message → 400 `stop_message`; on with 2 questions: no answers → 400 `answers`; one "yes" → 403 `screening_stop` with the stop
message byte for byte, **and** the building total, the day log count and the `visits` row count in D1 (read through `wrangler d1 execute
visitor-log --local --persist-to $STATE_DIR`, documented) are unchanged; all "no" → 201 with `screened: true`; **hours**: Mary at 12:00 PM
→ 403 `outside_hours` with the exact message; at 11:30 AM → 403; at 1:30 PM → 201; Frank at 3:00 AM → 201; Agnes at 7:00 PM → 403;
by arrangement (Ellen) → 403 with the exact message, and staff sign Ellen in → 201 with `warnings[0].code` `by_arrangement`; the visitor
limit: two for Mary then a third → 409 `resident_full`, one signs out, the third → 201; the same phone twice → 409 `already_in`;
**the count across midnight auto sign-out**: at Sep 14 2:00 PM two Harbour visitors sign in, one signs out at 3:00 PM, a Lighthouse
visitor signs in at 8:00 PM, staff sign a Harbour visitor in at 10:00 PM; at 8:59 PM `total` 3 (Harbour 2, Lighthouse 1); at 9:00 PM
`total` 2 and the Harbour visitor has `out_kind: "auto"`, `out_label` "9:00 PM" and is in `auto_today`; at 11:59 PM `total` 2; at 12:00 AM
Sep 15 `total` 0, the late Harbour visit and the Lighthouse visit are `auto` at "12:00 AM", and the Sep 14 day log shows all four with the
right `out_kind`; **property** (`tests/count-property.test.mjs`, seeded PRNG): 200 events over 3 days in time order (visitor sign-ins on
Lighthouse and inside Harbour's windows, staff sign-ins at any hour, sign-outs by token and by staff) with 40 checkpoints between them; at
each checkpoint `total` and every unit count equal the test's own model (sign-ins so far − sign-outs so far, where a visit also counts as
out once its `auto_out_at` from API.md has passed), never negative; **overdue**: Mary's visitor in at 11:00 AM → at 11:29 AM
`overdue: false`, at 11:30 AM `true` with `due_label` "11:30 AM"; a Lighthouse visitor never overdue; **the sign-out link**: the token is 43
base64url characters and D1 holds only its SHA-256 (d1 execute); a visit in at 9:00 PM → GET at 11:59:59 PM → 200; at 12:00:00 AM →
410 with the exact message; an unknown token → 404; sign out → `out_kind: "visitor"`; again → 200 `already_out: true` and `out_at`
unchanged; a Harbour visitor who taps Sign out at 9:05 PM after closing → `already_out: true`, `out_kind: "auto"`; staff sign-out → 200
then 409 `not_in`; **retention** (`X-Test-Now` only moves forward): Lighthouse visits dated Aug 1 and Aug 15 2026; at Aug 31 (age 30 for
Aug 1) a staff request → the Aug 1 day log still has it; at Sep 1 → gone from the day log **and** from D1; then, after a fresh reset,
Lighthouse visits dated Aug 15 and Aug 16, the manager sets retention 7, and a staff request at Aug 23 → the Aug 15 visit (age 8) is gone
from the day log and D1 and the Aug 16 visit (age 7) is kept; retention 0 and 366 → 400; `POST /api/test/maintenance` returns the counts it deleted; settings home/screening/notice validation (one test per field).
M1 negative controls (`tests/negative-*.mjs`, copies in `worker/.negative/`): (a) `negative:notice-unit` — the copy puts every active
notice in `unit_notices` → the right-unit test goes red; (b) `negative:screening` — the copy ignores a "yes" → the screening test goes red;
(c) `negative:auto-out` — the copy never treats a passed `auto_out_at` as out → the across-midnight count test and the property go red;
(d) `negative:retention-setting` — the copy always keeps 30 days → the retention 7 test goes red; (e) `negative:retention-boundary` —
the copy deletes at age ≥ retention → the age-30-kept test goes red; (f) `negative:link-expiry` — the copy cuts the link at UTC midnight
→ the 11:59:59 PM test goes red; (g) `negative:hours-close` — the copy lets a visitor in at the close minute → the 11:30 AM test goes red.

**M2 (Worker, the rest; after the lead's prompt):** units, residents and staff settings routes; roll call routes; contacts JSON and CSV;
`POST /api/test/seed { scenario: "demo" }`; `worker/tools/first-setup.mjs --home "<name>" --phone "<709…>" --manager "<name>" --pin
<4–6 digits> [--out <file>]` (no network, no SAMPLE rows; writes `worker/first-setup.sql`, git-ignored: the home row with `sample = 0` and
the defaults from API.md, one manager with a PBKDF2 hash + salt made exactly as `auth.js` does; no units or residents; the manager adds
them in settings). Tests (`tests/api-m2.test.mjs`): units (hours validation per field, a name taken, closing a unit with residents → 409,
a closed unit's residents not in search); residents (each field, upper-cased initial, inactive not in search and 404 on sign-in); staff
(add, `pin_taken`, turning off the last manager → 409); **roll call**: three in the building, start → `total` 3, a sign-in after the start
→ `total` 4 with `after_start: true`, a sign-out during it stays with `out_label`; found by Carl and by Amira (two tokens) → `found` 2
with each `found_by`; unfound → back to 1; a second start → 409 with `roll_call_id`; end → found writes 409; `current` null after;
visitors who signed out before the start are not listed; **contacts**: rows for a range across two dates and the unit filter; `from > to`
→ 400; the CSV header exact, CRLF on every line, a visitor named `O'Brien, "Junior" (SAMPLE)` quoted, `=HYPERLINK("x") (SAMPLE)` guarded,
`Signed out` values `Visitor`, `Staff`, `Auto at closing`, `Still in`, `Signed in by` `QR code` or a staff name, the filename; the JSON rows
and the CSV lines agree; a visit past retention is in neither; **seed**: at 3:00 AM and at 3:00 PM `total` ≥ 3 on Lighthouse, an overdue
Harbour visitor at 3:00 PM, the last 20 days each have visits, `out_url` GETs 200; **first setup**: the tool's SQL applied to a fresh D1 and
a Worker started **without** `TEST_MODE` → the manager PIN signs in, `GET /api/info` has the name with `sample: false`, `/api/test/reset` →
404, and a resident added through settings has no "(SAMPLE)". M2 negative controls: (h) `negative:csv-guard` — no formula guard → the CSV
test goes red; (i) `negative:rollcall-after-start` — the copy lists only visits in the building at the start → the after-start test goes
red; (j) `negative:last-manager` — no guard → red; (k) `negative:ratelimit` — wrong PINs never counted → the 429 test goes red;
(l) `negative:contacts-unit` — the copy ignores `unit` → the unit filter test goes red.

**M3 (the visitor pages; after the lead's prompt, `git rebase main` first):** `app/public/index.html`, `app/public/visit/` (your CSS and JS),
`app/public/out/`, `app/public/privacy/` per Design, talking only to docs/API.md. Playwright in `app/tests/visit/` (run
`E2E_PORT=8404 npx playwright test tests/visit`): `visit.spec.mjs` (**a first visit by real input**: type name and phone, Continue, search
"ma" → Mary and Margaret, tap Mary, Sign in → `#signed-in` shows "3:00 PM" and the URL is `/out/?t=`, and `GET /api/staff/building`
has the visitor on Harbour wing; open `/` again → the signed-in screen; `setNow` 3:40 PM, tap Sign out → "Signed out at 3:40 PM." and the
API agrees; `/` → name and phone filled in; "Not you?" clears them and a reload keeps them clear; **the notice on the right unit**: an
outbreak notice on Cove unit and a whole-home info notice via API → `#home-notices` has the info notice; pick Agnes → `#unit-notices` has
the outbreak notice with `data-severity="outbreak"` and `sevColour` = `SEV_RGB.outbreak`, `#sign-in` is disabled until "I have read it";
then **Back, pick Frank** in the same page → no outbreak notice anywhere on the page (`#unit-notices` empty or hidden) and "Sign in" is
enabled; **screening "yes" stops the sign-in**: screening on via API → answer "No", then "Yes" → `#stop` shows the stop message exactly,
`#sign-in` is hidden, and no `POST /api/visitor/signin` was sent (listen with `page.on('request')` for the whole step) and the building
total is unchanged; "I tapped Yes by mistake" → all "No" → signed in; **blocked**: Ellen → `#blocked` with the by-arrangement message;
a restricted notice on Harbour → Mary blocked with the restricted message; `setNow` 12:00 PM (fresh test) → Mary blocked with the
outside-hours message; **the link**: `/out/?t=` opened in a new phone context signs out; a visit from yesterday's link after midnight →
`#link-error` shows the 410 text and nothing about the visit; staff sign-out and auto sign-out show their sentences on `/out/`;
**privacy**: `/privacy/` says "30 days"; after `PUT /api/settings/home { retention_days: 14 }` it says "14 days", and so does the line on
step 1), `targets.spec.mjs` (every visitor button ≥ 56 px and hit-tests to itself at 390 in both engines on each step; Sign in and Sign out
≥ 64 px tall; SAMPLE visible on `/`, `/out/`, `/privacy/`; no horizontal scroll; `#sign-in` contrast ≥ 4.5; the sticky header never covers
`#sign-in` or an answer button). Screenshots of every step (incl. a notice, the stop screen, blocked, signed in, signed out) via
`shot(page, testInfo, 'visit', name)`. M3 negative controls (`app/tests/visit/negative-*.mjs`, page copies in `app/.negative/`, E2E_PORT
8406 with `E2E_WORKER_DIR`): (m) `stale-notice` — the copy does not clear `#unit-notices` when a different resident is picked → the "Back,
pick Frank" check goes red; (n) `yes-posts` — the copy treats "Yes" as "No" → the no-POST check goes red; (o) `overlay` — a transparent
cover over `#sign-out` → the `tap()` hit-test goes red; (p) `forget-me` — the copy never stores name and phone → the remembered check
goes red.

### vl2 — Staff pages and settings, Playwright for them
Owns:
- app/public/staff/**
- app/public/settings/**
- app/public/common/**
- app/tests/staff/**
- docs/build-report-vl2.md

Report: docs/build-report-vl2.md

Task:
Build the staff pages and the settings per the brief and Design, talking only to docs/API.md through `app/public/common/api.js`
(same-origin `fetch('/api/…')`; the token in `localStorage` `visitor-log:staff-token`; a 401 goes back to the keypad; errors surface the
API's `error` text as is, placed under the input named by `field`). `app/public/common/` also holds your shared `keypad.js`, `ui.js` and
`style.css` for staff and settings. Time and dates come from the API, never the browser clock. Until vl1's M1 is merged into your branch
you may develop against a mock of your own (`app/public/common/api.mock.js`, `?mock=1`, same shapes as API.md, served by a small static
server you start inside your worktree on 8401), but **every Playwright test runs against the real Worker**.

**M1 (pages; commit when green, then stop):** `/staff/` with every tab and `/settings/` with every tab and `/settings/door-sign/`, per
Design. Polling as in Design (building 5 s, roll call 3 s), never re-rendering a row under the person's finger or an open confirmation.
The CSV download through a Blob. Screenshots of each tab at 390 and 1024 into `app/tests/staff/shots/` (mock is fine for M1 screenshots).

**M2 (after the lead's prompt; `git rebase main` first, vl1 M1 is merged by then):** first a **cross-review** of vl1's M1 Worker against
docs/API.md for what your pages call (write findings in your report, do not edit vl1's files). Then Playwright in `app/tests/staff/` (run
`E2E_PORT=8403 npx playwright test tests/staff`) for what vl1's M1 routes support: `building.spec.mjs` (wrong PIN "That PIN is not right."
**and** the 401 via `waitForResponse`; visitors signed in via API show under the right unit cards with `.unit-count` and `#building-total`
equal to the API; **sign out by real taps** with the inline confirm → the row leaves, the count and the total drop at once and
`GET /api/staff/building` agrees; Cancel leaves it; an overdue visitor (Harbour, in at 11:00 AM, `setNow` 11:30 AM) has
`data-overdue="true"` and "Overdue since 11:30 AM" within one poll; after `setNow` 9:00 PM the Harbour visitor is gone from the card and
listed in `#auto-today`; a notice on Cove shows on the Cove card only; a poll that lands while a confirmation is open does not close it),
`manual.spec.mjs` (sign in Ellen with no phone → `#manual-warnings` shows "Visits with Ellen W. (SAMPLE) are by arrangement only. Please
see the nurse's desk." and the visit is in the building with "Signed in by staff"; with screening on via API the Sign in without
`#manual-screened` shows the API's message under it and nothing is recorded; with it → recorded), `settings-m1.spec.mjs` (a staff PIN shows
"Only a manager can change the settings."; **add an outbreak notice for Cove unit by real input** → a visitor phone context's
`GET /api/visitor/residents/r_agnes` (API read) has it in `unit_notices` and `r_frank` does not; "Whole home" → `home_notices`; turn a notice
off → gone from the API; **screening**: Save with the switch on and no questions shows the API's message under the questions; Use the
example → `#example-label` exact and the example questions in the inputs and the switch still off, and `GET /api/settings` still has no
questions (not saved); edit and Save with the switch on → the API has the questions and `enabled: true`; **retention**: set 14 → the line
reads "Visitor records are deleted after 14 days." and `GET /api/info` says 14; 0 → the API's message under `#retention-days`),
`targets.spec.mjs` (SAMPLE badge on `/staff/`, `/settings/`, `/settings/door-sign/`; every button ≥ 44 px, keypad keys and
`button.found` ≥ 64 px, each hit-tests to itself at 390 and 1024 in both engines; no horizontal scroll at 390; the primary button contrast
≥ 4.5; the sticky header never covers a row's Sign out). M2 negative controls (`app/tests/staff/negative-*.mjs`, page copies in
`app/.negative/`, E2E_PORT 8407 with `E2E_WORKER_DIR`): (a) `stale-total` — the copy does not re-render `#building-total` after a sign-out
→ the count check goes red; (b) `no-overdue` — the copy ignores `overdue` → red; (c) `overlay` — a transparent cover over a row's Sign out
→ the `tap()` hit-test goes red; (d) `notice-unit` — the copy's notice form sends the first unit when "Whole home" is picked → the
whole-home check goes red; (e) `example-saves` — the copy's "Use the example" also saves → the "not saved" check goes red.

**M3 (after the lead's prompt; rebase on main, vl1 M2 merged):** `rollcall.spec.mjs` (three visitors via API; **Start roll call** by real
taps on the tablet → `#roll-call-progress` "0 of 3 found"; a second context (a phone, `STAFF2_PIN`) opens Roll call and ticks one →
the tablet shows "1 of 3 found" within one poll with `found_by` Amira; the tablet ticks another; a visitor who signs in after the start
appears with "Came in after the roll call started" and the progress reads "2 of 4 found"; End roll call → "Ended … 2 of 4 found" and
ticks are refused), `log-contacts.spec.mjs` (visits across Sep 13 and 14 on two units via API with `X-Test-Now`; the day log for Sep 14
lists exactly that day's visits with the right Out words, Previous shows Sep 13, the unit filter narrows it; the contact list for Sep 13–14
and Harbour wing shows the API's count; **Download CSV by a real tap** → the downloaded file's bytes equal
`GET /api/staff/contacts.csv` for the same range and unit, and its suggested filename equals the API's), `settings-m3.spec.mjs` (add a unit
with two windows → the visitor API's `hours_label` for a resident moved to it; overlapping windows → the API's message; add a resident
with a lower-case initial → shown upper-case and found by the visitor search; "Visits by arrangement only" → the visitor API refuses with
by_arrangement; remove a resident → not found; add staff with a taken PIN → the API's message under `#staff-pin`; turn off the last manager
→ the API's message), `door-sign.spec.mjs` (`decodeQr(page.locator('#door-qr'))` equals `<baseURL>/`; the page is white under print media
and `#print-sign` is hidden; the home name and SAMPLE show). M3 negative controls: (f) `local-tick` — the copy's Found button changes only
the page and sends nothing → the second-context check goes red; (g) `csv-stale-unit` — the copy's download ignores the unit picker →
the byte comparison goes red; (h) `qr-wrong-path` — the copy's QR encodes `/staff/` → the decode check goes red. Final screenshots of
every tab at 390 and 1024 into `app/tests/staff/shots/`.

## Main (vl-lead, not a slice)
Owns PLAN.md, AGENTS.md, DECISIONS.md, BRIEF.md, docs/API.md, docs/DEPLOY.md, docs/build-report.md, docs/shots/**, README.md,
package.json, demo.mjs, .gitignore, app/package.json, app/package-lock.json, app/playwright.config.mjs, app/tests/helpers.mjs,
app/tests/start-worker.mjs, app/tests/journey/**, app/public/theme.css, app/public/vendor/**. Merges each milestone after reading the diff,
sends cross-reviews (vl2 reviews vl1's M1 against API.md before its M2; vl1 reviews vl2's `common/api.js` calls read-only before M3; vl2
reviews vl1's visitor pages against Design at the end), writes `app/tests/journey/journey.spec.mjs` (a visitor phone signs in for Mary →
the nurse's-desk tablet sees them on Harbour wing → a roll call is started and they are ticked found → the visitor signs out on their
phone and the count drops → the manager adds an outbreak notice for Cove unit → a visitor for Agnes sees it and confirms, a visitor for
Frank does not see it → screening on with edited example questions → a "yes" is stopped and nothing is recorded → the contact list CSV
for today has the visitors → in the evening the Cove visitor's automatic sign-out at 7:00 PM closing shows in "not confirmed" → the next
day the old link is dead → 31 days later the visits are gone; chromium + webkit) and its negative control, runs `rig qa --ref <sha> --port 8409` for the Worker
suite, every negative control and the whole Playwright suite, takes `pwshot` screenshots into `docs/shots/` from `npm run demo`, writes
README / DEPLOY / build report, pushes the private repo, closes the slice tabs by id, removes worktrees, writes the status file.

## Open questions
None blocking. Anything that needs Alexander goes under NEEDS ALEXANDER in the status file.
