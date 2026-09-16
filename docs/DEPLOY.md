# Visitor Log: deploying

## What is live (2026-09-15, on Alexander's go)

| Piece | Value |
|---|---|
| Worker + app | <https://visitor-log.alexjpower74.workers.dev> (`visitor-log`, one Worker serving `/api/*` and `app/public/`) |
| D1 | `visitor-log`, id `81c7a857-cbd2-4eb6-85ea-a7b645381653`, migration `0001_init.sql` applied `--remote` |
| Cron | `*/15 * * * *` (maintenance) |
| Secrets, R2, KV | none |
| Data | the SAMPLE home only (`/api/info` says `sample: true`) |

How the SAMPLE data got there without `TEST_MODE` in production: one temporary `wrangler deploy --var TEST_MODE:1`, one
`POST /api/test/seed {"scenario":"demo"}`, then `wrangler deploy` again with no var. `POST /api/test/reset` answers 404 on the
live Worker. The seeded visits age out after the 30-day retention period; to refresh the demo, repeat those three steps.

## For a real home

Everything below is what a real deployment for one home needs. One deployment is
one home: its own D1 database, its own Worker, its own address.

## What it is on Cloudflare

| Piece | Name | Notes |
|---|---|---|
| Worker | `visitor-log` (or `visitor-log-<home>`) | `worker/`; serves `/api/*` and the pages in `app/public/` as static assets |
| D1 database | `visitor-log` (or `visitor-log-<home>`) | binding `DB`; migrations in `worker/migrations/` |
| Cron trigger | `*/15 * * * *` | in `worker/wrangler.toml`; runs maintenance: automatic sign-out at closing, retention deletes, expired sessions |
| Secrets | none | staff PINs are PBKDF2 hashes in D1; tokens are stored as SHA-256 |
| R2, KV, Queues | none | |
| Domain | the home's choice | the door sign's QR code is made from whatever address the page is opened at |

**Never set `TEST_MODE`.** It turns on `X-Test-Now` (a fake clock), `X-Test-IP` and the `/api/test/*` routes (including wiping the
database). It is only ever passed on the command line in tests and `npm run demo`, never in `wrangler.toml` or the dashboard.

## Steps (from `worker/`)

1. `wrangler d1 create visitor-log` and paste the `database_id` it prints into `worker/wrangler.toml` (it holds a placeholder).
2. `wrangler d1 migrations apply visitor-log --remote`.
3. Make the home and its first manager, without SAMPLE rows:
   `node tools/first-setup.mjs --home "<home name>" --phone "<709 phone>" --manager "<manager name>" --pin <4-6 digits>`
   then `wrangler d1 execute visitor-log --remote --file first-setup.sql`, then delete `first-setup.sql` (it holds the PIN's hash).
4. `wrangler deploy`.
5. Open `/settings/` with the manager PIN and add the units with their visiting hours, the residents (first name, last initial,
   room), the staff and their PINs, and check the retention period and the visitor limit. Screening stays off until the home writes
   its own questions.
6. Open `/settings/door-sign/` **at the deployed address** and print the door sign. Scan it with a phone before putting it up.
7. Check: `GET /api/info` shows the home's name with `sample: false`; `POST /api/test/reset` answers 404.

## Before a real home relies on it (not technical)

- **Privacy.** The home (or NL Health Services, for a public home) decides whether visitor names and phone numbers fall under PHIA or
  ATIPPA for them, and reviews the privacy notice at `/privacy/` and the retention period before real visitors use it. The app stores
  no health information about residents and never stores screening answers, but the notices a home writes are its own words.
- **Deleted means deleted from the live database.** Cloudflare D1's Time Travel can restore a database to an earlier point for its
  retention window, so a record stays restorable for that window after the app deletes it. Check Cloudflare's current Time Travel
  window and say so in the privacy notice if it matters to the home.
- **A fire drill still needs people.** Automatic sign-outs at closing are listed as "not confirmed" on the staff page because a visitor
  signed out by the clock may still be inside. The roll call is only as good as the sign-ins.
- **Visitors without a smartphone** are signed in at the nurse's desk ("Sign someone in").
