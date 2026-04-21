# Chrome prompt — Apply migration 003_invites.sql

Applies the admin access-code schema + RLS policy for authenticated user reads. Must run before the `/signup` and `/dashboard` routes ship.

---

Task: apply migration 003_invites.sql to the Sneakers Terminal Supabase project via the dashboard SQL editor.

Prerequisites:
- Logged into supabase.com
- Project ref: ujfgtkebslesepbjrhyr

Step 1 — navigate
Go to: https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/sql/new

Step 2 — paste this SQL into the editor

```sql
-- 003_invites.sql
-- Admin-issued single-use access codes + RLS policy for authenticated users.

alter table public.waitlist
  add column if not exists invite_code     text unique,
  add column if not exists invited_at      timestamptz,
  add column if not exists invite_used_at  timestamptz;

create index if not exists waitlist_invite_code_idx
  on public.waitlist (invite_code)
  where invite_code is not null;

drop policy if exists waitlist_select_own on public.waitlist;
create policy waitlist_select_own on public.waitlist
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = email);
```

Step 3 — click Run (Cmd+Enter).

Step 4 — verify
- Result panel: "Success. No rows returned."
- Table Editor → public → waitlist: three new columns present (invite_code text, invited_at timestamptz, invite_used_at timestamptz)
- Authentication → Policies → waitlist: a policy "waitlist_select_own" exists, SELECT action, to authenticated role.

Step 5 — report back
- Confirm success (screenshot the result panel)
- Screenshot the new policies list showing waitlist_select_own
- If any error, paste the verbatim text before retrying

Do NOT:
- Modify any other policy
- Run any other SQL
- Touch RLS on other tables

If the migration errors and mentions "column already exists" that's fine (the `if not exists` guards handle re-runs). Any other error, stop and paste it to me.
