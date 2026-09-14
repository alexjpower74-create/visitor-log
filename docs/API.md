# Visitor Log: API contract (v1)

The contract between the Worker (vl1) and the pages (vl1 for the visitor's phone pages, vl2 for the staff pages and settings).
If the code and this file disagree, this file wins until the lead changes it. Written by vl-lead 2026-09-14. Questions go in
your build report; do not invent a different contract.

One Worker `visitor-log` serves the API under `/api/*` and the static app from `app/public/` (same origin, no CORS).
One deployment = one home. Local only tonight: `wrangler dev --local`.

JSON in, JSON out (the CSV route is the one exception). Errors are always
`{ "error": "<plain English for a Newfoundland visitor or staff member>", "code": "<machine code>", "field"?: "<input name>" }`
plus any extra keys named below.

| code | HTTP | when |
|---|---|---|
| `bad_request` | 400 | validation; `field` names the input |
| `unauthorized` | 401 | missing or expired token, or a wrong PIN (`field: "pin"`) |
| `forbidden` | 403 | the token's role may not use this route |
| `by_arrangement` | 403 | a visitor picked a resident whose visits are by arrangement only |
| `restricted_unit` | 403 | a visitor picked a resident on a unit (or a home) with an active `restricted` notice |
| `outside_hours` | 403 | a visitor signs in outside the unit's visiting hours |
| `screening_stop` | 403 | a screening answer is "yes" |
| `not_found` | 404 | unknown resident, unit, notice, staff member, visit, roll call or visit token |
| `already_in` | 409 | this phone number already has a visit in the building |
| `resident_full` | 409 | the resident already has as many visitors in the building as the home allows |
| `not_in` | 409 | staff sign out a visit that is already signed out |
| `pin_taken` | 409 | another staff member already has that PIN (`field: "pin"`) |
| `bad_state` | 409 | anything else not allowed from the current state (a roll call already going or already ended, a unit that still has residents, the last manager) |
| `link_expired` | 410 | a visitor's sign-out link after midnight of the day of the visit |
| `rate_limited` | 429 | too many PIN tries |

## Time and the test clock

- The home's zone is `America/St_Johns` (Newfoundland time; DST starts the second Sunday of March and ends the first Sunday of
  November, both at 2:00 AM). Every `date` is home-local `YYYY-MM-DD`. Labels: `date_label` `"Mon Sep 14"`, `long_label`
  `"Monday, September 14"`, any time label `"3:05 PM"` (bare time, no words; `"12:00 AM"` for midnight, `"12:00 PM"` for noon).
  Instants in JSON are ISO strings in UTC (`"2026-09-14T17:35:00.000Z"`).
- Pages never use the browser clock for dates or times. They take `today`, `now`, `now_local` (`"15:00"`) and labels from the API.
- A local time on a date becomes an instant with the offset actually in effect at that local time. The home's day starts at local
  midnight (never ambiguous in Newfoundland: the changes happen at 2:00 AM). For a local time that happens twice (1:00–1:59 AM on
  the first Sunday of November) use the first; for one that does not exist (2:00–2:59 AM on the second Sunday of March) use the
  instant one hour later.
- Only when the Worker runs with var `TEST_MODE=1` (never in `wrangler.toml`): header `X-Test-Now: <ISO instant>` replaces "now"
  and `X-Test-IP: <string>` replaces the client IP. Without `TEST_MODE=1` both headers are ignored.
- Test routes exist only under `TEST_MODE=1` (404 otherwise): `POST /api/test/reset`, `POST /api/test/maintenance`,
  `POST /api/test/seed` (M2). See the end.

## Visiting hours, "due", auto sign-out, "in the building"

- A unit's `hours` is a list of 1 to 4 windows `{ "open": "HH:MM", "close": "HH:MM" }`, the same every day, sorted, not
  overlapping (touching is allowed). `open` is `00:00`–`23:59`, `close` is `00:01`–`24:00`, `open < close`. `24:00` means the next
  local midnight. `[{ "open": "00:00", "close": "24:00" }]` is open visiting.
- `open_now`: the home-local time now is inside a window, `open <= now_local < close` (the close minute is outside).
- `hours_label`: each window `"8:00 AM to 11:30 AM"` (`24:00` reads `"midnight"`), joined `"A and B"`, `"A, B and C"`. Open visiting
  reads `"Open all day"`.
- **Closing** of a unit on a date = the `close` of its last window on that date.
- At sign-in the Worker stores two instants on the visit, computed from the unit's hours at that moment (a later change to the hours
  does not move them):
  - `auto_out_at` = closing on the visit's date, if `in_at` is before it; otherwise the next local midnight after `in_at`.
  - `due_at` = the `close` of the window that contains `in_at`; if `in_at` is in no window (a staff sign-in), the `close` of the next
    window that day; if none is left, `auto_out_at`.
- A visit is **in the building at instant T** when `in_at <= T`, and `out_at` is null or `out_at > T`, and `auto_out_at > T`.
  A visit whose `auto_out_at` has passed with `out_at` still null **is signed out**, `out_kind: "auto"`, `out_at = auto_out_at`.
  Every answer shows it that way whether or not maintenance has written it yet.
- `overdue` = in the building now and `now >= due_at`. With open visiting (or one window) `due_at` equals closing, so it never shows.
- **Maintenance** (`maintenance(env, now)`, one function): (1) writes `out_at = auto_out_at, out_kind = 'auto'` on every visit whose
  `auto_out_at <= now` and `out_at` is null; (2) deletes every visit older than the retention period and every roll call started
  before the same cutoff (with its entries); (3) deletes expired staff sessions and PIN attempts older than a day. It runs from
  `scheduled()` (cron `*/15 * * * *`, `event.scheduledTime`), at the start of every `/api/staff/*` and `/api/settings*` request and
  of both `/api/visit/:token` routes, and from `POST /api/test/maintenance`. It is idempotent.
- **Retention**: a visit's age in days = today (home-local) − the visit's `date` (its local sign-in date). It is kept while
  `age <= retention_days` and deleted when `age > retention_days`. With 30: a Sep 14 visit is still there all day Oct 14 and is gone
  from Oct 15 at 12:00 AM. No route ever returns a visit past that point, even before maintenance deletes it.
- A visit's sign-out link works until the next local midnight after `in_at` (`link_expires_at`).

## Auth

- `Authorization: Bearer <token>`. Tokens (staff sessions and visit tokens) are 32 random bytes, base64url (43 characters); the
  Worker stores only their SHA-256.
- Roles: `manager` (every staff and settings route), `staff` (staff routes only). A token on a route its role may not use → 403
  `forbidden` `"Only a manager can change the settings."`. No token or an expired one → 401 `"Please sign in again."`.
- PINs are 4 to 6 digits, unique in the home, stored as PBKDF2-SHA-256 (100 000 iterations) with a per-staff salt.
- Rate guard: 5 wrong PINs from one IP within 15 minutes → 429 `rate_limited` `"Too many tries. Wait 15 minutes, then try again."`
  for the rest of that window, even for the right PIN.

| method + path | who | body → answer |
|---|---|---|
| `POST /api/signin` | anyone | `{ pin }` → 200 `{ token, role, staff: { id, name }, expires_at }` (12 hours). Wrong PIN → 401 `"That PIN is not right."` `field: "pin"`. |
| `POST /api/signout` | any staff token | → 200 `{ ok: true }`; the token stops working. |
| `GET /api/info` | anyone | → `{ home_name, sample, phone, zone, retention_days, today, date_label, long_label, now, now_local, time_label }`. Before the home row exists (a migrated, empty D1) `home_name` and `phone` are `""`, `sample` is `false`, `retention_days` is `30`. |

## SAMPLE home (what `POST /api/test/reset` creates; tests rely on these ids)

- Home: `home_name` `"SAMPLE Harbourview Care Home (demo)"`, `sample: true`, `phone` `"709-555-0142"`, `retention_days` 30,
  `max_visitors_per_resident` 2, `after_hours_message` `"Visiting hours are over for now. If you need to see someone, please call the unit."`,
  `desk_message` `"Please see the nurse's desk."`, `screening_enabled` false, `screening_stop_message` `""`, **no screening questions**,
  **no notices**, no visits, no roll calls.
- Units (in this order): `u_harbour` "Harbour wing" `[08:00–11:30, 13:30–21:00]` (label `"8:00 AM to 11:30 AM and 1:30 PM to 9:00 PM"`);
  `u_lighthouse` "Lighthouse wing" `[00:00–24:00]` ("Open all day"); `u_cove` "Cove unit" `[10:00–19:00]` (`"10:00 AM to 7:00 PM"`).
- Residents (first name + last initial + room; nothing else is stored about them): Harbour wing `r_mary` Mary S. room 101,
  `r_george` George P. 104, `r_ellen` Ellen W. 108 (**by arrangement**); Lighthouse wing `r_frank` Frank O. 201, `r_rose` Rose B. 205,
  `r_walter` Walter K. 210, `r_margaret` Margaret L. 212; Cove unit `r_agnes` Agnes D. 301, `r_bill` Bill H. 304.
- A resident's `name` is `"<first_name> <last_initial>."`, and while the home is `sample` it ends `" (SAMPLE)"`: `"Mary S. (SAMPLE)"`.
- Staff: `s_donna` "Donna R. (SAMPLE)" manager PIN `7314`; `s_carl` "Carl B. (SAMPLE)" staff PIN `2580`; `s_amira` "Amira H. (SAMPLE)" staff PIN `4691`.
- SAMPLE phone numbers are `709-555-01xx` (a fictional range).

## Objects

`Notice` = `{ id, unit: null | { id, name }, severity: "info" | "restricted" | "outbreak", severity_label, message }`
(settings answers add `active`, `created_at`, `created_label` as `"Mon Sep 14, 3:00 PM"`). `severity_label`: info `"Notice"`, restricted `"Visiting restricted"`,
outbreak `"Outbreak"`. `unit: null` is the whole home. The home writes `message`; the app adds only the label and the unit name.
Lists of notices are ordered outbreak, restricted, info, then newest first. Only active notices are shown to visitors and staff.

`VisitorVisit` (what a visitor's own phone sees; never another visitor's phone number) =
`{ state: "in" | "out", home_name, visitor_name, resident: { name, room, unit_name }, date, date_label, in_at, in_label, out_at,
out_label, out_kind: null | "visitor" | "staff" | "auto", home_notices: [Notice], unit_notices: [Notice], link_expires_at }`.
`home_notices` are the active whole-home notices and `unit_notices` the active notices for the resident's unit, both as of now.

`StaffVisit` = `{ id, visitor_name, visitor_phone, resident: { id, name, room }, unit: { id, name }, date, date_label, in_at, in_label,
due_at, due_label, overdue, out_at, out_label, out_kind, method: "qr" | "staff", signed_in_by: null | "<staff name>", screened }`.
`visitor_phone` is `""` when staff signed in someone without a phone. `screened` is true when the home had screening on and every
answer was "no" (the answers themselves are never stored).

## Visitor routes (no account, no token)

| method + path | body → answer |
|---|---|
| `GET /api/visitor/start` | → `{ home_name, sample, phone, retention_days, today, date_label, time_label, home_notices: [Notice], screening: { enabled, questions: [{ id, text }] } }`. `questions` is `[]` when screening is off. |
| `GET /api/visitor/residents?q=` | `q` trimmed, at least 2 characters, else 400 `field: "q"` `"Type at least 2 letters of their first name, or their room number."`. All digits → rooms starting with `q`; otherwise first names starting with `q`, or `"<first> <initial>"` starting with `q` (case-insensitive). Active residents only, at most 8, sorted by first name then room. → `{ residents: [{ id, name, room, unit: { id, name } }] }`. |
| `GET /api/visitor/residents/:id` | → `{ resident: { id, name, room, unit: { id, name, hours_label, open_now } }, can_sign_in, reason, message, home_notices: [Notice], unit_notices: [Notice], needs_notice_confirm }`. `reason` is the first that applies of `by_arrangement`, `restricted_unit`, `outside_hours`, `resident_full`, else `null`; `message` is that reason's exact message (below) or `null`. `needs_notice_confirm` is true when an active `outbreak` notice applies (whole home or this unit). Unknown or inactive → 404. |
| `POST /api/visitor/signin` | `{ name, phone, resident_id, answers?: { "<question id>": "yes" \| "no" }, notice_confirmed?: true }` → 201 `{ token, out_url: "/out/?t=<token>", visit: VisitorVisit }`. |
| `GET /api/visit/:token` | → `{ visit: VisitorVisit }`. |
| `POST /api/visit/:token/signout` | → 200 `{ visit, already_out: false }` with `out_kind: "visitor"`; when the visit is already out (by the visitor, staff or auto) → 200 `{ visit, already_out: true }` and nothing changes. |

`POST /api/visitor/signin` checks in this order and stops at the first failure. **A refused sign-in stores nothing.**
1. `name` trimmed 2–60 characters with a letter, else 400 `field: "name"` `"Please type your name."`. `phone`: strip spaces, dashes,
   dots, brackets and a leading `+1` or `1`; exactly 10 digits, else 400 `field: "phone"` `"Please type a 10-digit phone number, like 709-555-0123."`.
   Stored and shown as `"709-555-0123"`. `resident_id` missing → 400 `field: "resident_id"` `"Please pick who you are visiting."`.
2. Unknown or inactive resident → 404 `"We can't find that resident. Please see the nurse's desk."`.
3. By arrangement → 403 `by_arrangement` `"Visits with <resident name> are by arrangement only. <desk_message>"`
   (`"Visits with Ellen W. (SAMPLE) are by arrangement only. Please see the nurse's desk."`).
4. An active `restricted` notice for the resident's unit or the whole home → 403 `restricted_unit`
   `"<unit name>: visitors can't sign themselves in right now. <desk_message>"`.
5. Outside the unit's hours → 403 `outside_hours` `"<after_hours_message> Visiting hours on <unit name>: <hours_label>."`
   (`"Visiting hours are over for now. If you need to see someone, please call the unit. Visiting hours on Harbour wing: 8:00 AM to 11:30 AM and 1:30 PM to 9:00 PM."`).
6. Screening on and any active question without a `"yes"`/`"no"` answer → 400 `field: "answers"` `"Please answer every question."`.
7. Screening on and any answer `"yes"` → 403 `screening_stop` with `screening_stop_message` exactly as the home wrote it.
8. An active `outbreak` notice applies and `notice_confirmed !== true` → 400 `field: "notice_confirmed"` `"Please read the notice, then tap I have read it."`.
9. The resident already has `max_visitors_per_resident` visits in the building → 409 `resident_full`
   `"<resident name> already has <n> visitors signed in. Please wait until someone signs out. <desk_message>"` (`n` = the limit;
   `"1 visitor"` when it is 1). A null limit never refuses.
10. The same phone number has a visit in the building → 409 `already_in` `"This phone number is already signed in, since <in_label>. Please sign out first."`.

The answer to `GET /api/visitor/residents/:id` uses the messages of checks 3, 4, 5 and 9 for `message`.

`GET /api/visit/:token`: unknown → 404 `"We can't find that visit. If you are still in the building, please tell the staff."`;
now `>= link_expires_at` → 410 `link_expired` `"This sign-out link has expired. It only works on the day of your visit."` (both routes).

## Staff routes (role `staff` or `manager`)

| method + path | body → answer |
|---|---|
| `GET /api/staff/building` | → `{ now, date_label, time_label, total, units: [{ id, name, hours_label, open_now, notices: [Notice], count, visits: [StaffVisit] }], auto_today: [StaffVisit], roll_call: null \| { id, started_label, total, found } }`. Every active unit in order, also with `count: 0`, then any closed unit that still has visitors in the building (nobody in the building is ever hidden); each unit carries `active`. `visits` are those in the building now, oldest sign-in first. `total` = the sum of the counts. `notices` = active notices for that unit or the whole home. `auto_today`: visits dated today signed out automatically, newest first. `roll_call`: the one going now. |
| `GET /api/staff/residents` | → `{ screening_enabled, units: [{ id, name, hours_label, open_now, restricted }], residents: [{ id, name, room, unit_id, by_arrangement }] }` (active only, residents by first name). |
| `POST /api/staff/visits` | `{ resident_id, visitor_name, visitor_phone?: "", screened?: true }` → 201 `{ visit: StaffVisit, warnings: [...] }`. Staff may sign someone in outside hours, for a by-arrangement resident, on a restricted unit or past the visitor limit: the visit is recorded and `warnings` lists each that applied, in order, as `{ code, message }` with the codes and messages of checks 3, 4, 5 and 9. `resident_id` missing or `""` → 400 `field: "resident_id"` `"Please pick who they are visiting."`; name as check 1 (`field: "visitor_name"`, `"Please type their name."`); a non-empty phone as check 1 (`field: "visitor_phone"`); unknown resident 404. Checks run in this order: resident missing, name, phone, unknown resident (404), `screened`, `already_in`. Screening on and `screened !== true` → 400 `field: "screened"` `"Ask the screening questions first. Only sign in a visitor who answered No to every one."`. A non-empty phone already in the building → 409 `already_in`. `method: "staff"`, `signed_in_by` = the staff member's name. |
| `POST /api/staff/visits/:id/signout` | → 200 `{ visit }` with `out_kind: "staff"`; already out (any kind) → 409 `not_in` `"That visitor is already signed out."`. |
| `GET /api/staff/visits?date=&unit=` | `date` default today, `unit` default `all` or a unit id → `{ date, date_label, unit, count, visits: [StaffVisit] }`: every visit with that local `date`, oldest first. Bad date → 400 `field: "date"`; unknown unit → 404. |
| `GET /api/staff/contacts?from=&to=&unit=` | (M2) → `{ from, to, unit, count, rows: [ContactRow] }`. `ContactRow` = `{ visit_id, date, date_label, unit_name, resident_name, room, visitor_name, visitor_phone, in_label, out_label, signed_out, signed_in_by }`; `signed_out` is `"Visitor"`, `"Staff"`, `"Auto at closing"` or `"Still in"`; `signed_in_by` is `"QR code"` or the staff name. By date, then sign-in time. Dates must be valid `YYYY-MM-DD` (a missing or bad `from` → 400 `field: "from"` `"Pick a real date."`, a bad `to` → `field: "to"`), `from <= to` (else 400 `field: "to"` `"The end date is before the start date."`), at most 366 days apart (else 400 `field: "from"`). |
| `GET /api/staff/contacts.csv?from=&to=&unit=` | (M2) the same rows as CSV. `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="visitor-contacts-<unit id or all-units>-<from>-to-<to>.csv"`. Header exactly `Date,Unit,Resident,Room,Visitor,Phone,In,Out,Signed out,Signed in by`; `Date` is `YYYY-MM-DD`, `In`/`Out` are time labels (`Out` empty when still in). CRLF after every line including the last; a field with a comma, quote, CR or LF is quoted with quotes doubled; a field starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`. Header only when there are no rows. Same validation as JSON. |
| `GET /api/staff/rollcall/current` | (M2) → `{ roll_call: null \| RollCall }`. |
| `POST /api/staff/rollcall` | (M2) → 201 `{ roll_call: RollCall }`. One already going → 409 `bad_state` `"A roll call is already going."` with `roll_call_id`. |
| `GET /api/staff/rollcall/:id` | (M2) → `{ roll_call: RollCall }`. |
| `POST /api/staff/rollcall/:id/found` | (M2) `{ visit_id, found: true \| false }` → 200 `{ roll_call }`. A visit not in the list → 404; ended → 409 `bad_state` `"This roll call has ended."`. |
| `POST /api/staff/rollcall/:id/end` | (M2) → 200 `{ roll_call }`; already ended → 409 `bad_state`. |

`RollCall` = `{ id, started_at, started_label, started_by, ended_at, ended_label, ended_by, total, found, entries: [{ visit_id,
visitor_name, visitor_phone, resident_name, room, unit: { id, name }, in_label, after_start, out_label, found, found_label, found_by }] }`.
Entries = every visit in the building at `started_at`, plus every visit signed in after `started_at` and (for an ended roll call)
before `ended_at` (`after_start: true`). A visitor who signs out during the roll call stays in the list with `out_label`. Sorted by unit
order, then visitor name. `total` = entries, `found` = entries marked found. Marks carry who and when (`found_by`, `found_label`).

## Settings routes (role `manager`; every write answers with the whole `settings` object)

`GET /api/settings` → `{ settings }` where `settings` =
`{ home: { home_name, phone, sample, retention_days, max_visitors_per_resident, after_hours_message, desk_message, screening_enabled,
screening_stop_message }, screening_questions: [{ id, text }], units: [{ id, name, hours, hours_label, active }], residents: [{ id,
first_name, last_initial, name, room, unit_id, by_arrangement, active }], notices: [Notice + active, created_at, created_label],
staff: [{ id, name, role, active }] }` (units in order, residents by first name, notices newest first, inactive rows included).

| method + path | body → answer (M1 unless marked) |
|---|---|
| `PUT /api/settings/home` | any of `{ phone, retention_days, max_visitors_per_resident, after_hours_message, desk_message }` → 200 `{ settings }`. Numbers may also be sent as strings of digits (form values). `retention_days` an integer 1–365 (`field: "retention_days"` `"Keep visitor records for 1 to 365 days."`); `max_visitors_per_resident` an integer 1–20, or `null` or `""` for no limit; messages 1–300 characters; phone as check 1 or `""`. Takes effect at once (the next maintenance uses the new retention). |
| `PUT /api/settings/screening` | `{ enabled, stop_message, questions: [{ id?, text }] }` → 200 `{ settings }`. Replaces the list (an `id` keeps that question's id). Question text 5–200 characters, at most 10 (`field: "questions"`). `enabled: true` with no questions → 400 `field: "questions"` `"Add at least one question before you turn screening on."`; with an empty `stop_message` → 400 `field: "stop_message"` `"Write what a visitor who answers Yes should do."`. |
| `POST /api/settings/notices` | `{ unit_id: null \| "" \| "<unit id>", severity, message }` (`""` is also the whole home) → 201 `{ id, settings }`. Message 1–300 characters (`field: "message"`); bad severity `field: "severity"`; unknown unit 404. Active on creation. |
| `PUT /api/settings/notices/:id` | any of `{ unit_id, severity, message, active }` → 200 `{ settings }`. |
| `DELETE /api/settings/notices/:id` | → 200 `{ settings }`. |
| `POST /api/settings/units` | (M2) `{ name, hours }` → 201 `{ id, settings }`. Name 1–40 characters, unique among active units other than the one being edited (`field: "name"`). Hours as above, else 400 `field: "hours"` `"Visiting hours need a start before the end, and the times can't overlap."`. |
| `PUT /api/settings/units/:id` | (M2) any of `{ name, hours, active }`. `active: false` while active residents are on it → 409 `bad_state` `"Move or remove the residents on this unit first."`. |
| `POST /api/settings/residents` | (M2) `{ first_name, last_initial, room, unit_id, by_arrangement }` → 201 `{ id, settings }`. `first_name` 1–30 letters, spaces, hyphens or apostrophes; `last_initial` one letter A–Z (stored upper case); `room` 1–10 letters, digits, spaces or hyphens; `unit_id` an active unit, else 400 `field: "unit_id"` `"Pick an open unit."`. |
| `PUT /api/settings/residents/:id` | (M2) any of those plus `active`. |
| `POST /api/settings/staff` | (M2) `{ name, role, pin }` → 201 `{ id, settings }`. `name` 1–60 characters (`field: "name"`), `role` `manager` or `staff` (`field: "role"`), `pin` 4–6 digits (`field: "pin"`); `pin_taken` 409. |
| `PUT /api/settings/staff/:id` | (M2) any of `{ name, role, pin, active }`. Leaving no active manager (by `active: false` or by changing the last manager's role) → 409 `bad_state` `"The home needs at least one manager."`. |

## Test routes (`TEST_MODE=1` only; 404 otherwise)

- `POST /api/test/reset` → 200 `{ ok: true }`: wipe everything, then the SAMPLE home above.
- `POST /api/test/maintenance` → 200 `{ auto_signed_out, deleted_visits, deleted_roll_calls }` using `X-Test-Now`.
- `POST /api/test/seed { "scenario": "demo" }` (M2) → 200 `{ today, out_url }`: the SAMPLE home plus, for the demo: a whole-home
  info notice `"SAMPLE notice: the side door is closed for painting this week. Please use the main entrance."` and an outbreak notice
  on Cove unit `"SAMPLE notice: Cove unit is on outbreak precautions. Please wear a mask and clean your hands before you go in."`;
  SAMPLE visits (visitor names end `"(SAMPLE)"`) on each of the last 20 days inside each unit's hours, some signed out by the visitor,
  some by staff, some automatically; today, whatever the hour: at least 3 visitors in the building on Lighthouse wing, one visit today
  signed out by the visitor and one by staff, and — when now is inside Harbour wing's afternoon window — one Harbour visitor signed in
  during the morning window and still in (overdue). Screening stays off. `out_url` is the sign-out link of a Lighthouse visitor in the
  building. Deterministic for a given `now`.

## Pages (paths the app serves)

`/` the visitor's sign-in (the door QR opens it), `/out/?t=<token>` the visitor's signed-in page and sign-out, `/privacy/` the privacy
notice, `/staff/` the staff pages, `/settings/` the manager's settings, `/settings/door-sign/` the printable door sign with the QR code.

## Screening example (settings page only; never saved or switched on by the app)

Shown under the label `"Example only. Change the words to your home's own before you turn screening on."`:
questions `"Do you feel sick today, for example with a fever, cough, vomiting or diarrhea?"` and
`"Has public health or a doctor told you to stay home right now?"`; stop message
`"Please don't visit today. Call the unit if you need to talk with someone."`.
