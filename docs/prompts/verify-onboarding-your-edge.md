# Verify onboarding step 1 — "Your edge" (O'Toole tuning prototype)

Background: prototyped a new first onboarding step, **"Your edge"**, at `/onboarding/your-edge`. The student makes two picks — a **risk band** and a **strategy style** — and on submit those picks are merged into their O'Toole per-user memory. The point: finishing the step literally tunes the AI, not just records a preference. This is the first slice of reframing onboarding around "optimize your trading AI."

What changed in code:
- New step added as #1 in `onboarding/steps.ts` (flow is now 7 steps; "Your edge" → "About you" → …).
- New page/form at `apps/platform/src/app/onboarding/your-edge/`.
- New route `POST /api/onboarding/edge` — non-destructively merges a marker-delimited `## My edge` block into `user_otoole_memory`.
- Entry redirects (`post-signin`, `login`) now send first-timers to `/onboarding/your-edge` instead of `/onboarding/about-you`.

This code is **local only** (not committed/deployed). Run it on local dev.

You're a QA tester. **Be concrete — verbatim text, exact step numbers.**

## Step 0 — Start local dev

In a terminal: `cd ~/sneakers-trading && pnpm --filter @sneakers/platform dev`
Wait for "Ready". Base URL is `http://localhost:3000`.

## Step 1 — Sign in and open the step

1. Go to `http://localhost:3000/login`, sign in with an existing account (magic link / dev link as usual).
2. Once authed, navigate directly to `http://localhost:3000/onboarding/your-edge`.

Report:
- Page loads? y/n
- Heading text (verbatim): <…> (expect "Tune your trading AI")
- Stepper in the header (verbatim): <…> (expect "STEP 1 OF 7 · YOUR EDGE")

## Step 2 — Check the two pickers

- **RISK BAND** group: how many cards? List each label + the price range badge. (Expect 4: Favorites 60–90¢, Balanced 35–65¢, Longshots 10–35¢, Mixed "any price".)
- **STRATEGY STYLE** group: how many cards? List each label. (Expect 4: Arbitrage, Value hunter, Momentum, Contrarian.)
- Before any selection: is the "O'TOOLE IS NOW TUNED" preview box visible? (should be hidden)
- Is the CONTINUE button disabled? (should be)

## Step 3 — Make picks, watch the live preview

1. Click **Longshots**, then click **Value hunter**.
2. The "O'TOOLE IS NOW TUNED" box should now appear.

Report the verbatim sentence inside it. Expected:
`O'Toole will lead with value plays the crowd missed and focus on longshots in the 10–35¢ range when it proposes trades.`

Also confirm: both selected cards show the emerald active state (green ring/border).

## Step 4 — Submit, confirm it advances

1. Click **CONTINUE →**. Button should read "TUNING…" briefly.
2. You should land on `/onboarding/about-you`.

Report:
- Landed URL: <…>
- Stepper now reads: <…> (expect "STEP 2 OF 7 · ABOUT YOU")

## Step 5 — Confirm O'Toole was actually tuned

This is the real test — did the pick reach the AI's memory?

1. Go to `http://localhost:3000/dashboard/settings/otoole` (the O'Toole memory/settings page).
2. Look at the strategy memory content.

Report:
- Is there a block starting with `## My edge (set during onboarding)`? y/n
- Paste the block verbatim. Expected to contain "Risk band: Longshots (10–35¢)" and "Strategy style: Value hunter".
- If the user already had memory text from before, is that earlier text **still present** (not clobbered)? y/n

(Alternative if the settings page is hard to read: open the O'Toole chat on `/dashboard` and ask "what's my strategy?" — it should answer with longshots / value hunter.)

## Step 6 — Re-entry pre-fill

1. Navigate back to `http://localhost:3000/onboarding/your-edge`.
2. Confirm **Longshots** and **Value hunter** are already selected (pre-filled from the saved memory), and the preview box is already showing.

Report: pre-fill works? y/n

## Step 7 — Re-tune (non-destructive update)

1. Still on `/onboarding/your-edge`, change picks to **Favorites** + **Arbitrage**, click CONTINUE.
2. Go back to `/dashboard/settings/otoole`.

Report:
- Does the `## My edge` block now say Favorites / Arbitrage? y/n
- Is there only **one** `## My edge` block (not two stacked)? y/n
- Any earlier user-written memory still intact? y/n

## Report back

```
## Step 1. Open
- Loads: y/n
- Heading: <…>
- Stepper: <…>

## Step 2. Pickers
- Risk band cards: <count> — <list>
- Strategy style cards: <count> — <list>
- Preview hidden pre-selection: y/n
- CONTINUE disabled pre-selection: y/n

## Step 3. Live preview
- Preview sentence (verbatim): <…>
- Active state on both cards: y/n

## Step 4. Submit
- Landed URL: <…>
- Stepper after: <…>

## Step 5. O'Toole tuned
- "## My edge" block present: y/n
- Block content (verbatim): <…>
- Pre-existing memory preserved: y/n / n/a

## Step 6. Re-entry pre-fill
- Pre-filled correctly: y/n

## Step 7. Re-tune
- Block updated to Favorites/Arbitrage: y/n
- Exactly one block: y/n
- Earlier memory intact: y/n / n/a

## VERDICT
- Prototype: <WORKS / PARTIAL / BROKEN>
- Issues: <NONE / list>
- Does finishing the step feel like "tuning your AI"? <your honest read>
```
