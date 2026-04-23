# Full site smoke test — Chrome extension

End-to-end walk through everything shipped on the web recently. Paste the whole block into Claude Chrome.

**Before starting:** open `https://sneakersterminal.com` in the same Chrome profile and sign in once with an admin email (or an existing invited account). The extension inherits that session via cookies — without this, Part F will 302 to `/signup` and stall. If the deploy is on a Vercel preview URL (not production), substitute throughout.

---

You're smoke-testing the Sneakers Terminal web app end-to-end. Work through Parts A–G in order. For each part, report PASS/FAIL with specifics, and screenshot anything that looks off. Final report at the bottom.

## Part A — landing page + iMessage-style OG image

1. Visit `https://sneakersterminal.com/` in an incognito window (so no referral cookie, no session).
2. Check:
   - Hero background image loads (not a blank dark screen).
   - Sneakers logo with dark ring + green glow is visible.
   - Tagline: `All Prediction market prices in one` (green)
   - Waitlist counter renders: `> N OPERATORS IN QUEUE`
   - Top-right pill: `🎓 ARE YOU A COLLEGE STUDENT?`
   - Waitlist form (INDIVIDUAL / BUSINESS toggle + email input + REQUEST ACCESS button)
3. Directly visit `https://sneakersterminal.com/opengraph-image` — should render a 1200×630 image with the Sneakers logo on the left and **three lines of bold text**: `Your personal` / `trading terminal` / `on the go.` (last line green). Screenshot it.
4. Directly visit `https://sneakersterminal.com/college/opengraph-image` — similar layout, text is `A personal trading` / `terminal for the` / `college user.` (green).

## Part B — /college page

1. Visit `https://sneakersterminal.com/college`.
2. Check:
   - Top-left: `← BACK` link
   - Top-right: pill `🎓 STUDENT? 75% OFF` linking to `/students`
   - Eyebrow: `SNEAKERS TERMINAL / COLLEGE`
   - Headline: `A personal trading terminal` (white) + `for the college user.` (green)
   - Subtext mentions `Verify your .edu to unlock 75% off`
   - Waitlist form renders
3. Click the `75% off` link in the subtext — should land on `/students`.

## Part C — venues catalog (incl. new placeholders)

1. Visit `https://sneakersterminal.com/venues`.
2. Scroll through prediction-market section. Look specifically for three new cards:
   - **Limitless** — `COMING SOON` badge, placeholder SVG logo (dark circle, green wordmark), blurb mentions Base L2.
   - **Opinion** — same treatment, blurb mentions "Integration pending platform confirmation."
   - **Gemini** — same.
3. Check a few live ones render with real PNG logos: Polymarket, Kalshi, ProphetX, NoVig, OG Markets.

## Part D — referral V2 success card (the M1 ship)

1. Still on the landing page (`/`), in the incognito window, enter a throwaway email like `test+abc123@sneakersterminal.com` and submit.
2. Wait for response. Expected success card:
   - `> Access requested.`
   - `You're #NNN in the queue.`
   - Section **YOUR INVITES** with `3 of 3` counter
   - Three horizontal bars in the "available" state (green with ring, none filled)
   - Section **YOUR LINK** with input `https://sneakersterminal.com/r/XXXXXX` + COPY button
   - Helper text about +5 spots per claim
3. Click COPY. Button text briefly shows `COPIED`. Save the referral URL for Part E.

## Part E — referral link banner

1. Open a second incognito window (new referral cookie state).
2. Visit the referral URL from Part D (e.g., `https://sneakersterminal.com/r/XXXXXX`).
3. You should be redirected to `/` with a banner or hint that says something like `Referred by an operator` — the exact copy lives in Phase 1 of the referral plan. Flag whatever copy appears.
4. Submit another throwaway email. After submit, the success card shows `Operator XXXXXX just moved up.` at the end of the "You're #NNN" line — confirming the referrer attribution fired.

## Part F — onboarding 5-step flow (SIGNED-IN REQUIRED)

Switch to the Chrome profile that's signed in. If the URL redirects you to `/signup`, the extension isn't authenticated — ask the user to sign in manually first, then re-run.

1. Visit `/onboarding/about-you`.
   - Header: `STEP 1 OF 5 · ABOUT YOU`, progress bar at 0%
   - H1: `Tell us about you`
   - `> M1 placeholder` line visible
   - CONTINUE button navigates to `/onboarding/platforms`
2. `/onboarding/platforms` — `STEP 2 OF 5 · PLATFORMS`, progress ~25%, H1 `Where do you already trade?`, CONTINUE → `/onboarding/invite-friends`
3. `/onboarding/invite-friends` — `STEP 3 OF 5 · INVITE FRIENDS`, progress ~50%, H1 `Bring your inner circle`, CONTINUE → `/onboarding/location-check`
4. `/onboarding/location-check` — `STEP 4 OF 5 · LOCATION`, progress ~75%, H1 `Quick location check`
   - **Below the intro, a monospace block shows real values like `ip_country: US / ip_state: CA`** — Vercel edge geo. If both are `—`, you're hitting localhost not the Vercel deploy. Flag that.
   - CONTINUE → `/onboarding/done`
5. `/onboarding/done` — `STEP 5 OF 5 · DONE`, progress 100%, big emerald `Ready.` headline, `OPEN DASHBOARD` button
   - **`SKIP FOR NOW` footer link should NOT appear on this page** (layout hides it on the last step). Confirm.
   - OPEN DASHBOARD → lands on `/dashboard`.

## Part G — edge cases

1. Sign out (click profile → sign out, or clear cookies). Try `/onboarding/about-you` directly — should 302 to `/signup`.
2. Sign back in. Visit `/onboarding/about-you` → click `SKIP FOR NOW` in the footer → should go to step 2.
3. Visit `/onboarding/platforms` directly → progress bar should still be at ~25% (URL-driven, not history-driven).
4. Visit `/leaderboard/operators` and `/operators/anyhandle` — both should 404 for now (those are V2 milestones M2–M5, not shipped yet). Confirm 404.

## Final report template

```
Part A (landing + OG):
  Landing: PASS / FAIL (notes)
  Root OG image: PASS / FAIL  [attach screenshot]
  College OG image: PASS / FAIL  [attach screenshot]

Part B (/college): PASS / FAIL (notes)

Part C (/venues new cards):
  Limitless: YES/NO
  Opinion:   YES/NO
  Gemini:    YES/NO
  Placeholder SVG renders? YES/NO

Part D (referral success card):
  Position: #NNN
  Invites bars: 3 available / filled? _
  Copy button worked: YES/NO
  Referral URL: sneakersterminal.com/r/______

Part E (referral banner):
  Banner copy: "____"
  Attribution confirmed after 2nd signup: YES/NO

Part F (onboarding):
  Step 1 progress %: _
  Step 2 progress %: _
  Step 3 progress %: _
  Step 4 progress %: _, ip_country=__, ip_state=__
  Step 5 progress 100%? _, skip-footer hidden? _
  Dashboard loads? _

Part G (edge cases):
  Signed-out redirect:  PASS / FAIL
  Skip link works:      PASS / FAIL
  Direct URL progress:  PASS / FAIL
  /leaderboard 404:     PASS / FAIL
  /operators/_ 404:     PASS / FAIL

Screenshots: (attach all)
Overall blockers / bugs: (free text)
```
