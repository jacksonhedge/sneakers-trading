# Chrome prompt — deep signup flow test

Paste to Claude Chrome. The previous test verified the happy paths (7/7 PASS).
This one stress-tests the sign-up surface against edge cases, validation
errors, duplicates, and downstream DB integrity.

Test against **production** at https://sneakersterminal.com.

---

I need you to deep-test the Sneakers Terminal sign-up flow on production.
Previous test confirmed happy paths work; this one looks for edge-case
breakage. Run each phase, report PASS / FAIL with a one-line note, finish
with a short summary. Use disposable emails and SELECTs only — no admin
panel access, no XSS, no cookie manipulation, no third-party email access.

## Setup
- Fresh incognito for each phase (clears the `sneakers_ref` cookie state)
- Disposable emails: `chrome-deep-1@example.com`, `chrome-deep-2@example.com`, etc.
- Don't actually submit individual sign-up forms with codes — just submit
  the no-code waitlist branch (Phases 4-6) and the org branch (Phase 3)
- Screenshot ONLY on FAIL

## Phase 1 — Validation errors on the org form

Open https://sneakersterminal.com → click "Sign up your organization".
For each test, fill the form, submit, and confirm what happens:

| # | Input | Expected |
|---|---|---|
| 1.1 | Empty all fields, click submit | Browser-native required-field validation blocks submit |
| 1.2 | Org name only (skip type/school/leader/email) | Browser blocks at the first missing field |
| 1.3 | All fields valid, email = `not-an-email` | Browser email validation rejects |
| 1.4 | All fields valid, type = leave default "Pick one" | Form submission blocked (select is required) |

PASS criteria: form refuses to submit on any of the 4 invalid states.
None of these should reach the API.

## Phase 2 — Successful org submission + DB state

1. Fill the org form fully:
   - Org: `Chrome Deep DKE`
   - Type: `Sorority`
   - School: `Arizona State University`
   - Leader: `Chrome Deep`
   - Email: `chrome-deep-1@example.com`
2. Submit. Expect success card with org name + hardware tile + CONTINUE button.
3. Run in Supabase SQL Editor:
   ```sql
   SELECT
     w.email AS waitlist_email,
     w.account_type,
     w.company_name,
     o.org_name,
     o.org_type,
     o.org_college,
     o.status AS org_status
   FROM waitlist w
   LEFT JOIN organization_signups o ON o.org_leader_email = w.email
   WHERE w.email = 'chrome-deep-1@example.com';
   ```
4. Confirm the joined row shows:
   - `account_type = 'business'`
   - `company_name = 'Chrome Deep DKE'`
   - `org_name = 'Chrome Deep DKE'`
   - `org_type = 'sorority'`
   - `org_college = 'Arizona State University'`
   - `org_status = 'pending'`

PASS criteria: BOTH tables have matching rows joined on email.

## Phase 3 — Duplicate org submission

1. Same browser tab, click "Sign up your organization" again
2. Submit the EXACT same form (`chrome-deep-1@example.com`, `Chrome Deep DKE`, etc.)
3. Expect: graceful "already on the list" handling — should NOT create a second waitlist row but MAY create a second organization_signups row (the table has no unique constraint on email).
4. Verify in Supabase:
   ```sql
   SELECT COUNT(*) FROM waitlist WHERE email = 'chrome-deep-1@example.com';
   SELECT COUNT(*) FROM organization_signups WHERE org_leader_email = 'chrome-deep-1@example.com';
   ```
   - First count MUST be 1 (waitlist deduped by email)
   - Second count may be 1 or 2 (acceptable either way for now — admin can dedupe later)

PASS criteria: waitlist count is exactly 1; no 500 error on resubmit.

## Phase 4 — Individual no-code waitlist signup

1. Fresh incognito. Visit https://sneakersterminal.com.
2. Click "Sign up as an individual →" (lands on /signup)
3. Fill: email = `chrome-deep-2@stanford.edu`, leave ACCESS CODE blank
4. Verify: when you type the .edu email, a green ".edu detected" hint appears under the email field
5. Submit with empty code field.
   - This should fall back to the waitlist branch since no code was provided.
   - Expect either: success "you're on the list" card OR redirect to a confirmation page
6. Verify in Supabase:
   ```sql
   SELECT email, account_type, referral_code, direct_referrals
   FROM waitlist
   WHERE email = 'chrome-deep-2@stanford.edu';
   ```
   - `account_type = 'individual'`
   - `referral_code` is set (8 chars)
   - `direct_referrals = 0`

PASS criteria: row exists with correct shape, no 500.

## Phase 5 — Bad invite code on /signup

1. Fresh incognito. Visit https://sneakersterminal.com/signup
2. Fill: email = `chrome-deep-3@example.com`, ACCESS CODE = `BADCODE9`
3. Submit
4. Expect: error message inline saying the code is invalid / not for this email / already used. NOT a 500. NOT a redirect.

PASS criteria: graceful in-form error displayed, no navigation away from /signup.

## Phase 6 — /login with various email states

For each, open `https://sneakersterminal.com/login?email=<URL-ENCODED-EMAIL>`:

| Email | Expected state |
|---|---|
| `chrome-never-existed@example.com` | "That email isn't on the waitlist" + "JOIN THE WAITLIST →" link |
| `chrome-deep-2@stanford.edu` (from Phase 4) | "You're on the waitlist" + position + "UNLOCK ACCESS" gate (refer 1 person) + their referral link |
| `chrome-deep-1@example.com` (from Phase 2) | Same — they're on waitlist via the org signup |

PASS criteria: each state renders the right card, no 500s.

## Phase 7 — Referral cookie attribution

1. Get the referral_code for `chrome-deep-2@stanford.edu` from your Phase 4 query
2. Fresh incognito. Visit `https://sneakersterminal.com/r/<that-code>` — should redirect to `/` with a cookie set
3. Confirm landing now shows "Referred by <CODE>" banner above the queue counter
4. Submit individual no-code waitlist signup with email `chrome-deep-4@example.com`
5. Verify in Supabase:
   ```sql
   SELECT email, referred_by_code
   FROM waitlist
   WHERE email = 'chrome-deep-4@example.com';
   ```
   - `referred_by_code` should equal the referrer's code from step 1
6. Also verify the referrer's count incremented:
   ```sql
   SELECT email, direct_referrals
   FROM waitlist
   WHERE email = 'chrome-deep-2@stanford.edu';
   ```
   - `direct_referrals` should be 1 (was 0 in Phase 4)

PASS criteria: attribution works end-to-end, counter increments via DB trigger.

## Phase 8 — Final cohort summary

Run:
```sql
SELECT email, account_type, referral_code, referred_by_code, direct_referrals, created_at
FROM waitlist
WHERE email LIKE 'chrome-deep-%@%' OR email LIKE 'chrome-aligned-%@%'
ORDER BY created_at;
```

Paste the result. Expect rows for: `chrome-aligned-1` (from previous test),
`chrome-deep-1`, `chrome-deep-2`, `chrome-deep-4` (deep-3 was a /signup
attempt with bad code — should NOT have a row since the code rejected
before any insert).

PASS criteria: 4 rows, deep-3 absent, deep-4 has `referred_by_code` set.

## Final report

For each phase:
- ✅ PASS items (one line each)
- ❌ FAIL items (specific error + what was expected)
- 🟡 ANYTHING WEIRD

Keep total under 35 lines. Screenshots only on FAILs.

## Boundaries

- Do NOT submit student verification (would create real DB rows we'd have to clean up)
- Do NOT click "Sign in" on /login (would trigger Resend, possibly with non-existent emails — risk of bounce reputation)
- Do NOT modify any Supabase data — SELECTs only
- Do NOT access the admin panel
- If any URL returns 500, report once and stop testing that path
- Submit the org form max 2x, individual form max 2x — don't flood the waitlist with junk
