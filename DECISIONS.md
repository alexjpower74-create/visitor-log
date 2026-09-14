# Visitor Log: decisions

Alexander was asleep; the lead (vl-lead) made these calls so the build could keep moving. Each one is easy to reverse.
Newest at the bottom.

1. **Two slices, split by who holds the phone.** vl1 = the Worker **and** the visitor's phone pages (hours, notices, screening and
   the visitor limit are rules that live on both sides of one API call); vl2 = the staff pages and the manager's settings. The lead
   owns the shared test scaffolding, the design tokens, the vendored QR library and the cross-slice journey spec.
2. **Notice severity decides what a notice does, the home decides the words.** Notice: visitors see the message. Visiting
   restricted: visitors see the message and cannot sign themselves in to that unit (or the whole home); they are sent to the
   nurse's desk, where staff can sign them in. Outbreak: visitors see the message and must tap "I have read it" before signing in.
   The app adds only the severity label and the unit name; it never states a health fact of its own.
3. **Screening ships with no questions and switched off.** The settings page offers an example marked "Example only", which fills
   the form but is never saved or switched on by the app. Turning screening on needs at least one question and the home's own
   words for what a "yes" visitor should do.
4. **Screening answers are never stored.** A "yes" stores nothing at all (not even the name); a sign-in after all "no" answers stores
   only `screened: true`. The answers would be health information about the visitor, and nothing needs them later.
5. **One sign-in is one person.** People without a phone (children, a spouse) are signed in by staff at the desk ("Sign someone
   in"), so the fire-drill count stays a count of people. A phone number can have one visit in the building at a time.
6. **Visiting hours are 1 to 4 windows per unit, the same every day.** "Overdue" means still in after the window they came in
   during; "auto sign-out at closing" happens at the end of the unit's last window. A visit signed in after closing (staff only)
   is signed out automatically at midnight, so nobody stays "in the building" in the records past the day of their visit.
7. **Auto sign-out is computed, not just scheduled.** `auto_out_at` is stored at sign-in and every answer treats a passed one as
   signed out, whether or not the cron has written it. The cron (every 15 minutes) and every staff request write it down. So the
   count is right even if a cron run is missed.
8. **Auto sign-outs are shown, not hidden.** A visitor signed out automatically at closing may still be in the building. The staff
   page lists today's automatic sign-outs as "not confirmed" so staff can check before trusting a count of zero.
9. **A late tap on "Sign out" after an automatic sign-out changes nothing.** The visit stays "Auto at closing" so the day's
   counts never change after the fact; the visitor's page says they were signed out automatically.
10. **Retention counts calendar days in Newfoundland time.** A visit is kept while (today − the visit's date) ≤ the setting and
    deleted the day after. It runs on every staff request as well as on the cron, and no route returns an older visit even before
    the delete, so a missed cron can never leak an old record into a contact list.
11. **Residents: first name, last initial, room, unit and "by arrangement" only.** No health information, no photos, no dates of
    birth. The visitor search needs 2 characters and returns at most 8 names, so the list of residents is not published whole.
12. **Staff sign in with their own PIN** (12-hour session); managers also open the settings. Staff may sign a visitor in outside
    hours, on a restricted unit, for a by-arrangement resident or past the visitor limit: the visit is recorded with each warning
    shown, because the desk is where exceptions are supposed to be made.
13. **The sign-out link is a capability link** that works until midnight of the day of the visit; only its SHA-256 is stored. It
    never shows the visitor's phone number or anyone else's visit.
14. **Look: Alexander's approved portfolio look** (dark navy, colour on data, pills and edges) with harbour blue as the accent;
    the notice severities are the only loud colours. Visitor pages use larger type and 56 px buttons with no background glow,
    because many visitors are older and standing in a doorway.
15. **The door sign's QR code is made on the page** from the home's own address with qrcode-generator (MIT, vendored), so nothing
    is fetched from another host. Tests decode the rendered QR with jsQR to prove it opens the sign-in page.
16. **One staff session for the staff pages and the settings** (vl2's question, 17:55). A desk tablet is shared, so a manager who
    signs in on Settings is also signed in on the staff pages, and a staff PIN typed on Settings shows "Only a manager can change
    the settings." The page keeps the signed-in name from the sign-in answer; there is no `/api/me` route.
17. **A staff sign-in with no resident picked is a 400 on `resident_id`**, checked before the name and the phone, so the error
    lands under the first field a person would fix (vl2's question, added to API.md).
