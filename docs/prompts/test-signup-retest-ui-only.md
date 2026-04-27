# Chrome prompt — signup flow re-test (UI-only)

Paste to Claude Chrome. Re-validates the bug fix that just shipped (commit
e0ad401): `/signup` now falls back to the waitlist branch when ACCESS CODE
is empty. Previous test caught this gap and 3 cascading failures (Phase 4,
6.2, 7); this prompt confirms they're now ✅.

Test against **production** at https://sneakersterminal.com.

UI-only — no Supabase queries needed. Use disposable emails.

---

I need a quick re-test of the Sneakers Terminal signup flow on production
after a bug fix. The fix made ACCESS CODE optional on /signup so users
without invite codes can join the waitlist via that screen. Run each test,
report PASS / FAIL with a one-line note. Total target: under 5 minutes.

## Setup

- Fresh incognito for each test
- Disposable emails: `chrome-retest-1@example.com`, `chrome-retest-2@stanford.edu`, etc.
- Screenshot only on FAIL

## Test 1 — `/signup` form structure (was the bug)

1. Open https://sneakersterminal.com/signup directly
2. Verify the ACCESS CODE field label reads `ACCESS CODE (optional)` — note the "(optional)" suffix
3. Verify the EMAIL field still labeled `EMAIL (.edu preferred)`

PASS criteria: code field is labeled optional. (Previous test had it as required.)

## Test 2 — empty-code submission falls back to waitlist (was Phase 4 FAIL)

1. Same `/signup` page
2. Fill: email = `chrome-retest-1@stanford.edu`, leave ACCESS CODE EMPTY
3. Verify a green `✓ .edu detected` hint appears under the email field
4. Verify the submit button reads `JOIN THE LIST` (not `ENTER TERMINAL →`)
5. Click submit
6. Expect a success card replacing the form, containing:
   - `> You're on the list.`
   - `Queue position #N` (some number)
   - `1 Invite UNUSED` block with the green pill bar
   - "You get one. Pick somebody who'd actually use this..." copy
   - YOUR LINK section with a `https://sneakersterminal.com/r/<CODE>` URL + COPY button
   - `CONTINUE TO SIGN IN →` button at the bottom

PASS criteria: success card renders, no 500, no inline error. (This was the
hard fail last round.)

## Test 3 — code-bearing submission still works (regression check)

1. Fresh incognito. Open https://sneakersterminal.com/signup
2. Fill: email = `chrome-retest-3@example.com`, ACCESS CODE = `BADCODE9`
3. Verify submit button now reads `ENTER TERMINAL →` (because code is filled)
4. Click submit
5. Expect inline error: `> That code is invalid, already used, or not for this email.`

PASS criteria: bad-code branch still rejects gracefully (proves the
optional-code change didn't break the code-required path).

## Test 4 — /login finds the new waitlist row (was Phase 6.2 FAIL)

1. Visit `https://sneakersterminal.com/login?email=chrome-retest-1@stanford.edu`
2. Expect: "> You're on the waitlist." card with:
   - Position number (#N)
   - "UNLOCK ACCESS" gate explaining "Refer 1 person to get in"
   - The user's referral link

PASS criteria: shows waitlist card, NOT "not on waitlist". (Last round
this user wasn't in DB because Phase 4 failed; now should be there.)

## Test 5 — referral attribution end-to-end (was Phase 7 partial fail)

1. From Test 4's page, copy the referral code shown (the 6-8 char string
   in the link, e.g. `E9FPHR`)
2. Fresh incognito. Visit `https://sneakersterminal.com/r/<that-code>`
3. Verify it redirects to `/` and the homepage shows
   `> Referred by <CODE>` banner above the queue counter
4. Click "Sign up as an individual →" to go to /signup
5. Fill: email = `chrome-retest-2@example.com`, leave code empty
6. Submit. Expect the same success card as Test 2.
7. Go back to Test 4's URL: `/login?email=chrome-retest-1@stanford.edu`
8. Refresh. Should now show `1 referral so far` (instead of 0) at the
   bottom of the UNLOCK ACCESS gate

PASS criteria: referrer's count visibly increments, proving the
attribution flow + DB trigger fired.

## Test 6 — org form still works (regression check)

1. Fresh incognito. Click "Sign up your organization" on landing
2. Fill quickly: org=`Chrome Retest Theta`, type=`Sorority`,
   school=`UCLA`, leader=`Chrome Retest`, email=`chrome-retest-org@example.com`
3. Submit. Expect success card with org name + hardware tile +
   `CONTINUE TO SIGN IN →`

PASS criteria: org submission still succeeds (proves the schema-
alignment refactor wasn't regressed by the signup-form fix).

## Final report

For each test:
- ✅ PASS items (one line)
- ❌ FAIL items (specific symptom + what was expected)

Target output: 6 lines + 1-line summary. Screenshots only on FAILs.

## Boundaries

- Do NOT submit /login forms (would hit Resend with bouncy emails)
- Do NOT submit student verification
- Do NOT modify any data
- If a 500 hits, report once and stop testing that path

Total submissions across this test: 3 individual signups + 1 org signup.
Don't exceed.
