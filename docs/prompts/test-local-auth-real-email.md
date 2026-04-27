# Local auth flow test — REAL EMAIL via Resend

Paste to Claude Chrome. Tests the full sign-in surface end-to-end on
**localhost** with real magic-link emails delivered through your verified
Resend domain (sneakersterminal.com). This is the production-shaped test —
the dev-mode link is OFF, you're verifying email actually arrives.

This exercises everything that just shipped: Resend-backed magic links,
captain-by-user-id, joinOrgId consent gate, CSRF middleware, post-signin
next-validation, plus end-to-end Resend deliverability.

---

I need a comprehensive test of the Sneakers Terminal auth flow running
locally with **AUTH_DEV_RETURN_LINK unset** so magic links are delivered
via real email through the verified Resend domain. The test depends on a
working email inbox.

Run each phase, mark **PASS** / **FAIL** with one line, end with a summary
table. Total target: 15–22 minutes (longer than the dev-link version
because you're waiting on email delivery between phases).

## Setup (verify before testing)

The user is responsible for these — verify they did them:

1. `apps/platform/.env.local` should NOT contain `AUTH_DEV_RETURN_LINK=1`.
   If it does, comment it out or remove the line, then restart the dev
   server. Confirm by curling:
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" -H "origin: http://localhost:3000" \
     -d '{"email":"sanity@example.com"}' | jq
   ```
   Response should be `{"ok": true, "status": "magic_link_sent"}` —
   **NO** `devLink` field. If devLink is present, the env var is still
   active. STOP and tell user.

2. `apps/platform/.env.local` should contain:
   ```
   WAITLIST_FROM_EMAIL=Sneakers Terminal <noreply@sneakersterminal.com>
   RESEND_API_KEY=<a real key>
   ```

3. Dev server is running on `http://localhost:3000`.

4. The 5 migrations from this session have been applied in Supabase SQL
   editor (021–025).

5. The user has 2–3 real email inboxes available for testing — preferably
   ones they can check fast (Gmail with real-time refresh, etc.). They
   should be addresses they actually own. Suggest one of:
   - Their primary email
   - A `+test1@gmail.com`, `+test2@gmail.com` alias of their primary
   - A second account they have

   **DO NOT use disposable email services** (mailinator, etc.) — those
   often refuse delivery from new sender domains and you'll false-fail
   the deliverability check.

If any of these aren't ready, STOP and tell the user which step is missing.

## Test conventions

- **Fresh incognito window for each major phase** (clears cookies between).
- Use a real email the user can check in real-time. The user will need to
  forward you the magic-link URL from their inbox so you can complete the
  sign-in step.
- Screenshot ONLY on FAILs.
- The success card should NOT contain a dev-mode amber box anymore — only
  the emerald "Magic link sent" message.
- Open browser devtools → Console + Network tabs.

---

## Phase 1 — Sanity: server up, env vars correct, security headers present

1. Open `http://localhost:3000` in fresh incognito. Landing page renders
   cleanly, no 500 errors.
2. Devtools → Network → reload → confirm response headers include:
   - `Content-Security-Policy`
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
3. In a separate terminal:
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" -H "origin: http://localhost:3000" \
     -d '{"email":"sanity@example.com"}' | jq
   ```
   Expected: `{"ok": true, "status": "magic_link_sent"}` —
   **NO `devLink` field**.

**PASS criteria**: response shape clean, no devLink, headers present.

## Phase 2 — Email deliverability sanity (no UI, just inbox check)

1. From a terminal, send a magic link to your real test email:
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" -H "origin: http://localhost:3000" \
     -d '{"email":"YOUR_REAL_EMAIL@example.com"}' | jq
   ```
   Replace `YOUR_REAL_EMAIL` with an inbox you control.
2. Within 60 seconds, check that inbox.
3. Look for an email with:
   - **From**: `Sneakers Terminal <noreply@sneakersterminal.com>`
     (NOT `onboarding@resend.dev` — that's the unverified-fallback
     sender; if you see it, `WAITLIST_FROM_EMAIL` isn't set)
   - **Subject**: `Your Sneakers Terminal sign-in link`
   - Body has a `SIGN IN →` button + raw URL fallback
4. The URL in the email should look like:
   `https://<your-supabase-project>.supabase.co/auth/v1/verify?token=...&type=magiclink&redirect_to=http://localhost:3000/auth/callback?next=/dashboard`

**PASS criteria**: email arrives within 60s, from the verified
sneakersterminal.com domain, with a working magic-link URL.

🟡 If the email doesn't arrive: check the Resend dashboard
(https://resend.com/emails) — every send is logged there. If status =
"delivered" but you still don't see it, check spam. If status =
"bounced", note the bounce reason.

🟡 If the email arrives but `From:` is `onboarding@resend.dev` →
`WAITLIST_FROM_EMAIL` env var isn't loading. STOP and ask user to
restart the dev server.

## Phase 3 — Open signup flow (full UI path)

1. Fresh incognito → `http://localhost:3000/signup`
2. Confirm form has:
   - Eyebrow `SIGN UP · INDIVIDUAL`
   - EMAIL field with .edu hint
   - ACCESS CODE field labeled `(optional)`
   - Submit button reads `SEND MAGIC LINK →`
3. Type a real email you control (e.g. `+test1@gmail.com` alias).
4. Click `SEND MAGIC LINK →`.
5. Success state appears with:
   - Emerald box: `✓ MAGIC LINK SENT` + "Check <email> for a sign-in link..."
   - **NO amber dev-mode box** (devLink is off)
6. Check inbox within 60s. Click the SIGN IN → button in the email.
7. Browser opens to `/auth/callback`. After ~1s shows "SIGNING YOU IN /
   Setting your session…"
8. Redirects to `/dashboard` (or `/onboarding/about-you` for first sign-in).

**PASS criteria**: end up on `/dashboard` (or onboarding) authenticated
as the test email.

🟡 Common failures:
- "SIGN-IN FAILED" shown on /auth/callback — copy the error text.
  Likely: link already used (you tried twice), link expired (>1h old),
  or Supabase project mismatch.
- Email never arrives — check Resend dashboard for the send status.

## Phase 4 — Returning user via /login

Fresh incognito.

1. Visit `http://localhost:3000/login`. The "no_email" state renders.
2. Type the same email from Phase 3 (now a returning user).
3. Submit → page navigates to `/login?email=<that>`. Should show
   "Welcome back" card with position #X.
4. Click `SEND MAGIC LINK`. Success message: "Magic link sent. Check your
   inbox."
5. Wait for email (60s). Click SIGN IN.
6. Lands on `/dashboard` (this time NOT onboarding — they're a returning
   user, post-signin route distinguishes them).

**PASS criteria**: returning-user flow lands on /dashboard directly.

## Phase 5 — Bad code path (regression)

Fresh incognito.

1. `/signup` → type `+test2@gmail.com` + bad code `BADCODE9` → submit.
2. Inline error: `> That code is invalid, already used, or not for this email.`
3. NO email is sent (no inbox arrival even after 60s — confirm by
   checking Resend dashboard, that send shouldn't appear).

**PASS criteria**: clear error, no email sent, no Resend log entry.

## Phase 6 — Login enumeration check (curl)

In a terminal:
```
# Real existing user
curl -sX POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d '{"email":"<the email from Phase 3>"}' | jq

# Definitely doesn't exist
curl -sX POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d '{"email":"definitely-not-a-real-9999@example.com"}' | jq
```

Both responses:
- HTTP status 200
- Body shape: `{"ok": true, "status": "magic_link_sent"}` (identical)

The user with the real email gets an inbox arrival; the fake one
doesn't. **Externally**, the responses are indistinguishable.

**PASS criteria**: identical 200 responses; only a Resend log entry +
inbox arrival distinguishes the real one.

## Phase 7 — CSRF middleware

```
# Foreign origin → 403
curl -sX POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" -H "origin: https://evil.example.com" \
  -d '{"email":"x@example.com"}' -i | head -3

# No origin (server-to-server) → 200
curl -sX POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"x@example.com"}' -i | head -3

# Same origin → 200
curl -sX POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d '{"email":"x@example.com"}' -i | head -3
```

**PASS criteria**: 403 / 200 / 200.

## Phase 8 — Org signup wizard + captain dashboard

1. Fresh incognito → `http://localhost:3000`
2. Click `Sign up your organization`. 3-step wizard.
3. Step 1: pick any tier. Step 2: fill in org details — leader email
   should be a real inbox you control (`+captain@gmail.com` alias works).
   Step 3: submit.
4. Success card appears. Click `CONTINUE TO SIGN IN`.
5. The captain isn't on the waitlist yet — visit `/signup` directly,
   submit the captain email with no code, click `SEND MAGIC LINK`.
6. Check inbox, click SIGN IN.
7. Lands on `/dashboard` (or onboarding).
8. Visit `/dashboard/profile`. Captain card should appear at the top:
   gradient hero, org name, status pill `PENDING REVIEW`, 0/0/0 stats,
   `ADD MEMBERS →` button.

**PASS criteria**: captain card renders. Confirms post-signin's
org_leader_user_id backfill is wiring captain identity to auth user id.

## Phase 9 — joinOrgId consent gate

1. Captain (Phase 8) clicks `ADD MEMBERS →`. Lands at
   `/dashboard/org?tab=members`. Copy the join URL.
2. Fresh incognito → paste the join URL. Confirm:
   - Amber pill: `ORG PENDING REVIEW · CAPTAIN WILL APPROVE YOU`
   - Helper: "Your sign-in goes through immediately. The captain reviews
     + approves your roster row separately."
3. Submit a different real-email-you-control (`+member@gmail.com`).
4. Inbox check + click magic link → lands on `/dashboard` as new member.
5. Switch back to captain incognito. Refresh `/dashboard/org?tab=members`.
6. Roster shows the new member with status pill `PENDING` (amber). NOT
   `ACCEPTED`.
7. Click `Approve`. Status flips to `ACCEPTED` (emerald).

**PASS criteria**: PENDING → captain Approve → ACCEPTED. Not auto-accepted.

## Phase 10 — Signed-out state

1. From the captain dashboard, find a sign-out option.
2. Click sign out. Should redirect to `/` or `/login`.
3. Visit `/dashboard` directly → should redirect to `/signup` or `/login`
   (auth-gated).
4. Re-sign-in via `/login` → captain card re-appears at
   `/dashboard/profile`.

**PASS criteria**: captain identity survives sign-out / sign-in cycle.

## Phase 11 — Resend dashboard cross-check

Open https://resend.com/emails. You should see one row per email sent
during this test:
- Phase 2 sanity send
- Phase 3 open-signup
- Phase 4 returning-user
- Phase 8 captain
- Phase 9 member

Confirm:
- All status `delivered`
- All `from` show `noreply@sneakersterminal.com` (NOT `onboarding@resend.dev`)
- Click into a few — payload looks correct, no bounces

**PASS criteria**: every test send is logged + delivered + from the
verified domain.

## Phase 12 — Browser + server console check

1. Browser devtools Console: NO red errors during the test.
2. `npm run dev` terminal: no repeating stack traces.
   - Acceptable: `[magic-link]` info logs, Supabase pings.
   - Not acceptable: `[csrf_origin_rejected]` spam (middleware too
     aggressive), `permission denied for table` (RLS misconfig),
     `[email] resend error` (deliverability problem).

**PASS criteria**: no red errors in either console.

---

## Final report

For each phase 1-12:
- ✅ PASS items (one line each)
- ❌ FAIL items (specific symptom + what you expected)
- 🟡 ANYTHING WEIRD that's not pass/fail

Total: target under 35 lines. Screenshot only on FAILs.

## Boundaries

- Localhost only — do NOT hit production endpoints.
- Use real inboxes you control. Don't paste real magic-link URLs to me
  unless you want me to actually click them — they're single-use and
  short-lived.
- If a phase requires the user to forward you the magic-link URL,
  describe what to look for in the email and ask them for the URL.
- If the dev server crashes, restart it and resume from current phase.
  Note the trigger.

If everything passes, the auth flow is verified end-to-end against real
email delivery and is ready to ship to prod (just unset
`AUTH_DEV_RETURN_LINK` if it was ever set, and confirm Vercel has the
same `WAITLIST_FROM_EMAIL` and `RESEND_API_KEY` values).
