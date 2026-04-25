# Tournaments — bounded competitions on top of the leaderboard

Written 2026-04-25. Companion to PLAN_COLLEGE_LEADERBOARD.md +
PLAN_GROUPS_AND_PRODUCT_SPLIT.md.

## TL;DR

The leaderboard is always-on (continuous rate-of-return ranking).
**Tournaments are time-bounded slices** — "Super Bowl Weekend",
"March Madness 2026", "Election Night Showdown" — with their own scoped
leaderboards, optional entry rules, and optional prizes. They drive
weekly + seasonal engagement that always-on rankings can't match.

The vision: every Sunday afternoon, every Sneakers user has a tournament
to opt into. Cohort effects compound — your frat is in a Super Bowl
tournament against 8 other frats; you all watch the game together rooting
for your bot's positions.

## Product shape

A tournament is:

1. **Time-bounded**: explicit `starts_at` and `ends_at` (e.g., a Friday-
   to-Sunday weekend, a 2-week regular-season window, a 4-hour live event)
2. **Scope-bounded**: defined market filter — sport, category, specific
   markets, or "any market in the live feed"
3. **Eligibility-bounded**: who can enter — anyone, students-only,
   verified-students-only, specific schools, specific groups, paid tier
4. **Scored**: a leaderboard scoped to ONLY the trades placed during the
   tournament window on tournament-eligible markets
5. **Optional prize**: branded swag (hat, hoodie, sticker pack), inclusion
   in a "Hall of Fame" page, or just bragging rights. **No cash prizes**
   to stay clear of state DFS / contest regs.

## Tournament types (3 patterns to start)

### A. Event tournaments — single sporting moment

Examples: Super Bowl Sunday · NCAA Championship · Election Night ·
Crypto BTC-on-X-Date

- 4-72 hours wide
- Markets: anything related to that event
- Scoring: total P&L (since stakes are constrained, ROI flips wildly)
- Prize: branded swag for top 3 individuals + top 3 groups

### B. Season tournaments — multi-week, sport-scoped

Examples: NFL Regular Season Pick'em · March Madness Bracket · NBA
Playoffs Run

- 2-12 weeks wide
- Markets: that sport's full slate
- Scoring: weighted ROI with min-trades floor (skip the "1 lucky bet"
  problem)
- Prize: leaderboard-only for MVP. Add swag if engagement holds.

### C. Speed runs — limited-window, narrow-scope

Examples: "Find the best arb in the next 60 minutes" · "Profit from
$10 in 1 hour using only crypto perps" · "Beat the bot in 30 minutes"

- 30 min - 4 hours wide
- Markets: a specific filter or a single live market
- Scoring: simple — highest absolute P&L wins
- Prize: real-time leaderboard during the run, screenshot-shareable

Speed runs are the highest-engagement format because they create FOMO —
you have to be there.

## Schema

```sql
-- Migration 021 (apply after the leaderboard migrations land)
CREATE TABLE tournaments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,                 -- url-friendly: 'super-bowl-2026'
  name            text NOT NULL,                        -- "Super Bowl Sunday 2026"
  description     text,                                 -- 1-2 paragraph hype copy
  kind            text NOT NULL,                        -- 'event' | 'season' | 'speed_run'
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,

  -- Scope rules
  market_filter   jsonb NOT NULL DEFAULT '{}',          -- { sport: 'football', league: 'NFL', tags: [...] }
  eligibility     jsonb NOT NULL DEFAULT '{}',          -- { student_verified: bool, min_tier: 'medium', schools?: [], groups?: [] }

  -- Scoring config
  scoring_method  text NOT NULL DEFAULT 'weighted_roi', -- 'weighted_roi' | 'total_pnl' | 'win_rate'
  min_trades      integer NOT NULL DEFAULT 3,           -- floor to be eligible for top spots

  -- Prize / display
  prize_description text,                               -- "Top 3 each tier get Sneakers hoodie"
  banner_image_url text,
  status          text NOT NULL DEFAULT 'draft',        -- 'draft' | 'open' | 'live' | 'resolved' | 'cancelled'

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tournaments_dates CHECK (ends_at > starts_at),
  CONSTRAINT tournaments_kind CHECK (kind IN ('event','season','speed_run')),
  CONSTRAINT tournaments_status CHECK (status IN ('draft','open','live','resolved','cancelled'))
);

CREATE INDEX tournaments_status_dates_idx ON tournaments (status, starts_at);

-- Per-entrant table (individual or group)
CREATE TABLE tournament_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  entrant_type    text NOT NULL,                        -- 'individual' | 'group'
  user_id         uuid REFERENCES auth.users(id),       -- set if entrant_type='individual'
  group_id        uuid,                                 -- set if entrant_type='group' (FK to groups when that lands)
  joined_at       timestamptz NOT NULL DEFAULT now(),
  withdrew_at     timestamptz,

  -- Cached score (refreshed by cron, since computing live is expensive)
  cached_score    numeric(8,4),
  cached_trades   integer NOT NULL DEFAULT 0,
  cached_pnl_usd  numeric(12,2) NOT NULL DEFAULT 0,
  cached_rank     integer,
  cached_at       timestamptz,

  CONSTRAINT tournament_entries_either_user_or_group CHECK (
    (entrant_type = 'individual' AND user_id IS NOT NULL AND group_id IS NULL) OR
    (entrant_type = 'group'      AND group_id IS NOT NULL AND user_id IS NULL)
  ),
  CONSTRAINT tournament_entries_uniq_user UNIQUE (tournament_id, user_id),
  CONSTRAINT tournament_entries_uniq_group UNIQUE (tournament_id, group_id)
);

CREATE INDEX tournament_entries_tournament_idx ON tournament_entries (tournament_id, withdrew_at);
```

## Routes

```
/dashboard/tournaments                  → list of active + upcoming tournaments
/dashboard/tournaments/[slug]           → tournament detail + leaderboard
/dashboard/tournaments/[slug]/join      → opt-in flow (validates eligibility)
/admin/tournaments                      → admin create/edit
/admin/tournaments/[slug]/scoring       → admin tools to recompute / void / resolve
```

## API

```
GET    /api/tournaments                     → list with current state
GET    /api/tournaments/:slug               → details + cached leaderboard
POST   /api/tournaments/:slug/join          → opt-in self or group
POST   /api/tournaments/:slug/withdraw      → leave (only before tournament starts)
POST   /api/admin/tournaments               → create
POST   /api/admin/tournaments/:id/score     → recompute leaderboard now
POST   /api/admin/tournaments/:id/resolve   → mark as resolved, freeze rankings
```

## Scoring engine

Cron job runs every 5 minutes for each tournament with status='live'.
For each entry:

```sql
-- Pseudocode for weighted_roi scoring
SELECT SUM(pnl_usd) / NULLIF(SUM(stake_usd), 0) AS weighted_roi
  FROM bot_trade_attempts
 WHERE bot_id = $entry.user_id OR bot_id = $entry.group_id
   AND status = 'resolved'
   AND decided_at BETWEEN $tournament.starts_at AND $tournament.ends_at
   AND market_id IN (SELECT market_id FROM markets WHERE [tournament.market_filter])
```

The cron writes the result into `tournament_entries.cached_score` +
`cached_rank`. The UI reads from those cached fields, never from the
computation directly.

When a tournament's `ends_at` passes:
- One final score recompute
- Status moves to 'resolved'
- Rankings freeze
- Notification fires to top 3 entrants ("you placed 2nd in Super Bowl
  Sunday — claim your hoodie at /winners/<slug>")

## UI sketches

### `/dashboard/tournaments` (list view)

Three-column grid of tournament cards. Each card:

```
┌────────────────────────────────────────────────┐
│ [HERO IMAGE — banner_image_url, opt'l]         │
│                                                │
│ SUPER BOWL SUNDAY 2026                  LIVE  │
│ Feb 8 — 12pm ET to game end                    │
│                                                │
│ NFL prop markets only · top P&L wins           │
│                                                │
│ 142 entrants · 14 groups · current leader: KZ  │
│                                                │
│ [JOIN →]   or   [VIEW LEADERBOARD →]           │
└────────────────────────────────────────────────┘
```

Sections:
- **LIVE** — currently open tournaments, sorted by ends_at ascending
- **OPENING SOON** — open status but starts_at > now
- **PAST** — resolved tournaments, collapsed; click to expand

### `/dashboard/tournaments/[slug]` (detail + leaderboard)

- Top: hero banner + countdown
- Middle: leaderboard (individuals + groups split)
- Right rail: rules, market filter, prize description
- Bottom: recent trade feed (last 10 trades from entrants, anonymized
  to handle if user is private)

### `/dashboard/tournaments/[slug]/join`

Eligibility check first:
- ✅ Verified .edu student → can enter as individual
- ✅ Captain of a group → can enter the group OR yourself
- ❌ Not eligible → reason ("Verify your student status first")

Confirm screen:
- Tournament name + dates + scope
- Your existing rules will apply (your bot keeps trading per its config)
- Trades during the window on eligible markets count toward the
  tournament leaderboard automatically. **Do nothing — just keep trading.**
- "OPT IN" button

## Tournament discovery + promotion

Tournaments need to feel like events. Promotion surfaces:

1. **Dashboard banner** — "Super Bowl Tournament starts Friday — JOIN →"
   visible to everyone with eligible tier
2. **Email blast** — Resend campaign 48 hours before tournament starts
3. **Push notification** — APNS / web push at tournament start ("It's
   live — your trades count")
4. **Ambient ticker** — landing page stats strip rotates "TOURNAMENT
   STARTING IN 4H" when one is imminent
5. **Group chat reminder** — when a captain's group joins, all members
   get a "you're in a tournament now" notification

## Phasing

### Phase 1 — minimal MVP (~3 days)
- Migration 021 applied
- `/dashboard/tournaments` list view (cards, no images, no live data)
- Hard-coded admin can create tournaments via direct DB insert
- Manual scoring via SQL query, paste results into UI
- Goal: prove the concept with ONE event tournament for one weekend

### Phase 2 — automation (~3 days)
- Admin UI at `/admin/tournaments` (create / edit)
- Cron job that computes scores every 5 min during live tournaments
- Eligibility validator
- Automatic resolution when ends_at passes

### Phase 3 — polish + promotion (~2 days)
- Hero banners (image upload via Supabase Storage)
- Notifications (push + email)
- "Coming Soon" + "Past Tournaments" carousels
- Detail-page leaderboard with sparklines

### Phase 4 — group-vs-group (depends on groups + bots)
- Group entry as first-class
- Group bot trades count toward group's tournament score
- Group P&L chart

### Phase 5 — prizes + winners page (~2 days)
- Branded swag fulfillment integration (Printful / Shopify)
- `/winners/[slug]` public page with top 3 + their schools
- Hall of Fame at `/tournaments/hall-of-fame`

**Total: ~12 days from start to full feature, can ship Phase 1 in a week.**

## Open questions

1. **Real money or paper trading?** MVP is paper-only (matches the
   college leaderboard MVP). Real money requires the full bot infra +
   Polymarket wallet + per-state regulatory review.

2. **Are tournaments gated to paid tiers or open?** Lean: open to all,
   but bot-driven entries (autotrade) require Terminal tier. So Free
   users can opt in but trade manually.

3. **Can users self-create tournaments?** Probably not in MVP — admin
   curates. Post-MVP, captains can create private group-vs-group
   tournaments. Public-facing tournaments stay admin-curated to keep
   the brand aligned.

4. **Multiple tournament participation?** Yes — a user can be in 5
   tournaments at once. Their trades count for whichever tournament's
   filter they match.

5. **Leaving mid-tournament?** Allowed before starts_at, blocked after.
   Once you're in, you're committed (prevents min_trades-floor gaming).

6. **What if no one enters?** Tournament with <5 entrants 24h before
   start auto-cancels. Admin gets a Slack ping, manually decides whether
   to push or kill.

7. **Tournament-specific rules for the bot?** E.g., "for this tournament
   only, max stake is $50." Doable — `tournament_entries` could carry an
   override config that the bot reads when evaluating signals during the
   window. Defer to V2.

## Why this matters for the business

Tournaments are the **engagement-loop ROI** that makes Terminal-tier
worth $99/mo:

- **Sunday afternoons** — every NFL Sunday becomes a Sneakers session
- **March Madness** — 3 weeks of bracket-driven daily check-ins
- **Election season** — quadrennial mega-engagement window
- **Crypto cycle moments** — BTC halving, ETF launches, etc.

Without tournaments, the leaderboard is "look how I'm doing." With
tournaments, every sport season + cultural moment becomes a Sneakers
ritual. That's the difference between a tool you check and a tool you
LIVE in.

## Starting point for next session

1. Read this + PLAN_COLLEGE_LEADERBOARD + PLAN_AUTONOMOUS_BOTS
2. Phase 1 first commit: write migration 021, paste into Supabase SQL
   Editor, apply
3. Phase 1 second commit: create `/dashboard/tournaments/page.tsx` —
   server component, fetch all tournaments where status IN ('open','live',
   'resolved'), render the 3-section card grid
4. Phase 1 third commit: hard-code one test tournament via direct INSERT
   to validate the rendering path
5. Phase 2: scoring cron at `/api/cron/tournaments/score` (protected by
   CRON_SECRET, run every 5 min via Vercel Cron)
