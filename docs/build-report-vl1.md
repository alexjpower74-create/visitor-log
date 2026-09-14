# Build report: vl1 (Worker, D1 and the rules; the visitor's phone pages)

A record, not a queue. Items are marked DONE or REJECTED in place.

## M1: Worker core

### What I built (DONE)

- `worker/wrangler.toml`: name `visitor-log`, `main = "src/index.js"`, D1 `DB` with the placeholder id, cron `*/15 * * * *`,
  assets `../app/public` with `run_worker_first = ["/api/*"]`. No `TEST_MODE` in `[vars]`.
- `worker/migrations/0001_init.sql`: home (single row), units (hours JSON, position), residents, staff (PIN hash + salt),
  sessions (`token_hash`), pin_attempts, notices, screening_questions, visits (`token_hash`, `in_at`, `date`, `due_at`,
  `auto_out_at`, `out_at`, `out_kind`, `method`, `signed_in_by`, `screened`), roll_calls and roll_call_entries (tables only).
  Indexes on `visits(date)`, `visits(out_at, auto_out_at)`, `visits(phone)`, plus `visits(resident_id)`.
- `worker/src/`:
  - `index.js`: router, `scheduled()` → `maintenance`; every `/api/staff/*` and `/api/settings*` path checks its role (even paths
    it does not answer) and runs maintenance first; both `/api/visit/:token` routes run maintenance first.
  - `http.js`: JSON and the one error shape. `clock.js`: now and client IP, honoured only under `TEST_MODE=1`.
  - `time.js`: NL local dates, labels and wall time → instant with `Intl` only (repeated hour → first, missing hour → one hour later).
  - `hours.js` (pure): validation, `open_now`, `hours_label`, `due_at`, `auto_out_at`.
  - `rules.js` (pure): the visitor sign-in decision in API.md's order (checks 1–10), phone and name cleaning, and `blockReasons`
    (checks 3, 4, 5, 9), which also gives the resident answer's `reason` and the staff `warnings`.
  - `auth.js`: PBKDF2-SHA-256 100 000 iterations with a per-staff salt, 43-character tokens stored as SHA-256, the 5-in-15-minutes guard.
  - `world.js`: one consistent read of the home; the single "in the building at T" rule (`inBuildingAt`) and `outOf` (a passed
    `auto_out_at` reads as `auto`); notice filters and ordering; `VisitorVisit` and `StaffVisit`.
  - `maintenance.js`: `maintenance(env, now)`: auto sign-out, retention deletes (visits and roll calls), expired sessions, old PIN attempts.
  - `sample.js`: the SAMPLE home for `POST /api/test/reset`. `visitor.js`, `staff.js`, `settings.js`: the M1 routes.
- Routes: all the M1 routes named in the brief. `csv.js` and `seed.js` are M2 and not written yet.
- `worker/tests/`: `run.mjs` (unit tests, then a fresh D1 in `.state-<PORT>`, `wrangler dev --local --var TEST_MODE:1` on PORT
  (default 8402, inspector +10), `api-empty` first, then the API suites; stops what it started), `api-helpers.mjs`,
  `time`, `hours`, `rules`, `retention` unit tests, `api-empty.test.mjs`, `api.test.mjs`, `count-property.test.mjs`,
  `negative-lib.mjs` + seven `negative-*.mjs` + `negative-all.mjs`, and `negative-control.log`.
- D1 reads in tests go through `wrangler d1 execute visitor-log --local --persist-to $STATE_DIR --json --command <SELECT>`
  (`d1()` in `api-helpers.mjs`; `run.mjs` sets `STATE_DIR`). Tests only ever SELECT.

### Verified (DONE)

`cd worker && npm test` in this worktree (port 8402, fresh D1): **unit 23/23 pass; empty D1 1/1 pass; API + property 36 pass,
0 fail, 1 skipped** (the inactive-resident search, with its reason). The count property ran 63 visitor and 51 staff sign-ins,
30 sign-outs by link and 56 by staff, 28 automatic sign-outs, and 38 of 40 checkpoints had people in (it asserts minimums for
each, so a run that measured nothing fails). These are working-tree numbers; the lead's numbers come from `rig qa`.

The first full run had 2 red tests, both mistakes in the tests, not the Worker, fixed in the tests: search "10" expected rooms in
room order, but API.md sorts by first name then room (Ellen 108, George 104, Mary 101); and the maintenance test ordered two
3:00 PM visits by `in_at, out_kind`, a tie. Both now assert API.md's order.

How the important checks could have failed, and what makes them red:
- Notice on the right unit: every active notice in `unit_notices` → Frank and Mary get the Cove outbreak (control a).
- Screening "yes": a sign-in that ignores the answer → 201 and a new D1 row; the test compares the building total, the day log
  count and `SELECT COUNT(*) FROM visits` before and after (control b).
- Count across midnight and the property: a passed `auto_out_at` not treated as out → 9:00 PM and 12:00 AM counts stay high
  (control c). The property's model uses only `time.js` wall times, never the Worker's `hours.js` or `world.js`.
- Retention: the setting ignored (control d) or the boundary off by one day (control e); both assert the day log **and** D1.
- The link: expiry at UTC midnight (9:30 PM in September) → the 11:59:59 PM GET is 410 (control f).
- Hours: the close minute counted as open → 11:30 AM lets Mary in (control g).
- Token storage: the tests read `visits.token_hash` and `sessions.token_hash` from D1, compare them with the SHA-256 of the token,
  and check the token itself appears nowhere in those tables.

### Negative controls (DONE)

`cd worker && npm run negative` (port 8405, `NEG_PORT` overrides): each copies `worker/` into `worker/.negative/<name>/`, patches
the copy (the anchor must occur exactly once, or the control fails with exit 2), runs the copy's own `run.mjs --fresh --api-only
--grep`, passes only if the named tests are `not ok`, and appends to `worker/tests/negative-control.log`. All 7 went red:

| control | break in the copy | red test |
|---|---|---|
| (a) `negative:notice-unit` | `world.js` `unitNoticesOf` returns every active notice | notice on the right unit |
| (b) `negative:screening` | `rules.js` drops the `screening_stop` refusal on a "yes" | screening: a yes stops the sign-in |
| (c) `negative:auto-out` | `world.js` `inBuildingAt`/`outOf` ignore `auto_out_at`; `maintenance.js` never writes auto | count across midnight **and** count property |
| (d) `negative:retention-setting` | `maintenance.js` `retentionDays` always 30 | retention: the manager sets 7 |
| (e) `negative:retention-boundary` | `maintenance.js` `keptFrom` deletes at age ≥ retention | retention: age 30 kept |
| (f) `negative:link-expiry` | `world.js` `linkExpiresAt` = UTC midnight after the date | sign-out link: works until 11:59:59 PM |
| (g) `negative:hours-close` | `hours.js` `openNow` uses `now <= close` | hours: Mary at 12:00 PM and at 11:30 AM |

The shipped code has no switch that turns any of these guards off.

### Decisions and questions for the lead

1. **The brief's across-midnight numbers do not add up.** Events: two Harbour visitors in at 2:00 PM, one out at 3:00 PM, a
   Lighthouse visitor in at 8:00 PM, a staff Harbour sign-in at 10:00 PM. By API.md's rule, at 8:59 PM that is Harbour 1 +
   Lighthouse 1 = **2** (the brief says 3, Harbour 2) and at 9:00 PM **1** (the brief says 2). 11:59 PM = 2 and 12:00 AM = 0
   agree. I kept the brief's events and asserted API.md's arithmetic (2, 1, 2, 0), with a comment at the test. If the lead meant
   three Harbour visitors, say so and I will change the events, not the rule.
2. **`created_label` on settings notices** has no format in API.md. I used `"Mon Sep 14, 3:00 PM"` (date_label, comma, time label).
3. **Lenient inputs, a superset of the contract** (for pages that send form values as text): `retention_days` and
   `max_visitors_per_resident` also accept a string of digits; `max_visitors_per_resident: ""` means no limit; a notice's
   `unit_id: ""` means the whole home (the Design's `#notice-unit` "Whole home" option has value `""`). Nothing valid is refused.
4. **Messages API.md does not spell out** (the field is exact, the words are mine): `q`/`date`/`unit` aside, `"Pick a real date."`,
   `"We can't find that unit."`, `"We can't find that notice."`, `"We can't find that visit."` (staff sign-out),
   `"We can't find that resident."` (staff sign-in), `"You can have up to 10 questions."`, `"Each question needs 5 to 200 characters."`,
   `"Turn screening on or off."`, `"Allow 1 to 20 visitors per resident, or leave it blank for no limit."`,
   `"Write the after-hours message in 1 to 300 characters."`, `"Write the desk message in 1 to 300 characters."`,
   `"Write the notice in 1 to 300 characters."`, `"Pick Notice, Visiting restricted or Outbreak."`, `"Turn the notice on or off."`,
   `"Send the details as JSON."` (`field: "body"`), `"There is nothing here."` (unknown API path, 404).
5. **Screening questions are sorted** with a position; a `PUT` that leaves out `enabled`, `stop_message` or `questions` keeps the
   saved value. The stop message is stored exactly as sent (not trimmed), so the 403 returns it byte for byte.
6. **Hours windows are sorted on save** (validation accepts them in any order, then stores them sorted). Relevant from M2.
7. **Staff sign-in order of checks**: name, phone, unknown resident (404), `screened`, then `already_in`. The staff
   `screened` flag is stored true only while screening is on.

### Left undone in M1

- `GET /api/staff/building` answers `roll_call: null` always: no M1 route can start one. M2 fills it in with the roll call routes.
- "An inactive resident is not found" is a skipped test with the reason (no M1 route can turn a resident off). M2.
- `deleted_roll_calls` is asserted as 0 only; roll calls cannot be created before M2 (the tests only SELECT from D1).
- `csv.js`, `seed.js`, `tools/first-setup.mjs`: M2.

### Needs from another slice

None for M1.

### Lead's answers to the M1 questions (DONE)

1. Midnight numbers: PLAN.md now says 2 at 8:59 PM and 1 at 9:00 PM; events and assertions kept. 2. `created_label` format is in
API.md. 3. The lenient inputs are now the contract. 4. My wording stands. 5–7 stand, except the staff sign-in check order, which
changes in M2 (resident missing first).

## Cross-review of vl2 M1 (read-only, before vl1 M2)

Read on main after 3885c0c: `app/public/common/api.js`, `app/public/staff/staff.js`, `app/public/settings/settings.js`, plus
`showError` in `common/ui.js` and the `name=` / `data-error-for=` attributes in `staff/index.html` and `settings/index.html`.
Every request body and query was checked against docs/API.md and against my Worker (M1 routes) or the M2 routes I am about to
build. I edited none of vl2's files.

**Matches (DONE):**
- `api.js`: Bearer token; JSON bodies; `POST` with `{}` for sign-out, roll call start/end and staff sign-out (the Worker accepts
  `{}` or no body); a 401 clears the session except on `/api/signin`; `download()` parses `filename="visitor-contacts-….csv"`
  from `Content-Disposition`, which is the header I will send.
- Staff sign-in (`POST /api/staff/visits`): `{ resident_id, visitor_name, visitor_phone }` always as strings, `resident_id: ""`
  when nobody is picked, `screened: true` only when the box is ticked (left out otherwise). All as API.md.
- Day log: `?date=<info.today or the date input>&unit=all|<id>`.
- Notices: `POST` sends `unit_id: null` for "Whole home"; `PUT { active }`; `DELETE`.
- Screening `PUT`: `{ enabled: boolean, stop_message: string, questions: [{ id?, text }] }`. Ids come from
  `settings.screening_questions`, so an edit keeps them; rows filled by "Use the example" have no id and get new ones.
- Visits and privacy: digit strings become numbers (`intOrRaw`), anything else is sent raw and refused with its field;
  `max_visitors_per_resident: null` when blank; `phone` may be `""`.
- Units: `{ name, hours: [{ open, close }] }`. A time input cannot hold 24:00, so the page shows a 24:00 close as 00:00 and sends a
  00:00 close as `"24:00"`. The Worker accepts a `"24:00"` close and refuses a `"00:00"` close, so that mapping is needed and right;
  an `open` of `"00:00"` is sent as is. Blank time inputs send `""` → 400 `field: "hours"`, which has a slot.
- Residents: `{ first_name, last_initial, room, unit_id, by_arrangement: boolean }`; "Remove" is `PUT { active: false }`.
- Staff: `POST { name, role, pin }`; `PUT { name, role }` plus `pin` only when typed; "Turn off/on" is `PUT { active }`.
- Roll call: `GET current`, then `GET :id` once it has ended (current is null by then); `POST found { visit_id, found: boolean }`;
  start and end with `{}`; the 409's `roll_call_id` is read from the error body; `started_by`, `ended_by` and `found_by` are shown
  as names; every entry field it reads is in API.md's `RollCall`. The building banner reads `roll_call.found` and `.total`.
- Contacts: `?from=&to=&unit=all|<id>`; every `ContactRow` field it reads is in API.md.

**What this means for my M2 (no change asked of vl2):**
1. **Staff sign-in order.** With nobody picked and no name, my M1 Worker answers the name error first, so the page shows "Please type
   your name." instead of the resident error. M2 moves `resident_id` first, as API.md now says.
2. **A unit edit re-sends its own name**, so "name taken" must ignore the unit being edited. I will test it.
3. **The last-manager guard must also catch a role change** (manager → staff through `PUT { name, role }`), not only
   `active: false`. I will guard and test both.
4. **Empty contact dates.** `api.qs` keeps `""`, so a cleared date input sends `from=`. API.md says the dates must be valid but
   names no field for a bad one. I will answer 400 `field: "from"` or `field: "to"`, so it lands in their `from`/`to` slot.
5. **A resident on a closed or unknown unit.** API.md says "active unit" with no code. I will answer 400 `field: "unit_id"`
   (not 404), so the message lands under the resident form's unit picker instead of the general error.
6. **Staff name and role rules** are not in API.md. I will take a name of 1–60 characters (`field: "name"`) and a role of
   `manager` or `staff` (`field: "role"`); both have slots.
7. Fields with no slot fall back to the form's general error, which is fine: `enabled` (screening) and `active` (row errors).

No mismatch needs a change in vl2's files.

## M2: Worker, the rest

### What I built (DONE)

- **Staff sign-in order** (`staff.js`), as API.md now says: `resident_id` missing or `""` → 400 `field: "resident_id"`
  "Please pick who they are visiting."; then the name ("Please type their name."), the phone, an unknown resident (404),
  `screened`, `already_in`.
- **Units, residents and staff settings** (`people.js`): `POST`/`PUT /api/settings/units`, `/residents`, `/staff`, with the
  cross-review's points built in:
  - A unit name must be unique among open units (ignoring case), and the unit being edited doesn't count against itself.
  - Hours are sorted on save; a close of `24:00` is accepted.
  - Closing a unit that still has active residents → 409. A closed unit's name is free for a new unit, and the old unit can't
    reopen under a name that's now taken.
  - Residents: first name, initial (stored upper case), room and unit validated; a closed or unknown unit → 400 `field: "unit_id"`.
  - Staff: PINs are unique across all staff, including anyone turned off (`pin_taken` 409 with `field: "pin"`). The last-manager
    guard covers both turning them off and changing their role to staff. A staff edit without `pin` keeps the PIN.
- **Roll call** (`rollcall.js`): the list is worked out from the visits every time. It is every visit in the building at the
  start, plus every sign-in after the start (and before the end, once ended). The table stores only the ticks. A second tick on
  someone already found keeps the first finder. Unticking clears the tick. Starting when one is already going is refused at the
  database, not just checked first, so two tablets pressing Start at once can't both succeed. `GET /api/staff/building`'s
  `roll_call` now carries the one going.
- **Contact list** (`contacts.js`, `csv.js`): JSON and CSV share one query and one retention cutoff. The CSV quotes and guards
  fields as API.md says, ends every line with CRLF, and names the file as API.md says.
- **Demo seed** (`seed.js`): `POST /api/test/seed { scenario: "demo" }`. The ids, names, times and notices are the same for the
  same "now". Only the sign-out tokens are random, so a demo link can't be guessed.
- **`tools/first-setup.mjs`**: writes the home row (`sample = 0`, API.md defaults) and one manager, hashed as `auth.js` does,
  into a git-ignored file. It makes no network calls and adds no SAMPLE rows, units or residents. `npm test` now ends with a
  setup stage: a fresh D1, the tool's SQL, and a Worker **without** `TEST_MODE`.

### Verified (DONE)

`cd worker && npm test` in this worktree (port 8402): **unit 26/26 pass** (adds `csv.test.mjs`); **empty D1 1/1 pass**;
**API M1 + count property + M2 48/48 pass, 0 skipped** (the M1 inactive-resident skip is now a real test in `api-m2.test.mjs`);
**first setup 1/1 pass**. The first-setup check runs `tools/first-setup.mjs` against a freshly migrated D1 and starts the Worker
without `TEST_MODE`. It checks that:
- the manager PIN signs in, and the SAMPLE PIN 7314 doesn't;
- `/api/info` has the home with `sample: false`, and `X-Test-Now` is ignored;
- all three test routes answer 404;
- a unit and a resident added through settings read "Check T." with no "(SAMPLE)".

These are working-tree numbers; the lead's come from `rig qa`. Nothing was left behind: no state folders, no `first-setup.sql`,
and the ports are free.

What the M2 tests assert, and what would make them red:
- **Roll call:** a sign-in after the start makes 4, while a list of only the visits in the building at the start stays 3
  (control i). The test also checks: a sign-out during the roll call stays listed with its time; two tokens tick, and the first
  finder is kept; unticking clears the tick; a second start is 409 with `roll_call_id`; ticks after the end are 409; a sign-in
  after the end isn't added; `current` is null afterwards; the building banner summary matches.
- **Contacts:** four visits over Sep 13 and 14 on two units, with all four "Signed out" words and both "Signed in by" words.
  The unit filter narrows them (control l); `from > to`, bad dates and the 366-day limit are refused with their fields; a visit
  past retention is in neither the JSON nor the CSV.
- **CSV:** the exact header; CRLF on every line with no bare LF; the O'Brien name quoted; the HYPERLINK formula and a leading
  `@` guarded (control h); the exact filename for all units and for one unit; the header only when there are no rows. Every CSV
  line, read back by the test's own parser and guard, equals its JSON row.
- **Staff:** turning off the last manager, or making them staff, is 409 (control j). A turned-off manager's session and PIN
  stop working. A PIN change retires the old PIN. `pin_taken` applies on add and on change, and a person's own PIN doesn't
  count against them.
- **Seed:** at 3:00 AM and at 3:00 PM, at least 3 on Lighthouse; exactly one overdue visitor at 3:00 PM (Harbour, in at
  10:40 AM, due 11:30 AM) and none at 3:00 AM; each of the last 20 days has visits; all three sign-out kinds appear; the
  demo notices are on the right units; `out_url` answers 200 while the visit is in; the same "now" gives the same day log;
  every seeded visitor name ends "(SAMPLE)".
- **Rate guard:** the M1 429 test is control k's target.

### Negative controls (DONE)

`cd worker && npm run negative` (port 8405) now runs all 12 controls. The M1 seven (a–g) and the M2 five all went **RED as
intended**, each on its named test; the output is appended to `worker/tests/negative-control.log`.

| control | break in the copy | red test |
|---|---|---|
| (h) `negative:csv-guard` | `csv.js` `cell` drops the apostrophe guard | contacts CSV |
| (i) `negative:rollcall-after-start` | `rollcall.js` `onRollCall` keeps only visits in the building at the start | roll call |
| (j) `negative:last-manager` | `people.js` `putStaff` drops the last-manager 409 | staff: turning off the last manager |
| (k) `negative:ratelimit` | `auth.js` `recordWrongPin` writes nothing | pin guard (M1 test) |
| (l) `negative:contacts-unit` | `contacts.js` keeps every unit's visits | contacts: rows for a range … and the unit filter |

The shipped code has no switch that turns any of these guards off.

### Questions for the lead

1. **A closed unit hides visitors who are still in.** API.md lists only active units in `GET /api/staff/building` and lets a
   unit close once its residents are gone. So a visitor still signed in on that unit drops out of `total`, which is the
   fire-drill count. My test signs that visitor out before closing the unit. Options: refuse closing a unit with visitors in
   the building (409 `bad_state`), or keep closed units with visitors in the building on the card list. I have not changed the
   contract; please decide.
2. The words API.md does not give are mine: unit name / taken, first name, initial, room, "Pick an open unit.", staff name,
   role, PIN, `pin_taken`, "Pick a start date." / "Pick an end date." / "Pick dates no more than 366 days apart.", "That visitor
   is not on this roll call.", "Say whether they were found.".

### Lead's answers to the M2 questions (DONE)

1. Closed units: decided in API.md (ead4387) and DECISIONS #18. The building view lists every open unit, then any closed unit that
   still has visitors in the building, and each unit carries `active`. 2. My wording for the unspecified messages stands. API.md
   now says "Pick a real date." for a bad contact-list date; I changed my "Pick a start date." / "Pick an end date." to match.

## M3: the visitor pages

### Two fixes first (DONE, each committed with its test)

1. **Closed units stay in the building view** (`14afc3c`). `GET /api/staff/building` lists every open unit, then any closed unit
   with visitors still in, and each unit carries `active`; the total counts them. Test: a visitor in on Cove, Cove's residents
   removed, Cove closed. Cove is still listed with `active: false`, count 1, total 1; a new open unit is listed before it; once the
   visitor is signed out, Cove leaves the list. `npm test`: unit 26/26, empty D1 1/1, API 49/49, first setup 1/1. **Control (q)
   `negative:closed-unit-hidden`** (the copy lists active units only) went **RED as intended**, failing with "Expected values to
   be strictly deep-equal" on the unit list. The output is in `worker/tests/negative-control.log`.
2. **`tools/first-setup.mjs` is text again** (`b39e245`). Line 18 held literal NUL..0x1F and DEL bytes inside the regex class, so
   git treated the file as binary. The class is now written `\x00-\x1f\x7f`; `file` reports "JavaScript source, Unicode text,
   UTF-8 text" for both the working copy and the committed blob. The first-setup stage of `npm test` passes 1/1. `git show`
   still prints "Bin" for this one commit, because the old side of that diff was binary; later diffs of the file are normal text.
   A scan of every other file I wrote found no control bytes.

### Contract addition the lead needs to write into API.md

**`GET /api/visitor/start` → `screening.stop_message`** (the home's words; `""` while screening is off). The Design says a "Yes"
at once shows `#stop` with the home's stop message *and sends nothing*. Your journey spec checks both. But API.md's start answer had
only `{ enabled, questions }`: the stop message existed only in the 403 to a `POST`, so a page could not show the words without
sending. The field is additive, and vl2's pages (which read only `screening.questions`) are unaffected. Tests: the M1 visitor-start
and empty-D1 tests now expect `stop_message: ""`, and the screening test expects the exact stop message, byte for byte, alongside
the questions.

### The visitor pages (DONE)

- **`/`** (`app/public/index.html`, `visit/sign-in.js`): the header shows the home name and SAMPLE; `#home-notices` sits above
  everything. **Step 1**, "Sign in to visit": `#name`, `#phone`, the privacy line with the API's retention days and `#privacy-link`,
  `#continue`, and `#not-you`. Name and phone are saved in `localStorage` `visitor-log:me` on Continue. **Step 2**, "Who are you
  visiting?": `#search` with the under-2-letters hint; `button.resident[data-resident]`, or "No one matches…". **Step 3**:
  - the resident and their room and unit;
  - `#blocked` with the API's `message`, the unit's notices and `#pick-else` when `can_sign_in` is false;
  - otherwise `#unit-notices`, then `#confirm-notice` (`aria-pressed`) when `needs_notice_confirm`;
  - `#screening` with `.question[data-question]` and `button.answer[data-answer]`;
  - a "Yes" shows `#stop` at once with the home's words, hides `#sign-in` and sends nothing; `#stop-back` clears the answers;
  - `#sign-in` is enabled only when every answer is No and the notice (if any) is confirmed.

  Picking a different resident clears the notices, the refusal, the answers and the confirmation before anything new shows. A
  sign-in moves the page to `/out/?t=` with `history.replaceState`, and the token is kept in `visitor-log:visit`, so opening `/`
  again shows the visit while it is in. API errors show the API's text in `#error`, under the field it names (a name or phone
  error takes the visitor back to step 1).
- **`/out/?t=`** (`out/index.html`, `visit/out.js`): `#signed-in` (a check, "Signed in", `#in-time`, "Visiting …", the notices,
  `#sign-out`, "Keep this page. This sign-out link works until midnight tonight."), or `#signed-out` (`#out-time` and the sentence
  for the visitor, staff or auto sign-out, "Thank you for visiting.", "Sign in again"). A 404 or 410 shows `#link-error` with the
  API's text and a Sign in link, and nothing about any visit anywhere in the DOM.
- **`/privacy/`** (`privacy/index.html`, `visit/privacy.js`): the sections and words from the Design, with the home's name,
  retention days and phone from the API.
- Shared in `visit/visit.js` and `visit/visit.css`: 18 px type, every button at least 56 px and Sign in / Sign out 64 px, notice
  cards (a 6 px edge in `--sev` and the severity pill), no glow. The sticky header's real height is kept as the page's scroll
  padding (below).

### Verified (DONE)

Playwright, `E2E_PORT=8404 npx playwright test tests/visit` (chromium-390 and webkit-390, the real Worker): **16/16 pass** (8 tests × 2 engines), after
the header fix and after every control ran, so the committed screenshots come from green code. The worker suite for the M3 Worker
changes: unit 26/26, empty D1 1/1, API 49/49, first setup 1/1. These are working-tree numbers; the lead's come from `rig qa`.
- `visit.spec.mjs`, 7 tests, following PLAN's M3 list: a first visit by real input; the notice on the right unit (including Back,
  pick Frank); screening "Yes" (no `POST /api/visitor/signin` seen by `page.on('request')`, and the building total unchanged);
  blocked (by arrangement, restricted, outside hours); the link (another phone, staff and automatic sentences, yesterday's link
  after midnight showing only the 410 text); privacy (30 days, then 14).
- `targets.spec.mjs`, 1 long test across every step: buttons at least 56 px and hit-tested; Sign in and Sign out at least 64 px;
  SAMPLE on `/`, `/out/` and `/privacy/`; no sideways scroll; Sign in contrast at least 4.5; the sticky header.
- Screenshots of every step (details, search, resident, signed in, signed out, notice, stop, the three blocked screens, staff and
  automatic sign-out, link expired, privacy) in `app/tests/visit/shots/`, both engines.

**A check that measured nothing, and the bug it was hiding (DONE).** My first "sticky header never covers" check passed while the
header was covering buttons. At 390 px the home name wraps and the header is about 112 px tall, but the scroll padding was a fixed
96 px. The lead's `expectTapTarget` hit-tests only a button's centre, and on a short page the buttons never scrolled far enough to
reach the header. I made the check real in three steps, recording each:
1. A hit-test just inside the top edge, plus a guard that at least one target actually reaches the header. The run went red on
   the guard in both engines ("at least one target must reach the header, or the sticky header check measures nothing",
   Received 0): the check had been measuring nothing.
2. The test home gets 8 screening questions (the home may have up to 10), so the first answers can scroll up under the header.
   Against the old CSS it then went red for the real reason in both engines: "under the sticky header: No: its top edge is
   covered", with the tap landing on `<div class="v-inner">`.
3. The fix: `visit.js` keeps `--header-h` at the header's measured height (`ResizeObserver`), and the page's
   `scroll-padding-top` is that height plus 16 px (CSS fallback 0, so nothing else rescues it). The header is also a little
   more compact. Green in both engines. **Control (r) `negative:header-covers`** removes the measurement in a copy and went red.

### Negative controls (DONE)

`cd app && node tests/visit/negative-all.mjs` (port 8406): each copies `app/public` and `worker/` into `app/.negative/visit-<name>/`,
patches the copy (the anchor must occur exactly once), runs one named test against a Worker started from the copy, and passes only
if that test is the one that failed, with the named text in the output. All went **RED as intended**; the output is in
`app/tests/visit/negative-control.log`.

| control | break in the copy | red test and output |
|---|---|---|
| (m) `stale-notice` | `sign-in.js` `pick()` no longer clears `#unit-notices` | the notice on the right unit: the `[data-severity="outbreak"]` count is not 0 after picking Frank |
| (n) `yes-posts` | `sign-in.js` `answer()` submits the sign-in on a "Yes" (the server's 403 then shows the same stop message) | screening: "a Yes must not send a sign-in", Received one POST |
| (o) `overlay` | `visit.js` adds a transparent full-screen cover over the signed-in screen | a first visit: `tap(Sign out)` "something else is on top" |
| (p) `forget-me` | `sign-in.js` `remember()` no longer stores name and phone | a first visit: `#name` `toHaveValue('Linda K. (SAMPLE)')` fails on the return to `/` |
| (r) `header-covers` | `visit.js` never measures the header (scroll padding 16 px) | targets: "its top edge is covered", the tap lands on the home name |

(n) is worded differently from PLAN ("treats Yes as No"). A copy that treats Yes as No shows no stop screen at all, so the test
fails at `#stop` and never reaches the no-POST check PLAN names. My copy sends the "Yes" instead: the screen looks the same (the
server's 403 carries the same words), so only the no-POST check can catch it.

### For the lead

1. **Your journey spec fails at step 3 on vl2's page, not the visitor pages.** Line 74, `desk.getByText(/1 of 1 found/)`,
   matches two elements after the roll call ends (`#roll-call-progress` and the per-unit count `.roll-unit-count`), a strict-mode
   violation in both engines. I ran an untracked scratch copy (deleted afterwards) with only that locator narrowed to
   `#roll-call-progress` and screenshots off, on my port 8404. **It passed in chromium-tablet and webkit-tablet**, so every
   visitor id, word and behaviour the journey uses works on these pages. I did not edit your file. Its screenshots from my first
   run landed in `app/tests/journey/shots/` in this worktree; I deleted them, uncommitted.
2. **`GET /api/visitor/start` → `screening.stop_message`** needs a line in API.md (committed in `0be21fb`; see the contract
   addition above).
