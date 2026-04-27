# Browser auth flow test — localhost, real email

Paste to Claude Chrome. Tests the full sign-in UI on localhost with real
magic-link emails delivered via the verified sneakersterminal.com Resend
domain. The API-level checks (dev-mode-off, CSRF, enumeration) have
already been verified via curl — this prompt drives the browser through
the user-visible flow.

---

I need a hands-on browser test of the Sneakers Terminal auth flow on
`http://localhost:3000`. Real magic-link emails (no dev escape hatch).

**Setup (already verified — just confirm):**
- Dev server running on `http://localhost:3000`
- Curl sanity checks all pass:
  - `POST /api/auth/login` returns `{ok:true, status:"magic_link_sent"}`
    with NO `devLink` field
  - CSRF middleware rejects foreign origin (403)
  - Migrations 021-025 applied
- The user has a real inbox they can check in real-time. Ask them which
  email to use — they need to provide it before you start. **DO NOT use
  disposable email services.**

Run each phase, mark **PASS** / **FAIL** in one line. Wait for the user
to confirm email arrival before continuing the next phase. Final summary
table.

## Phase 1 — Open signup → real email → sign in

1. Open `http://localhost:3000/signup` in fresh incognito.
2. Confirm form has:
   - Eyebrow `SIGN UP · INDIVIDUAL`
   - EMAIL field with .edu hint
   - ACCESS CODE field labeled `(optional)`
   - Submit button reads `SEND MAGIC LINK →`
3. Type the real email the user gave you. Leave ACCESS CODE empty.
4. Click `SEND MAGIC LINK →`.
5. Success state shows emerald box: `✓ MAGIC LINK SENT`. **NO amber
   dev-mode box** (devLink is off).
6. Ask the user: "Check `<email>` for a Sneakers Terminal sign-in email
   (from `noreply@sneakersterminal.com`). When it arrives, copy the SIGN
   IN link and paste it back to me."
7. When they paste the link, navigate to it.
8. Browser opens `/auth/callback` → "SIGNING YOU IN / Setting your
   session…" → redirects to `/dashboard` or `/onboarding/about-you`.

**PASS criteria**: end up authenticated. Email arrived from the verified
domain (NOT `onboarding@resend.dev`).

🟡 If the email shows `From: onboarding@resend.dev` → `WAITLIST_FROM_EMAIL`
isn't loading.
🟡 If `/auth/callback` shows "SIGN-IN FAILED" → copy the error detail.

## Phase 2 — Profile + .edu detection

While authenticated:

1. Click profile avatar (top-right) or visit `/dashboard/profile`.
2. Confirm the page renders with:
   - Big circle avatar with initial
   - Email displayed
   - Cards: EMAIL (with `✓ .EDU DETECTED` if applicable),
     PLAN (free), STUDENT VERIFICATION (Not submitted), UNIVERSITY,
     REFERRALS, BOT & WALLET
   - Quick links footer
3. **NO captain card** — this user isn't a captain.

**PASS criteria**: profile renders cleanly, no console errors.

## Phase 3 — Returning user via /login

Fresh incognito.

1. Visit `http://localhost:3000/login` (no email param). "Sign in" card
   renders with email input.
2. Type the same email from Phase 1 (now a returning user). Submit.
3. Page redirects to `/login?email=<that>` showing:
   - Card title: `> Welcome back.`
   - Position block (#X)
   - Helper text "You've already used your invite code..."
   - `SEND MAGIC LINK` button
4. Click `SEND MAGIC LINK`. Success message. NO amber box.
5. Ask user for the new magic link from their inbox. Click it.
6. Lands on `/dashboard` (NOT onboarding — they're returning).

**PASS criteria**: returning-user routing skips onboarding.

## Phase 4 — Bad code path (regression)

Fresh incognito.

1. `/signup` → second test email + ACCESS CODE = `BADCODE9` → submit.
2. Inline error: `> That code is invalid, already used, or not for this email.`
3. NO email is sent (ask user to confirm no email arrived after 30s).

**PASS criteria**: clear error, no inbox arrival.

## Phase 5 — Org signup wizard + captain dashboard

The user needs another real email for the captain.

1. Fresh incognito → `http://localhost:3000`. Click `Sign up your
   organization`. 3-step wizard.
2. Step 1: pick any tier card. Click NEXT.
3. Step 2: fill in:
   - Org name: `Local Test Frat`
   - Type: `Fraternity`
   - School: `Test University`
   - Leader: `Test Captain`
   - Email: the captain real email
   Click NEXT.
4. Step 3: review. Click `SUBMIT ORG →`.
5. Success card. Click `CONTINUE TO SIGN IN` — lands on `/login`.
6. Captain isn't on the waitlist yet. Visit `/signup` directly, type the
   captain email, leave code empty, submit.
7. Ask user for the magic link from the captain inbox. Click it.
8. Lands on `/dashboard` or onboarding.
9. Visit `/dashboard/profile`.
10. Confirm at top:
    - Gradient captain hero card with `Local Test Frat`
    - Status pill: `PENDING REVIEW` (amber)
    - 3-stat grid: ACCEPTED 0, PENDING 0, TOTAL 0
    - `ADD MEMBERS →` + `MANAGE ORG` buttons

**PASS criteria**: captain card appears. Confirms post-signin's
org_leader_user_id backfill is working.

## Phase 6 — joinOrgId consent gate

The user needs a third real email for the member.

1. While authenticated as captain, click `ADD MEMBERS →`. Lands at
   `/dashboard/org?tab=members`.
2. Find the emerald "Your join link · FASTEST" card. Copy the URL.
3. Open a fresh incognito window. Paste the join URL.
4. Confirm the join page shows:
   - Org name `Local Test Frat`
   - Captain line `Captain: Test Captain`
   - Amber pill: `ORG PENDING REVIEW · CAPTAIN WILL APPROVE YOU`
   - Helper: "Your sign-in goes through immediately. The captain reviews
     + approves your roster row separately."
5. Type the member real email. Submit.
6. Ask user for the magic link → click it. Lands on `/dashboard` as
   member.
7. Switch back to captain incognito. Refresh `/dashboard/org?tab=members`.
8. Roster row shows the member email with status pill `PENDING` (amber).
   **NOT** `ACCEPTED`.
9. Click `Approve`. Status flips to `ACCEPTED` (emerald).

**PASS criteria**: PENDING by default → captain Approve → ACCEPTED.

## Phase 7 — Captain identity persists across sign-out

1. Captain incognito. Find a sign-out option.
2. Click sign out → redirects to `/` or `/login`.
3. Visit `/dashboard` directly → should redirect to `/signup` or
   `/login` (auth-gated).
4. Re-sign-in via `/login` → captain hero card re-appears at
   `/dashboard/profile`. Same `Local Test Frat`.

**PASS criteria**: captain identity survives sign-out / sign-in.

## Phase 8 — Console + Resend dashboard cross-check

1. Browser devtools Console: NO red errors during the test.
2. Open https://resend.com/emails. You should see one row per email
   sent: Phase 1, 3, 5, 6 (4 sends total).
3. All status `delivered`. All `from` show `noreply@sneakersterminal.com`.

**PASS criteria**: no red console errors, all 4 sends logged + delivered
from the verified domain.

---

## Final report

For each phase 1–8:
- ✅ PASS items (one line each)
- ❌ FAIL items (specific symptom + what you expected)
- 🟡 ANYTHING WEIRD that's not pass/fail

Total: target under 25 lines. Screenshot only on FAILs.

## Boundaries

- Localhost only.
- Don't paste real magic-link URLs you don't intend to actually use —
  they're single-use and short-lived.
- If the dev server crashes mid-test, restart and resume from the
  current phase. Note the trigger.

If everything passes, the auth flow is verified end-to-end against real
Resend delivery and ready for prod (just confirm Vercel env has the same
`WAITLIST_FROM_EMAIL` and `RESEND_API_KEY` values).
