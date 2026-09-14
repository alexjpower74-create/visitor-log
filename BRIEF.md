# Visitor Log — brief (Onyx, 2026-09-14)

**Prefix** `vl` · **Ports** app 8401, worker 8402, QA 8409 · **Repo** `visitor-log` (private) · **Lead effort** xhigh

## What
QR sign-in for visitors at a long-term care home, personal care home or group home in Newfoundland. A visitor
scans the QR at the door, signs in on their own phone (name, phone, who they're visiting, screening questions if
the home has them turned on), sees the home's notice banner (e.g. an outbreak on one unit), and signs out on the
way out. Staff see who is in the building right now — which matters in a fire drill or an outbreak — and can
pull a contact list for any day and unit.

## Home settings (PIN)
Units/wings, residents (first name + last initial + room is enough), visiting hours per unit, max visitors per
resident, screening questions on/off and their wording (set by the home — ship none enabled by default; show an
example template marked as an example), **notice banner** with severity (info / restricted unit / outbreak — the
home writes the words; the app never states health facts itself), restricted residents (visits by arrangement
only → "Please see the nurse's desk").

## Visitor flow (phone, no app, no account)
Scan → name + phone (remembered on this phone next time) → pick resident (search; residents on restricted units
show the home's own message) → screening answers if enabled (a "yes" shows the home's instruction, e.g. "please
don't visit today, call the unit") → **Signed in** screen with time and a big **Sign out** button (also a link
that stays valid until midnight). Outside visiting hours: the home's message.

## Staff side
In the building now (by unit, with sign-in times, "overdue sign-out" after the visit window), fire-drill roll call
(tick off visitors found), day log and **contact list export** for a date range + unit (CSV), manual sign-in for
visitors without phones, auto sign-out at closing marked as "auto".

## Privacy (hard rules)
SAMPLE home "SAMPLE Harbourview Care Home (demo)", SAMPLE residents and visitors only, labelled SAMPLE. Visitor
records auto-delete after a retention period the home sets (default 30 days, shown in settings and the privacy
notice). No health info about residents stored.

## Tests that matter
Outbreak banner shows on the right unit only (negative control); screening "yes" stops the sign-in; in-building
count equals sign-ins minus sign-outs across midnight auto sign-out; retention deletes records older than the
setting (fake clock, negative control); journeys chromium + webkit at 390 + 1024 tablet.
