# Sneakers Terminal — signup/onboarding/approval audit

Date: 2026-05-04. Compares the current Sneakers flow to the patterns used by best-in-class consumer + fintech onboarding flows. Goal: find the highest-leverage gaps to close before the 100-testers push.

## Current Sneakers flow

```
/                  → Landing (LOG IN | SIGN UP)
/signup            → multi-step form (email, name, source, account_type, business_subtype, referral, avatar)
                     ↓ POST /api/auth/signup
                     ↓ creates Supabase auth user + waitlist row (invite_used_at=null)
                     ↓ router.push('/dashboard')
/dashboard         → layout sees invite_used_at=null
                     ↓ redirect
/pending           → static "you're in line" card. No queue position. No ETA. Sign-out only.

⏳ admin clicks ApproveButton at /admin/users
   ↓ POST /api/admin/approve-user → invite_used_at=now()
   ↓ NOW (post 2026-05-04 fix): also fires sendApprovedEmail via Resend

/dashboard         → layout passes gate
                     ↓ ⚠ unclear when /onboarding fires; appears post-approval
/onboarding/about-you
       → /wallet → /platforms → /invite-friends → /location-check → /done
                     ↓
/dashboard
```

## Industry references

### Robinhood (consumer trading)
- **Single-screen signup**: email + password + DOB + SSN-last-4 in one screen. No "click next" between every field.
- **Identity verification streamed in parallel** with account funding — user doesn't wait at a static screen.
- **Approval = push notification** + email + in-app banner. Three channels.
- **Onboarding embedded in app**: not a multi-step flow before access. Shown as gentle prompts inside the working dashboard ("link a bank to start trading").
- Key takeaway: don't gate access on onboarding completion. Gate features instead.

### Stripe Atlas (formation product)
- **Status timeline page** while waiting (e.g., "Filed → IRS approval → bank account opened → funded"). Each step has an ETA. User refreshes instead of leaving.
- Email at every state transition.
- Key takeaway: turn waiting into transparency. Position + ETA reduces "is this dead?" anxiety.

### Polymarket (direct competitor)
- **Wallet-first**: signup IS connecting a wallet. No email/password.
- **Skip-friendly onboarding**: every step has a Skip button. Lets power users go straight to trading.
- Key takeaway: every required field is a drop-off opportunity. Skip > require for non-essential.

### Kalshi (direct competitor)
- **KYC up-front** (legally required for them). Three-screen identity flow.
- **Status badge on the user's own profile** ("VERIFIED · TIER 2") — explicit signal of where they are in the funnel.
- Email + SMS for status changes.
- Key takeaway: make the user's own approval state visible to them everywhere, not buried in a modal.

### Linear (B2B)
- **Magic link only** — no password ever. Signup form is one field: email.
- **Workspace bootstrapping while user reads docs**: as soon as email is verified, they land on a working workspace with sample data. No empty state.
- Onboarding is a **dismissible checklist in the corner** of the working app.
- Key takeaway: zero-friction auth (magic link) + working-app-from-second-zero is the bar.

### Vercel (developer)
- **OAuth-first** signup (GitHub/GitLab/Bitbucket). Email is fallback.
- Account is usable immediately; onboarding is a series of optional banners ("connect a Git provider", "deploy your first project").
- Key takeaway: borrow trust from OAuth. Skip your own auth entirely if you can.

### Supabase (developer + admin approval-style)
- **Org pending state shows real activity feed**: "Account created · Email verified · Awaiting team approval (3 pending)". Time-stamped.
- Admin gets Slack/email alert for new pending requests. Approval is one click in the admin UI; user gets email + the org dashboard updates live via Supabase Realtime.
- Key takeaway: bidirectional realtime — admin sees signups instantly, user sees approval instantly.

## Patterns worth borrowing for Sneakers

Ranked by ROI for the 100-testers push:

### Tier 1 — ship this week

1. **Approve sends email** ✅ (just shipped, 2026-05-04)
2. **`/pending` queue position + ETA**
   - Show "you're #N of M waiting". Add an "approved testers ahead of you" count from the waitlist table. ~30 min query work + UI tweak.
   - Optional polish: auto-refresh via Supabase Realtime on `waitlist.invite_used_at` change so an open tab updates without manual refresh.
3. **Bulk approve in `/admin/users`**
   - Multi-select checkboxes + "Approve N selected" button. Each fires `sendApprovedEmail` in sequence (Resend can handle 10 RPS). Cuts the 100-testers approval session from ~20 min of clicking to ~30s.
4. **Single-screen signup**
   - Current flow is multi-step (next1, next2 onSubmit handlers in signup-form.tsx:147+). Collapse into one screen with all fields visible. Industry standard, reduces drop-off.

### Tier 2 — ship this month

5. **Reverse onboarding order**
   - Move `/onboarding/about-you` + `/location-check` + `/platforms` BEFORE the /pending gate. Admin then approves with full profile in front of them — better tester selection.
   - `/wallet` and `/invite-friends` stay post-approval (require trading access anyway).
6. **OAuth signup option**
   - Google + Apple sign-in via Supabase. Current flow is email + magic link only. OAuth shaves another ~30s off signup.
7. **Status badge in dashboard chrome**
   - Small "Tier: Pro · Approved 5/2" pill in the top bar. Always visible, removes ambiguity.

### Tier 3 — polish

8. **Welcome email sequence**
   - Day 0 (approve): "you're in"
   - Day 1: "tour of the dashboard"
   - Day 3: "make your first connection"
   - Day 7: "give us feedback"
9. **Realtime admin dashboard**
   - Supabase Realtime subscription on `waitlist` so new signups appear in `/admin/users` without refresh.
10. **Skip everywhere**
    - Every onboarding step needs a Skip button. The flow assumes users will fill all 5 steps; in practice ~30% of testers will bail at a required step.

## Tonight's deliverable

- ✅ `sendApprovedEmail()` added to `apps/platform/src/lib/email.ts`
- ✅ `/api/admin/approve-user` calls it on the approve path; gracefully tolerates Resend failures
- ✅ Approve response now includes `{ emailed: bool, emailError: string|null }` so the admin UI can show "Approved + emailed ✓" vs "Approved (email failed)"
- ⏳ Optional next pass: have the ApproveButton surface the email status in a toast

## Schema considerations

No migration needed for tonight's changes. The `waitlist` table already has all the columns we'd want for queue position, ETAs, and realtime. The `subscription_status` column we backfilled earlier today opens the door for the status-badge UI when we get there.

## Open questions

- **Magic link vs password**: current Sneakers signup is magic-link first (per `/api/auth/request-link`). Good. Keep it.
- **OAuth providers**: Google? Apple? Both? User-base is college students per memory — Google is dominant.
- **Onboarding-before-approval (Tier 2 #5)**: this is the biggest UX win but requires reworking the redirect logic in `dashboard/layout.tsx` and `/api/auth/signup`. Worth doing, but fragile — needs careful testing.
