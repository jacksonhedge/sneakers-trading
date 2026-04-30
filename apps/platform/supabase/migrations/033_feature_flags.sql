-- Feature flags.
--
-- Lets ops toggle behavior at runtime without redeploying. Today's
-- /admin/signup-config is a read-only mirror of env vars (which require
-- a Vercel env edit + redeploy to change). This table backs a writable
-- /admin/flags page where boolean flags can be flipped live.
--
-- Reader pattern: lib/feature-flags.ts → getFlag(key, defaultValue) reads
-- this table first, falls back to defaultValue (which can be sourced from
-- env if needed). New flags use this table; existing env-driven flags
-- can stay env-driven until/unless someone wants to migrate them.
--
-- Audit: every flip writes to admin_audit_events via the server action
-- so we know who toggled what when.
--
-- Notes:
--   - boolean-only for v1. If we need string/json values later, add a
--     second table or extend this one with a value_text/value_json column.
--   - description is operator-facing — what does this flag DO. Surface
--     in the UI so toggling without context is harder.

create table if not exists public.feature_flags (
  key text primary key,
  value_bool boolean not null default false,
  description text null,
  updated_at timestamptz not null default now(),
  updated_by text null
);

-- RLS: admins read+write via service role. No anon/authed access.
alter table public.feature_flags enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feature_flags'
      and policyname = 'feature_flags_deny_public'
  ) then
    create policy feature_flags_deny_public
      on public.feature_flags
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

-- Updated_at auto-touch on writes. Saves the action code from setting it
-- manually; admin_audit_events still gets the actor email separately.
create or replace function public.feature_flags_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists feature_flags_touch_updated_at on public.feature_flags;
create trigger feature_flags_touch_updated_at
  before update on public.feature_flags
  for each row
  execute function public.feature_flags_touch_updated_at();

comment on table public.feature_flags is
  'Boolean feature flags togglable from /admin/flags. Read via lib/feature-flags.ts -> getFlag(); write via the server action with audit logging.';
