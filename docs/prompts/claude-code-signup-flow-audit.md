# Claude Code handoff — sign-up flow audit + polish

For another Claude Code instance. Your job is to make the end-to-end sign-up journey feel right for a first-time visitor, regardless of which path they take. The scaffolding is in place; you're finishing it.

## What's already built (don't rebuild)

**Commit `6b66279`** shipped the new code-first landing form. The behavior you should NOT regress:

- Landing page `/` uses `LandingForm` (`apps/platform/src/app/landing-form.tsx`). It has an optional **ACCESS CODE** field above the email input. If the code field is filled, submit goes to `/api/auth/request-link` and a magic link is sent. If empty, it falls back to `/api/waitlist` and the user sees a queue position + referral card.
- Submit button label flips: **SIGN IN** when code is present, **JOIN WAITLIST** when empty.
- `/students` still uses the older `WaitlistForm` component (students always go through waitlist) — leave it alone.

## Read these files before writing any code

- `apps/platform/src/app/page.tsx` — landing page layout
- `apps/platform/src/app/landing-form.tsx` — the new landing form (code or waitlist)
- `apps/platform/src/app/signup/page.tsx` + `signup-form.tsx` — the `/signup?code=X` redemption page (used when the user clicks an invite email)
- `apps/platform/src/app/login/page.tsx` — existing-waitlist-member sign-in page
- `apps/platform/src/app/auth/callback/route.ts` — magic-link callback
- `apps/platform/src/app/onboarding/` — post-sign-in onboarding (commit `b1c0e1b` scaffolded M1)
- `apps/platform/src/app/api/waitlist/route.ts` — waitlist POST handler
- `apps/platform/src/app/api/auth/request-link/route.ts` — code+email magic-link trigger
- `apps/platform/src/app/api/auth/login/route.ts` — existing-member magic-link trigger
- `apps/platform/src/lib/email.ts` — `sendInviteEmail()` template (what a waitlisted user receives when admin issues their code)

## Specific things to audit + fix

Go through these in order. Each one is a standalone checklist you can commit separately.

### 1. Waitlist success → "what do I do next?" clarity

After a user joins the waitlist on `/` they see the `WaitlistSuccessCard` (in `landing-form.tsx`). Current copy:

- "You're on the list"
- Queue position
- Your invites (3 slots)
- Your referral link

**What's missing:** "What happens next?" A visitor doesn't know if they'll get an email, when they'll get in, or what they should do in the meantime. Add 2-3 lines explaining:
- "We invite in waves. When a slot opens, we'll email you an access code."
- "Want to move up? Share your link — each signup bumps you 5 spots."
- Optional: link to a public `/status/[code]` page if one exists (check `src/app/status/` — if no such route, don't fabricate one).

### 2. Landing form → re-visit flow

A waitlisted user who later receives an invite email clicks through to `/signup?code=XXX`. But some users will try to re-enter their email on `/` instead — what happens?

Current behavior (landing-form.tsx `submit()` → waitlist path): if the email already exists on the waitlist, it redirects to `/login?email=...` via `router.push`. Check that this still works post-deploy:

- Sign up once (joins waitlist, status = waitlisted, no code).
- Come back to `/` in a fresh incognito window.
- Paste the same email, leave code empty, submit.
- **Expected:** lands on `/login?email=...` with position visible.
- **Current:** should work, but verify end-to-end.

If that flow is broken, fix the redirect in `landing-form.tsx` or `/api/waitlist/route.ts`.

### 3. Landing form → code-with-wrong-email

If someone with a valid code types the WRONG email (typo), `/api/auth/request-link` returns `{error: 'invite_invalid'}`. The landing form currently shows "That code is invalid, already used, or not for this email." — that's fine. But the next step for the user is unclear: do they retype? Start over?

Add a small "Did you mean…?" affordance OR a clearer retry button (currently the user just has to edit the field in place). Judgment call — if the current UX is good enough, leave it and flag in your report.

### 4. Email template consistency

Two email templates exist:
- `sendInviteEmail({to, code})` in `lib/email.ts` — sent when admin issues an invite
- Supabase's magic-link email (templated in Supabase dashboard, not this repo) — sent when a user with a valid code requests a sign-in link

Spot-check both against the Wimbledon-green / stone-50 / `#00703c` palette that the site uses. If the Supabase template is still default-blue, note it (you can't fix it from code — it's a Supabase dashboard setting — but the human should know).

### 5. /signup page — still needed post-LandingForm?

`/signup` exists and accepts `?code=XXX` for the invite-redemption flow. Now that `/` has the same inputs, is `/signup` redundant?

**Probably no — it's what invite-email links point to** (the URL in the email template). Verify that `sendInviteEmail()`'s template points at `/signup?code=...` not at `/` — if it points at `/`, both surfaces work, but `/signup` can be left alone for backward compat.

If you find `/signup` is genuinely dead, remove it in a SEPARATE commit with a clear message. Do not silently delete.

### 6. Onboarding continuity

After a successful sign-in (magic-link callback lands on `/dashboard`), does the user see anything onboarding-ish? Check `apps/platform/src/app/onboarding/` — the M1 scaffold exists per `b1c0e1b`. Determine:

- Is there a middleware that redirects first-time users to `/onboarding`?
- Does the dashboard have an "Complete setup" prompt somewhere?
- If onboarding is still stubby, write a clear summary of what's missing for a follow-up task. Don't build the whole onboarding flow in this pass — scope creep.

### 7. Referral-cookie flow

Visitors who land via `/r/[code]` get a 30-day `sneakers_ref` cookie. The landing form reads that and includes it in the waitlist POST. Spot-check:

- Visit `/r/TESTCD` (even if code doesn't exist — the route handler `clear stale ref cookie on invalid /r/[code]` shipped in commit `f7c5b62`).
- Sign up for waitlist.
- Verify the `referrerCode` is sent in the POST body (DevTools network tab).

### 8. Small copy + UX tweaks (batch into one commit)

- The `/` helper text under the button reads "No code? You can still join the waitlist — we invite in waves." Good, keep.
- Consider: when code field has 1–7 characters (mid-typing), the button should probably still say SIGN IN and the error should surface on submit, not mid-typing. Check current behavior — if it flickers "JOIN WAITLIST" / "SIGN IN" as the user types, smooth that out.
- Access-code input should auto-uppercase (already does via `toUpperCase()` in `onChange`) and be `maxLength=8`. Confirm both.

## Anti-goals — do NOT touch

- **`/api/waitlist` schema or response shape.** Other surfaces (admin console, existing-user redirect) depend on current fields. Additive changes only.
- **Stripe, subscription, or pricing code.** Unrelated to sign-up. If you see obvious bugs, write them up in your report, don't fix.
- **The venue ticker, connect-wallet button, markets page, or dashboard panels.** Out of scope.
- **Supabase migrations.** Don't add any. If you need a schema change, write up the proposed migration as a follow-up task.
- **Tests.** Repo has zero test infrastructure today. Don't invent one for this audit.

## Working environment

- Branch: `feat/autotrade-tos` is the current tip. Create your own branch off it (`feat/signup-flow-audit`) and commit there. Merge strategy is the human's call.
- Dev server: `pnpm --filter=@sneakers/platform dev` against `http://localhost:3000`. Live Stripe / Supabase / env vars are in `apps/platform/.env.local` (gitignored, already configured).
- Production check URL: `https://sneakersterminal.com`.

## Report format

After each commit, append to `docs/SIGNUP_AUDIT_NOTES.md` (create it on first commit):

```
## <section number>. <short title>
Commit: <hash> · <one-line message>
What I changed:
  - ...
What I verified works:
  - ...
What's still broken / worth follow-up:
  - ...
```

End-of-session summary at the top of that file:
- Which sections you completed
- Which you deferred (and why)
- Any bugs you found but didn't fix (with file:line)

## Stop conditions

Stop and hand back to the human when:
- You've completed all 8 sections
- You hit anything requiring a product decision (copy tone, pricing, what to email, etc.) — don't guess
- You find a bug outside the sign-up flow's scope — report and stop
- Your changes affect more than ~300 lines across ~8 files — you're probably off-scope

The sign-up flow is the first thing every user sees. Err on the side of polish, not features.
