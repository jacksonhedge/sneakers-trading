# Referral Program V2 — Clubhouse-style Incentive Layer

**Status:** proposed, awaiting decisions 2–4 greenlight
**Builds on:** `docs/REFERRAL_PLAN.md` (V1 — Phase 1 shipped, migration `002_referrals.sql` live)
**Does NOT change:** signup flow. Waitlist stays open. This is an *incentive* upgrade, not a gating pivot.

---

## Why V2

V1 turns referrals into queue-position bumps. That works for the waitlist phase. Once we launch, position bumps stop meaning anything — we need the incentive layer to keep pulling.

V2 adds the *Clubhouse mechanics* — scarcity of invite slots, visible inviter lineage, public leaderboards, tiered badges — without closing the top of the funnel. People can still join via the open waitlist. But *referred* signups feel (and look) different.

This is also the vehicle for the profitable-operator amplification thesis: track P&L, mint Verified Operators, and bias invite gravity toward sharp users who'll attract more sharp users.

---

## Locked-in mechanic

**Every user starts with 3 invites.** Their referral link works unlimited times on the backend (no gating), but the UI frames each claim as burning an invite. When all 3 are used, the post-signup card shows "0 invites remaining — refills on 2026-04-29."

Scarcity is the scarcity *feel*, not a hard cap. The funnel stays open; the psychology changes.

---

## Proposed defaults for the open decisions

| # | Decision | Default |
| - | -------- | ------- |
| 2 | Invite refill | +1 per week passive, max budget 5. Hitting Early (1 ref) / Priority (3) / Founder (10) tops up to max. Verified Operators get 2× budget (6 max). |
| 3 | Verified Operator bar | 90 days tracked / ≥20% ROI / ≥50 resolved trades / ≥$10,000 cumulative volume. All four must be true. |
| 4 | `/operators/[handle]` page | Ship the template structure immediately with "Claim this slot" empty state. Case studies populate once the first qualifier shows up. |

Push back on any of these before we build.

---

## User-facing surfaces

### Post-signup card (replaces current queue-position card)
- Queue position (unchanged from V1)
- **Invite slots:** filled dots for used, outline for remaining → `● ● ○` with count
- Next refill timestamp
- Tier progress bar (Early / Priority / Founder)
- Badges earned (Operator / Connector / Founding Operator / Verified Operator)
- Shareable artifact: "Generate share card" button → PNG at `/api/share-card/[code]` (server-rendered via `next/og`, same pattern as `opengraph-image.tsx`). Shows position + invites + link. Users post to X/IG.

### `/status/[code]` (V1 route, upgraded)
- Same queue info
- **Inviter chain:** "Invited by @user · who was invited by @user · who joined on launch day"
- **Their referrals:** list + count + any that became Verified Operators

### `/leaderboard/operators` (new)
- Top referrers this week / month / all-time
- Counts + badges next to each handle
- Public (no auth required) so it's shareable

### `/operators/[handle]` (new, template ships now)
- Empty state until owner is Verified
- When populated: P&L curve, sample of tracked trades, which signals they acted on, their invite chain, their invitees
- Owner can toggle named-vs-anonymous and which trades are visible

---

## Data model

New migration `005_invites_and_operators.sql`:

```sql
-- Extend waitlist (V1 table) with invite economy + operator flag
alter table public.waitlist
  add column invite_budget int not null default 3,
  add column invites_used int not null default 0,
  add column verified_operator_at timestamptz,
  add column handle text unique;

create index waitlist_verified_operator_idx
  on public.waitlist (verified_operator_at)
  where verified_operator_at is not null;

create index waitlist_handle_idx
  on public.waitlist (handle)
  where handle is not null;

-- Track every invite claim for chain visibility + abuse detection
create table public.invite_claims (
  id uuid primary key default gen_random_uuid(),
  inviter_code text not null references public.waitlist(referral_code),
  invitee_code text not null references public.waitlist(referral_code) unique,
  claimed_at timestamptz not null default now()
);

create index invite_claims_inviter_idx on public.invite_claims (inviter_code);

-- Profitability tracker — the infrastructure piece from the advice paste
create table public.referral_trades (
  id uuid primary key default gen_random_uuid(),
  user_code text not null references public.waitlist(referral_code),
  platform text not null,
  market_id text not null,
  market_question text,
  outcome text not null,
  side text not null check (side in ('YES','NO')),
  size_usd numeric not null,
  entry_price numeric not null,
  close_price numeric,
  resolution text check (resolution in ('YES','NO','VOID')),
  pnl_usd numeric,
  opened_at timestamptz not null,
  resolved_at timestamptz,
  source text not null check (source in ('user_reported','onchain','api')),
  verified_at timestamptz
);

create index referral_trades_user_idx on public.referral_trades (user_code, opened_at desc);
```

**Why `handle` on waitlist row:** lineage and leaderboard need a public display string that isn't email. User picks one post-signup; falls back to `operator_<code>` if unset.

---

## API + routes

- **`POST /api/invites/redeem`** — when a new signup uses `ref` cookie. Increments `invites_used` on inviter. Writes `invite_claims` row.
- **`GET /api/leaderboard/operators?window=week|month|all`** — top-N by direct referrals, with Verified flag.
- **`GET /api/profile/[handle]`** — public profile JSON (chain + referrals + badges).
- **`POST /api/operators/apply`** — user submits their Polymarket wallet / Kalshi trade export for verification. Goes into a queue for human review (admin page).
- **`GET /api/share-card/[code]`** — renders a 1200×630 PNG with position + invite slots + link. Same `next/og` pattern as the OG images.

---

## Verified Operator pipeline

Three paths to a verified record:
1. **On-chain (Polymarket):** user adds their wallet → cron reads positions + resolved markets → `referral_trades` rows appended with `source='onchain'`.
2. **API (Kalshi, future):** if Kalshi opens trade-history API, connect via OAuth.
3. **User-reported:** CSV upload + screenshot. Goes into review queue. Gets `source='user_reported'`, only counts toward Verified status after `verified_at` is set by admin.

Verification job runs nightly: for each user, compute (days_tracked, roi, trade_count, volume) from `referral_trades`. If all four thresholds pass, set `verified_operator_at = now()` and grant invite-budget bonus.

---

## Milestones

- **M1 — Invite scarcity UI** (2 days). Migration for invite columns only. Post-signup card with dots + refill timer. No tracker, no leaderboard yet.
- **M2 — Lineage + leaderboard** (2–3 days). `handle` claim UI. `/status/[code]` upgrades. `/leaderboard/operators` public page. Badges.
- **M3 — Share-card PNG** (1 day). `/api/share-card/[code]` with `next/og` ImageResponse. Button on post-signup card.
- **M4 — Profitability tracker scaffolding** (3–4 days). `referral_trades` table. Polymarket wallet-link flow + cron. CSV upload + admin review queue.
- **M5 — Verified Operator badges + case study template** (2 days). Nightly verification job. `/operators/[handle]` template page.
- **M6 — First case study** (timing TBD). When first Verified Operator qualifies, ship writeup within 48 hours.

Roughly 10–14 days of work end-to-end. M1–M3 are user-visible and stand alone; M4–M5 are the harder infrastructure piece.

---

## Open before code

1. Greenlight defaults on decisions 2–4 above (or revise).
2. Pick handle grammar: `@jacksonhedge` (Twitter-style) or bare `jacksonhedge` (Clubhouse-style). I'd propose `@` for clarity.
3. Decide whether Verified Operator case studies default to named or anonymous. I'd propose anonymous-by-default with opt-in to named — lower barrier to the first qualifier.
4. Rate-limiting: the leaderboard + profile endpoints need a throttle before we ship or abuse is cheap. Either Upstash or Supabase Edge. Already open in `ROADMAP.md` under "Later".

Ping me with yes/no on defaults + any of the open-4 and I'll start M1.
