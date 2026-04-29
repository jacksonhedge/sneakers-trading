-- Phase 1B — autotrade caps + kill switch.
--
-- Per-user risk controls for the O'Toole co-pilot. The execute endpoint
-- runs 5 gates before placing any order:
--   1. kill_switch_active is false
--   2. proposal size_usd <= per_trade_cap_usd
--   3. today's executed sum + size_usd <= daily_cap_usd
--   4. market snapshot fresh + phase != 'closed' + best_ask <= max_price
--   5. user has live Polymarket credentials + sufficient USDC balance
--
-- Defaults are deliberately conservative. The user can raise them via
-- /dashboard/settings/autotrade once they've watched the system place
-- a few trades and trust the rationale quality.
--
-- Idempotent.

create table if not exists public.autotrade_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  -- Single-trade ceiling. The execute endpoint refuses any draft larger.
  per_trade_cap_usd    numeric(10, 2) not null default 50
                       check (per_trade_cap_usd > 0 and per_trade_cap_usd <= 5000),
  -- Total $ that may be placed per UTC day. The execute endpoint sums
  -- today's filled + pending executions and refuses if the new draft
  -- would push past this.
  daily_cap_usd        numeric(10, 2) not null default 200
                       check (daily_cap_usd > 0 and daily_cap_usd <= 25000),
  -- Big red button. When true the execute endpoint short-circuits to
  -- 'rejected' on every draft. Setting this also cancels all pending
  -- drafts (handled by /api/otoole/kill-switch).
  kill_switch_active   boolean not null default false,
  kill_switch_reason   text,
  kill_switch_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.autotrade_settings enable row level security;

-- Users can read + update their own row. Writes go through API routes
-- so we still validate caps server-side, but allow client reads for the
-- settings page.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'autotrade_settings'
      and policyname = 'autotrade_settings_self_read'
  ) then
    create policy autotrade_settings_self_read on public.autotrade_settings
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

comment on table public.autotrade_settings is
  'Per-user risk controls for the O''Toole co-pilot. Execute endpoint enforces '
  'per_trade_cap_usd + daily_cap_usd + kill_switch_active before every order.';
