-- Phase 1A — O'Toole as strategy scaffold.
--
-- Two changes that let O'Toole help users build trading strategies WITHOUT
-- yet touching real money or wallets:
--
-- 1. `alert_rules.created_by` — distinguishes hand-built rules from
--    AI-managed ones. O'Toole only mutates rules where created_by='otoole'
--    OR rules the user explicitly hands to it via rule_id. Defaults to
--    'user' so existing rows are protected and the API stays compatible.
--
-- 2. `trade_drafts` — O'Toole's `propose_trade` tool writes here. Each row
--    is a structured TradeIntent (market, side, size, max_price, rationale)
--    that the dashboard renders with confirm/cancel. NO order is placed
--    until the user explicitly confirms — execution lives in Phase 1B+.
--
-- Idempotent. Re-runs safely.

-- ── 1. created_by column on alert_rules ────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='alert_rules')
     and not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='alert_rules' and column_name='created_by'
     ) then
    execute $sql$
      alter table public.alert_rules
        add column created_by text not null default 'user'
        check (created_by in ('user', 'otoole'))
    $sql$;
  end if;
end $$;

create index if not exists alert_rules_created_by_idx
  on public.alert_rules (user_id, created_by);

comment on column public.alert_rules.created_by is
  'Origin of the rule: ''user'' (hand-built via UI) or ''otoole'' (AI-managed). '
  'O''Toole tools only mutate rules where this is ''otoole'' OR the user '
  'explicitly hands a rule_id to update_alert_rule.';

-- ── 2. trade_drafts table ──────────────────────────────────────────────
-- One row per O'Toole-proposed trade. The dashboard reads pending drafts
-- and renders them as cards with Confirm / Cancel / Edit buttons. Confirm
-- → execution router (Phase 1C); Cancel → status='cancelled'. Audit trail
-- of every proposal stays in this table even after the draft resolves.

create table if not exists public.trade_drafts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.waitlist(id) on delete cascade,
  -- The proposing source. 'otoole' for now; future: 'rule', 'scanner', 'manual'.
  proposed_by     text not null default 'otoole'
                  check (proposed_by in ('otoole', 'rule', 'scanner', 'manual')),
  -- Rule that triggered this proposal, if applicable. Null when O'Toole
  -- proposed cold-started or based on a chat message.
  source_rule_id  uuid null references public.alert_rules(id) on delete set null,
  -- Pin to a specific market — composite key from any scraper.
  platform        text not null,
  platform_market_id text not null,
  outcome_name    text not null,
  -- 'buy' or 'sell'; size is in USD-equivalent dollars (UI converts to
  -- shares using the live price). max_price is the limit ceiling — the
  -- execution router won't fill above it. side+max_price together protect
  -- against slippage when this draft eventually fires.
  side            text not null check (side in ('buy', 'sell')),
  size_usd        numeric(12, 2) not null check (size_usd > 0 and size_usd <= 10000),
  max_price       numeric(6, 5) not null check (max_price > 0 and max_price <= 1),
  -- Reasoning attached to the draft so the user can audit why O'Toole
  -- proposed it (e.g. "Cross-book arb edge 3.2pp; OG cheaper on YES").
  rationale       text,
  -- Lifecycle. 'pending' until user acts; 'confirmed' once they hit
  -- Confirm and the execution router takes over; 'cancelled' on dismiss
  -- or expiry; 'expired' if stale (older than ttl_minutes since created_at).
  status          text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  ttl_minutes     int not null default 15 check (ttl_minutes between 1 and 60),
  -- Set when status flips to 'confirmed' — points at the trades table row
  -- the execution router creates. Null until then.
  trade_id        uuid null,
  -- Free-form context for what O'Toole was looking at when it proposed.
  -- Lets the audit trail capture e.g. recent prices, edge magnitude, etc.
  metadata        jsonb null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz null
);

create index if not exists trade_drafts_user_status_idx
  on public.trade_drafts (user_id, status, created_at desc);
create index if not exists trade_drafts_pending_ttl_idx
  on public.trade_drafts (created_at)
  where status = 'pending';

-- RLS: deny public access. Service-role inserts (from /api/otoole/chat tool
-- exec) and reads (from the dashboard server component) bypass.
alter table public.trade_drafts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='trade_drafts'
      and policyname='trade_drafts_deny_public'
  ) then
    create policy trade_drafts_deny_public
      on public.trade_drafts
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

comment on table public.trade_drafts is
  'O''Toole-proposed trades pending user confirmation. Inserts via /api/otoole/chat '
  'propose_trade tool. UI renders pending rows as confirm/cancel cards. NO order '
  'placement happens here — that''s the execution router (Phase 1B+).';
