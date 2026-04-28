-- Rate-limit bucket table. One row per request that's been counted; the
-- helper in lib/rate-limit.ts counts rows for a key inside a sliding
-- window and rejects when the count reaches the threshold.
--
-- Service-role-only — RLS denies anon + authenticated by default. Keeps
-- the table from being readable / writable via the anon Supabase client.

create table if not exists public.rate_limit_buckets (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  created_at timestamptz not null default now()
);

-- Lookups are always (key, created_at >= now() - window). Composite index
-- on those columns makes the count scan cheap even at high row counts.
create index if not exists rate_limit_buckets_key_time_idx
  on public.rate_limit_buckets (key, created_at desc);

-- TTL helper — anything older than 24h has rolled out of even the
-- longest reasonable window. A daily cron (or pg_cron) deletes them so
-- the table doesn't grow unbounded. Manual prune for now:
--   delete from public.rate_limit_buckets where created_at < now() - interval '24 hours';

alter table public.rate_limit_buckets enable row level security;

-- No policies → deny-all for anon + authenticated. Service role bypasses
-- RLS so the API routes that own this table still work.
