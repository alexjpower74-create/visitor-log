# Visitor Log

QR sign-in for visitors at a long-term care home, personal care home or group home in Newfoundland and Labrador. A visitor scans
the QR at the door and signs in and out on their own phone (no app, no account); staff see who is in the building right now by
unit, run a fire-drill roll call, read the day log and export a contact list; the manager sets units, visiting hours, residents,
notices, screening and how long records are kept. Overnight build 2026-09-14, lead `vl-lead`, slices `vl1` (Worker + visitor pages)
and `vl2` (staff pages + settings).

Read PLAN.md first (the Rig contract), then docs/API.md (the contract between slices), then DECISIONS.md.

## Stack and ports

- `worker/`: Cloudflare Worker, plain JS ESM, no npm deps, D1 `DB` (`visitor-log`), cron `*/15 * * * *` (maintenance). Serves
  `/api/*` and `app/public/`.
- `app/public/`: plain HTML/JS/CSS, no build, nothing from another host. `/` visitor sign-in, `/out/?t=` signed in / sign out,
  `/privacy/`, `/staff/`, `/settings/`, `/settings/door-sign/`. `app/public/vendor/qrcode.js` is qrcode-generator 2.0.4 (MIT).
- `app/tests/`: Playwright 1.63, chromium + webkit, phone 390 and tablet 1024x768, against the real Worker. `visit/` vl1,
  `staff/` vl2, `journey/` lead.
- Ports (inspector = port + 10, always pass `--inspector-port`; other crews hold 9229):
  vl2 dev 8401 · vl1 Worker 8402 · vl2 e2e 8403 · vl1 visit e2e 8404 · vl1 negative copies 8405, 8406 · vl2 negative copy 8407 ·
  lead e2e/journey 8408 · QA 8409. `npm run demo` uses 8401 once the slices are done.
- SAMPLE PINs: manager `7314` (Donna R.), staff `2580` (Carl B.), `4691` (Amira H.).

## Rules that bite here

- **Deploys only when Alexander says so (he did on 2026-09-15: the SAMPLE demo is live at visitor-log.alexjpower74.workers.dev).**
  Day to day: `wrangler dev --local`. The repo is public: run `check-no-personal-data .` before every push.
- **Nothing is sent.** No email, no SMS. The visitor's sign-out link lives on their own phone.
- **SAMPLE only.** Home "SAMPLE Harbourview Care Home (demo)"; residents, visitors and staff are SAMPLE and labelled SAMPLE.
- **No health information about residents**: first name, last initial, room, unit, "by arrangement". Screening answers are never
  stored. Notices are the home's own words; the app never states a health fact itself.
- **Records delete themselves** after the home's retention period (default 30 days). No route ever returns an older visit.
- **Time is the home's zone** (`America/St_Johns`), from the Worker, never the browser clock. Tests pin it with `X-Test-Now`.
- Own only your slice's paths; `rig guard` enforces it. Verify → commit (own paths) → report.
- Every important check has a negative control that breaks a copy in `.negative/`, goes red, and is recorded.
- Plain English for Newfoundland users. No emoji as icons. No devils or demons.

## Standing rules (every project, read by Claude Code and Codex alike)

CLAUDE.md is a symlink to this file, so Onyx (Claude Code) and Cobalt (Codex) read the same text. Edit AGENTS.md only.

- **Read PLAN.md first where it exists; it is the contract.** Own only your slice's files.
- **What "done" means:** verified, committed (only your own paths, with a message that says what and why), pushed, and shown: a screenshot via `pwshot` for anything visible. Never hand back an empty screen; seed demo data if the UI needs it. Never leave a green step uncommitted.
- **Nothing leaves without Alexander.** Emails, forms, applications, posts, marketplace submissions and pull requests to other people's repos are staged to one click; he presses send.
- **Tests that cannot lie.** A bug that reached a person gets a test that fails without the fix, proved by reverting the fix. Every guard (grep, lint, check) is shown to fail on a known-bad input in the same run: a check that cannot fail measured nothing. Real dependencies over mocks where practical. Hit-test with elementFromPoint, never rects.
- **Public-repo hygiene.** No secrets, no machine names, no home-folder paths, no invented businesses. Real businesses appear only where Alexander chose to show them. Run `check-no-personal-data` before pushing a public repo.
- **Browser work.** Playwright is the default; WebKit check before calling a WKWebView page done; the Chrome extension only for pages that need his real login.
- **Keep this file short:** commands, gotchas with a why, hard rules. Architecture belongs in the code and README.
