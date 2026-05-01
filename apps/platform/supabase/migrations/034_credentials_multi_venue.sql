-- Open up user_venue_credentials beyond Polymarket and add a scope column.
--
-- Original migration 028 hard-coded `check (venue in ('polymarket'))`. Now
-- that the /api/balance aggregator is live and we're adding Kalshi + Opinion
-- adapters, the venue list belongs in lib/venues.ts (the catalog), not in a
-- DB constraint that requires a migration per new venue.
--
-- Scope: 'read' lets a user connect for balance visibility only (lower
-- trust ask). 'trade' is required to actually place orders. The autotrade
-- risk gates check this before signing anything.
--
-- Existing rows are backfilled to 'trade' — that's the only scope the old
-- form ever produced.
--
-- Idempotent.

alter table public.user_venue_credentials
  drop constraint if exists user_venue_credentials_venue_check;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_venue_credentials'
      and column_name = 'scope'
  ) then
    alter table public.user_venue_credentials
      add column scope text not null default 'trade'
        check (scope in ('read', 'trade'));
  end if;
end $$;

comment on column public.user_venue_credentials.scope is
  'Trust level granted by the user. ''read'' = balance/positions visibility only. '
  '''trade'' = sign + place orders. Autotrade gates require ''trade''.';
