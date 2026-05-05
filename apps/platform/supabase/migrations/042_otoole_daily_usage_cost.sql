-- Adds a per-day cost column to otoole_daily_usage so the API route
-- can enforce a $/day cap on Sneakers' shared key (in addition to the
-- existing message-count cap from migration 008).
--
-- Why a separate column instead of computing from token_input/output:
--   - Tokens lump together across models. A user's day might mix Haiku
--     ($1/$5 per MTok) and Sonnet ($3/$15) calls. Computing $/day from
--     totals alone would need per-model token splits, which we don't track.
--   - This column accumulates dollars at write-time using the model that
--     was actually billed for that request, so the value is already
--     model-aware and can be summed/compared directly.
--
-- Backfill: existing rows get cost_usd_total = 0. The cap will treat
-- those rows as "no cost spent today", which is correct for migration
-- day (the user's history of billed messages stays uncounted, but we're
-- not retroactively charging — only forward enforcement).

alter table public.otoole_daily_usage
  add column if not exists cost_usd_total numeric(10, 4) not null default 0;

comment on column public.otoole_daily_usage.cost_usd_total is
  'Cumulative USD cost for the day on Sneakers shared key (BYO-key requests do not increment). Written by lib/otoole-usage.ts -> incrementAndGetCount with the per-request cost from estimateRequestCostUsd.';
