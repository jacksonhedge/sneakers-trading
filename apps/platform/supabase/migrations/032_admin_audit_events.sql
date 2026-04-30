-- Admin audit log.
--
-- Immutable append-only record of every admin write action: who did it,
-- what they did, to whom (or what), and any action-specific payload. Rows
-- are inserted from server actions (grantAccessAction, issueInviteAction,
-- revokeInviteAction, future trading + billing actions) via
-- lib/admin-audit.ts → logAdminAction().
--
-- Why this matters:
--   1. Operator accountability — when something looks wrong on a user's
--      row, we need to know whether ops or signup created the state.
--   2. Forensic — if a code is used unexpectedly we can trace back to
--      who issued it and when.
--   3. Future regulatory readiness — CFTC-regulated prediction-market
--      operators are required to maintain timestamped, immutable audit
--      trails of every operator-initiated action. We're not regulated
--      today, but building the table now is far cheaper than adding it
--      later when the rows already happened.
--
-- Design:
--   - actor_email is the canonical key (admin emails are stable; ids may
--     not be set if action runs without a Supabase session somehow).
--   - target_email is the most common target shape; for non-user targets
--     (system actions, market actions later), target_kind disambiguates
--     and target_email may be null with target_id used instead.
--   - metadata jsonb captures action-specific detail (issued code,
--     previous state, force flag, etc).
--   - No foreign keys to auth.users / waitlist — emails are deliberately
--     plain text so the audit row survives if the underlying user is
--     deleted. That's an audit-log invariant: the trail outlives the
--     records.

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  actor_email text not null,
  actor_id uuid null,
  action text not null,
  target_kind text not null default 'user',
  target_email text null,
  target_id text null,
  metadata jsonb null,
  ip text null,
  user_agent text null
);

-- Recent-events feed (the /admin/audit page's main query).
create index if not exists admin_audit_events_ts_desc_idx
  on public.admin_audit_events (ts desc);

-- Per-actor history.
create index if not exists admin_audit_events_actor_ts_idx
  on public.admin_audit_events (actor_email, ts desc);

-- Per-target history (drives the per-user activity timeline on
-- /admin/users/<id>).
create index if not exists admin_audit_events_target_ts_idx
  on public.admin_audit_events (target_email, ts desc)
  where target_email is not null;

-- Per-action funnel (e.g. "show me every grant_access in the last 7d").
create index if not exists admin_audit_events_action_ts_idx
  on public.admin_audit_events (action, ts desc);

-- RLS: nothing flows through anon/authed clients. Inserts + reads happen
-- via the service-role client (server actions for inserts, admin pages
-- for reads). Service role bypasses RLS entirely.
alter table public.admin_audit_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_audit_events'
      and policyname = 'admin_audit_events_deny_public'
  ) then
    create policy admin_audit_events_deny_public
      on public.admin_audit_events
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

comment on table public.admin_audit_events is
  'Immutable admin action log. Insert via lib/admin-audit.ts → logAdminAction(); read via /admin/audit and /admin/users/<id>. Never UPDATE or DELETE rows by hand.';
