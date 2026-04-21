-- 003_invites.sql
-- Adds admin-issued single-use access codes that gate account creation,
-- plus an RLS policy letting authenticated users read their own waitlist
-- row. Referral codes (from 002) are separate and unrelated.

-- 1. Columns on waitlist.
--    invite_code: admin-generated 8-char code, unique, nullable until issued.
--    invited_at: when admin issued the code.
--    invite_used_at: when the holder successfully completed sign-in. Null
--      until that happens; non-null means the code is burned.
alter table public.waitlist
  add column if not exists invite_code     text unique,
  add column if not exists invited_at      timestamptz,
  add column if not exists invite_used_at  timestamptz;

create index if not exists waitlist_invite_code_idx
  on public.waitlist (invite_code)
  where invite_code is not null;

-- 2. RLS policy: authenticated users (Supabase Auth) can SELECT the waitlist
--    row whose email matches their JWT-claim email. This is how the dashboard
--    reads the signed-in user's queue position / referral counts.
--    Inserts and updates continue to happen through the service_role key
--    server-side and are not affected by this policy.
drop policy if exists waitlist_select_own on public.waitlist;
create policy waitlist_select_own on public.waitlist
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = email);
