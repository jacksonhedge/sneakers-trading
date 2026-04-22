-- Tracks O'Toole AI chat usage per user per day.
-- Supports the "daily charge / daily cap" model: free tier gets a tight cap,
-- Pro/Elite/Business get higher or unlimited caps. The cap itself is enforced
-- in application code (packages vary between tiers + add-ons); this table
-- is just the source of truth for "how many messages has this user sent
-- today?" so we can:
--   - enforce caps against free tier
--   - bill usage-based add-ons accurately
--   - show users their remaining allowance
--   - audit for abuse

create table if not exists public.otoole_daily_usage (
  user_id       uuid not null,
  usage_date    date not null default (now() at time zone 'utc')::date,
  message_count integer not null default 0,
  token_input   bigint not null default 0,
  token_output  bigint not null default 0,
  last_message_at timestamptz,
  primary key (user_id, usage_date)
);

create index if not exists otoole_daily_usage_date_idx
  on public.otoole_daily_usage (usage_date desc);

alter table public.otoole_daily_usage enable row level security;

-- Users can see their own usage rows.
create policy otoole_daily_usage_self_read on public.otoole_daily_usage
  for select using (auth.uid() = user_id);

-- Writes go through the service-role server only (the API route).
