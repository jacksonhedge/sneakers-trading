# Onboarding V2 M1 — Chrome extension smoke test

**Target:** latest deploy of `feat/autotrade-tos` on Vercel (swap URL for preview vs production).
**Built in commits:** `b1c0e1b` (onboarding skeleton) + `c636002` (referral V2 M1 — invite scarcity card).

Paste this whole block into Claude Chrome.

---

You're smoke-testing two milestones that just shipped on **sneakersterminal.com** (replace with a Vercel preview URL if prod hasn't caught up). Work through the checklist, screenshot anything that looks wrong, and report findings at the end.

## Part A — referral V2 success card (waitlist → post-signup state)

1. Open `https://sneakersterminal.com/` in a fresh incognito tab.
2. Fill the waitlist form with a throwaway email (e.g. `test+{random6chars}@sneakersterminal.com`). Leave account type on INDIVIDUAL. Submit.
3. Wait for the response. Expected success card contents:
   - Header: `> Access requested.`
   - Queue position line: `You're #NNN in the queue.`
   - Section labeled **YOUR INVITES** with counter `3 of 3`
   - Three horizontal bars, all in the "available" (green, ring) state — none filled
   - Section labeled **YOUR LINK** with an input field containing `https://sneakersterminal.com/r/XXXXXX` and a COPY button
   - Helper text: "Each signup through this link moves you up 5 spots + claims one of your invites."
4. Click COPY — button text should change to `COPIED` briefly.
5. Copy the referral URL for Part B.

**Report:** position number, referral code, any missing/broken element, screenshot of the success card.

## Part B — onboarding flow

You need to be signed in for this. If the account you created in Part A isn't auto-signed-in, click any magic link in your inbox — otherwise just hit `/signup` and sign in with an existing admin email.

For each step below, report: did the page render, what's the step counter say, what's the progress-bar percentage, did the Continue button navigate correctly.

1. Visit `/onboarding/about-you`.
   - Expected header: `STEP 1 OF 5 · ABOUT YOU`
   - Progress bar: empty/near-empty
   - H1: "Tell us about you"
   - Placeholder line beginning `> M1 placeholder`
   - CONTINUE button visible. Click it.

2. `/onboarding/platforms`.
   - `STEP 2 OF 5 · PLATFORMS`
   - Progress bar ~25%
   - H1: "Where do you already trade?"
   - Click CONTINUE.

3. `/onboarding/invite-friends`.
   - `STEP 3 OF 5 · INVITE FRIENDS`
   - Progress bar ~50%
   - H1: "Bring your inner circle"
   - Click CONTINUE.

4. `/onboarding/location-check`.
   - `STEP 4 OF 5 · LOCATION`
   - Progress bar ~75%
   - H1: "Quick location check"
   - **Important:** below the intro there's a monospace block showing `ip_country: XX` and `ip_state: XX`. On a Vercel deploy these should be real country/state codes (e.g. `US` / `CA`). If they're `—` (dashes), you're hitting localhost instead of the deploy — flag that.
   - Click CONTINUE.

5. `/onboarding/done`.
   - `STEP 5 OF 5 · DONE`
   - Progress bar 100%
   - Big emerald "Ready." headline
   - OPEN DASHBOARD button visible
   - **The "SKIP FOR NOW" footer link should NOT appear on this page** (the layout hides it on the last step). Verify.
   - Click OPEN DASHBOARD → lands on `/dashboard`.

## Part C — edge cases (quick)

- Sign out and visit `/onboarding/about-you` directly. You should be redirected to `/signup` (auth gate on the layout).
- While signed in, click the "SKIP FOR NOW" link in the footer on step 1. It should skip to step 2.
- Hit `/onboarding/platforms` directly with a fresh browser history (no back button). Progress bar should still show ~25% (it's URL-driven, not history-driven).

## Report template

```
Part A result: PASS / FAIL (details)
  Position: #NNN
  Referral code: XXXXXX
  Issues: ...

Part B result: PASS / FAIL per step (1–5)
  Step 1: ...
  Step 2: ...
  Step 3: ...
  Step 4: ip_country=__, ip_state=__ (or — if localhost)
  Step 5: skip-footer hidden? YES/NO

Part C result: ...

Screenshots: (attach)
```
