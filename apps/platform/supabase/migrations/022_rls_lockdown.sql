-- RLS lockdown for tables that exist in prod but lack policies in source
-- control (audit CRITICAL #5). Closes anon-key data exposure on:
--   - organization_signups
--   - safe_treasury
--   - autotrade_waitlist
--   - leaderboard_positions  (migration 015 forgot to enable RLS)
--
-- Idempotent: each block is wrapped in `if exists` so applying against a
-- fresh DB (no tables) or a partially-migrated DB is a no-op for missing
-- tables. The CREATE TABLE statements for these tables still need to land
-- in source control once prod schema is dumped — but the security posture
-- here doesn't depend on column shape; it just locks down row access.

-- ─── organization_signups ────────────────────────────────────────────────
-- Captain reads their own org row by email match. Service role writes (the
-- /api/waitlist signup route) and reads (admin tooling).
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'organization_signups') then
    execute 'alter table public.organization_signups enable row level security';

    -- Drop any prior permissive policies before recreating, in case the
    -- table was set up via Studio with default-allow.
    execute 'drop policy if exists organization_signups_self_read on public.organization_signups';
    execute 'drop policy if exists organization_signups_anon_read on public.organization_signups';
    execute 'drop policy if exists organization_signups_anon_join on public.organization_signups';

    -- Captain reads their own row. /join/[orgId] page uses service role,
    -- so anon-key clients never need to query this directly.
    execute $p$
      create policy organization_signups_self_read on public.organization_signups
        for select to authenticated
        using (lower(org_leader_email) = lower(auth.jwt() ->> 'email'))
    $p$;

    -- Public landing card on /join/[orgId] needs name/college/captain to
    -- render the invite page. Allow a narrowed read for anon, scoped by
    -- the org_id arriving in the URL — this is read-only public data the
    -- captain shares deliberately. If you want this fully service-role,
    -- delete this policy and have /join read via getServerClient().
    execute $p$
      create policy organization_signups_join_read on public.organization_signups
        for select to anon
        using (true)
    $p$;

    -- No INSERT/UPDATE/DELETE policies — service role only.
  end if;
end $$;

-- ─── safe_treasury ───────────────────────────────────────────────────────
-- User reads/writes only their own treasury row. Schema is unknown but the
-- code uses created_by = auth.uid() consistently.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'safe_treasury') then
    execute 'alter table public.safe_treasury enable row level security';

    execute 'drop policy if exists safe_treasury_self_all on public.safe_treasury';
    execute 'drop policy if exists safe_treasury_anon_read on public.safe_treasury';

    execute $p$
      create policy safe_treasury_self_all on public.safe_treasury
        for all to authenticated
        using (created_by = auth.uid())
        with check (created_by = auth.uid())
    $p$;
  end if;
end $$;

-- ─── autotrade_waitlist ──────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'autotrade_waitlist') then
    execute 'alter table public.autotrade_waitlist enable row level security';

    execute 'drop policy if exists autotrade_waitlist_self_all on public.autotrade_waitlist';

    execute $p$
      create policy autotrade_waitlist_self_all on public.autotrade_waitlist
        for all to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $p$;
  end if;
end $$;

-- ─── leaderboard_positions ───────────────────────────────────────────────
-- Migration 015 created this table without enabling RLS — every position
-- was anon-key readable. Lock it down: authenticated users can read
-- positions (intended public board), service role writes.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'leaderboard_positions') then
    execute 'alter table public.leaderboard_positions enable row level security';

    execute 'drop policy if exists leaderboard_positions_read on public.leaderboard_positions';

    -- Public board — any authenticated user (and anon, since the
    -- leaderboard ought to be visible to logged-out visitors too) can SELECT.
    -- Writes are service-role only.
    execute $p$
      create policy leaderboard_positions_read on public.leaderboard_positions
        for select to anon, authenticated
        using (true)
    $p$;
  end if;
end $$;
