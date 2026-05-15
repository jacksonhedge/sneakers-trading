-- Phase 1B+ — take-profit / stop-loss on co-pilot proposals.
--
-- Adds two nullable price columns to trade_drafts so a proposal can
-- carry exit thresholds alongside the entry. When the draft executes
-- successfully (executeCopilotDraft), an autotrade_positions row is
-- opened with these values; the watcher then auto-sells when price
-- crosses either threshold.
--
-- Both columns are optional. A draft with neither set behaves exactly
-- like before (no position row created — user manages exit themselves).
--
-- Idempotent.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'trade_drafts')
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'trade_drafts'
         and column_name  = 'take_profit_price'
     ) then
    execute $sql$
      alter table public.trade_drafts
        add column take_profit_price numeric(8, 6) null
          check (take_profit_price is null
                 or (take_profit_price > 0 and take_profit_price <= 1))
    $sql$;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'trade_drafts')
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'trade_drafts'
         and column_name  = 'stop_loss_price'
     ) then
    execute $sql$
      alter table public.trade_drafts
        add column stop_loss_price numeric(8, 6) null
          check (stop_loss_price is null
                 or (stop_loss_price > 0 and stop_loss_price <= 1))
    $sql$;
  end if;
end $$;

comment on column public.trade_drafts.take_profit_price is
  'Optional take-profit threshold (0..1). When the buy fills, an autotrade_positions '
  'row is created with this TP; watcher auto-sells when current price >= TP.';
comment on column public.trade_drafts.stop_loss_price is
  'Optional stop-loss threshold (0..1). Watcher auto-sells when current price <= SL.';
