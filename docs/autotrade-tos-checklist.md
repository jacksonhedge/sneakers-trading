# Auto-trade — TOS + consent checklist (Phase 1)

This doc captures the legal posture and in-product disclosures required
**before any auto-trade execution code ships beyond Phase 1**. It is the
gate the auto-trade brief
([`docs/HANDOFF_AUTOTRADE.md`](./HANDOFF_AUTOTRADE.md)) calls out
explicitly:

> *Don't ship Phase 5+ without legal review from Phase 1. This is explicit.
> If the user hasn't signed off on the TOS, the code exists on branch but
> doesn't deploy.*

You do NOT need a lawyer to sign off — the brief allows "your own
judgment". But you need to read every item and decide whether it matches
what we want to be on the record for.

## How to use

1. Read each item below.
2. For each: tick the checkbox if you accept the language as-is, or note
   what you want changed inline.
3. Once every box is ticked, reply on the PR (or in chat) "TOS approved"
   and I'll move to Phase 2 (migrations + credential encryption + the
   Polymarket wrapper).
4. The actual TOS page on sneakersterminal.com is updated as part of
   Phase 5 — the in-product `user_autotrade_consents` table stores the
   versioned text the user clicked through.

---

## A. Public TOS additions (sneakersterminal.com/terms)

These four paragraphs need to land on the public Terms page **before**
the in-product auto-trade flow goes live. Add them under a new "Auto-trade
execution" section.

- [ ] **A1. Not an investment advisor.** *"Sneakers Terminal is not a
      registered investment advisor, broker-dealer, or commodity trading
      advisor. The auto-trade feature executes pre-configured rules that
      you create and own. You retain full responsibility for trading
      decisions and outcomes. Past performance of any market is not
      indicative of future results."*

- [ ] **A2. Non-custodial.** *"Sneakers Terminal does not hold, custody,
      or have unilateral control over your funds. Polymarket (or any
      future supported venue) custodies your wallet. The Polymarket CLOB
      API credentials you provide authenticate only the order operations
      you have configured in your auto-trade rules — not transfers,
      withdrawals, or any other wallet action. You can revoke our access
      at any time from Polymarket's UI."*

- [ ] **A3. Business-tier eligibility.** *"Auto-trade is available only
      to active Business-tier subscribers (excluding the Fraternity
      sub-flavor). By enabling auto-trade you affirm that (a) your
      account is in good standing, (b) you have the legal authority to
      trade prediction markets in your jurisdiction, (c) where the
      account is held by an entity, you have authority to act on behalf
      of that entity, and (d) you understand the risk profile of
      automated trading on illiquid prediction markets."*

- [ ] **A4. Permission to act + revocation.** *"You grant Sneakers
      Terminal permission to place orders on your behalf according to
      the rules you configure, subject to the limits set in-product
      (per-trade caps, per-day caps, concurrent-position caps, hard
      ceilings). You can revoke this permission immediately by (a)
      disabling auto-trade in your account settings, (b) disconnecting
      your venue credentials, or (c) rotating your Polymarket API
      credentials in Polymarket's own UI. Sneakers Terminal will not
      retain or attempt to re-use revoked credentials."*

## B. In-product disclosures

These appear in the auto-trade UI itself — separate from the public TOS.

- [ ] **B1. Consent click-through.** Before the user can flip
      `auto_trade_enabled_globally` to true the first time, show a modal
      that requires the user to scroll to the bottom and click "I
      understand and accept" — text mirrors items A1–A4 above. The
      acceptance is recorded in `user_autotrade_consents` with
      `consent_version`, `consent_text_hash`, `accepted_at`, and the
      authed user id. We can prove what each user agreed to and when.

- [ ] **B2. Per-rule dry-run banner.** Every newly created auto-trade
      rule shows a prominent banner for the first 7 days: *"This rule is
      in dry-run mode for the first 7 days after creation. Orders will
      be logged to your audit trail but NOT submitted to Polymarket.
      Review the log before enabling live execution."*

- [ ] **B3. Per-rule live-enable confirmation.** When the user flips
      `auto_trade_live` to true after dry-run completes, require a
      second confirmation modal: *"You are about to enable LIVE
      execution for rule '\<name>'. This rule will place real orders
      against your Polymarket account, up to \$\<per-trade cap>/trade
      and \$\<per-day cap>/day. Type ENABLE to confirm."*

- [ ] **B4. Limits transparency.** The auto-trade settings page shows
      both the user's currently-set caps AND the system hard ceilings:
      *"Per-trade: $100 (max $1,000). Per-day: $500 (max $5,000).
      System hard ceiling: $5,000/trade, $25,000/day, 100 concurrent
      positions — these cannot be raised by you or by support."*

- [ ] **B5. Failure-mode disclosure.** On the rule-edit page, beneath
      the auto-trade fields: *"Auto-trade will not retry on Polymarket
      errors. If Polymarket rejects an order, the failure is logged and
      you are notified — the engine will not re-attempt. You can fire
      manually from the log page if you want to retry."*

- [ ] **B6. Email confirmation on rule creation.** Every time a user
      creates or substantially modifies an auto-trade rule, send an
      email: *"You configured an auto-trade rule on Sneakers Terminal:
      \<details>. It is in dry-run for 7 days, then must be manually
      enabled for live execution. If this wasn't you, disable
      auto-trade immediately at \<link>."*

## C. Risk + safety posture

- [ ] **C1. Hard ceilings are absolute.** Per-trade $5,000, per-day
      $25,000, 100 concurrent positions. These are constants in
      `lib/autotrade/limits.ts` and cannot be exceeded even by admin
      action without a code change + review. (The user-configurable max
      stops at $1,000/trade, $5,000/day; the hard ceiling is
      defense-in-depth for code bugs that bypass the user-facing cap.)

- [ ] **C2. Three independent kill switches.** (1) Per-rule
      `auto_trade_live` flag, (2) per-user
      `auto_trade_enabled_globally`, (3) admin global env var
      `AUTOTRADE_KILL_SWITCH=1`. Any of them flipped halts execution
      immediately for its scope. The admin switch requires a redeploy
      (intentional friction).

- [ ] **C3. Daily circuit breaker.** A separate cron
      (`/api/cron/autotrade-circuit-check`, every 10 min) queries
      `auto_trade_daily_totals`. Any user whose `live_volume_usd` exceeds
      5× their per-day cap → `auto_trade_enabled_globally` flipped to
      false + admin alerted via Resend. This shouldn't be reachable
      given the per-trade-cap math but is defense against engine bugs.

- [ ] **C4. Audit log immutability.** `auto_trade_log` has no UPDATE or
      DELETE policies. Every attempt — dry-run, live, blocked — is
      recorded with `attempted_at`, `mode`, `blocked_reason` (if
      blocked), `venue_response` (if live), and `status`. Users export
      their own log; admin sees everything. RLS forbids any writes
      after insert.

- [ ] **C5. Credentials never logged or returned.** AES-256-GCM
      encrypted at rest with `AUTOTRADE_CREDENTIAL_KEY`. Decrypted only
      inside the cron handler's process. Never written to logs (Sentry,
      stdout, Supabase). Never returned in any API response — the rule
      editor shows "✓ Connected" or "Connect Polymarket" only.

- [ ] **C6. Stale-fire protection.** Before placing an order, the
      engine re-runs `loadAllLatestSnapshots()` and re-evaluates the
      trigger against the freshest data. If price moved out of the
      trigger range between rule fire and order placement, the order is
      blocked with `blocked_reason='stale_trigger'`.

- [ ] **C7. No automatic retries.** If Polymarket returns 5xx, the log
      entry is marked `status='error'`, the user is notified via the
      regular alert channels, and the engine does NOT retry. User can
      re-arm manually.

## D. What we are explicitly NOT promising

These are clarifications — included so we don't accidentally imply more
than we deliver. Surface in the in-product disclosure copy where
relevant.

- [ ] **D1. No best-execution guarantee.** Market orders may fill at
      adverse prices on illiquid markets. We do not promise any specific
      slippage bound. (Phase 2 of the brief adds limit orders.)

- [ ] **D2. No uptime SLA on the engine.** Cron runs every minute for
      Business; if Vercel cron is delayed or fails, fires may be missed
      or delayed. We do not credit users for missed fires.

- [ ] **D3. No position management.** The engine places orders. It does
      NOT manage open positions: no take-profit, no stop-loss, no
      partial close, no hedge. The user is responsible for exits.

- [ ] **D4. Polymarket-only in v1.** The schema supports multi-venue;
      the engine doesn't. Kalshi / NoVig / sportsbooks are NOT
      auto-trade venues until separate briefs ship.

- [ ] **D5. Fraternity exclusion.** A `business_subtype = 'fraternity'`
      account is on the Business tier for everything else but CANNOT
      enable auto-trade. The auto-trade endpoints check this explicitly
      and return 403. Documented in the user-facing pricing page.

## E. Operational readiness

These are pre-deployment items, not legal — listed here because they
need to be done before Phase 5 ships and the brief calls them out.

- [ ] **E1. `AUTOTRADE_CREDENTIAL_KEY` rotation procedure documented.**
      Generate via `openssl rand -hex 32`. Rotation requires a migration
      that re-encrypts all `user_venue_credentials` rows with both old +
      new key, then drops the old. Documented in
      `docs/autotrade-key-rotation.md` (to be written in Phase 3).

- [ ] **E2. `AUTOTRADE_KILL_SWITCH` runbook.** When to flip, who has
      authority, what happens to in-flight requests. Documented in
      `docs/autotrade-incident-response.md` (Phase 7).

- [ ] **E3. Resend admin alerts wired.** Circuit-breaker trips,
      Polymarket auth failures, and 5xx clusters all email
      `ADMIN_EMAILS` automatically. Phase 7.

- [ ] **E4. Polymarket account terms reviewed.** Confirm Polymarket's
      own developer terms permit programmatic order placement on behalf
      of end-users via API credentials they've issued. (Quick read: yes,
      that's the entire point of the CLOB API. But do the read.)

---

## Sign-off

Once all checkboxes above are ticked (or alternative language is noted
inline), reply with **"TOS approved"** and I'll move to Phase 2.

Until then, no Phase 2+ code ships.
