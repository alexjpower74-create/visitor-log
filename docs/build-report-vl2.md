# Build report — vl2 (staff pages and settings)

## M1 — pages (DONE, 2026-09-14)

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
  deliberately broken copy. The brief puts the real negative controls (`stale-total`, `overlay`, …) in M2 against the Worker; I did
  not build them early. These M1 results come from the mock, not the Worker.
- Screenshots: `app/tests/staff/shots/chromium-{390,tablet}-*.png` (16 per size: staff sign in, building, building with a confirm,
  roll call none/going, day log, contacts, sign someone in, every settings tab, door sign). WebKit copies went to the git-ignored
  `app/tests/results/vl2-webkit-shots/`. I looked at the tablet building, roll call, screening, the 390 confirm and the 390 door sign;
  that review found "Use the example" leaving an old error on screen, now fixed.

### Left undone / known gaps
- No Playwright specs yet (M2/M3 per brief; they need vl1's Worker). No negative controls yet (M2/M3).
- `targets.spec` checks (44/64 px hit-tests, contrast, sticky header over Sign out) have not been run. On a 390 phone the sticky
  header is about 140 px tall (the home name, badge, time, name and two buttons wrap). It works, but it's a candidate to shrink in M2.
- Removed residents and turned-off units are not restorable from the Residents list (the list shows active residents only; a unit
  can be opened again).
- I did not open `~/.codex/memories/cobalt/` at the start: the global note asks for it, but rule 8 of the build brief says reading outside
  the worktree stops an unattended agent on a permission prompt. Flagging the conflict for whoever runs the next session.

### Questions for the lead (docs/API.md)
1. `POST /api/staff/visits` with no `resident_id`: API.md gives the 404 for an unknown resident but no 400 for a missing one. The
   page sends what is picked (`""`) and shows whatever comes back under `#manual-resident` (`field: "resident_id"`) or in
   `#manual-error`. Please confirm the Worker's answer.
2. Staff pages have no route that returns who is signed in; the page keeps `{ role, name }` from `POST /api/signin` in
   `localStorage` `visitor-log:staff-who`. If the lead would rather have `GET /api/me`, the header is one call away.
3. Settings in this page share the staff token key, so a staff member who types their PIN on `/settings/` is signed in on `/staff/`
   too (the settings page shows the 403 text). That seemed right for one shared desk tablet; say if not.

### Needs from other slices
- None for M1. `rig guard` flags `app/node_modules` (the lead's symlink, untracked, not matched by `.gitignore`'s `node_modules/`
  because a symlink isn't a directory). I did not commit it. The lead may want `node_modules` without the slash in `.gitignore`.
