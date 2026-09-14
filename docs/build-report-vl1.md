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
