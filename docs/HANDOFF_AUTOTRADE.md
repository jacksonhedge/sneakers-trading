# Handoff — Auto-trade execution engine (Polymarket, v1)

**Mission:** Let high-tier users configure Polymarket API credentials, attach auto-trade actions to their existing alert rules, and have the engine place orders on their behalf when rules fire. Non-custodial (user keeps wallet control), explicit opt-in per rule, multi-layer kill switches, mandatory dry-run period before live execution.

**Replaces the stub** drafted at the end of `docs/HANDOFF_NOTIFICATIONS.md`. Notifications must ship first — this engine extends the alert-rule system.

---

## Risk framing (read this first)

This is the first feature in the product that touches real money on the user's behalf. Every design choice below is shaped by risk mitigation. Do NOT ship corners cut. Specifically:

- **Non-custodial.** Sneakers never holds user funds. Users grant us scoped API credentials that authenticate order operations against their own Polymarket wallet. Our keys can be revoked by the user at any time from Polymarket's UI.
- **Dry-run gate.** Every new auto-trade rule runs in dry-run mode for 7 days before live execution unlocks. Dry-run logs "would have placed" entries; no orders submitted. User reviews → explicitly toggles to live.
- **Multi-layer kill switches.** Per-rule enabled, per-user enabled, admin global. Any of them flipped → execution halts immediately.
- **Size + frequency limits.** Per-trade cap, per-day cap, minimum cooldown between fires. Defaults conservative; user can raise up to hard ceiling.
- **Audit log.** Every attempt, every execution, every failure. Immutable. User exports their own; admin sees all.
- **Legal posture.** Terms of Service must be updated before this ships (Phase 1). Sneakers is NOT a registered investment advisor; user is the decision-maker, we are the executor of their pre-configured rules. Explicit language in TOS + in-product disclaimers.

If any of these get compromised for scope or speed, **stop and escalate to the user.** Don't ship a half-safe auto-trade system.

---

## Pre-existing state you must NOT rebuild

- `docs/HANDOFF_NOTIFICATIONS.md` must be fully implemented and merged before this brief starts. Auto-trade extends `alert_rules` with an optional `auto_trade_action` column; it doesn't replace the alert system.
- `lib/stripe/tiers.ts` (from the Stripe handoff) has the tier matrix. Respect the tier gating decision below.
- `lib/markets-data.ts` has `loadAllLatestSnapshots()`. The execution engine uses it to confirm market still matches rule before placing an order (rule fires on stale data → don't execute against changed price).
- Supabase RLS is in place. Every new table follows the same user-scoped pattern.

**Stack:** Next.js 16, Supabase (Postgres + RLS), TypeScript, `@polymarket/clob-client` (official npm), `ethers` for signing utilities, Vercel Cron for scheduled execution passes, Supabase Vault or app-level AES-256-GCM for credential encryption.

Branch: `feat/autotrade` off `main` (or off whichever branch notifications has merged into).

---

## Decisions locked in by the user (2026-04-22)

Do NOT re-ask these. Execute against them:

### Tier gating

- **Auto-trade is Business-only in v1.** Not Elite. Not Fraternity. Not Pro. Business accounts only.
- After 3 months of stable operation (no incidents, no inadvertent mass-fires, <1% order-failure rate), evaluate opening to Elite. That's a product decision tracked in ROADMAP; not automated.
- At the API layer, every auto-trade endpoint calls `requireTier('business', supabase)`. Fraternity sub-flavor also qualifies as Business for access, but **Fraternity accounts cannot enable auto-trade** — the additional gate checks `business_subtype !== 'fraternity'` because frat treasuries are not appropriate auto-trade surfaces.

### Credential model

- **Polymarket CLOB API credentials** (API key + secret + passphrase), not raw private keys. User creates these in Polymarket's own UI and pastes them into Sneakers. We never ask for their wallet private key or seed phrase.
- Credentials are encrypted at rest via Supabase Vault if enabled, else app-level AES-256-GCM with `AUTOTRADE_CREDENTIAL_KEY` env var (32-byte hex, rotated yearly).
- Credentials decrypted only inside the execution engine's process, never returned to the client, never logged.
- "Test connection" endpoint that makes a read-only API call (balance fetch) to verify credentials work — required before rule can be marked live.

### Order types (v1)

- **Market orders only.** No limit orders, no stop-loss, no partial fills, no iceberg orders. Rule fires → compute size → market-order the YES or NO side.
- Add limit orders in Phase 2 once we have execution-failure data showing price slippage is a real problem.

### Venues (v1)

- **Polymarket only.** Schema is multi-venue-ready (`venue` column on credentials, `venue` field on `auto_trade_action`) but only `'polymarket'` dispatcher exists.
- Kalshi is the natural next venue (also programmatic, less liquidity) — separate brief when we get there.

### Size + frequency limits (defaults; user can raise up to hard ceiling)

| Limit | Default | User-configurable max | Hard ceiling |
|---|---|---|---|
| Per-trade size | $100 | up to $1,000 | $5,000 |
| Per-day aggregate | $500 | up to $5,000 | $25,000 |
| Per-rule cooldown | 60 min | down to 15 min | 5 min (no rule fires more than every 5 min regardless) |
| Per-user concurrent open positions | 10 | up to 50 | 100 |

Hard ceilings are absolute — even admin can't raise them without a code change + review. These exist so an accidental rule misconfiguration can't cause a catastrophic loss.

### Dry-run gating

- **Every new auto-trade rule is dry-run for 7 days.** Duration starts at rule creation, not at first fire.
- During dry-run: rule fires normally (notification sent), execution engine logs a `would_have_placed` row, no order submitted.
- After 7 days, the rule shows a "Ready for live execution" prompt on `/dashboard/alerts`. User reviews the dry-run log → confirms → rule transitions to live.
- User cannot skip the dry-run period in v1. This is the most important safety net.
- User CAN preemptively disable a dry-run rule (dry_run → disabled) if the log reveals a bad rule.

### Kill switches

1. **Per-rule `auto_trade_live` flag** — false during dry-run, true after user confirms.
2. **Per-user `auto_trade_enabled_globally` flag** — default false; user toggles on from `/dashboard/alerts/settings` AFTER setting up credentials + reading a disclaimer.
3. **Admin global kill switch** — env var `AUTOTRADE_KILL_SWITCH=1` halts all execution across the platform. Use in emergencies (Polymarket API degraded, bug in engine, legal issue). Flipping requires redeploy, intentional friction.
4. **Daily circuit breaker** — if any single user's auto-trade volume exceeds 5× their daily cap in a 24h window (shouldn't be possible given caps but defense-in-depth), auto-disable and alert admin.

---

## Deliverables, in order

### Phase 1 — Legal + TOS update (user-executed, you document)

Write `docs/autotrade-tos-checklist.md`:
- Explicit language: "Sneakers is not a registered investment advisor. Auto-trade rules execute your pre-configured decisions. You retain full responsibility for trading outcomes."
- Explicit language: "Sneakers does not custody your funds. Polymarket holds your wallet; your API credentials authenticate only the operations you've configured."
- Explicit language: "Auto-trade is available only to Business-tier users, who affirm they understand the risk profile and have legal authority to trade on behalf of their entity."
- Explicit language: "You grant Sneakers permission to place orders on your behalf according to rules you configure, subject to the limits defined in-product. You can revoke this permission at any time by disabling auto-trade or rotating your Polymarket API credentials."
- In-product click-through consent form before auto-trade can be enabled. Text stored in a `user_autotrade_consents` table with version + timestamp so we can prove what users agreed to when.

User reviews the checklist with legal counsel (or at minimum their own judgment) before Phase 2 code ships. Do not ship Phase 2+ until user signs off.

### Phase 2 — Migrations

Next available number (check `apps/platform/supabase/migrations/`).

```sql
-- user_venue_credentials
create table if not exists public.user_venue_credentials (
  id                 bigserial primary key,
  user_id            bigint not null references public.waitlist(id) on delete cascade,
  venue              text not null check (venue in ('polymarket')),  -- expand later
  api_key_encrypted  text not null,
  api_secret_encrypted text not null,
  passphrase_encrypted text,
  label              text,                              -- user's own label
  test_connection_ok boolean not null default false,
  test_connection_at timestamptz,
  created_at         timestamptz default now(),
  last_used_at       timestamptz,
  unique (user_id, venue)                               -- one cred set per venue per user in v1
);
create index user_venue_credentials_user_idx on public.user_venue_credentials (user_id);

-- alert_rules addition (extending from the notifications brief)
alter table public.alert_rules
  add column if not exists auto_trade_action    jsonb,
  add column if not exists auto_trade_live      boolean not null default false,
  add column if not exists auto_trade_unlocks_at timestamptz,  -- rule_created_at + 7 days
  add column if not exists per_trade_cap_usd    numeric(12,2) default 100,
  add column if not exists per_day_cap_usd      numeric(12,2) default 500;

-- user_autotrade_settings
create table if not exists public.user_autotrade_settings (
  user_id                         bigint primary key references public.waitlist(id) on delete cascade,
  auto_trade_enabled_globally     boolean not null default false,
  consent_version                 text,
  consent_accepted_at             timestamptz,
  per_day_cap_usd_override        numeric(12,2),
  max_concurrent_positions_override int,
  updated_at                      timestamptz default now()
);

-- auto_trade_log (immutable audit trail)
create table if not exists public.auto_trade_log (
  id                   bigserial primary key,
  rule_id              bigint references public.alert_rules(id) on delete set null,
  user_id              bigint not null references public.waitlist(id) on delete cascade,
  attempted_at         timestamptz not null default now(),
  venue                text not null,
  market_key           text not null,
  side                 text not null check (side in ('buy','sell')),
  outcome              text not null check (outcome in ('YES','NO')),
  size_usd             numeric(12,2) not null,
  order_type           text not null check (order_type in ('market','limit')) default 'market',
  mode                 text not null check (mode in ('dry_run','live','blocked')),
  blocked_reason       text,                              -- killswitch / limit / circuit breaker / etc.
  venue_order_id       text,                              -- null if blocked / dry_run
  venue_response       jsonb,                             -- raw response for debugging
  status               text not null check (status in ('pending','filled','rejected','cancelled','error')) default 'pending',
  filled_at            timestamptz,
  filled_size_usd      numeric(12,2),
  filled_avg_price     numeric(12,6),
  error_message        text,
  created_at           timestamptz default now()
);
create index auto_trade_log_user_attempted_idx on public.auto_trade_log (user_id, attempted_at desc);
create index auto_trade_log_rule_attempted_idx on public.auto_trade_log (rule_id, attempted_at desc);

-- Day-aggregate view for the circuit breaker (materialized or plain view — plain is fine for v1)
create or replace view public.auto_trade_daily_totals as
select user_id,
       date_trunc('day', attempted_at) as day,
       sum(case when mode = 'live' and status != 'rejected' and status != 'error' then size_usd else 0 end) as live_volume_usd,
       count(*) filter (where mode = 'live') as live_attempts
from public.auto_trade_log
group by user_id, date_trunc('day', attempted_at);
```

RLS: users can only select their own rows on every table. Admin uses service role. The `auto_trade_log` table is **insert-only** for the engine; no update/delete policies (immutable audit requirement).

### Phase 3 — Credential encryption + storage

`src/lib/autotrade/credentials.ts`:
- `encryptCredentials(plain: CredentialBundle): EncryptedBundle` — AES-256-GCM with `AUTOTRADE_CREDENTIAL_KEY` (32-byte hex env var). IV per-field random, stored prepended to ciphertext.
- `decryptCredentials(encrypted: EncryptedBundle): CredentialBundle` — inverse. Throws on HMAC mismatch.
- If Supabase Vault is set up, use it instead — it's purpose-built and simpler. Document both paths; ship with whichever is available.
- `storeUserCredentials(userId, venue, plain)` — encrypts + upserts + resets `test_connection_ok = false` on any change.
- `loadUserCredentials(userId, venue)` — fetches + decrypts. Service-role only (cron handler, test-connection endpoint). **Never called from user-facing API routes.**
- `testConnection(userId, venue)` — decrypts + calls Polymarket's balance-fetch endpoint (read-only) + updates `test_connection_ok` + `test_connection_at`. Doesn't return the balance to the client — just a pass/fail.

**Don't log decrypted credentials anywhere.** Not to stdout, not to Supabase, not to Sentry. Structured log entries say `"credentials loaded for user X"`, never the values.

### Phase 4 — Polymarket CLOB client wrapper

`src/lib/autotrade/polymarket.ts`:
- Thin wrapper around `@polymarket/clob-client`.
- `placeMarketOrder(creds, marketId, side, outcome, sizeUsd)` → returns `{orderId, filled, avgPrice, raw}` or throws.
- `cancelOrder(creds, orderId)` — available but not used by v1 engine (we only place market orders that should fill immediately).
- `fetchBalance(creds)` — for the test-connection check.
- `fetchOpenPositions(creds)` — for the concurrent-position-count guard.
- Error types: network error, insufficient-balance error, market-closed error, rate-limit error, auth error. Each distinguishable so the engine can retry the right ones.

Polymarket API client is stateless — create a fresh client per request. Don't hold connections.

### Phase 5 — Dry-run execution engine

`src/app/api/cron/autotrade/route.ts` — runs on every cycle of the alert cron (integrated into the existing `/api/cron/evaluate-standard` and `/api/cron/evaluate-business` handlers from the notification brief).

Flow per alert rule that has `auto_trade_action` set:
1. Run standard notification dispatch first (from the notification brief).
2. Check kill switches: `AUTOTRADE_KILL_SWITCH` env var → stop everything. `user_autotrade_settings.auto_trade_enabled_globally` false → skip. `alert_rules.auto_trade_live` false AND `auto_trade_unlocks_at < now()` → treat as dry-run. `alert_rules.auto_trade_live` false AND still in dry-run window → dry-run.
3. Verify market still matches rule — fire a fresh `loadAllLatestSnapshots()` lookup. If price moved enough that the trigger would no longer fire now, skip (stale fire protection).
4. Verify limits: per-trade size <= cap, today's aggregate + this trade's size <= per-day cap, open positions count < concurrent limit.
5. Compute order parameters from `auto_trade_action` config + current market.
6. Insert `auto_trade_log` row with `mode='dry_run'` OR `mode='live'` OR `mode='blocked'` + blocked_reason.
7. If mode=`live`: decrypt credentials → call `placeMarketOrder` → update the log row with response. On success, status → `pending`; poll once after 30s for fill status update (or rely on Polymarket webhook if we add one in Phase 9).

### Phase 6 — Rule UI additions

`/dashboard/alerts/[id]/edit`:
- New "Auto-trade" section below the channel toggles. Hidden entirely if user tier is not Business (or is Fraternity).
- Fields (only if "Enable auto-trade on this rule" is checked):
  - Side: Buy / Sell (dropdown)
  - Outcome: YES / NO (dropdown)
  - Size in USD (number input, capped at user's per_trade_cap)
  - Order type: Market (only option in v1, locked)
- Below the fields, a prominent banner: "This rule is in dry-run for the first 7 days after creation. Orders will be logged but not placed."
- For existing rules past their dry-run window, banner changes to "✓ Dry-run complete. Review the log below to enable live execution."

`/dashboard/alerts/settings` — extend from notification settings:
- New "Auto-trade" tab.
- Credentials: "Connect Polymarket" button → form for API key + secret + passphrase → test connection → success shows "✓ Connected (last verified X mins ago)".
- "Rotate credentials" and "Disconnect" buttons.
- Global kill switch toggle: "Enable auto-trade on my account". Default off. Requires consent-form acceptance on first flip.
- Size limits: per-trade cap (slider 10–1000), per-day cap (slider 100–5000). Shows hard ceilings as locked values.

`/dashboard/alerts/[id]/log` — new page showing that rule's auto-trade history:
- Table: attempted_at, mode (dry_run / live / blocked), side/outcome/size, status, venue_order_id link-out to Polymarket.
- CSV export button.
- During dry-run window: "Dry-run active — N of 168 hours remaining."
- After dry-run window: "Ready for live? Review the log above and enable." button that flips `auto_trade_live` to true after a second confirmation.

### Phase 7 — Safety controls

- Implement the hard ceilings as code constants in `src/lib/autotrade/limits.ts`. Import everywhere they're checked; never inline.
- Circuit breaker: a cron route `/api/cron/autotrade-circuit-check` running every 10 min. Queries `auto_trade_daily_totals` view; any user whose `live_volume_usd` exceeds 5× their cap → insert a row in `user_autotrade_settings` setting `auto_trade_enabled_globally = false` + alert admin via email (Resend) with subject "🚨 Auto-trade circuit breaker tripped".
- Admin kill-switch verification: the cron handler checks `process.env.AUTOTRADE_KILL_SWITCH === '1'` first; if set, logs "killswitch active" once per cycle, exits early without touching anything.

### Phase 8 — Admin dashboard

`/admin/autotrade`:
- Total volume today / this week / this month.
- Per-user top spenders.
- Recent failures (status = 'error' or 'rejected') — drill into any for full `venue_response`.
- Circuit-breaker events log.
- Manual "Disable auto-trade for user X" action (admin emergency).
- Manual "Flip global kill switch" action — requires typing `CONFIRM KILL` to execute.

### Phase 9 — Polymarket webhook integration (optional v1, plan for v2)

Polymarket publishes order-status webhooks. Ideally we subscribe per-user and update `auto_trade_log.status` in real time rather than polling.

- For v1: poll once after 30s, set status based on response. Mark as `pending` indefinitely if polling fails; user can see "pending" in their log and check Polymarket directly.
- For v2: actual webhook endpoint `/api/webhooks/polymarket` + subscription setup when credentials connect. Out of scope here.

### Phase 10 — Observability + error paths

- Every `auto_trade_log` row with `status = 'error'` triggers a Sentry (or whatever's configured) event with the venue_response payload sanitized of credential data.
- Daily digest email to admin (via Resend, cron'd): "X live trades, Y dry-run, Z blocked, W errors. Top 3 failures: ..."
- `/admin/autotrade` shows the same numbers in-app.

---

## Access-control design principle

Server-side every request. RLS on tables. But also:

- **Decryption keys live in env vars, not DB.** Rotating `AUTOTRADE_CREDENTIAL_KEY` is a coordinated operation: re-encrypt all rows in a migration with both old and new key; store in an alt column during transition; delete old column after verification.
- **Credentials never leave the execution-engine boundary.** The rule editor UI shows "Credentials configured ✓" or "Connect Polymarket" — it can't display the stored values. There's no "show me my saved key" button. Users rotate by disconnecting + reconnecting.

---

## Safety rails (beyond standard)

- **Don't ship Phase 5+ without legal review from Phase 1.** This is explicit. If the user hasn't signed off on the TOS, the code exists on branch but doesn't deploy.
- **Default every new account to auto-trade disabled.** Even Business users. They must opt in.
- **Every rule creation with `auto_trade_action` set triggers an email confirmation.** "You just created an auto-trade rule: [details]. It will be in dry-run for 7 days. If this wasn't you, disable it immediately at [link]."
- **Never retry a failed trade automatically.** If Polymarket returns a 500, log + alert user via notification; don't re-attempt until user manually re-enables.
- **Fail-safe on cron errors.** If the autotrade cron route throws, it must NOT partially execute some users and skip others. Transactional processing per-user: either all of this user's fires process or none.

---

## Don't-do list

- Don't store raw private keys. CLOB API credentials only. If a user asks, point them at Polymarket's CLOB API docs for how to create one.
- Don't support multi-venue in v1. Schema allows it; handlers only implement Polymarket.
- Don't add limit orders in v1. Market orders only.
- Don't expose the encrypted credential columns in any API response.
- Don't log decrypted credentials anywhere.
- Don't auto-retry failed trades.
- Don't let users skip the 7-day dry-run.
- Don't build position management (take-profit / stop-loss auto-close) — that's a separate feature. Rules only place orders; user manages exits manually.
- Don't integrate Polymarket websockets for order status in v1. Polling after 30s is sufficient.
- Don't surface the admin kill switch to regular users.
- Don't expose order execution to Fraternity accounts even though they're `business` tier — `business_subtype = 'fraternity'` must check-and-deny.

---

## Testing (this one matters — be thorough)

1. **Credential encryption round-trip:** encrypt a test bundle → decrypt → assert equality. Swap ciphertext bytes → decryption throws HMAC mismatch.
2. **Test-connection flow:** valid creds → `test_connection_ok = true`. Invalid creds → false + error message surfaced to UI.
3. **Rule gating:** Pro user attempts to enable auto-trade → 402. Elite user → 402. Fraternity Business user → 403 with "auto-trade not available for Fraternity accounts". Standard Business user → success.
4. **Dry-run enforcement:** create a rule → fire the cron → `auto_trade_log` row has `mode='dry_run'`, no Polymarket API call. Advance system time past 7 days → fire cron → mode still `dry_run` until user flips `auto_trade_live`. User flips → next fire is `mode='live'`.
5. **Per-trade cap:** rule with per_trade_cap_usd=100 and action size 500 → blocked with reason `per_trade_cap_exceeded`.
6. **Per-day cap:** user has $450 in logged live volume today, cap $500 → next fire attempting $100 trade → blocked with `per_day_cap_exceeded` (not truncated to $50).
7. **Concurrent positions cap:** mock Polymarket API returning 10 open positions, user limit 10 → next fire blocked with `concurrent_positions_cap_exceeded`.
8. **Stale-fire protection:** rule fires based on history snapshot, but `loadAllLatestSnapshots()` shows price moved out of trigger range → blocked with `stale_trigger`.
9. **Admin kill switch:** set `AUTOTRADE_KILL_SWITCH=1`, trigger cron → nothing executes, log entry says `killswitch_active`. Unset → normal flow resumes.
10. **User-global kill switch:** `auto_trade_enabled_globally=false` → all fires for that user blocked. Flip to true → normal flow resumes.
11. **Circuit breaker:** simulate user exceeding 5× daily cap → circuit breaker cron trips → `auto_trade_enabled_globally` forced to false + admin alert email received.
12. **Credential rotation:** user changes Polymarket creds via UI → `test_connection_ok` resets to false; all live rules effectively pause until next test-connection succeeds.
13. **Polymarket API error handling:** mock 500 from Polymarket → log entry status `error`, no retry, user notification fired.
14. **Audit log immutability:** attempt `UPDATE auto_trade_log SET size_usd = 9999` as service role → RLS or explicit policy blocks.
15. **Log CSV export:** user downloads their own log → CSV contains columns matching schema. Another user cannot download this user's log.
16. **Fraternity gate:** a Fraternity account is on Business tier but `business_subtype='fraternity'`. They try to hit every auto-trade endpoint → 403 with explicit "not available for Fraternity accounts" message.

---

## Definition of done

- [ ] `docs/autotrade-tos-checklist.md` written and signed off by user before Phase 2 code deploys
- [ ] 4 new migrations applied (`user_venue_credentials`, `alert_rules` alter, `user_autotrade_settings`, `auto_trade_log`) + daily totals view
- [ ] Credential encryption lib with round-trip test + tampering test
- [ ] Polymarket CLOB wrapper with distinct error types
- [ ] Dry-run execution engine integrated into existing alert cron
- [ ] `/dashboard/alerts/settings` auto-trade tab: credentials form + test connection + global toggle + size limits
- [ ] `/dashboard/alerts/[id]/edit` auto-trade section (Business-only, not Fraternity)
- [ ] `/dashboard/alerts/[id]/log` with CSV export
- [ ] Circuit-breaker cron running; verified on test data
- [ ] `/admin/autotrade` dashboard showing volumes, failures, breaker events
- [ ] Admin kill-switch documented + verified
- [ ] Consent flow + TOS acceptance flow with versioned storage
- [ ] All 16 test scenarios pass; results in PR description
- [ ] PR opened; **user pairs with a human reviewer** on this one before merge (not a drive-by merge)

Estimated effort: **30–45 hours** including all safety scaffolding. Meaningfully larger than notifications because every phase requires careful thinking about what happens when it breaks.

---

## What comes AFTER this brief (v2 candidates, not in scope here)

- Limit orders + order modification (cancel/replace)
- Take-profit / stop-loss auto-exit logic
- Kalshi CLOB integration (separate venue)
- ProphetX / NoVig integration (partner API access needed)
- Position management dashboard (show open positions across venues)
- Strategy backtest mode (run rules against historical data → show hypothetical P&L)
- Multi-rule sequencing (when rule A fires, enable rule B; when position closes, disable rule C)
- Margin / leverage integrations (Polymarket margin was in beta at some point)

All of those are features on top of a working v1. Don't let scope creep push them into v1.
