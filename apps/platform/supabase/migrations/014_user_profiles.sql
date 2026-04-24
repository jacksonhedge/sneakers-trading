-- 014_user_profiles.sql
-- Onboarding V2 schema: per-user profile collected during /onboarding.
-- Keyed on auth.users.id. RLS-protected so each user only sees/writes their own.

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- step 1: /about-you
  state text,
  use_case text check (use_case in ('hobbyist', 'semi_pro', 'arb_hunter', 'analyst')),

  -- step 2: /platforms
  platforms_connected text[] not null default '{}',

  -- step 3: /invite-friends
  invites_sent_emails text[] not null default '{}',

  -- step 4: /location-check
  geo_ip_country text,
  geo_ip_state text,
  geo_lat numeric,
  geo_lng numeric,
  geo_matches_claim boolean,

  -- bookkeeping
  current_step text,
  profile_complete_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profiles_complete_idx
  on public.user_profiles (profile_complete_at)
  where profile_complete_at is not null;

alter table public.user_profiles enable row level security;

create policy user_profiles_select_own on public.user_profiles
  for select to authenticated using (auth.uid() = user_id);

create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated with check (auth.uid() = user_id);

create policy user_profiles_update_own on public.user_profiles
  for update to authenticated using (auth.uid() = user_id);

create or replace function public.tg_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

create trigger user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.tg_user_profiles_updated_at();
