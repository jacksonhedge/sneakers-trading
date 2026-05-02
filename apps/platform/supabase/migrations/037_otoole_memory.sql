-- O'Toole per-user memory + insight sources.
--
-- The strategy/memory model: O'Toole is a generalized trading bot. Each user
-- shapes it with their own strategy notes ("how I trade") + a list of pasted
-- insight snippets (a tweet text, a GitHub README excerpt, an article
-- paragraph). v1 is paste-only — no URL fetching, no Twitter API. Source
-- snippets get attached to the system prompt at chat time, optionally
-- filtered to only fire when the user's message touches a matching market
-- keyword.
--
-- TWO tables:
--   user_otoole_memory   — exactly one row per user. Free-text strategy.
--   user_otoole_sources  — many rows per user. One pasted snippet each.
--
-- RLS: users CRUD their own rows (no service-role indirection — there are
-- no secrets here, just text the user typed).
--
-- Idempotent.

create table if not exists public.user_otoole_memory (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  -- The "about me + how I trade" extension to O'Toole's system prompt.
  -- Soft-capped at 8 KB on the API write path; DB column is unbounded so
  -- we don't have to migrate the cap upward later.
  content     text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.user_otoole_memory enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_otoole_memory'
      and policyname = 'user_otoole_memory_self_all'
  ) then
    create policy user_otoole_memory_self_all on public.user_otoole_memory
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

create table if not exists public.user_otoole_sources (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Display kind only — drives the icon/group in the settings list. Doesn't
  -- change behavior. Add new kinds without a migration; UI tolerates unknown.
  kind           text not null default 'note'
                 check (kind in ('twitter', 'github', 'article', 'note')),
  label          text not null,
  content        text not null,
  -- Optional comma-separated keywords. If the user's chat message contains
  -- any of these (case-insensitive substring) the source fires. Empty/null
  -- = always fire. Keep it user-typed; no structured tag system in v1.
  market_filter  text,
  created_at     timestamptz not null default now()
);

create index if not exists user_otoole_sources_user_idx
  on public.user_otoole_sources (user_id, created_at desc);

alter table public.user_otoole_sources enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_otoole_sources'
      and policyname = 'user_otoole_sources_self_all'
  ) then
    create policy user_otoole_sources_self_all on public.user_otoole_sources
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

comment on table public.user_otoole_memory is
  'Per-user strategy text injected into O''Toole''s system prompt every chat turn.';
comment on table public.user_otoole_sources is
  'Per-user pasted insight snippets. Injected when user message matches market_filter keywords.';
