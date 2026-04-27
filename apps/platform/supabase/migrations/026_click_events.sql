-- Click tracking events table.
--
-- Captures user-driven events from the app: page views, button clicks,
-- filter selections, market views, trade-intent signals, etc. The intent
-- is a single firehose-style table that the admin analytics views can slice
-- by event_name / page / user / session.
--
-- Design choices:
--   - `event_name` is freeform string (not enum) so new events ship without
--     a migration. The /admin/clicks UI lists distinct names from the data.
--   - `metadata` is jsonb for arbitrary per-event props (e.g. for a
--     market_view: { platform, market_id, asset, strike }).
--   - `user_id` is NULLABLE — we track anonymous traffic too. Auth-required
--     events filter on user_id IS NOT NULL at query time.
--   - `session_id` is opaque client-generated (cuid/uuid in sessionStorage),
--     groups a single browser session even if the user signs in mid-session.
--   - RLS denies public reads/writes. Inserts go through the service-role
--     client in /api/track (which validates + rate-limits server-side). The
--     /admin/clicks page reads via service-role too.

create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  user_id uuid null references auth.users (id) on delete set null,
  session_id text null,
  event_name text not null,
  page text null,
  target text null,
  metadata jsonb null,
  referrer text null,
  user_agent text null,
  ip_country text null
);

-- Recent-events feed: most common query.
create index if not exists click_events_ts_desc_idx
  on public.click_events (ts desc);

-- Top events by name in a window.
create index if not exists click_events_name_ts_idx
  on public.click_events (event_name, ts desc);

-- Per-user trace (for admin lookup).
create index if not exists click_events_user_ts_idx
  on public.click_events (user_id, ts desc)
  where user_id is not null;

-- Per-page funnels.
create index if not exists click_events_page_ts_idx
  on public.click_events (page, ts desc)
  where page is not null;

-- Per-session timeline (rare but useful for debugging individual sessions).
create index if not exists click_events_session_ts_idx
  on public.click_events (session_id, ts desc)
  where session_id is not null;

-- RLS: nothing flows through anon/authed clients directly. All reads + writes
-- go via /api/track (insert) and /admin/clicks (read), both of which use
-- the service-role client. Service role bypasses RLS entirely.
alter table public.click_events enable row level security;

-- Explicit deny-all policy for clarity. (RLS-enabled tables with no policies
-- already deny everything to non-service-role; adding a named policy makes
-- intent obvious to anyone reading the schema.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'click_events'
      and policyname = 'click_events_deny_public'
  ) then
    create policy click_events_deny_public
      on public.click_events
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

-- Reasonable retention guardrail: 90-day rows, after that vacuum out.
-- This is a comment, not enforced — add a scheduled job if/when volume
-- warrants. At 1k events/day the table stays tiny for years.
comment on table public.click_events is
  'Click + page-view events. Insert via /api/track (service-role); read via /admin/clicks. ~90-day retention recommended.';
