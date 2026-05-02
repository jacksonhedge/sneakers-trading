-- O'Toole GLOBAL memory + insight sources.
--
-- Mirrors the per-user shape from migration 037, but at bot-wide scope.
-- Edited from /admin/otoole. At chat time the system prompt is built as:
--
--   OTOOLE_PERSONA
--     + global persona_addendum   (operator-level system-prompt extras)
--     + global content            (bot-wide knowledge / strategy baseline)
--     + per-user memory.content   (user's own "how I trade")
--     + per-user sources          (user-pasted snippets, keyword-filtered)
--     + global sources            (operator-pasted snippets, keyword-filtered)
--
-- TWO tables:
--   otoole_global_memory   — singleton row (id=1). Persona addendum + content.
--   otoole_global_sources  — many rows. Operator-curated snippets.
--
-- RLS: both tables enable RLS with NO policies for authenticated/anon, so all
-- non-service-role access is denied. The admin page reads/writes through the
-- service-role client (lib/supabase-server.ts → getServerClient). The chat
-- route reads through the same path. There are no per-user privileges to
-- enforce here — global memory is operator-only.
--
-- Idempotent.

create table if not exists public.otoole_global_memory (
  -- Singleton key. Hardcoded to 1; the check constraint forbids any other id.
  id                int primary key default 1,
  -- System-prompt-level instructions appended to OTOOLE_PERSONA. Put rules
  -- here ("default to longshots in 10–35¢ band when no market specified").
  persona_addendum  text not null default '',
  -- Long-form bot-wide knowledge / strategy baseline. Put facts/principles
  -- here ("Sneakers covers prediction markets + sportsbooks + DFS + sweeps;
  -- prefer prediction markets for binary contracts").
  content           text not null default '',
  -- Master switch. If false, neither persona_addendum nor content is
  -- injected — useful for a quick A/B or to disable a regression without
  -- losing the text.
  enabled           boolean not null default true,
  updated_at        timestamptz not null default now(),
  updated_by        text,
  constraint otoole_global_memory_singleton check (id = 1)
);

-- Seed the singleton so reads always return one row.
insert into public.otoole_global_memory (id) values (1)
  on conflict (id) do nothing;

alter table public.otoole_global_memory enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'otoole_global_memory'
      and policyname = 'otoole_global_memory_deny_public'
  ) then
    -- Restrictive policy that denies all anon + authenticated access.
    -- Service role bypasses RLS, so admin page + chat route still work.
    create policy otoole_global_memory_deny_public
      on public.otoole_global_memory
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

create or replace function public.otoole_global_memory_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists otoole_global_memory_touch_updated_at on public.otoole_global_memory;
create trigger otoole_global_memory_touch_updated_at
  before update on public.otoole_global_memory
  for each row
  execute function public.otoole_global_memory_touch_updated_at();

create table if not exists public.otoole_global_sources (
  id             bigserial primary key,
  -- Display kind only — drives the icon/group in the admin list. Doesn't
  -- change behavior. Add new kinds without a migration; UI tolerates unknown.
  kind           text not null default 'note'
                 check (kind in ('twitter', 'github', 'article', 'note')),
  label          text not null,
  content        text not null,
  -- Optional comma-separated keywords. If the user's chat message contains
  -- any of these (case-insensitive substring) the source fires. Empty/null
  -- = always fire.
  market_filter  text,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text
);

create index if not exists otoole_global_sources_created_idx
  on public.otoole_global_sources (created_at desc);

alter table public.otoole_global_sources enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'otoole_global_sources'
      and policyname = 'otoole_global_sources_deny_public'
  ) then
    create policy otoole_global_sources_deny_public
      on public.otoole_global_sources
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

create or replace function public.otoole_global_sources_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists otoole_global_sources_touch_updated_at on public.otoole_global_sources;
create trigger otoole_global_sources_touch_updated_at
  before update on public.otoole_global_sources
  for each row
  execute function public.otoole_global_sources_touch_updated_at();

comment on table public.otoole_global_memory is
  'Singleton (id=1) row holding O''Toole''s bot-wide persona addendum + memory text. Edited from /admin/otoole.';
comment on table public.otoole_global_sources is
  'Operator-curated insight snippets injected into every user''s O''Toole chat when the user message matches market_filter keywords.';
