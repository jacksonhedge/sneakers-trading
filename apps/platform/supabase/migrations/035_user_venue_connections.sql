-- Per-user "I have an account at this venue" preferences.
--
-- This is what lib/connections.ts has been holding in localStorage:
-- which prediction markets / sportsbooks / DFS sites the user actually
-- uses. Moving it to Supabase so it syncs across web + iOS and so the
-- balance card / market filters / affiliate attribution can read it
-- server-side.
--
-- DISTINCT FROM user_venue_credentials:
--   - connections: "I have an account here" (boolean, user-asserted)
--   - credentials: "and here are my keys" (encrypted, server-validated)
-- Most users will sit in the connections-only state forever; a smaller
-- set will paste credentials so the balance / autotrade flows light up.
--
-- RLS: users can read + write their own rows directly. No secrets here,
-- so no need to route through a service-role API just to toggle a chip.
--
-- Idempotent.

create table if not exists public.user_venue_connections (
  user_id              uuid not null references auth.users(id) on delete cascade,
  venue                text not null,
  -- How we learned the user has this account. 'self_declared' = they
  -- toggled the chip without going through our affiliate. 'affiliate_click'
  -- = they clicked CONNECT which opened our affiliate signup link
  -- (revenue-bearing). 'oauth' reserved for future Coinbase-style flows.
  source               text not null default 'self_declared'
                       check (source in ('self_declared', 'affiliate_click', 'oauth')),
  -- Set when the user clicked our affiliate link, regardless of whether
  -- they actually completed signup. Used for attribution + nudges.
  affiliate_clicked_at timestamptz,
  connected_at         timestamptz not null default now(),
  primary key (user_id, venue)
);

create index if not exists user_venue_connections_user_idx
  on public.user_venue_connections (user_id);

alter table public.user_venue_connections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_venue_connections'
      and policyname = 'user_venue_connections_self_read'
  ) then
    create policy user_venue_connections_self_read on public.user_venue_connections
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_venue_connections'
      and policyname = 'user_venue_connections_self_insert'
  ) then
    create policy user_venue_connections_self_insert on public.user_venue_connections
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_venue_connections'
      and policyname = 'user_venue_connections_self_update'
  ) then
    create policy user_venue_connections_self_update on public.user_venue_connections
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_venue_connections'
      and policyname = 'user_venue_connections_self_delete'
  ) then
    create policy user_venue_connections_self_delete on public.user_venue_connections
      for delete to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

comment on table public.user_venue_connections is
  'Per-user list of venues the user claims to have an account at. '
  'Source-of-truth for the connections grid. Distinct from user_venue_credentials, '
  'which holds encrypted API keys for the subset of venues the user has wired up '
  'for balance/trading.';
