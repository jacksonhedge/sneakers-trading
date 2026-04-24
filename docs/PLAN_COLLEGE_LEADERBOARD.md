# College Leaderboard — plan

Written 2026-04-24. Gated competitive ranking for verified college students, based on rate of return.

## TL;DR

**Who can join**: any user with a completed student verification (migration 010 — `.edu` email verified + manual admin approval), who opts in from `/dashboard/leaderboard/join`.

**What they compete on**: **rate of return (%)** on positions they "open" within Sneakers. MVP is **paper trading** — users declare a simulated stake at a point-in-time market price; P&L resolves automatically when the market resolves. No real money moves, no custody risk, zero regulatory surface.

**Why paper first**: we don't have real trade execution yet. Waiting for Polymarket wallet integration or sportsbook OAuth would push the feature out 2+ months. Paper trading ships this week, proves engagement, and every paper position converts to real trades once execution lands.

**Scoring**: weighted-average ROI over all positions, with minimums (≥5 trades, ≥$100 total simulated stake) to prevent "one lucky 10000% trade" from topping the board.

**Display**: two leaderboards side-by-side — **your school** (top 50 at your verified college) and **all schools** (top 100 nationally). Weekly + all-time toggle.

---

## Scope — what's in MVP, what's not

**In MVP**
- Opt-in join from `/dashboard/leaderboard/join` (student-verified gate)
- "Open position" flow on any existing market on `/dashboard/markets/[platform]/[marketId]` — declare: outcome + simulated stake ($1 to $10,000)
- Automatic P&L resolution when the market closes (we already track `resolves_at` / `status=settled`)
- Weekly + all-time leaderboards, per-school + national
- User profile showing their positions, open/resolved, running ROI
- Anti-gaming minimums (see Scoring section)

**Not in MVP**
- Real money — zero real-money movement anywhere
- Cash prizes — just bragging rights for now, gift cards / brand swag possible post-MVP
- Social features (follow, react, comment) — shelved
- Private leagues / invite-only brackets — shelved
- Cross-college rivalries (FSU vs UF match-up weeks) — shelved
- iOS-native surface — shows in web only for MVP

---

## Schema

One new table + one extension to an existing one.

```sql
-- migration 015_leaderboard.sql

CREATE TABLE leaderboard_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id       text NOT NULL,                          -- "{platform}:{platform_market_id}"
  outcome_id      text NOT NULL,                          -- which side of the market
  opened_at       timestamptz NOT NULL DEFAULT now(),
  entry_price     numeric(6,5) NOT NULL,                  -- implied prob at open (0-1)
  simulated_stake numeric(12,2) NOT NULL,                 -- $1 to $10000
  resolved_at     timestamptz,                            -- null until market settles
  exit_price      numeric(6,5),                           -- null until settled; final truth
  payout          numeric(12,2),                          -- null until settled
  pnl             numeric(12,2),                          -- null until settled
  roi             numeric(8,4),                           -- null until settled (pct, e.g. 0.45 = 45%)
  status          text NOT NULL DEFAULT 'open',           -- 'open' | 'resolved' | 'voided'

  CONSTRAINT leaderboard_positions_stake_range CHECK (simulated_stake BETWEEN 1 AND 10000),
  CONSTRAINT leaderboard_positions_prob_range CHECK (entry_price BETWEEN 0 AND 1)
);

CREATE INDEX leaderboard_positions_user_idx ON leaderboard_positions (user_id, opened_at DESC);
CREATE INDEX leaderboard_positions_status_idx ON leaderboard_positions (status, resolved_at)
  WHERE status = 'open';

-- Users opt in explicitly. One row per user once they join, never deleted
-- (so we keep historical P&L even if they quit the leaderboard).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opted_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS leaderboard_display_handle text,  -- pseudonym shown on board
  ADD COLUMN IF NOT EXISTS leaderboard_college text;         -- canonical school name, set at join time

-- Aggregated view — the leaderboard itself.
-- Materialized so we're not recomputing on every page load. Refresh on a
-- cron or after each position resolves.
CREATE MATERIALIZED VIEW leaderboard_rollup AS
SELECT
  p.user_id,
  up.leaderboard_display_handle AS handle,
  up.leaderboard_college       AS college,
  COUNT(*)                     AS trade_count,
  SUM(p.simulated_stake)       AS total_staked,
  SUM(p.pnl)                   AS total_pnl,
  -- Stake-weighted ROI (bigger trades count more, preventing a $1
  -- 1000%-winner from beating $500 of careful 5% wins)
  SUM(p.pnl) / NULLIF(SUM(p.simulated_stake), 0) AS weighted_roi,
  MAX(p.resolved_at)           AS latest_resolve
FROM leaderboard_positions p
JOIN user_profiles up ON up.user_id = p.user_id
WHERE up.leaderboard_opted_in_at IS NOT NULL
  AND p.status = 'resolved'
GROUP BY p.user_id, up.leaderboard_display_handle, up.leaderboard_college
HAVING COUNT(*) >= 5 AND SUM(p.simulated_stake) >= 100;

CREATE UNIQUE INDEX leaderboard_rollup_user_idx ON leaderboard_rollup (user_id);
CREATE INDEX leaderboard_rollup_college_roi_idx ON leaderboard_rollup (college, weighted_roi DESC);
CREATE INDEX leaderboard_rollup_global_roi_idx  ON leaderboard_rollup (weighted_roi DESC);
```

**Why a materialized view + minimums**: we don't want the leaderboard to recompute on every page render (it's an O(N) GROUP BY across all users' positions) and we don't want one-trade wonders dominating. `HAVING count >= 5 AND stake >= 100` keeps the board honest.

**Refresh cadence**: refresh the materialized view (a) every time a position resolves (trigger-driven), AND (b) on a 5-minute cron as a safety net.

---

## API routes

All under `/api/leaderboard/*`:

```
POST  /api/leaderboard/join              → opt user in (checks student verification)
POST  /api/leaderboard/position/open     → create a leaderboard_position row
GET   /api/leaderboard/positions/:userId → list user's positions (self or public view)
GET   /api/leaderboard/school?code=UF    → top 50 of that school, weekly + all-time
GET   /api/leaderboard/global            → top 100 national
POST  /api/leaderboard/resolve           → cron-triggered; resolves positions on settled markets
                                           (protected by CRON_SECRET)
```

---

## UI routes

```
/dashboard/leaderboard/join           → join screen, picks handle + confirms college
/dashboard/leaderboard                → primary landing — two-column board (my school | national)
/dashboard/leaderboard/[userId]       → public-style profile (handle, positions, running ROI)
/dashboard/markets/[platform]/[mkt]/  → market detail pages gain a "Bet on it" button that
                                        opens a modal to declare stake + outcome
```

**Entry points to prompt joining**:
- Dashboard sidebar gets a "Leaderboard" link (with a "JOIN" chip if not yet opted in)
- Banner on student verification approval email: "you're in — join the leaderboard →"
- `/students` landing page gets a third bullet after "2 weeks free" + "75% off" → "Compete on the College Leaderboard"

---

## Scoring — the hard part

**Primary metric: stake-weighted ROI**

```
weighted_roi = SUM(pnl_i) / SUM(stake_i)
```

Where `pnl_i = payout_i - stake_i` and `payout_i` is calculated as:
- If the position's outcome resolved TRUE: `payout = stake / entry_price` (you bought at 42¢, it resolved YES, you get $1 per share)
- If FALSE: `payout = 0` (lose everything staked)
- If voided / cancelled: `payout = stake` (refund, doesn't count toward ROI either direction)

**Minimums to qualify for the public leaderboard:**
- ≥ 5 resolved positions (prevents sampling-size gaming)
- ≥ $100 total simulated stake cumulative (prevents tiny-trades-only spam)

**Weekly vs all-time:**
- Weekly = positions that resolved in the last 7 days
- All-time = positions that resolved ever

**Tiebreaker for identical ROI:** higher trade count wins (more variance survival).

**What we don't try to do**:
- Sharpe / Sortino-style risk adjustment — too opaque for a college audience, false-precision
- Time-weighted returns — market duration varies wildly (1h live market vs 6mo election); weighted average on stake handles it well enough
- Per-category leaderboards (sports / politics / crypto) — post-MVP

---

## Anti-gaming protections

1. **Minimums** (above) — can't rank with 1 lucky trade
2. **Stake cap**: $10,000 per position max. Can't declare "I put $10M on the favorite and made 2%" to game absolute P&L.
3. **Entry-price lock**: position entry price is captured server-side from the latest snapshot at open time. Client can't send their own entry_price to backdate.
4. **One position per (user, market, outcome)**: can't open 50 tiny positions to inflate trade count.
5. **Position open before resolution**: server-side check on `market.status != 'settled'` at open time, or reject. No post-hoc "I predicted this."
6. **Bot detection (post-MVP)**: manual-review flag for users with >100 positions/week or suspiciously uniform timing.
7. **Account-age gate**: user must have signed up ≥ 48 hours before opening their first position (reduces burner-account abuse).

---

## Rollout plan

### Phase 1 — schema + API (~1 day)
- Write + apply migration 015
- Build the 7 API routes
- Seed with fake data to test: 3 test users, 20 positions, various resolution states
- Unit tests on scoring math

### Phase 2 — UI (~2 days)
- `/dashboard/leaderboard/join` screen
- `/dashboard/leaderboard` two-column view (my school / national)
- Bet-placement modal from the market detail page
- User profile page
- Sidebar link + indicator

### Phase 3 — resolution cron (~0.5 day)
- Cron job at `/api/leaderboard/resolve` runs hourly
- Scans `status='open'` positions where the market is now settled
- Computes `payout`, `pnl`, `roi`, sets `status='resolved'`, stamps `resolved_at`
- Refreshes the materialized view after batch
- Safety net: same logic runs on position open as a quick sanity check

### Phase 4 — bootstrap + ship (~0.5 day)
- Admin dashboard surface at `/admin/leaderboard` to monitor signup + catch abuse early
- Invite first 10 verified students directly (personal DM) to open a few positions so the board isn't empty at launch
- Twitter / IG announcement once there are 50+ entries across 5+ schools

**Total effort estimate: ~4 days for MVP end-to-end.**

---

## Post-MVP roadmap

### V2 — real-money via Polymarket wallet
Once users connect a Polygon wallet (already planned via Crypto.com onboarding), we can read their actual Polymarket positions from the public chain. Separate "Real P&L" leaderboard, verified by on-chain data. This is the long-term differentiator — nobody else in college-student fintech can claim verifiable P&L.

### V3 — prize layer
Weekly / monthly top-3 per school gets branded swag (hat, hoodie, sticker). Cheap to run, massive engagement pull. Must be careful about "contest" regulations — structure as "we pick winners and mail merch," not "cash prizes for gambling performance," to stay out of DFS contest law.

### V4 — rivalries + March Madness-style brackets
Paper contests scoped to specific events (Super Bowl weekend, March Madness, election night). Enter a bracket, lock picks by deadline, live leaderboard during the event. Huge seasonal engagement.

### V5 — social layer
Follow other users, react to positions, comment threads on markets. Shift from "scoreboard" to "feed" — this is what drives retention past the initial signup spike.

### V6 — sportsbook integration
OAuth with DraftKings / FanDuel / NoVig when the platforms expose position-tracking APIs. Expand from "Polymarket P&L" to "cross-book P&L."

---

## Risks to call out

- **Cold start is existential**: an empty leaderboard is worse than no leaderboard. Hand-bootstrap the first 50 entries before any public launch.
- **Anti-gaming is a cat-and-mouse game**: the minimums above handle the obvious cases, but determined gamers will find edge cases. Plan for weekly review-and-patch cycles in the first month.
- **"Why would I paper-trade"**: needs framing that's honest about what it is ("stake-free competition, prove your market instincts") and hints at the real-money path ("future wallet-linked leaderboard coming"). Don't pretend paper is the same as real.
- **Regulatory surface**: pure paper-trading on public markets is unambiguously fine in every US state. Adding real-money stakes or cash prizes moves us into DFS/gambling territory — plan carefully before V3.
- **Handle abuse**: someone will pick `@ImpeachTrump` or worse as their display handle. Moderation queue, blocklist, and reporting mechanism needed pre-launch.

---

## Decision log (things I made the call on without asking)

- **Paper trading first** vs real-money-only: chose paper. Justification: ships in days instead of months, zero regulatory risk, converts seamlessly when Polymarket wallet lands.
- **Stake-weighted ROI** vs simple ROI: chose weighted. Justification: prevents $1 lucky bets from topping the board.
- **Per-school leaderboards live in MVP** vs national-only: chose both. Justification: per-school is the engagement driver ("beat the 3 other kids in your frat") — missing it would be a big miss.
- **Public profile pages** vs private-only: chose public. Justification: leaderboards without click-through to individuals are boring. Pseudonymous handle = no personal risk.
- **No cash prizes in MVP**: can add later, zero regulatory surface now.

Flag anything here you want to redecide and I'll revise.
