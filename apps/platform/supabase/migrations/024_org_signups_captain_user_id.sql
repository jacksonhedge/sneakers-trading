-- Captain identity by auth.users.id, not email (audit HIGH #6).
--
-- Why: persisting captaincy by email means an email change (user-initiated
-- or support-initiated) silently transfers control of every org tied to
-- the old address. Worse: any future support tooling that reassigns
-- emails between auth users would re-attribute orgs without the captain
-- following.
--
-- Add an org_leader_user_id column, backfill from auth.users by case-
-- insensitive email match, and update RLS to prefer the user_id check.
-- The org_leader_email column stays as a display + signup-form input;
-- it's no longer the source of truth for authz.

-- Add the column. Nullable until backfill completes for any pending-status
-- rows where the captain hasn't actually authed yet.
alter table public.organization_signups
  add column if not exists org_leader_user_id uuid;

create index if not exists organization_signups_leader_user_id_idx
  on public.organization_signups (org_leader_user_id)
  where org_leader_user_id is not null;

-- Backfill existing rows.
update public.organization_signups o
set org_leader_user_id = u.id
from auth.users u
where o.org_leader_user_id is null
  and lower(o.org_leader_email) = lower(u.email);

-- RLS: replace the email-based self_read policy (added in migration 022)
-- with a user_id-based one. Keep the email path as an OR so newly-signed-up
-- captains can still see their own pending row before the backfill UPDATE
-- in /api/auth/post-signin runs. Once that path ships and you confirm
-- every active row has a populated user_id, drop the email leg.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'organization_signups') then
    execute 'drop policy if exists organization_signups_self_read on public.organization_signups';

    execute $p$
      create policy organization_signups_self_read on public.organization_signups
        for select to authenticated
        using (
          org_leader_user_id = auth.uid()
          or (
            org_leader_user_id is null
            and lower(org_leader_email) = lower(auth.jwt() ->> 'email')
          )
        )
    $p$;
  end if;
end $$;
