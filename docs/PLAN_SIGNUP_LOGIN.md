# Signup & Login — configuration, flows, risks, launch plan

Written 2026-04-23 for Sneakers Terminal. The goal of this doc: make sure a real user can land on sneakersterminal.com, sign up, authenticate, complete onboarding, and land on a working dashboard — on the first try, every time, without human intervention.

## TL;DR

The current auth model is **code-first, no-email-round-trip**. Users paste an invite code + email into the landing form, the server admin-generates a magic-link URL, and the browser navigates to it directly. No Resend / no inbox dependency. This was the right pivot — the Resend-test-mode bottleneck was blocking real signups.

**Returning-user login** still goes through magic-link email (Resend) and therefore still depends on email delivery working in production. This is the biggest remaining blocker.

**Three things must be true before we open signups publicly:**

1. Resend is either (a) production-verified for `sneakersterminal.com` so emails actually deliver, OR (b) we add a password/OTP-typed-on-screen flow for returning users. Right now returning users can't log in reliably.
2. Supabase prod schema is fully migrated — `waitlist`, `user_profiles`, `user_credits`, `stripe_subscriptions`, `student_verification`, and `enterprise_hardware_requests` tables must all exist in prod (some pending).
3. At least one full happy-path test completes end-to-end on production: land → code → magic link → first-sign-in detection → onboarding steps → dashboard loads with real data. No "works locally."

---

## Entry points (every URL a new user can hit)

| Path | Purpose | State |
|---|---|---|
| `/` (landing) | Code entry OR waitlist signup. Code + email → direct sign-in. No code → join waitlist. | ✅ shipped |
| `/signup` | Alternate direct signup page (same form, different framing) | ✅ shipped |
| `/students` | Student-tier landing ("75% off. 2 weeks free.") | ✅ shipped but no OG image |
| `/college` | Same as `/students` but with OG preview image for text/social sharing | ✅ shipped |
| `/waitlist` | Email-only waitlist capture (no code required) | ✅ shipped |
| `/admin/invites` | Admin UI to mint + email invite codes | ✅ shipped |
| `?ref=CODE` URL param | Sets referrer cookie so when the invitee signs up, the referrer gets credit | ✅ shipped |

**Open question**: should `/` still offer both "paste code" and "join waitlist" together, or split into two distinct pages? Current UX toggles button label ("ACCESS" vs "JOIN WAITLIST") based on whether the code field has input. It works but feels overloaded.

---

## Auth flows (what happens at each state)

### Flow A — First-time sign-in (code-holder)

```
/ → user types email + code → POST /api/auth/request-link
  → server validates code against `waitlist` table (service_role)
  → server calls admin.createUser() (idempotent)
  → server calls admin.auth.admin.generateLink({type:'magiclink'})
  → server returns { ok:true, redirect: <action_link> }
  → client navigates to action_link
  → Supabase exchanges code for session cookies
  → 302 → /auth/callback
  → callback marks waitlist.invite_used_at = now() (conditional on null)
  → if update matched → isFirstSignIn=true → /onboarding/about-you
  → else → /dashboard
```

**Code**: `apps/platform/src/app/api/auth/request-link/route.ts` + `apps/platform/src/app/auth/callback/route.ts`

**Key invariant**: `invite_used_at` is set transactionally on first callback hit. Second sign-in doesn't re-fire onboarding because the update no longer matches a null.

### Flow B — Returning-user login (code already burned)

```
user types email at /login (no code needed) → POST /api/auth/login
  → server looks up waitlist row
  → if invite_used_at set → signInWithOtp({email}) → Resend sends magic link
  → user clicks email link → /auth/callback → /dashboard
```

**🔴 This flow depends on Resend actually delivering email.** Status unknown in prod. If Resend is still in test mode (we never confirmed domain verification), the magic link never arrives and users are locked out.

### Flow C — Admin login

Admin emails (defined by `ADMIN_EMAILS` env var) always get magic link regardless of waitlist state. Bypass exists at `/api/auth/login:26`.

### Flow D — Waitlist-only (no invite code yet)

User submits email at `/` without a code → `POST /api/waitlist` → row inserted with `invite_code = null`. User sees "You're on the list" confirmation. Admin later generates codes via `/admin/invites` or `scripts/issue-invites-bulk.ts`, which sends an email (Resend) with the code.

**🔴 Same email-delivery dependency**. Invite-code emails to waitlist users won't land until Resend is prod-verified.

### Flow E — Student verification

Post-signup, user visits `/dashboard/settings` (or similar) → uploads .edu email / student ID → server writes to `student_verification` table → admin reviews at `/admin/students` → approves → Stripe coupon `STRIPE_COUPON_STUDENT` applied on their next checkout.

### Flow F — Enterprise inquiry

User fills form at `/enterprise` or similar → writes to `enterprise_hardware_requests` table (migration 011) → admin reviews → manual outreach.

### Flow G — Edge cases (what happens when things break)

| Scenario | Current behavior | Correct behavior |
|---|---|---|
| Invalid code format | 400 "invite_invalid" | ✅ correct |
| Unknown email | 400 "invite_invalid" (no diff from bad code — prevents enumeration) | ✅ correct |
| Used code | 400 "invite_invalid" | ✅ correct (idempotent rejection) |
| Expired magic link | Redirect to `/signup?error=auth_failed` | ✅ correct |
| Browser killed during callback | User re-enters email+code → server re-generates link → idempotent createUser → works | ✅ correct |
| Resend failure on /api/auth/login | Returns 500, no user feedback about email not arriving | 🔴 needs better error handling + fallback |

---

## Configuration inventory

### Env vars required (Vercel)

**Authentication & data**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, for admin.createUser etc.)
- `NEXT_PUBLIC_SITE_URL` (e.g. `https://sneakersterminal.com`)
- `ADMIN_EMAILS` (comma-separated — always-magic-link list)

**Email (still in use for returning-user login + waitlist invite emails)**:
- `RESEND_API_KEY`
- `WAITLIST_FROM_EMAIL` (e.g. `hi@sneakersterminal.com`)

**Payments (Stripe)**:
- `STRIPE_SECRET_KEY`
- `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SIGNING_SECRET`
- `STRIPE_COUPON_STUDENT`
- `NEXT_PUBLIC_STRIPE_PRICE_{PRO,ELITE,BUSINESS,FRATERNITY}_{MONTHLY,YEARLY}` (8 prices)

**Data & misc**:
- `POSTGRES_URL` (Timescale / scraper data — just wired up on Railway)
- `SNEAKERS_ENABLE_SEED` (set to `1` so dashboard has data while scraper's catching up; remove once real data flows)
- `CRON_SECRET`
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` (O'Toole)
- `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` (web push)
- `MAX_AUTO_INVITES` (referral-throttle ceiling)

### Env vars required (Railway trader)

Separate service, separate env. Covered in `docs/prompts/railway-setup-scrapers.md`.

### Supabase migrations

Located at `apps/platform/supabase/migrations/*.sql`. **All 14 must be applied in order** to any environment (dev/staging/prod).

| # | File | Table(s) | Needed for |
|---|---|---|---|
| 001 | `001_waitlist.sql` | `waitlist` | Signup flow |
| 002 | `002_referrals.sql` | `referrals` | Referral credit |
| 003 | `003_invites.sql` | — | Invite code generator functions |
| 004 | `004_venue_access_requests.sql` | `venue_access_requests` | Onboarding platforms step |
| 005 | `005_account_type.sql` | ALTER waitlist | Pro/Elite/Business/Frat tiering |
| 006 | `006_user_credits.sql` | `user_credits` | O'Toole credit balance |
| 007 | `007_stripe_subscriptions.sql` | `stripe_subscriptions` | **Required before any paid signup** |
| 008 | `008_otoole_daily_usage.sql` | `otoole_daily_usage` | Rate-limit free-tier O'Toole |
| 009 | `009_user_provider_keys.sql` | `user_provider_keys` | Users BYOK their own LLM keys |
| 010 | `010_student_verification.sql` | `student_verification` | **Required for student discount flow** |
| 011 | `011_enterprise_hardware_requests.sql` | `enterprise_hardware_requests` | Enterprise / frat Mac Studio asks |
| 012 | `012_alerts.sql` | `alerts`, `alert_triggers` | User alert subscriptions |
| 013 | `013_invite_scarcity.sql` | ALTER waitlist | Adds `invite_code`, `invite_sent_at`, `invite_used_at` |
| 014 | `014_user_profiles.sql` | `user_profiles` | Onboarding answers (state, platforms, etc.) |

**🔴 Verify in prod**: 007 + 010 are critical for paid conversion. If they haven't been applied, the student flow + Stripe webhooks will crash silently on first real usage.

### Stripe products

- Pro Monthly / Pro Yearly
- Elite Monthly / Elite Yearly
- Business Monthly / Business Yearly
- Fraternity Monthly / Fraternity Yearly
- Student coupon (75% off Pro + Elite; 14-day trial)

**Verify live mode**: live Stripe keys are on Vercel (we added earlier this session). Need end-to-end test with a real card before going live.

### Cookies / session

Supabase manages session cookies via `@supabase/ssr`. Cookie names: `sb-<project-ref>-auth-token` (split into chunks). Lifetime: default 1 hour access, 7 days refresh. No custom cookie config.

**No CSRF protection** on the current API routes. For a small beta this is fine (JWTs are session-bound, and request-link requires a secret code). At scale, add double-submit cookie.

---

## Known issues / gaps (by severity)

### 🔴 Critical (blocks signups from working in prod)

1. **Resend domain verification status unknown**. If still in test mode, returning users cannot log in. Fix: verify `sneakersterminal.com` at `resend.com/domains`; add DNS records (SPF/DKIM); flip off test mode. Prompt exists at `docs/prompts/resend-domain-verify.md` (if not, write one).

2. **Migration 007 + 010 may not be in prod Supabase**. Verify by running the SQL from `apps/platform/supabase/migrations/007_stripe_subscriptions.sql` as a DRY RUN against prod and checking the table exists. If missing, apply via Supabase SQL editor.

3. **No smoke test on production auth**. Last verified: locally via dev server. Before opening beta, one human completes the full flow on sneakersterminal.com, using a brand-new email never seen by Supabase.

### 🟡 High (real usability issues, should fix pre-scale)

4. **`/api/auth/login` can 500 without telling the user why**. If Resend throws, the user sees "Server error" but no retry affordance. Fix: catch Resend-specific errors, show "We couldn't send the email. Try again in 60 seconds or contact hi@sneakersterminal.com."

5. **No rate limiting on `/api/auth/request-link`**. An attacker with a wordlist of emails + wordlist of codes could brute-force. Current collision space (6-char alphanumeric code) is survivable short-term but embarrassing at scale. Fix: add 10-req/min/IP limit using Upstash Ratelimit or Vercel Edge Middleware.

6. **First-sign-in detection is fragile**. If the `UPDATE ... WHERE invite_used_at IS NULL` fails for any DB reason, user is sent to `/dashboard` instead of onboarding — they never complete the onboarding flow and we lose signal on their platforms / state. Fix: separate the "is first sign-in" check from the "mark used" write, so they can fail independently.

7. **Onboarding is skippable**. Users can type `/dashboard` directly after callback and bypass the 5-step onboarding. Consider: layout-level middleware that checks `user_profiles.onboarding_completed_at` and redirects if null. Or accept it as a feature (power users shouldn't be forced through onboarding).

8. **No "resend my code" flow**. If a waitlisted user loses their invite email, they have no way to get it re-sent. Admin has to manually re-run `scripts/issue-invites.ts --email=X --force`. Fix: add `/help?action=resend-code` public page that re-triggers admin route.

### 🟢 Medium (polish / future-proofing)

9. **Session cookies don't show user's identity anywhere visible**. Debugging "am I logged in?" requires opening devtools. Surface it in the topbar (already done — email shows in profile avatar hover).

10. **No logout button in obvious places**. Ctrl-F "sign out" — `sign-out-button.tsx` exists on settings, but not in the topbar or dashboard. Add to profile dropdown.

11. **Mobile-viewport signup flow untested**. The landing form is responsive in theory but no one's validated it on iOS Safari / Android Chrome at actual phone sizes.

12. **Password reset doesn't exist** because we don't have passwords. If we ever add password-based auth (some enterprise users prefer it), this becomes a whole feature.

### ⚪ Low (nice-to-haves)

13. OAuth providers (Apple Sign-In, Google) — not critical for MVP, high conversion lift at scale.
14. 2FA for admin accounts — trivial to add via Supabase, zero users asking for it yet.
15. Account deletion endpoint — GDPR/CCPA compliance, low risk for US-only beta.

---

## Testing plan

### Automated stress tests (already exist)

Under `apps/platform/scripts/stress/`. Run with `pnpm --filter @sneakers/platform tsx scripts/stress/run-all.ts`.

- `01-double-post.ts` — submits the same waitlist form twice, checks idempotency
- `03-invite-probe.ts` — throws random codes at `/api/auth/request-link`, checks uniform 400s
- `04-self-referral.ts` — tries to refer self, checks rejection
- `05-garbage-inputs.ts` — SQL-injection, XSS, oversize payloads — checks sanitization
- `06-student-submit-unauth.ts` — anonymous POST to student verification endpoint
- `07-student-review-unauth.ts` — anonymous approval attempt

**These all pass locally. Run against prod before go-live.**

### Manual QA checklist (before beta open)

Block 30 minutes, do all of these with a fresh email each:

1. **Happy-path — code-first**: paste valid code + new email → should land on /onboarding/about-you. Complete onboarding → dashboard shows seed data.
2. **Happy-path — waitlist**: submit email only → "you're on the list" → admin mints code → email arrives → click link in email → signup works.
3. **Happy-path — student**: complete signup → go to /students flow → upload .edu → admin approves in /admin/students → Stripe checkout shows 75% off.
4. **Happy-path — returning user**: complete signup once → log out → log in with email only at /login → magic link email arrives → click → lands on /dashboard.
5. **Error — bad code**: type wrong code → see "invite_invalid" generic error.
6. **Error — used code**: reuse a code already burned → same generic error.
7. **Error — expired link**: let the admin-generated link sit for >30 min → click → should redirect to /signup?error=auth_failed.
8. **Mobile Safari**: steps 1 + 4 on an actual iPhone.
9. **Mobile Chrome**: steps 1 + 4 on Android.
10. **Rate-limit probe**: paste 20 different wrong codes in 60 seconds → should either succeed (we don't have rate limiting yet) or 429 (we do).

### Chrome-agent automation

Write one unified prompt for Claude Chrome that runs steps 1, 4, 5, 6, 7 on sneakersterminal.com (production), reports PASS/FAIL on each. Save at `docs/prompts/signup-qa-full.md`. Fire weekly.

---

## Monitoring / observability gaps

**What we don't currently see:**
- Funnel: "how many landed → entered code → completed callback → reached dashboard"
- Email-delivery success rate (Resend has a dashboard — not wired to our stack)
- Rate of `invite_invalid` rejects by IP (would surface attacker probing)
- Time-to-first-dashboard-render after first-sign-in
- Drop-offs between onboarding steps

**Minimum viable observability**:

1. **`auth_events` table** — insert one row per state transition (request-link called, link generated, callback hit, first-sign-in, onboarding step completed). Columns: `user_id`, `event_type`, `at`, `metadata_jsonb`. Query for funnel drop-offs.

2. **Vercel Analytics** already captures pageviews. Add custom events via `@vercel/analytics`:
   - `signup_code_submitted`
   - `signup_magiclink_redirected`
   - `auth_callback_succeeded` / `auth_callback_failed`
   - `onboarding_step_N_completed`
   - `dashboard_first_viewed`

3. **Admin dashboard at `/admin/auth-funnel`** — renders the above as a weekly bar chart. No external dependencies.

4. **Sentry** (or similar) for error collection. Currently we `console.error` everything — logs are in Vercel's function logs but nobody watches them. Wire Sentry for breadcrumbs + alerting.

---

## Launch-readiness checklist

Copy this into a GitHub issue when you're ready to open signups publicly.

**Blockers (all must be ✅ before opening)**

- [ ] Resend domain verified for sneakersterminal.com; production email delivery confirmed (send test → own inbox → arrives in <1 min)
- [ ] Supabase prod has all 14 migrations applied (verify: `SELECT tablename FROM pg_tables WHERE schemaname='public'` returns the expected set)
- [ ] Full happy-path auth flow completed on sneakersterminal.com by a real human with a brand-new email
- [ ] Live Stripe checkout completes end-to-end with a real $1 trial card (can refund after)
- [ ] `/api/auth/login` returns useful errors when Resend fails (not just 500)
- [ ] `STRIPE_COUPON_STUDENT` coupon exists in live Stripe dashboard with correct 75%-off config
- [ ] Session cookies persist across tab close → reopen (verify user stays logged in)

**High priority (ship within first week of open beta)**

- [ ] Rate limit on `/api/auth/request-link` (10/min/IP)
- [ ] Resend-my-code self-serve flow
- [ ] Mobile-viewport QA (iOS Safari + Android Chrome)
- [ ] Auth funnel events instrumented (at least signup_code_submitted → dashboard_first_viewed)

**Medium / next-sprint**

- [ ] Separate "is first sign-in" detection from "mark used" write
- [ ] Onboarding-completion middleware (or explicit "skip for now" link)
- [ ] Logout button in topbar profile dropdown
- [ ] Sentry integration
- [ ] Admin dashboard: signup funnel + error rate

**Post-MVP / after first 100 users**

- [ ] Apple Sign-In + Google OAuth
- [ ] 2FA for admin accounts
- [ ] Account deletion endpoint
- [ ] Password-based auth option for enterprise

---

## What to do RIGHT NOW (order)

If you had 1 hour to reduce launch risk, in this order:

1. **Verify Resend domain status** (5 min): log into resend.com/domains → check if sneakersterminal.com is `Verified`. If not, add the DNS records it shows and wait for verification to propagate. This is THE single biggest fragility in the auth stack.

2. **Verify Supabase migrations in prod** (5 min): Supabase SQL Editor → run `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;` → confirm all 14 tables are present. Apply missing migrations in order.

3. **Send yourself a test email via Resend** (5 min): trigger `/api/auth/login` with your admin email on prod, verify the email arrives.

4. **Full production smoke test** (15 min): use a brand-new email, go through the whole flow on sneakersterminal.com. Document what breaks.

5. **Write the Resend-failure error message** (15 min): in `/api/auth/login` route, catch Resend errors and return user-visible text.

6. **Add rate limiting** (15 min): the simplest possible — in-memory counter per IP (won't survive restart, good enough for the first 100 users).

After those 6 steps, you can reasonably open signups to 20-50 beta testers. After the first week, circle back to the "high priority" list.

---

## Files to read if digging deeper

- `apps/platform/src/app/api/auth/request-link/route.ts` — first-time sign-in
- `apps/platform/src/app/api/auth/login/route.ts` — returning-user login
- `apps/platform/src/app/auth/callback/route.ts` — magic-link exchange + first-sign-in detection
- `apps/platform/src/app/api/waitlist/route.ts` — waitlist capture
- `apps/platform/src/lib/supabase-auth.ts` + `supabase-server.ts` — client factories
- `apps/platform/src/lib/invite-code.ts` — code format validation
- `apps/platform/src/lib/admin-auth.ts` — admin-email shortcut
- `apps/platform/scripts/issue-invites.ts` + `issue-invites-bulk.ts` — admin tooling
- `apps/platform/supabase/migrations/*.sql` — schema source of truth
- `apps/platform/scripts/stress/` — negative-path test harness

---

## Review cadence

- Re-run this doc quarterly, or any time an auth-related bug reaches prod
- Update the "Known issues" section when a fix lands — don't let it decay
- After a user-reported auth bug, add a Manual QA case that would've caught it
