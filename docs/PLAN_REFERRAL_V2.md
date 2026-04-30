# Sneakers Terminal — Referral Program v2

Goal: get current users to invite the next wave of users (especially the 100-tester goal). The product already has the plumbing — `referral_code` per user + `direct_referrals` / `indirect_referrals` counters on `waitlist`. v2 turns those numbers into something users care about beyond bragging rights.

## What works against us today

1. **Reward is invisible.** A user invites three friends → their counters go up but nothing visible changes for them.
2. **No friction-aware mechanics.** The ask is "send me your referral code" with no shareable link, no preview card, no auto-fill.
3. **No "moment of value."** The invite form is on `/dashboard/profile`, two clicks deep — users never see it organically.

## Three lever options, ranked by impact:effort

### Lever A — Unlock heavier AI models via referrals (recommended primary)

Tie the referral counter to the existing model picker locks. We just shipped `UNLOCKED_MODEL_IDS` in `lib/ai-models.ts`; it's currently a static `Set([haiku])`. Make it computed per-user from `(plan_tier, referral_count)`:

| Referrals | Unlock |
|---|---|
| 0 | Haiku 4.5 (default) |
| 3 | + Sonnet 4.6 (matches Pro tier, free) |
| 10 | + Opus 4.7 (matches Elite tier, free) |
| 25 | + GPT-5 / Gemini 2.5 Pro (matches Business) |

User psychology: AI models are the most-touched surface on the dashboard. Locked → unlocked is dopamine. They'll see it every time they open the chat.

**Effort:** ~2 hours. Compute unlocks server-side from `direct_referrals`, pass through layout, the picker already supports `lockedIds`.

### Lever B — Visible referral link + share affordance everywhere

Currently invite codes live on `/dashboard/profile`. Surface them:

1. **Topbar pill** — small "Invite friends · 2/3 to unlock Sonnet" button next to the wallet button. Click → modal with copy-paste invite link + share-to-Twitter / Slack buttons + the unlock progress bar.
2. **OToole chat empty-state** — when user lands on a fresh dashboard for the first time, OToole says "want to unlock Sonnet? invite 3 friends — here's your link" with a copy button.
3. **Post-trade** — after their first auto-trade fires, surface "Refer a friend, get 30 free Sonnet messages."

**Effort:** ~half-day. Modal is small; the share targets are just window.open.

### Lever C — Cash-back rewards (when paid tiers light up)

Already drafted in `docs/REFERRAL_PLAN.md` — referrer gets 30% of the first month of any tier their referee subscribes to. Defer until Stripe webhook + paid signups are at non-trivial volume; until then it's free credits we're not tracking properly anyway.

**Effort:** ~1 day after paid signups exist. Skip for now.

### Levers I'd skip

- **Streak / login bonuses** — gimmicky on a Bloomberg-aspiring product
- **Referral leaderboard** — fun for top 1%, invisible to everyone else
- **Free Polymarket USDC for referees** — regulatory mess, real money in/out

## Recommended v2 build (this week)

Ship **A + B together**:

1. **Server-side `unlockedModelsForUser(userId)` helper** that returns `Set<AIModelId>` based on `referral_count` thresholds. Update the dashboard layout to pass that through to the picker instead of the static set.
2. **Topbar "Invite" button** with the share modal. Modal shows:
   - Copyable invite link: `sneakersterminal.com/r/{referral_code}`
   - "Share to Twitter / Slack / Discord / SMS" buttons (just `window.open` with prefilled text)
   - Progress: "2 of 3 referrals to unlock **Claude Sonnet 4.6** ⚡"
3. **`/r/{code}` redirector** — already partially wired (`/r/` is in the proxy's `SHARED_PATH_PREFIXES`); make it set a cookie naming the referrer + redirect to `/signup?ref={code}`. Signup attaches `referred_by_code` to the new waitlist row, which already increments the referrer's `direct_referrals` via the existing trigger.

## What success looks like

- Median user invites 1+ friend within 7 days of signup
- 30%+ of new users come in through `/r/{code}` links (vs cold typing the URL)
- 50%+ of first-week users hit at least one referral milestone (3 invites = Sonnet)

If those numbers don't move after 2 weeks, the unlock thresholds are wrong (too high) or the visibility is wrong (modal not seen). A/B test thresholds before adding more mechanics.

## Two open decisions before we ship

1. **Reward scope:** does Sonnet unlock at 3 referrals stay forever, or expire after 30 days (forcing them to keep recruiting)? Permanent is friendlier; temporary drives more invites. Permanent recommended for v2; revisit if invites stall.
2. **Self-referral protection:** users obviously try to invite themselves with alt emails. Guard rail = require the `referred_by_code` user's `invite_used_at` to be at least 24h before the new signup, and rate-limit per-IP referrer increments. Cheap.

Open these two in the PR description when the build lands.
