# Auth + Dashboard + Invite Codes — Plan

**Status:** starting execution.
**Branch:** continue on `feat/platform-scaffold`.
**Estimated scope:** 5–7h focused work.

---

## Goal

Let waitlist members with a valid single-use **access code** create an account and view a personal dashboard. Gates all product access behind admin approval.

## Two distinct code systems (keep separate in the mind and the DB)

| System | Who issues | Who redeems | Reusable? | Purpose |
|---|---|---|---|---|
| **Referral code** (shipped) | Auto-generated per waitlist signup | Anyone clicking the `/r/<code>` link | Reusable — unlimited downstream signups | Push referrer up the queue |
| **Access code** (this plan) | Admin (you) manually | One specific waitlist member | One-shot — burned after redemption | Let the user create a real account + access `/dashboard` |

## User-facing flow

1. User signs up on the waitlist landing (existing flow).
2. Admin (you) runs `pnpm admin:invite <email>` for a list of approved emails.
3. Each approved user receives an email: *"You're off the waitlist. Your access code: XXXXXXXX. [Sign up here]"*
4. User clicks the link → lands on `/signup?code=XXXXXXXX`, email auto-fills from the code.
5. User confirms → backend verifies code + email match → sends a Supabase magic link.
6. User clicks magic link in their inbox → authenticated → lands on `/dashboard`.
7. Invite code is marked consumed on successful sign-in. Repeat attempts are rejected.

## Data model — migration 003_invites.sql

```sql
alter table public.waitlist
  add column if not exists invite_code text unique,
  add column if not exists invited_at timestamptz,
  add column if not exists invite_used_at timestamptz;

create index if not exists waitlist_invite_code_idx
  on public.waitlist (invite_code)
  where invite_code is not null;
```

- `invite_code`: 8 chars (distinguish from the 6-char referral codes), same safe alphabet (no 0/O/I/1). Nullable — only set when admin issues.
- `invited_at`: when admin issued the code. Not the consumption timestamp.
- `invite_used_at`: when the user successfully signed in with it. Null = still redeemable.

## Auth stack

- **Supabase Auth** with **email OTP / magic link**, no passwords.
- Email confirmation: disabled (the magic link IS the confirmation).
- Redirect URL whitelist: `https://sneakersterminal.com/auth/callback` + `http://localhost:3000/auth/callback`.
- RLS policy on `waitlist`: authenticated users can `SELECT` their own row matched by `auth.jwt() ->> 'email' = email`.

## Routes

- `/signup` — server component reads `?code=` query param, client form for email + code. Posts to `/api/auth/request-link`.
- `/api/auth/request-link` — POST. Validates code + email against `waitlist`. Calls `supabase.auth.signInWithOtp({ email })`. Returns `{ ok: true }` or `{ error }`.
- `/auth/callback` — Supabase redirects here after magic-link click. Exchanges the code for a session. Marks `invite_used_at = now()` on the matching waitlist row. Redirects to `/dashboard`.
- `/dashboard` — protected server component. Reads the current user from Supabase, looks up their waitlist row, renders:
  - Queue position (real count + offset)
  - Direct + indirect referral counts
  - Shareable referral link with copy button
  - Tier progress (1 / 3 / 10 direct referrals)
  - Account-settings placeholder

## Admin issuance

`scripts/issue-invites.ts` at `apps/platform/scripts/` — CLI script.

Usage: `pnpm --filter=@sneakers/platform run admin:invite email1@example.com email2@example.com`

For each email:
1. Look up the waitlist row.
2. If no row: skip + warn (could auto-add, but v1 requires the user to have signed up first).
3. If already has an invite_code: skip + warn.
4. Generate 8-char code, set `invite_code` + `invited_at`.
5. Send email via Resend with subject *"You're off the Sneakers waitlist"*.

Runs locally only (needs `SUPABASE_SERVICE_ROLE_KEY` + `RESEND_API_KEY` from `.env.local`).

## Execution order

1. Migration 003 + apply (Chrome prompt at `docs/prompts/apply-invites-migration.md`)
2. RLS policy (same migration or separate)
3. Supabase Auth dashboard config (magic-link + redirect URLs — Chrome prompt at `docs/prompts/configure-supabase-auth.md`)
4. `/api/auth/request-link` route + validation
5. `/signup` page
6. `/auth/callback` route
7. `/dashboard` page + layout
8. Admin invite script
9. Invite email template
10. End-to-end test: issue code to a test email → receive email → sign up → dashboard loads with correct data
11. Deploy, verify prod

## Out of scope (later)

- Multi-account per email / account recovery flows
- Admin UI (for v1 it's a CLI script)
- Dashboard's "real" content (Markets, Portfolio, Trades) — v1 shows referral status + account settings + "coming soon" placeholders
- Rate limiting on /api/auth/request-link — Phase 3 polish
- Explicit "Request Access" button on landing — v1 treats the waitlist signup itself as the request

## Decisions locked

- **Bound codes** — each code is tied to the waitlist row's email, and signup requires the email to match. Prevents code sharing.
- **Single-use** — `invite_used_at` burns the code after successful signin.
- **No self-service access request in v1** — user signs up on waitlist, admin issues codes manually. Simple.
- **CLI, not admin UI, for v1 issuance** — faster to ship.
