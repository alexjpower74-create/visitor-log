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

## Contract changes made during the build

- vl2 asked what a staff sign-in with no resident returns → API.md: 400 `field: "resident_id"`, checked first (6be6cde).
- vl1 found the lead's across-midnight counts in PLAN.md were wrong (2 at 8:59 PM, 1 at 9:00 PM, not 3 and 2); PLAN.md fixed, the rule
  unchanged. API.md gained the `created_label` format, form-value numbers, `""` for the whole home / no limit, and the staff sign-in
  check order (508c11a).
- vl1's M2 found that closing a unit would drop a visitor who is still in from the building view and the fire-drill total. Decided:
  the building view also lists a closed unit that still has visitors in, with `active` on each unit (DECISIONS #18). The same commit
  made vl1's calls contract where API.md was silent: bad contact-list dates on `from`/`to`, a closed or unknown unit on `unit_id`,
  staff name and role fields, the last-manager guard on a role change, a unit keeping its own name when edited (ead4387).
