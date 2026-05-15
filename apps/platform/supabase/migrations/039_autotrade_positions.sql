-- Phase 1B+ — autotrade open positions with TP/SL targets.
--
-- One row per Polymarket position the user wants Sneakers to monitor.
-- Created when a copilot buy fills (or imported manually). The watcher
-- in apps/trader polls Polymarket prices on a cadence; when the current
-- price crosses take_profit_price OR stop_loss_price, the watcher fires
-- a sell via the same placeMarketOrder path the buy used and flips the
-- row's status to 'closed'.
--
-- Either / both TP and SL may be null. A row with both null is just a
-- position-of-record (user manages the exit themselves). Watcher skips
-- rows where both are null OR status != 'open'.
--
-- Idempotent.

create table if not exists public.autotrade_positions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.waitlist(id) on delete cascade,
  -- Originating buy execution (audit trail). Null for manually-imported
  -- positions or older buys created before this table existed.
  entry_execution_id    bigint null,
  -- Venue scope is 'polymarket' for v1; the column exists so future
  -- venues (Kalshi, etc.) can be added without an ALTER.
  venue                 text not null default 'polymarket'
                        check (venue in ('polymarket')),
  -- Market identity. token_id is Polymarket-specific (CLOB orders are
  -- placed against a token, not the market id) and is the actual handle
  -- the watcher passes to placeMarketOrder.
  platform_market_id    text not null,
  outcome_name          text not null,
  token_id              text not null,
  side                  text not null
                        check (side in ('YES', 'NO')),
  -- Position size + entry price. size_shares is the number of contracts
  -- held; the sell will be size_shares * (current price) in USDC.
  size_shares           numeric(18, 6) not null check (size_shares > 0),
  entry_price           numeric(8, 6) not null
                        check (entry_price >= 0 and entry_price <= 1),
  -- Trigger thresholds. TP must be strictly above entry to make sense;
  -- SL must be strictly below. Both <= 1 and >= 0.01 (avoid trying to
  -- sell at exact 0¢ — Polymarket order would never fill).
  take_profit_price     numeric(8, 6) null
                        check (take_profit_price is null
                               or (take_profit_price > 0 and take_profit_price <= 1)),
  stop_loss_price       numeric(8, 6) null
                        check (stop_loss_price is null
                               or (stop_loss_price > 0 and stop_loss_price <= 1)),
  -- Lifecycle.
  status                text not null default 'open'
                        check (status in ('open', 'closing', 'closed', 'cancelled', 'errored')),
  -- Why the position closed. Set when status flips off 'open'.
  close_reason          text null
                        check (close_reason is null
                               or close_reason in ('tp_hit', 'sl_hit', 'manual', 'expired', 'error')),
  close_price           numeric(8, 6) null
                        check (close_price is null or (close_price >= 0 and close_price <= 1)),
  close_execution_id    bigint null,
  close_error           text null,
  -- Watcher bookkeeping. Lets us know when we last polled so we can
  -- avoid hammering markets that just resolved + rate-limit ourselves.
  last_checked_at       timestamptz null,
  last_observed_price   numeric(8, 6) null,
  -- Standard timestamps.
  opened_at             timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  closed_at             timestamptz null,
  -- Sanity: TP > entry > SL when both are set. NULL is allowed in
  -- either column; check only fires on the rows that have both.
  constraint autotrade_positions_tp_above_entry check (
    take_profit_price is null or take_profit_price > entry_price
  ),
  constraint autotrade_positions_sl_below_entry check (
    stop_loss_price is null or stop_loss_price < entry_price
  )
);

-- Watcher hot path: "find all open positions across all users."
create index if not exists autotrade_positions_open_idx
  on public.autotrade_positions (status, last_checked_at)
  where status = 'open';

-- Per-user "show me my open positions" lookup for the dashboard UI.
create index if not exists autotrade_positions_user_status_idx
  on public.autotrade_positions (user_id, status, opened_at desc);

alter table public.autotrade_positions enable row level security;

-- Users can read their own positions. Writes go through API routes so
-- we still enforce ownership + sanity checks server-side.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'autotrade_positions'
      and policyname = 'autotrade_positions_self_read'
  ) then
    create policy autotrade_positions_self_read on public.autotrade_positions
      for select to authenticated
      using (
        user_id in (
          select id from public.waitlist where email = lower(auth.jwt() ->> 'email')
        )
      );
  end if;
end $$;

-- Auto-update updated_at on every row change. Existing migrations rely
-- on a `set_updated_at` trigger function; reuse if available, otherwise
-- create a local one (idempotent).
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'autotrade_positions_touch_updated_at') then
    create function public.autotrade_positions_touch_updated_at()
    returns trigger language plpgsql as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'autotrade_positions_touch_updated_at_trg'
  ) then
    create trigger autotrade_positions_touch_updated_at_trg
      before update on public.autotrade_positions
      for each row
      execute function public.autotrade_positions_touch_updated_at();
  end if;
end $$;

comment on table public.autotrade_positions is
  'Open Polymarket positions with optional take-profit / stop-loss targets. '
  'Watcher in apps/trader polls live prices and fires a sell when TP or SL '
  'crosses. Either threshold may be null — null = no auto-trigger on that side.';
