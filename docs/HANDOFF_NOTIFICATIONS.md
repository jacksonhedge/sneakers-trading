# Handoff — Notification engine (rules + delivery)

**Mission:** build a user-constructible notification system on top of the scraped market data. Users create rules ("notify me when X happens"), the engine evaluates rules on a cron, and delivers via browser push + email. Auto-trade is explicitly deferred to a Phase 2 (separate brief) — this phase ends at the user being notified.

**Pre-existing state you must NOT rebuild:**

- Market snapshots already landing in `apps/trader/data/<platform>/<date>.jsonl` via the scraper stack (Polymarket, Kalshi, NoVig, ProphetX, OG, Odds API).
- `lib/markets-data.ts` exposes `loadAllLatestSnapshots()` (latest per market) and `loadMarketHistory(days)` (full time-series). Both are already the right shape; you consume them, don't modify them.
- `lib/market-stats.ts` has `bigMovers()`, `arbCandidates()`, `representativeProb()` helpers — reuse them where trigger logic overlaps.
- Resend is already wired for transactional email (see the waitlist confirmation flow). Reuse the Resend client, don't re-instantiate.
- Supabase magic-link auth is in place; protected routes are plain HTTP JSON so iOS can consume the same endpoints.
- Migrations numbered sequentially — see `apps/platform/supabase/migrations/`. The next free numbers at the time this brief is written are 010+; check the directory and take the next available.

**Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + RLS), TypeScript, Resend. Vercel Cron for scheduled evaluation. `web-push` npm package for browser Push API.

Branch: `feat/notifications` off `feat/platform-scaffold` (or off `main` once merged).

---

## Decisions locked in by the user (2026-04-22)

Do NOT re-ask these. Execute against them:

### Scope

- **Auto-trade is NOT v1.** Rules fire notifications only. A "suggested action" link in the notification may open the venue's trade page via affiliate URL, but the engine never places trades. Auto-trade is a separate brief — draft `docs/HANDOFF_AUTOTRADE.md` at the end of this phase with open questions but do not implement.

### Channels (v1)

- **Browser Push** (Web Push API via VAPID; works on Chrome/Firefox/Edge/Safari 16.4+ desktop + Android. iOS Safari 16.4+ supports it for installed PWAs only — document this limitation for users.)
- **Email** (via existing Resend client)

**Explicitly deferred to Phase 2:** SMS (Twilio), phone call (Twilio Voice), Slack/Discord webhooks, generic webhooks. The schema should allow for them (channels is an array of strings) but v1 delivery only handles `browser_push` and `email`.

### Trigger types (v1) — four primitives

| Type | Config shape | Fires when |
|---|---|---|
| `price_threshold` | `{outcome_direction: 'above' \| 'below', threshold: number}` | Representative probability crosses threshold |
| `price_movement` | `{delta_pp: number, window_minutes: number}` | Probability moves ≥ `delta_pp` within `window_minutes` |
| `overround_threshold` | `{direction: 'above' \| 'below', threshold: number}` | Overround crosses a threshold (book widening/tightening) |
| `arb_appearance` | `{min_edge_pp?: number}` | A cross-book arb opportunity appears matching the market filter |

All rules compose with a `market_filter`:
```ts
{
  platform?: string       // e.g. "kalshi" — match only this book
  sport?: string          // e.g. "basketball"
  category?: TerminalCategory  // 'sports' | 'politics' | ...
  market_key?: string     // "platform:market_id" — pin to a specific market
}
```

Filter fields are ANDed together. At least one must be set (no unbounded "everything" rules in v1 to keep fire rates sane).

### Tier gating

| Tier | Active rules | Channels available | Eval frequency |
|---|---|---|---|
| Free | 0 | — | n/a |
| Pro | 3 | browser_push, email | 5 min |
| Elite | 20 | browser_push, email (+ SMS when Phase 2 ships) | 5 min |
| Business | unlimited | all channels (+ webhooks when Phase 2 ships) | 1 min |
| Fraternity | 20/seat | browser_push, email | 5 min |

Enforce rule-count limits at the API layer (attempt to create an 11th Pro rule → 402 with upsell copy).

### Cron frequency

- **5 minutes** for Pro / Elite / Fraternity (Vercel cron: `*/5 * * * *`)
- **1 minute** for Business (Vercel cron: `* * * * *`)

For v1, run two parallel cron routes (`/api/cron/evaluate-standard` and `/api/cron/evaluate-business`), each iterating only the rules that match its tier. Simpler than a single handler with tier-aware scheduling.

### Cooldowns + deduplication

- Every rule has a `cooldown_minutes` field. Default 60 minutes.
- Before firing, check `alert_events` for the most recent event on this rule; if the gap is less than `cooldown_minutes`, skip.
- Cooldowns are per-rule, not per-market-within-rule — so a rule that fires on "any NBA market over 90%" won't spam multiple fires if three NBA markets cross simultaneously. It fires once per cooldown window, citing the most-extreme match.

### Delivery preferences

Users toggle per-channel at `/dashboard/alerts/settings`:
- Browser push: on/off + quiet hours (default 10pm–8am local)
- Email: on/off + digest mode (immediate vs 15-min batch)

Quiet hours defer delivery; they don't suppress (notification queues, then sends at the next non-quiet minute). Digest mode batches multiple events into one email; still immediate for browser push.

---

## Deliverables, in order

### Phase 1 — Migrations

Next available migration number. Three tables:

```sql
-- alert_rules
create table if not exists public.alert_rules (
  id               bigserial primary key,
  user_id          bigint not null references public.waitlist(id) on delete cascade,
  name             text not null,
  description      text,
  trigger_type     text not null check (trigger_type in (
    'price_threshold', 'price_movement', 'overround_threshold', 'arb_appearance'
  )),
  trigger_config   jsonb not null,
  market_filter    jsonb not null default '{}',
  channels         text[] not null default '{browser_push,email}',
  cooldown_minutes int not null default 60,
  enabled          boolean not null default true,
  last_fired_at    timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index alert_rules_user_id_enabled_idx on public.alert_rules (user_id, enabled);

-- alert_events (firing history)
create table if not exists public.alert_events (
  id               bigserial primary key,
  rule_id          bigint not null references public.alert_rules(id) on delete cascade,
  user_id          bigint not null references public.waitlist(id) on delete cascade,
  fired_at         timestamptz not null default now(),
  market_key       text not null,     -- "platform:market_id" that triggered the fire
  trigger_snapshot jsonb not null,    -- minimal snapshot of the relevant fields at fire time
  channels_sent    text[] not null,
  delivery_status  jsonb,             -- per-channel success/failure
  created_at       timestamptz default now()
);
create index alert_events_rule_fired_idx on public.alert_events (rule_id, fired_at desc);
create index alert_events_user_fired_idx on public.alert_events (user_id, fired_at desc);

-- push_subscriptions (Web Push API)
create table if not exists public.push_subscriptions (
  id               bigserial primary key,
  user_id          bigint not null references public.waitlist(id) on delete cascade,
  endpoint         text not null,
  p256dh_key       text not null,
  auth_key         text not null,
  user_agent       text,
  created_at       timestamptz default now(),
  last_used_at     timestamptz,
  unique (user_id, endpoint)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- alert_delivery_prefs
create table if not exists public.alert_delivery_prefs (
  user_id              bigint primary key references public.waitlist(id) on delete cascade,
  email_enabled        boolean not null default true,
  email_digest_mode    boolean not null default false,  -- false = immediate, true = 15-min batch
  push_enabled         boolean not null default true,
  quiet_hours_start    int,                             -- 0-23; null = no quiet hours
  quiet_hours_end      int,
  quiet_hours_tz       text default 'America/New_York',
  updated_at           timestamptz default now()
);
```

Comment every column. RLS policies: users can read/write only their own rows on all four tables (standard `auth.uid()::text = user_id::text` pattern — confirm the existing auth→waitlist mapping before writing).

### Phase 2 — Browser Push setup

- Generate VAPID key pair once (CLI: `npx web-push generate-vapid-keys`). Store private in Supabase secrets / `.env.local` as `VAPID_PRIVATE_KEY`; public as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- Add `public/service-worker.js` that listens for `push` events and shows a notification. Register it in a root-layout client component on mount (only for authed users).
- Subscription flow: on first load after login, prompt user for notification permission, subscribe to push manager, POST subscription to `/api/push/subscribe` which upserts into `push_subscriptions`.
- Unsubscribe endpoint: `/api/push/unsubscribe` (scoped by endpoint).
- Install `web-push` npm package server-side for dispatch.

### Phase 3 — Trigger evaluators (pure functions)

`src/lib/alerts/triggers.ts`:

```ts
export type TriggerResult = null | {
  market_key: string
  trigger_snapshot: Record<string, unknown>
}

export function evaluatePriceThreshold(rule, latest): TriggerResult
export function evaluatePriceMovement(rule, history): TriggerResult
export function evaluateOverround(rule, latest): TriggerResult
export function evaluateArbAppearance(rule, latestByKey): TriggerResult
```

Each takes the rule + the relevant data slice, returns either `null` (didn't fire) or a payload describing what fired. Pure functions — no DB writes, no side effects. The cron handler calls them and decides whether to persist + dispatch.

Unit-test each evaluator in isolation. Put test cases at `src/lib/alerts/triggers.test.ts`. At minimum:
- Price threshold fires exactly when crossing, not when staying above.
- Price movement catches the swing within the window even if price ticks up and down.
- Overround crossings.
- Arb appearance fires once when the arb first appears, not on every subsequent run while it persists (this interacts with cooldown — confirm cooldown works before relying on it here).

### Phase 4 — Cron evaluation handler

Two routes: `/api/cron/evaluate-standard` and `/api/cron/evaluate-business`.

Handler flow:
1. Verify the Vercel cron secret header (`Authorization: Bearer $CRON_SECRET`). Reject otherwise.
2. Load all enabled rules for the target tier set (one tier for business, three tiers for standard).
3. Load `loadAllLatestSnapshots()` once.
4. Load `loadMarketHistory(1)` once (for price-movement triggers).
5. Group snapshots by market-key for the arb evaluator's cross-book lookup.
6. For each rule: apply `market_filter` → call the matching evaluator → if fires, check cooldown (`last_fired_at` column + `cooldown_minutes`) → if past cooldown, enqueue for delivery.
7. Dispatch delivery (Phase 5), persist `alert_events` row with `delivery_status`, update `last_fired_at` on the rule.

Log summary metrics to stdout (rule count evaluated, fires, errors) so Vercel logs are actionable.

Vercel cron config in `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/evaluate-standard", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/evaluate-business", "schedule": "* * * * *" }
  ]
}
```

### Phase 5 — Channel delivery

`src/lib/alerts/channels/push.ts`:
- Takes user_id + notification payload → fetches all `push_subscriptions` for user → dispatches via `web-push` library with VAPID headers.
- On `404` or `410` response from a push endpoint, delete the subscription (user unsubscribed or revoked).

`src/lib/alerts/channels/email.ts`:
- Takes user_id + notification payload → fetches user email from `waitlist` → sends via Resend.
- Subject: `🔔 ${rule.name} just fired`
- Body: rule name + description + market question + current price/delta + "View market →" link to `/dashboard?m=<market_key>`.
- Digest mode: buffer per-user fires in a short-lived in-memory map across cron invocations (or in a transient Supabase table `email_digest_queue`); every 15 min, flush to a single email per user. For v1 simplest: just send one email per fire, even in "digest mode" — ship the checkbox, defer true batching.

Quiet hours: before dispatch, check `alert_delivery_prefs` and the user's local time (from `quiet_hours_tz`). If within quiet window, skip the channel for push; defer email until past quiet hours (simplest v1: skip email too, log a `delivery_status` of `'skipped_quiet_hours'`; the rule will re-evaluate next cron cycle and fire again if conditions still hold).

### Phase 6 — Rule builder UI

`/dashboard/alerts` — list page:
- Table of rules: name, trigger summary ("NBA markets over 90%"), last fired, enabled toggle, edit/delete.
- "New rule" button → `/dashboard/alerts/new`.
- Rule-count indicator vs tier limit ("3 of 3 used — upgrade to Elite for more").

`/dashboard/alerts/new` and `/dashboard/alerts/[id]/edit` — form:
- Name + description (textarea).
- Trigger type picker (radio/tabs). Form fields render per trigger type:
  - `price_threshold`: "above/below" + threshold slider 0–100%.
  - `price_movement`: delta in pp (5–90) + window (5m / 15m / 1h / 6h / 24h / 7d).
  - `overround_threshold`: "above/below" + threshold (1.00–1.30).
  - `arb_appearance`: optional minimum edge in pp.
- Market filter: platform dropdown (or "any"), sport dropdown, category dropdown, or a "pin to specific market" picker (search autocomplete against `loadAllLatestSnapshots()`).
- Channels (checkboxes): browser_push, email. Disabled/greyed if tier doesn't allow or user hasn't granted browser permission yet.
- Cooldown minutes (10 / 30 / 60 / 240 / 1440).
- Preview: before saving, show "matches N current markets" and "would have fired M times in the last 7 days" — run the trigger against loaded history.

`/dashboard/alerts/settings` — delivery preferences:
- Email on/off + digest mode toggle.
- Browser push on/off + "Re-enable permission" button if browser reports permission denied.
- Quiet hours: start hour + end hour + timezone dropdown. Disabled if hours are null.
- "Send test notification" button per channel.

### Phase 7 — Tier gating + observability

- Wire `requireTier` (from the Stripe handoff; assume it's live by then, else use the temporary localStorage check via `gates()`) on all rule-create, rule-update, rule-delete endpoints. Enforce the per-tier rule-count cap on create.
- Admin page at `/admin/alerts` (email-allowlist-gated): table of all users' rules with filter/sort, totals per trigger_type, fire rate over last 24h/7d, per-channel delivery success rate. Spot abusers (>1000 fires/day on a single user → flag for manual review). Drill into any event to see the full trigger_snapshot.
- Each cron run logs a summary line to stdout that Vercel's log explorer can aggregate:
  `[cron:standard] rules=847 fired=23 delivered=19 skipped_quiet=4 errors=0 ms=1820`

### Phase 8 — Draft the autotrade brief (deferred phase, not implementation)

Before marking this complete, write `docs/HANDOFF_AUTOTRADE.md` as a stub that:
- Defines auto-trade as "rule fires → system places a trade on the user's behalf via a venue integration"
- Lists the open questions: which venues support programmatic API (Kalshi, Polymarket — yes; sportsbooks — not directly), position-sizing rules, error handling, kill switch, legal review of affiliate vs advisory posture.
- Enumerates pre-requisites: user-stored venue credentials (vault), per-venue API client, dry-run mode, audit log.
- Does NOT commit to an implementation approach or timeline. Product decisions needed first.

---

## Access-control design principle

Same as Stripe: **server-side is the only real firewall.** The rule-count cap, channel-allow check, and Business-only tier for 1-min cron MUST be enforced in the API routes. UI gates (disable the "New rule" button when at limit) are UX only.

For RLS, keep it simple: users can select/insert/update/delete only rows where `user_id` matches their own. The cron handler uses the service-role client to read all rules — not RLS-scoped.

---

## Safety rails

- **Rate-limit the rule-create endpoint.** A bad actor could spam 1000 rules/minute. Add a simple per-user Supabase table `rate_limit_buckets` or use the same Upstash solution already queued for auth endpoints.
- **Validate `market_filter` shape** on insert — reject empty filters (no "match everything" rules), reject filters referencing non-existent platforms/sports.
- **Validate `trigger_config`** against trigger_type — reject `price_threshold` with threshold > 1.0, etc.
- **Web Push payload size** is capped at 4KB. Truncate market question + description to fit.
- **Browser notification permission is sticky**: users who "Block" can't be re-prompted easily. Show a clear "you've blocked notifications; re-enable in browser settings" state rather than silently failing.
- **Cron secret**: Vercel cron sends a specific header. Verify it in every cron route. Anyone can POST to the route URL; auth prevents abuse.

---

## Don't-do list

- Don't implement auto-trade. Brief stub only.
- Don't build SMS / phone / webhook delivery in v1. Schema allows them; handlers don't exist.
- Don't build a queue/Redis/BullMQ. Cron + Supabase is enough for v1. When fire rates exceed ~1K/min, migrate.
- Don't build true 15-min email digest batching in v1. The preference toggle exists, but v1 sends one email per fire regardless.
- Don't let rules run against unbounded "everything" filters — require at least one filter dimension.
- Don't persist the full MarketSnapshot in `trigger_snapshot` — cherry-pick the 4-5 fields relevant to the fire reason. Keeps the JSONB small.
- Don't silently suppress failures. If Resend returns a 4xx/5xx, log it to `delivery_status` with the error message — the admin dashboard surfaces these.
- Don't assume iOS Safari supports browser push universally. Show a tooltip "iOS requires this app be installed to your home screen to receive push notifications" on the delivery preferences page if the user-agent is iOS Safari.

---

## Testing

1. **Rule creation (happy path):** as a Pro user, create 3 rules across 3 different trigger types; confirm all 3 persist with correct `trigger_config` shape and show up on `/dashboard/alerts`.
2. **Rule limit enforcement:** as a Pro user, attempt to create a 4th rule; expect 402 with "upgrade to Elite for 20 rules" copy.
3. **Business-account filter check:** a business user tries to create a Pro-tier rule count > 20 — should succeed (business = unlimited). Attempt to create an 11th rule as Fraternity → expect 402.
4. **Price-threshold evaluator fires once per crossing:** set up a test market; run the evaluator across simulated snapshots where price crosses 90% → expect one fire, not N fires.
5. **Cooldown enforcement:** a rule that fires → run the evaluator again within cooldown window → no fire. Outside window → fires again.
6. **Browser push end-to-end:** subscribe via the UI, use admin panel to manually trigger a rule's fire for your user → confirm push notification appears in browser.
7. **Email delivery end-to-end:** same, but delivery via Resend → confirm email received with correct subject + body + link-back URL.
8. **Quiet hours deferral:** set quiet hours covering "now", trigger a rule → delivery_status records `skipped_quiet_hours`, no notification sent.
9. **Cron secret auth:** POST to `/api/cron/evaluate-standard` with wrong secret → 401. With correct secret → 200 + summary log line.
10. **Push subscription cleanup:** fake a 410 response from a push endpoint (via mocking) → confirm the subscription row is deleted.
11. **Rule preview at creation:** in the UI, set a rule to "NBA markets over 90%" → preview shows N current matches and M would-have-fired in 7d. Numbers non-zero for a live sports day, zero for off-day.
12. **Admin abuse detection:** seed a user with 500 fires in a day, visit `/admin/alerts` → expect that user flagged in the top of the page with "abnormal fire rate".

Document all 12 in the PR description with pass/fail.

---

## Definition of done

- [ ] 4 migrations applied (alert_rules, alert_events, push_subscriptions, alert_delivery_prefs) with RLS policies
- [ ] VAPID keys generated, env vars set, service worker registered
- [ ] 4 trigger evaluators implemented + unit-tested
- [ ] Cron routes for standard (5m) + business (1m) live on Vercel, secret-gated
- [ ] `web-push` dispatch working end-to-end; subscriptions self-heal on 404/410
- [ ] Resend email dispatch working with proper subject/body/link-back
- [ ] `/dashboard/alerts` list + create + edit + delete pages; tier-count cap enforced server-side
- [ ] `/dashboard/alerts/settings` delivery prefs page, including "test notification" buttons
- [ ] `/admin/alerts` observability page with fire-rate metrics + delivery-status breakdown
- [ ] `docs/HANDOFF_AUTOTRADE.md` draft exists (stub, not implementation)
- [ ] All 12 test scenarios pass
- [ ] PR opened against `feat/platform-scaffold` with test results + screenshots

Estimated effort: **18–28 hours** including admin observability. Without admin page: 14–20 hours.
