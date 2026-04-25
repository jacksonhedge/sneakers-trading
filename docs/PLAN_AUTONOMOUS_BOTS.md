# Autonomous Bots — personal + group AI agents that auto-trade

Written 2026-04-24 for future Claude Code sessions. This is the Terminal-tier headline feature: every user (and every group) gets their own AI trading agent, configured by them, fed by Sneakers' centralized signals, executing autonomously within their budget + rules.

## TL;DR — what the product actually is

**One Sneakers bot per user. One Sneakers bot per group. Each isolated, each configurable.**

Think of it as three layers, top to bottom:

1. **Signal layer** — one per platform. Sneakers aggregates everything we scrape: cross-book arbs, price drift, volume anomalies, O'Toole consensus picks, user-contributed signals (Numerai-style, later). Shared across all bots.
2. **Bot-config layer** — one per user, one per group. Defines: budget, risk cap, allowed markets, allowed platforms, size function, notification preferences, "paused" flag.
3. **Execution engine** — single worker process. On each signal tick, evaluates every active bot-config. Where rules match + budget allows, fires a trade via the bot's wallet/treasury.

The **user-facing experience**: you open the Sneakers app (web or iOS), see your bot's current state (P&L today, last trades, confidence), adjust its rules in plain English, get pings when it fills a trade. The bot runs 24/7 on Sneakers infrastructure — not on your laptop.

---

## Why bot-per-user-per-group (not one shared bot)

**Isolation is the product.** If we ran one shared bot that traded "on behalf of everyone," we'd be operating a pool → regulated as a commodity pool / DFS contest / worse. Giving each user their own configured agent makes them the principal; we're just the infrastructure.

**Customization is the retention hook.** One user wants NBA-only. Another wants only crypto perps. Another wants only arbs > 3pp. A group wants "democratic" rules where a 3-of-5 captain vote changes the strategy. Shared-bot can't do any of this.

**Learning is per-instance.** The bot remembers what *this user's* approved trades were, what rules they overrode, what kinds of signals they found valuable. Over weeks it personalizes. A shared bot is generic advice.

---

## Personal bots vs Group bots — what's different

| | Personal bot | Group bot |
|---|---|---|
| Owner | One user | A group (with captain + members) |
| Budget source | User's personal wallet (Safe on Polygon or embedded wallet) | Group treasury (Safe multisig, 3-of-5 typical) |
| Rule changes | User edits anytime | Captain edits freely; threshold changes may need co-captain approval |
| P&L visibility | Private by default, optionally public (opt-in to leaderboard) | Visible to all group members; group's aggregate P&L shows on leaderboard |
| Trade approval | Fully automated within the user's rules | Captain can enable "manual approval for trades > $X" as a safety rail |
| Learning surface | What THIS user liked / rejected | What THIS group's captain approved / reverted |
| Tier requirement | Medium ($39/mo) to configure, Terminal ($99/mo) to execute | Fraternity tier ($799/mo) bundles it; Terminal ($99/mo) for solo-captain orgs |

**Crucial**: the underlying execution engine is the same. Personal vs group is just a bot-config shape + whose wallet fires the trade. Don't fork the engine.

---

## Signal layer — "our findings" feeding all bots

Signals are the aggregated intelligence all bots draw from. They land in a shared table + pubsub (Supabase Realtime works for MVP). A signal is a typed event:

```ts
type Signal = {
  id: uuid
  source: 'arb_scanner' | 'drift_detector' | 'volume_anomaly' | 'otoole_pick' | 'user_contributed'
  detected_at: timestamp
  market_id: text            // "{platform}:{platform_market_id}"
  outcome_id: text           // which side
  confidence: numeric(4,3)   // 0.000 - 1.000
  payload: jsonb             // source-specific (ask/bid diffs, drift magnitude, reasoning, etc)
  expires_at: timestamp      // when the signal goes stale
}
```

**MVP signal sources** (all already live or partially built):

1. **Cross-book arb scanner** — already in `apps/platform/src/lib/arb-scanner.ts`. Wraps N-way moneyline matching across NoVig/ProphetX/OddsAPI. Fires a signal when sum-of-best-asks < 1.00. Confidence = 1.00 - overround. Payload has the individual book prices.

2. **Price-drift detector** — already exists in a basic form (the Big Movers dashboard tile). A signal fires when `change24h > 10pp` with sufficient sample size. Confidence scales with magnitude + sample size.

3. **Volume anomaly** — not built yet. A signal fires when a market's 15-min volume exceeds 5× its 24h running average. Implies news / insider flow. Confidence = std deviations above baseline.

4. **O'Toole consensus pick** — not built yet. When O'Toole is asked the same market question 5+ times within 24h and consistently recommends the same side, that's a meta-signal. Confidence = agreement rate.

5. **User-contributed signals** (Numerai-style, V3 feature) — users submit market predictions, those with a track record of accuracy get their signals amplified into the feed. Deferred until we have 500+ users to stratify.

**Signal storage shape** — append-only, TTL'd. Keep 30 days of signals for debugging / backtesting. Older stuff compacts to aggregates.

---

## Bot-config layer — "their inputs"

Each bot is a row + a JSONB config blob. Separate tables for personal vs group so RLS is cleaner:

```sql
-- Personal bot config (one per user)
CREATE TABLE personal_bots (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id),
  enabled             boolean NOT NULL DEFAULT false,
  daily_budget_usd    numeric(10,2) NOT NULL,       -- e.g. 50.00
  per_trade_cap_usd   numeric(10,2) NOT NULL,       -- e.g. 10.00
  allowed_platforms   text[] NOT NULL DEFAULT '{polymarket}',  -- expanding later
  allowed_categories  text[] NOT NULL DEFAULT '{}', -- [] = all
  blocked_categories  text[] NOT NULL DEFAULT '{}', -- e.g. ['crypto']
  wallet_address      text,                         -- Safe or embedded — where funds come from
  wallet_chain_id     integer NOT NULL DEFAULT 137,
  rule_config         jsonb NOT NULL DEFAULT '{}',  -- compiled strategy (see below)
  notification_mode   text NOT NULL DEFAULT 'every_trade',
  paused_until        timestamptz,                  -- killswitch (set to future date)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Group bot config (one per group, inherits from leaderboard_groups when that lands)
CREATE TABLE group_bots (
  group_id            uuid PRIMARY KEY,  -- FK to groups table when it exists
  captain_user_id     uuid NOT NULL REFERENCES auth.users(id),
  enabled             boolean NOT NULL DEFAULT false,
  daily_budget_usd    numeric(10,2) NOT NULL,
  per_trade_cap_usd   numeric(10,2) NOT NULL,
  approval_threshold_usd numeric(10,2), -- trades > this need captain manual approval
  allowed_platforms   text[] NOT NULL,
  allowed_categories  text[] NOT NULL DEFAULT '{}',
  blocked_categories  text[] NOT NULL DEFAULT '{}',
  safe_treasury_id    uuid,                         -- FK to safe_treasury when that lands
  rule_config         jsonb NOT NULL DEFAULT '{}',
  notification_mode   text NOT NULL DEFAULT 'captain_all_members_hourly',
  paused_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Every trade the bot attempts, whether filled, rejected, or errored
CREATE TABLE bot_trade_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id              uuid NOT NULL,                -- references personal_bots.user_id OR group_bots.group_id
  bot_type            text NOT NULL,                -- 'personal' | 'group'
  signal_id           uuid NOT NULL,                -- what triggered this
  market_id           text NOT NULL,
  outcome_id          text NOT NULL,
  side                text NOT NULL,                -- 'buy' | 'sell'
  stake_usd           numeric(10,2) NOT NULL,
  entry_price         numeric(6,5) NOT NULL,
  decided_at          timestamptz NOT NULL,
  executed_at         timestamptz,
  status              text NOT NULL,                -- 'decided' | 'pending_approval' | 'executing' | 'filled' | 'rejected' | 'errored' | 'voided'
  tx_hash             text,                         -- Polygon tx hash when filled
  error_message       text,                         -- why rejected/errored
  resolved_at         timestamptz,
  exit_price          numeric(6,5),
  pnl_usd             numeric(10,2),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bot_trade_attempts_bot_time_idx ON bot_trade_attempts (bot_id, decided_at DESC);
CREATE INDEX bot_trade_attempts_pending_idx  ON bot_trade_attempts (status) WHERE status IN ('decided', 'pending_approval', 'executing');
```

### The `rule_config` JSONB — where the logic lives

This is where user inputs get compiled from natural language into a decision engine's input. Example shape:

```json
{
  "version": "1.0",
  "human_prompt": "Arb trades on NBA moneyline when overround < 0.98. Max $25/trade. Skip live games.",
  "compiled_rules": [
    {
      "id": "arb-nba",
      "signal_type": "arb_scanner",
      "filter": {
        "market_category": "basketball",
        "market_phase": { "in": ["pre_game"] }
      },
      "trigger": {
        "payload.overround": { "lt": 0.98 }
      },
      "action": {
        "type": "buy_cheapest_side",
        "stake_usd": { "min": 5, "max": 25, "fn": "kelly_quarter" }
      },
      "priority": 100
    }
  ]
}
```

The `human_prompt` is the user's natural-language version. `compiled_rules` is what O'Toole produces when the user edits the prompt — a deterministic structure the execution engine can evaluate without an LLM in the hot path.

**Compilation happens on save, not on every signal.** Fast-path execution is pure rule-matching, milliseconds.

---

## Execution engine — how trades actually fire

A single backend worker, not per-user processes. Runs continuously on Railway (or wherever the scraper worker ends up scaled).

### Main loop (pseudocode)

```
every 30 seconds:
  new_signals = signals WHERE detected_at > last_tick AND expires_at > now()
  if new_signals empty: continue

  active_bots = personal_bots WHERE enabled=true AND (paused_until IS NULL OR paused_until < now())
                UNION group_bots WHERE enabled=true AND ...

  for each signal, for each bot:
    if signal.market not in bot.allowed_categories (if set): skip
    if signal.market in bot.blocked_categories: skip
    if signal.platform not in bot.allowed_platforms: skip
    if bot.spent_today >= bot.daily_budget: skip
    for each rule in bot.compiled_rules ordered by priority:
      if rule.filter matches signal and rule.trigger matches signal.payload:
        stake = compute_stake(rule.action, bot.remaining_budget)
        insert bot_trade_attempt (status='decided')
        if bot is group and stake > approval_threshold:
          set status='pending_approval'; notify captain
          break  # don't fire automatically
        try execute_trade(bot.wallet, signal.market, signal.outcome, stake)
          on success: set status='filled', tx_hash=...
          on failure: set status='errored', error_message=...
        break  # first matching rule wins for this signal
```

### Execution primitives

For **Polymarket on Polygon** (MVP):
- Bot config has wallet_address + chain_id=137
- Execution calls Polymarket's CLOB API with a signed order using our delegated key pattern (user delegates trade-scoped permission via Privy or similar — they do NOT hand over raw private keys)
- Fills happen on-chain; we poll for receipts

For **NoVig / ProphetX** (V2):
- OAuth-style bearer token the user provides; we hold it encrypted in user_provider_keys
- Execution is REST calls to their trade APIs

For **Sportsbooks** (never):
- DK / FD / BetMGM ToS explicitly prohibit third-party automation
- Out of scope permanently

### Safety rails built into the engine

- **Global killswitch**: a single env var (`BOT_EXECUTION_ENABLED=false`) halts everything. Flip in seconds during an incident.
- **Per-bot pause**: user can pause from the app; sets `paused_until = now() + N hours`.
- **Daily budget hard cap**: engine refuses trades that would exceed. Resets at UTC midnight.
- **Cooldown after loss streak**: 3 consecutive losing trades in an hour auto-pauses for 4 hours. User can override.
- **Approval gate for group bots**: trades above `approval_threshold_usd` require captain push notification approval within 15 min, else voided.
- **Sanity checks** on every trade:
  - Is the entry price within 2% of the current snapshot? (Stale signals)
  - Is the market still open?
  - Has the market already resolved?
  - Does the wallet have sufficient balance?
  - Any of these fail → status='voided', log reason, move on.

---

## Notification model

Each bot has a `notification_mode`. APNS push on iOS, web push on web, email as fallback.

**Personal bot modes**:
- `every_trade` — one push per fill
- `hourly_summary` — one push per hour with fills + P&L
- `threshold_only` — only when daily P&L breaches ±10% of budget
- `daily_wrap` — single push at 11pm local with full day summary
- `none` — user checks the app themselves

**Group bot modes** (additional):
- `captain_only` — pushes only go to the captain
- `captain_all_members_hourly` — captain gets every fill; members get hourly summary
- `all_members_every_trade` — everyone sees everything (high-transparency mode)

**Content of a trade-fill push**:
```
Sneakers bot: +$2.40 on BTC > $100k (buy at 42¢, now 48¢)
Tap to see all of today's trades.
```

**Content of an hourly summary**:
```
Your bot: 4 trades, +$8.30 (+12%), 3W 1L. Last: Lakers ML at 44¢.
```

Keep pushes short. Full detail is in the app.

---

## UI — what the user sees

### Personal bot — two primary screens

**1. Dashboard card (embedded in main dashboard)**
- Current state pill: `ACTIVE` / `PAUSED` / `DISABLED` / `NEEDS FUNDING`
- Today: trades filled · P&L · budget remaining
- Last 3 trades (market · result · tap-for-detail)
- Big "Adjust rules →" button
- Big "Pause for 24h" killswitch

**2. Bot settings page (`/dashboard/bot`)**
- Natural-language rule box ("Describe what you want the bot to do")
- Compiled rules preview (read-only, shown for confidence)
- Budget sliders (daily $, per-trade $)
- Platform toggles (Polymarket on, NoVig off, etc.)
- Category allowlist/blocklist
- Notification mode selector
- Wallet connection state
- "Preview next 24h" — dry-run showing what the bot WOULD have done with current rules against the last day's signals

### Group bot — adds

- Members list with who approved/rejected recent trades
- Treasury balance + recent withdrawals (linked to Safe)
- Captain-only controls (rule editor, member removal)
- Pending approvals queue (trades waiting on captain)
- Group P&L chart + leaderboard rank

---

## Pricing + tier implications

Maps directly onto the Simple/Medium/Terminal split proposed in PLAN_GROUPS_AND_PRODUCT_SPLIT.md:

| Tier | What's accessible |
|---|---|
| Simple ($0) | View bot concept, "coming soon" waitlist only |
| Medium ($10 student / $39 non-student) | Configure a bot, see what it WOULD trade (dry-run), no execution |
| Terminal ($25 student / $99 non-student) | Full execution, Polymarket wallet integration, unlimited rule changes |
| Fraternity ($799) | Group bot + up to 25 members share one bot, group-leaderboard prioritized |

**Cost math** per Terminal user:
- Signal bus queries: negligible (shared infra)
- Execution engine: marginal compute (~1-2 CPU-seconds per bot per day)
- Polygon gas: ~$0.01-0.05 per trade, user pays from their wallet balance
- Wallet infra (Privy or Turnkey): ~$0.50/user/month
- LLM calls for rule compilation on save: ~$0.10/month per active user

Gross margin target: 80%+ on Terminal tier at $99.

---

## Rollout phases

### Phase 1 — paper-trade MVP (2 weeks)
- personal_bots + bot_trade_attempts tables
- Rule compilation (O'Toole → structured rules)
- Execution engine runs against **fake wallets** (paper trading only)
- UI: dashboard card + settings page
- Notification: local-only (no APNS yet)
- Scope: Polymarket signals only, arb_scanner + drift_detector only
- Gate to: student-verified users + admin allowlist, not general public

**Goal**: prove the concept feels good. Does a user actually want this? Do the rules compile to something sensible? What's the P&L variance on paper?

### Phase 2 — real money, constrained (3 weeks, after Phase 1 feedback)
- Polymarket wallet integration via Privy/Turnkey (delegated keys, not raw custody)
- Execution fires real trades on Polygon
- Rate-limit: max 10 trades/bot/day during beta
- APNS push notifications
- On-chain reconciliation cron (catches failed tx, marks status correctly)
- Scope: Terminal-tier subscribers only, personal bots only (no groups yet)

**Goal**: prove real-money execution without blowing anyone up. Track bug rate per 1000 trades.

### Phase 3 — group bots (2 weeks, after Phase 2 stable)
- group_bots table
- Safe treasury integration (already have schema from PLAN_GROUPS)
- Captain approval flow for trades > threshold
- Group leaderboard integration
- Scope: Fraternity tier subscribers + their members

**Goal**: prove governance works. Does the captain actually approve trades? Do members stay engaged?

### Phase 4 — expanded signals (4 weeks, rolling)
- Volume anomaly detector
- O'Toole consensus meta-signals
- User-contributed signals (Numerai-style) — gated to Terminal users only
- Signal-quality scoring (promote signals that predict outcomes correctly)

**Goal**: make the bot smarter than any individual user could be.

### Phase 5 — NoVig / ProphetX integration (6 weeks)
- OAuth flows for bearer tokens
- Trade execution via their REST APIs
- Expand bot scope to multi-venue
- Cross-platform arb execution (buy on Polymarket, sell on NoVig simultaneously)

**Goal**: the differentiator nobody else has.

### Phases that are explicitly NOT on the roadmap
- Sportsbook auto-execution (DK/FD/BetMGM/etc) — ToS forbids it
- Unregulated "anyone can run a bot" access — everything is tied to verified identity

**Total: ~17 weeks from start to full-featured Terminal tier.**

---

## Regulatory + legal

Rough but honest read:

- **Paper trading** — zero regulatory surface. Delay no further.
- **Polymarket on-chain** — Polymarket operates as a CFTC-registered event-contract venue. Automated trading on your own wallet is allowed; Polymarket's own UI encourages it. We're building a sophisticated client on top of a regulated venue. Defensible.
- **NoVig / ProphetX** — peer-to-peer sports betting, licensed as exchange operators in specific states. Each requires individual KYC per user; we can't bypass that. Bot config tells us what to trade, but the execution goes through their KYC'd session. User attests they're authorized to trade in their state.
- **Sportsbooks** — explicitly off limits. All major US books prohibit third-party automation in ToS.
- **Our role**: we're an infrastructure provider, not a broker. We never custody user funds (Safe / embedded wallets custody them). We never take trade fees (venues do). We charge for the software + signals.
- **The big question**: is our *signal feed* itself regulated? If we're publishing "buy Yankees ML" recommendations to paying subscribers, there's an argument that's investment advice (SEC) or wagering advice (state gambling). Mitigations:
  - Frame signals as "market observations" not recommendations
  - Always let the user's own rules decide — the bot decides, not us
  - Include prominent disclaimers
  - Consult counsel before V4 (user-contributed signals) since that's the fuzziest line

**Before Phase 2 ships**: talk to a lawyer with fintech + gambling experience. Cost: $5-10K for an opinion. Worth it.

---

## What already exists that accelerates this

Quick inventory of what's in the repo we can lean on:

- `apps/platform/src/lib/arb-scanner.ts` — cross-book arb detection, battle-tested. Directly becomes a signal source.
- `apps/platform/src/lib/market-stats.ts` — drift detection (`bigMovers` function). Wrap as a signal source.
- `apps/platform/src/lib/otoole-backend-context.ts` — O'Toole infra. Extend for meta-signals + rule compilation.
- `safe_treasury` table (live) — group wallet integration is half done.
- `autotrade_waitlist` table (live) — users have already opted in; we have a list for Phase 1 beta.
- `feat/autotrade-tos` branch — consent UX is drafted. Needs dusting off.
- `/dashboard/settings/autotrade` page — explainer UI exists. Replace the "coming soon" state with real bot controls when ready.
- Supabase Realtime — for pub/sub of signals + trade status. No new infra needed.

---

## Open questions — need answers before Phase 1 starts

1. **Who funds the paper-trade budget?** Simplest: each user starts with $1000 simulated, resets weekly. Or: tied to their real wallet balance even in paper mode (but clamped at the balance so they can't paper-trade $10M).

2. **Rule compilation quality.** O'Toole turning "only bet NBA moneylines with arb > 3pp" into structured rules is non-trivial. Need to benchmark compile quality against 100 test prompts before Phase 1 exits.

3. **Signal staleness policy.** Arb signals are fresh for ~30 seconds before they evaporate. Drift signals maybe 15 min. Do we have execution-ready signal-age guarantees? Signal lifecycle needs to be modeled carefully.

4. **Per-user LLM cost control.** If every rule edit triggers an Opus call, costs spiral. Cap at 5 rule compilations per user per day; warn above that.

5. **How do we handle cold-start for new bots?** First 24h a bot has no history → no cooldown-after-losses data → how aggressive should it be? Conservative defaults (small stakes, fewer signals accepted) until it has 10 resolved trades.

6. **Group-bot governance edge cases.** Captain leaves the group → who inherits? Three officers want to vote on a rule change → is it majority, threshold from the Safe, or captain-can-veto? Needs explicit spec.

7. **Bot vs. user decision conflict.** User manually places a trade on a market the bot was about to trade on. Do we cancel the bot's pending trade? Halve the bot's stake? Ignore? Needs a policy.

8. **Kill-switch authority in groups.** Can any member pause the group bot, or only the captain? Probably: any member triggers a "pause request" that auto-confirms in 60 min unless the captain rejects. Protects against hostile captain.

---

## What would make this bot actually different

This is the stuff that turns "another trading bot" into "the Sneakers Terminal":

1. **It sees what no single user sees.** 40+ venues aggregated. Arb signals fire that a solo user running a script against Polymarket alone would never find.
2. **It's configured in English, not code.** The rule compiler is the magic. Users don't write DSL; they describe what they want in a sentence.
3. **It learns from the whole cohort.** Your bot benefits from the fact that 10,000 other bots are running — we see which strategies work across different market conditions and bias the signal weights accordingly (while keeping each bot's execution private).
4. **Groups turn it social.** A frat running a shared bot is a dozen brothers hanging out Sunday watching the bot work. The bot is the campfire.
5. **The leaderboard is always-on.** Unlike paper-trading where you have to remember to check, the bot is always generating P&L against your rules, so the leaderboard is always fresh.

If 3 of those 5 are real, this is a $100/mo product that college kids will actually pay for.

---

## Starting point for the next Claude Code session

If you pick this up cold, here's the exact sequence:

1. Read `docs/PLAN_COLLEGE_LEADERBOARD.md` + `docs/PLAN_GROUPS_AND_PRODUCT_SPLIT.md` + this doc. They're linked.
2. Look at what's in prod: `apps/platform/src/lib/arb-scanner.ts`, `market-stats.ts`, the `safe_treasury` + `autotrade_waitlist` tables.
3. Phase 1 first commit: `CREATE TABLE personal_bots` + `bot_trade_attempts` + `CREATE TABLE signals`. Write the migration; apply to prod via Supabase SQL Editor (the migration backlog flow we've been using).
4. Phase 1 second commit: wire arb_scanner to emit signals into the new table. Should be a 30-line change.
5. Phase 1 third commit: skeleton execution engine that reads signals + evaluates personal_bots + INSERTs paper-trade rows into bot_trade_attempts (status='filled' immediately, no real execution). Deployable as a Railway cron hitting `/api/bots/tick` every 30 seconds.
6. Phase 1 fourth commit: dashboard card showing the bot's state.

That's ~4 days of focused work for a proof-of-concept. Everything after is UI polish + real-money integration + scale-out.

---

## Review cadence

Quarterly, or when any phase exits.
