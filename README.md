# Visitor Log

QR sign-in for visitors at a long-term care home, personal care home or group home in Newfoundland and Labrador. A visitor scans
the code at the door and signs in and out on their own phone; staff see who is in the building right now, run a fire-drill roll
call and pull a contact list. Local build only; nothing is deployed or sent.

## Open it (on this computer)

```
cd ~/Projects/"Visitor Log"
npm run demo
```

Then open:

| Screen | Address | PIN |
|---|---|---|
| Visitor sign-in (what the door QR opens) | <http://127.0.0.1:8401/> | none |
| Staff: in the building, roll call, day log, contact list, sign someone in | <http://127.0.0.1:8401/staff/> | `2580` Carl, `4691` Amira (staff), `7314` Donna (manager) |
| Settings: notices, screening, visits and privacy, units and hours, residents, staff, door sign | <http://127.0.0.1:8401/settings/> | `7314` |
| The printable door sign with the QR code | <http://127.0.0.1:8401/settings/door-sign/> | none |
| A visitor's sign-out page | printed by `npm run demo` (works until midnight) | none |

`npm run demo` keeps its data between runs; `npm run demo -- --fresh` starts again from the SAMPLE seed. It needs Node 22+ and
`wrangler` 4.131+ on the PATH, and runs the Worker with `wrangler dev --local`.

## What is real and what is SAMPLE

- **SAMPLE:** everything. The home "SAMPLE Harbourview Care Home (demo)", its units and visiting hours, every resident (names end in
  "(SAMPLE)"; first name, last initial and room only), every visitor and staff member, their phone numbers (the fictional
  709-555-01xx range), the notices and the visits in the demo. No real people, homes or health information.
- **Real:** the rules the app enforces, which are the home's own settings, not anything the app claims about health: visiting hours
  per unit, the visitor limit per resident, notices written by the home, screening questions written by the home (none are switched
  on by default; the example is marked "Example only"), and deleting visitor records after the home's retention period (30 days by
  default).

## What it does

- **Visitors (no app, no account):** name and phone (remembered on that phone), pick the resident by first name or room, read the
  home's notice, answer the home's screening questions if it has them on, and sign in. The signed-in page has a big Sign out button
  and a link that works until midnight. Outside visiting hours, for a resident whose visits are by arrangement, or on a unit where
  visiting is restricted, the visitor sees the home's message and is sent to the nurse's desk. A "Yes" to a screening question
  stops the sign-in on the spot and nothing is stored.
- **Staff:** who is in the building now by unit with sign-in times and "Overdue", signing someone out, the automatic sign-outs at
  closing listed as "not confirmed", a fire-drill roll call that several phones can tick at once, the day log, a contact list for a
  date range and unit with a CSV download, and signing in a visitor who has no phone (with a warning when a rule would have stopped
  them).
- **Settings (manager):** notices with severity (Notice / Visiting restricted / Outbreak) for the whole home or one unit, screening
  questions and the home's own "please don't visit" words, the retention period and visitor limit, units and visiting hours,
  residents, staff PINs, and the printable door sign.

## Tests

_Filled in from the final QA run (pinned sha, one run, nothing re-run). Until then this section is not a result._

## What deploying needs

Nothing is deployed. `docs/DEPLOY.md` has the steps. In short: D1 database `visitor-log`, Worker `visitor-log` (static assets from
`app/public`), a cron trigger `*/15 * * * *` for automatic sign-out and retention deletes, **no secrets** (PINs are hashes in D1),
no R2 or KV. The real home and its first manager come from `worker/tools/first-setup.mjs`. Never set `TEST_MODE`.

## Where to pick this up

- `PLAN.md` is the build contract, `docs/API.md` the API, `DECISIONS.md` every call made overnight.
- `docs/build-report.md` has the QA history and the negative controls; the slices' own reports are `docs/build-report-vl1.md` and
  `docs/build-report-vl2.md`.
