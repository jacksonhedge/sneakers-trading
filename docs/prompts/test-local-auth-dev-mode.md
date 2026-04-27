# Local auth flow test — AUTH_DEV_RETURN_LINK mode

Paste to Claude Chrome. Tests the full sign-in surface end-to-end on
**localhost** with the dev escape hatch enabled, so you don't need real
email delivery to verify the flow works.

This exercises everything that just shipped in the security audit batch:
Resend-backed magic links, captain-by-user-id, joinOrgId consent gate,
CSRF middleware, post-signin next-validation, the whole stack.

---

I need a comprehensive test of the Sneakers Terminal auth flow running
locally with `AUTH_DEV_RETURN_LINK=1` set. The dev escape hatch makes the
server return the magic-link URL in the JSON response so you can click
through immediately without depending on email delivery.

Run each phase, mark **PASS** / **FAIL** with one line, end with a summary
table. Total target: 12–18 minutes.

## Setup (run before testing)

The user is responsible for these — verify they did them:

1. `apps/platform/.env.local` contains:
   ```
   AUTH_DEV_RETURN_LINK=1
   ```
2. Dev server is running: `cd apps/platform && npm run dev` → listening on
   `http://localhost:3000`
3. The 5 migrations from this session have been applied in Supabase SQL
   editor: `021_user_provider_keys_lockdown.sql`, `022_rls_lockdown.sql`,
   `023_credit_transactions_idempotency.sql`,
   `024_org_signups_captain_user_id.sql`,
   `025_student_verification_rls_realign.sql`

If any of these aren't done, STOP and tell the user which step is missing.

## Test conventions

- **Fresh incognito window for each major phase** (clears cookies between).
- Disposable emails: `local-test-1@example.com`, `local-test-2@example.com`,
  `local-test-cap@example.com`, `local-test-3@school.edu`, etc.
- Don't submit forms with a real personal email.
- Screenshot ONLY on FAILs.
- The "DEV MODE LINK" amber box that appears on success contains the
  clickable magic-link URL — that's the AUTH_DEV_RETURN_LINK feature
  working. Click that link to complete sign-in.
- Open browser devtools → Console + Network tabs. Note any 5xx, console
  errors, or unhandled promise rejections per phase.

---

## Phase 1 — Sanity: dev server + env var actually wired

1. Open `http://localhost:3000` in fresh incognito. Landing page should
   render with the terminal aesthetic (emerald + dark, "SIGN UP / WAITLIST"
   eyebrow, hero CTA). No 500 errors.
2. Open devtools → Network tab. Refresh. Confirm response headers include:
   - `Content-Security-Policy` (long string starting with `default-src 'self'`)
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), ...`
3. In a separate terminal:
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" \
     -H "origin: http://localhost:3000" \
     -d '{"email":"sanity@example.com"}' | jq
   ```
   Expected response shape:
   ```
   { "ok": true, "status": "magic_link_sent", "devLink": "https://..." }
   ```
   The `devLink` field is the proof that AUTH_DEV_RETURN_LINK=1 is active.
   If `devLink` is missing, the env var isn't being read — STOP and tell
   the user.

**PASS criteria**: dev server responds, security headers present, devLink
present in response.

## Phase 2 — Open signup (the main on-ramp)

1. Fresh incognito → `http://localhost:3000/signup`
2. Confirm form has:
   - Eyebrow `SIGN UP · INDIVIDUAL`
   - EMAIL field with .edu hint
   - **ACCESS CODE field labeled `(optional)`**
   - Submit button reads `SEND MAGIC LINK →` (not "JOIN THE LIST" — that
     was the old copy)
3. Type `local-test-1@stanford.edu` in EMAIL. Leave ACCESS CODE empty.
4. Verify the `✓ .edu detected` hint appears under the email field.
5. Click `SEND MAGIC LINK →`.
6. Success state appears with:
   - Emerald box: `✓ MAGIC LINK SENT` + "Check local-test-1@stanford.edu..."
   - **Amber box**: `⚠ DEV MODE — AUTH_DEV_RETURN_LINK=1` followed by a
     clickable URL starting with `https://...supabase.co/auth/v1/verify?...`
7. Click the amber dev-mode link.
8. Expect redirect chain: `/auth/callback` → setting session → `/dashboard`
   (or `/onboarding/about-you` for first-time users — both are PASS).
9. End up authenticated. Confirm by clicking the profile avatar or visiting
   `/dashboard/profile` — should show your email.

**PASS criteria**: end up on `/dashboard` (or `/onboarding/about-you`) as
the authenticated user `local-test-1@stanford.edu`.

🟡 If `/auth/callback` shows "SIGN-IN FAILED — Couldn't complete sign-in",
copy the error detail and FAIL the phase. Most likely cause: PostgreSQL
admin.generateLink call failed (check the server console for
`[magic-link] generateLink failed`).

## Phase 3 — Returning user via /login

Fresh incognito.

1. Visit `http://localhost:3000/login` (no email param).
2. The "no_email" state renders: `> Sign in.` card with email input + "Not
   on the waitlist yet?" link.
3. Type `local-test-1@stanford.edu` (the user from Phase 2). Click submit.
4. The page navigates to `/login?email=local-test-1@stanford.edu`. Server
   re-renders showing the "authed" state:
   - Card title: `> Welcome back.`
   - Position block (#X with referral boost = 0)
   - Helper text "You've already used your invite code..."
   - `SEND MAGIC LINK` button
5. Click `SEND MAGIC LINK`.
6. Success message appears: "Magic link sent. Check your inbox."
7. **Amber DEV MODE LINK box** appears below. Click that link.
8. End up on `/dashboard` as the same user.

**PASS criteria**: returning-user flow works; no /signup detour required.

## Phase 4 — Bad code path (regression check)

Fresh incognito.

1. Visit `/signup`.
2. Type `local-test-2@example.com` in EMAIL.
3. Type `BADCODE9` in ACCESS CODE.
4. Click submit.
5. Expect inline error: `> That code is invalid, already used, or not for
   this email.`
6. Stays on `/signup`. No redirect, no devLink shown.

**PASS criteria**: invalid code rejected with the correct error string.
This confirms the open-signup change didn't break the code-validation path.

## Phase 5 — Login enumeration check

The audit closed the email-enumeration oracle on `/api/auth/login`. Verify.

1. In a terminal, run TWO curls:
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" -H "origin: http://localhost:3000" \
     -d '{"email":"local-test-1@stanford.edu"}' | jq

   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" -H "origin: http://localhost:3000" \
     -d '{"email":"definitely-does-not-exist-9999@example.com"}' | jq
   ```
2. Both responses should have IDENTICAL shapes externally:
   `{ "ok": true, "status": "magic_link_sent", "devLink": "..." }` for the
   real user, and `{ "ok": true, "status": "magic_link_sent" }` (no devLink
   because no email was actually sent for the unknown address) for the
   non-existent one.
3. Critically: HTTP status is 200 for BOTH. Neither returns 404, neither
   returns "not_found" — that would be a regression.

**PASS criteria**: HTTP 200 for both; same `status` field; the only
difference is presence/absence of `devLink` (which corresponds to whether
a real email send was attempted).

🟡 If the unknown-email response is 404 or contains `"status":
"not_found"`, that's a FAIL — the enumeration oracle re-emerged.

## Phase 6 — CSRF middleware blocks cross-origin POSTs

The CSRF middleware should reject mutating /api/* calls from foreign
Origin headers.

1. In a terminal:
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" \
     -H "origin: https://evil.example.com" \
     -d '{"email":"x@example.com"}' -i
   ```
2. Expected: HTTP 403 with body `{"error":"csrf_origin_rejected"}`.
3. Now the same call WITHOUT an Origin header (server-to-server case):
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" \
     -d '{"email":"x@example.com"}' -i
   ```
4. Expected: HTTP 200 (server-to-server callers like Stripe webhooks have
   no Origin and must be allowed).
5. Same call WITH Origin = localhost:3000 (legitimate browser case):
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" \
     -H "origin: http://localhost:3000" \
     -d '{"email":"x@example.com"}' -i
   ```
6. Expected: HTTP 200.

**PASS criteria**: cross-origin (evil.example.com) → 403; no-origin →
200; same-origin → 200.

## Phase 7 — Org signup + captain dashboard

The org wizard creates an organization_signups row, then the captain authes
and the post-signin route should backfill `org_leader_user_id`.

1. Fresh incognito → `http://localhost:3000`
2. Click `Sign up your organization`. 3-step wizard opens.
3. **Step 1**: Select any tier (Software only is fine). Click NEXT.
4. **Step 2**: Fill in:
   - Org name: `Local Test Frat`
   - Type: `Fraternity`
   - School: `Test University`
   - Leader: `Test Captain`
   - Email: `local-test-cap@example.com`
   Click NEXT.
5. **Step 3**: Confirm review card. Click `SUBMIT ORG →`.
6. Success card appears. Click `CONTINUE TO SIGN IN`.
7. Lands on `/login`. Type `local-test-cap@example.com` in the email field
   if not already filled. Submit.
8. Redirect to `/login?email=local-test-cap@example.com`.
   - **Issue check**: this captain email may render in `not_found` state
     because the captain has no waitlist row yet (they only signed up the
     org, not the personal waitlist). If you see `> That email isn't on
     the waitlist.` — that's expected at this MVP. Use `/signup` directly:
     visit `/signup`, type `local-test-cap@example.com`, leave code empty,
     submit. The open-signup path creates the auth user.
9. Click the dev-mode link from the success card.
10. End up on `/dashboard` (or `/onboarding/about-you` for first sign-in).
11. Click profile avatar → `/dashboard/profile`.
12. Confirm at the TOP of the profile page:
    - Gradient "captain" hero card with `Local Test Frat`
    - Status pill: `PENDING REVIEW` (amber)
    - 3-stat grid: ACCEPTED 0, PENDING 0, TOTAL 0
    - `ADD MEMBERS →` + `MANAGE ORG` buttons

**PASS criteria**: captain card appears. The org_leader_user_id backfill
in /api/auth/post-signin worked silently — captain identity is now wired
to the auth user.id, not just the email.

## Phase 8 — joinOrgId consent gate

The audit changed the /join/[orgId] flow so members land as `pending` and
the captain has to approve. Verify.

1. While authenticated as the captain, click `ADD MEMBERS →` (or visit
   `/dashboard/org?tab=members`).
2. Locate the emerald "Your join link · FASTEST" card. Copy the URL —
   should look like `http://localhost:3000/join/<full-uuid>`.
3. **Open a fresh incognito window** so the captain's session doesn't
   bleed in.
4. Paste the join URL. Confirm the page renders with:
   - Org name `Local Test Frat`
   - Captain line `Captain: Test Captain`
   - Amber pill: `ORG PENDING REVIEW · CAPTAIN WILL APPROVE YOU`
   - Helper text: "Your sign-in goes through immediately. The captain
     reviews + approves your roster row separately."
5. Type `local-test-3@school.edu` in the form. Submit.
6. Success state: dev-mode link appears. Click it.
7. End up authenticated on `/dashboard` as the new member.
8. Switch back to the captain's incognito window.
9. Refresh `/dashboard/org?tab=members`.
10. Roster table should now show `local-test-3@school.edu` with status
    pill `PENDING` (amber). Crucially **NOT** `ACCEPTED` — the consent
    gate is the change.
11. Click the `Approve` button on that row.
12. Status should flip to `ACCEPTED` (emerald).

**PASS criteria**: member shows as PENDING by default after using the join
link, captain Approve button transitions to ACCEPTED. Without this fix,
any anonymous caller could spray random emails at any joinOrgId UUID and
auto-fill the captain's roster.

## Phase 9 — Captain attempts to revoke ACCEPTED member

This should be blocked — accepted members get removed via "remove member,"
not via "revoke invite."

1. From the captain's roster (Phase 8 state), the only buttons on an
   ACCEPTED row should be... actually none right now. Confirm there's
   no "Revoke" button on the ACCEPTED row.
2. Try via curl (still as the captain — extract the auth cookie from
   browser devtools → Application → Cookies, copy the supabase-related
   cookie value):

   Skip this step if cookies are too fiddly. Visual inspection of the row
   buttons is enough.

**PASS criteria**: no Revoke button on ACCEPTED rows in the captain UI.

## Phase 10 — Sign out, sign back in, session preserved

1. Same captain incognito session. Visit `/dashboard/profile` and find a
   sign-out option (might be in a header dropdown — look for it).
2. Click sign out. Should redirect to `/` or `/login`.
3. Visit `/dashboard` directly — should redirect to `/signup` or `/login`
   (auth-gated).
4. Visit `/login`, type `local-test-cap@example.com`, submit.
5. Use dev-mode link to sign in.
6. Captain card on `/dashboard/profile` should re-appear, exactly as
   before (org_leader_user_id is persisted).

**PASS criteria**: captain identity survives sign-out / sign-in cycle
(this proves the user_id-based captain check is working, not just the
session).

## Phase 11 — Browser console + server console clean check

1. Throughout the test, the browser devtools Console should have NO red
   errors (yellow warnings are OK). Note anything that appears.
2. The terminal running `npm run dev` should not have repeating error
   stacks. A few `[magic-link]` info lines, `[email] RESEND_API_KEY unset`
   messages (if you didn't set RESEND_API_KEY locally — that's fine, the
   dev link in the response is what we use), and Supabase connection
   pings are normal.
3. NOT normal: `Error: P2025` (Prisma not-found), `[csrf_origin_rejected]`
   spam (would mean the CSRF middleware is too aggressive),
   `permission denied for table` (RLS misconfig).

**PASS criteria**: no red console errors, no repeating server stacks.

---

## Final report

For each phase 1-11:
- ✅ PASS items (one line each)
- ❌ FAIL items (specific symptom + what you expected)
- 🟡 ANYTHING WEIRD that's not pass/fail

Total: target under 30 lines. Screenshot only on FAILs.

## Boundaries

- Localhost only — do NOT hit production endpoints
- Don't actually click the dev-mode link from a different browser/device
  — it's a single-use URL and you'll burn it
- If the dev server crashes mid-test, restart it and resume from the
  current phase. Note the crash + last action that triggered it.

If everything passes, the auth flow is verified end-to-end and ready for
prod after you set `RESEND_API_KEY` (which you already have for waitlist
emails — same key works) and unset `AUTH_DEV_RETURN_LINK`.
