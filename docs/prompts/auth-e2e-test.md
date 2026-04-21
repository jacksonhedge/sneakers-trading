# Chrome prompt — End-to-end auth + dashboard test

Tests the full access-code → magic-link → dashboard flow on production. An invite code (`E8L93R9T`) has already been issued to `jackson@hedgepayments.com` via the admin CLI; this prompt drives the user-side flow.

---

Task: end-to-end test the brand-new Sneakers Terminal signup + dashboard flow. An access code has already been generated and emailed; your job is to complete the signup, receive the magic link, and verify the dashboard loads correctly.

Context:
- Live site: https://sneakersterminal.com
- Test email: `jackson@hedgepayments.com` (already on the waitlist)
- Access code: `E8L93R9T` (just issued — if you land on /signup without a query param, type this in)
- Two emails will arrive in this flow: (a) the invite email with the code, already sent; (b) a Supabase magic-link email that gets sent after Step 2 below

Prerequisites:
- You can access `jackson@hedgepayments.com`'s inbox (or the mailbox it forwards to)
- No existing Supabase session in this browser profile (start fresh / incognito is cleanest)

---

STEP 1 — Open the invite email

1. Open the inbox for `jackson@hedgepayments.com`.
2. Find the most recent email from "Sneakers Terminal <onboarding@resend.dev>" with subject "You're off the Sneakers waitlist" (may land in Promotions / Updates / Spam — check all).
3. Open the email.
4. Verify:
   - Shows the access code `E8L93R9T` prominently
   - Has a "SIGN UP →" button
   - Has text about single-use / can't be reused
5. Screenshot the email.

---

STEP 2 — Start signup

1. Click the "SIGN UP →" button in the email. It should open https://sneakersterminal.com/signup?code=E8L93R9T
2. On the /signup page, verify:
   - The Sneakers logo appears
   - "Lace 'Em Up." and "Enter your access code to get in." are shown
   - The ACCESS CODE field is pre-filled with `E8L93R9T`
   - The EMAIL field is empty
3. Type `jackson@hedgepayments.com` into the EMAIL field.
4. Click "SEND SIGN-IN LINK".
5. Expected: the form transitions to a success state — green-bordered card saying "> Check your inbox." with a message about a sign-in link being sent.
6. If instead you see an error ("That code is invalid, already used, or not for this email." or similar), STOP and report the exact error.

Screenshot the success state.

---

STEP 3 — Receive and click the magic link

1. Return to the inbox.
2. Within 60 seconds, a NEW email should arrive with a subject like "Your Magic Link" (sender will be something like `noreply@mail.app.supabase.io`). If it doesn't arrive in 2 minutes, check spam.
3. Open the email.
4. Screenshot it.
5. Click the magic-link button in the email body.

---

STEP 4 — Verify landing on /dashboard

1. The click should redirect through `/auth/callback` and land on `https://sneakersterminal.com/dashboard`.
2. Verify the dashboard shows:
   - Sneakers logo in the header
   - The email `jackson@hedgepayments.com` shown
   - "YOUR POSITION" heading with a large green number (should be `#1` since this is the only waitlist row)
   - A "YOUR REFERRAL LINK" section with a link like `https://sneakersterminal.com/r/V5GHNE` (the referral code from earlier) and a COPY button
   - "DIRECT REFERRALS" counter (expected: 0)
   - "INDIRECT (2ND DEGREE)" counter (expected: 0)
   - "TIER PROGRESS" section with three tiers: Early Access (at 1), Priority Access (at 3), Founder Tier (at 10) — all should show as `○` unfilled at 0/N
   - "COMING SOON" cards for Markets / Portfolio / Trades
   - A "SIGN OUT" link in the top right
3. Screenshot the full dashboard page.

---

STEP 5 — Verify session persistence

1. Refresh the page (Cmd+R).
2. Dashboard should still render normally (session persisted via cookie).
3. Close the tab, open a new one, visit `https://sneakersterminal.com/dashboard` directly.
4. Should still render without re-auth (cookie-based session).

---

STEP 6 — Verify invite is single-use

1. Go back to https://sneakersterminal.com/signup?code=E8L93R9T (same code we just used).
2. Enter `jackson@hedgepayments.com` again.
3. Click SEND SIGN-IN LINK.
4. Expected: error message "That code is invalid, already used, or not for this email." — because the code was burned on successful signin in Step 4.
5. Screenshot the error.

---

STEP 7 — Report back

- Screenshot of the invite email (Step 1)
- Screenshot of the /signup success state (Step 2)
- Screenshot of the magic-link email (Step 3)
- Screenshot of the dashboard (Step 4)
- Confirmation that session persists across refresh + new tab (Step 5)
- Screenshot of the invite-reused error (Step 6)
- Any warnings, unexpected behavior, or delays longer than ~2 minutes at any step

If any step fails (page errors, email doesn't arrive, dashboard shows wrong data), STOP immediately and report the exact symptom with a screenshot.

---

Do NOT:
- Submit any additional signups beyond this flow
- Sign out then re-sign-in — we want to observe the session behavior from a single flow
- Click any "Coming Soon" card expecting it to work (they're placeholders)
- Attempt to bypass the invite check by entering a fake code
- Copy the referral link and actually share it with anyone — this is a test of the plumbing, not a referral test

When finished, paste the full report back to me. I'll then verify from my end that the `invite_used_at` timestamp got set on the waitlist row after Step 4.
