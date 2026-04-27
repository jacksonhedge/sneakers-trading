# Chrome prompt — apply migration 026 (click_events table)

Adds the `click_events` table that backs `/admin/clicks`, `/api/track`, and the auto page-view tracker mounted in the root layout. Until this migration runs on Supabase, hitting any tracked button or visiting any page will silently fail to record (the `/api/track` endpoint returns 200 but logs an `insert_failed` warning server-side), and `/admin/clicks` will render with a "relation click_events does not exist" error message.

The migration is idempotent (uses `if not exists` everywhere) so re-running is safe.

---

Task: apply migration `026_click_events.sql` to the Sneakers Terminal Supabase project.

Prerequisites:
- Logged into supabase.com with access to project **ujfgtkebslesepbjrhyr**

---

## Step 1 — Open the SQL editor

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/sql/new
2. Confirm you're in the right project (the breadcrumb should read "Sneakers Terminal" or similar). Screenshot the empty editor.

## Step 2 — Paste the migration SQL

The full migration is at `apps/platform/supabase/migrations/026_click_events.sql`. The user will paste it. After pasting, confirm:

- The first non-blank line is `create table if not exists public.click_events (`
- The last block is the `comment on table public.click_events is ...` line
- No SQL syntax highlighting errors visible

## Step 3 — Run the migration

1. Click the green **Run** button (or `Cmd+Enter`).
2. Expected output: `Success. No rows returned.` in the result panel below.
3. If there's a red error: screenshot it and STOP. Common possibilities:
   - `permission denied for schema auth` → the FK to `auth.users` is failing because the project lacks the auth schema (it shouldn't — that's standard Supabase). Tell the user.
   - `relation "click_events" already exists` → the migration partially applied previously. The `if not exists` guards should prevent this error specifically, but if you see it the table already exists; STOP and report success.

## Step 4 — Verify the table exists

Open a new SQL query (or replace the editor contents) and run:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'click_events'
order by ordinal_position;
```

Expected: 11 rows — `id, ts, user_id, session_id, event_name, page, target, metadata, referrer, user_agent, ip_country`.

Then run:

```sql
select indexname from pg_indexes where tablename = 'click_events';
```

Expected: 6 indexes (1 primary key + 5 secondary indexes named `click_events_*`).

## Step 5 — Sanity-test an insert

```sql
insert into public.click_events (event_name, page, target, metadata)
values ('test_event', '/admin/clicks', 'manual-sql-test', '{"source":"sql-editor"}'::jsonb)
returning id, ts, event_name;
```

Expected: 1 row returned with the test_event. Then immediately:

```sql
delete from public.click_events where event_name = 'test_event';
```

(Cleanup so the admin view doesn't show the manual test row.)

## Step 6 — Verify RLS is on

```sql
select tablename, rowsecurity
from pg_tables
where tablename = 'click_events';
```

Expected: `rowsecurity = true`.

```sql
select policyname, cmd, roles, qual
from pg_policies
where tablename = 'click_events';
```

Expected: 1 row, `policyname = 'click_events_deny_public'` (or similar), restrictive policy denying anon + authenticated roles. The service-role key bypasses this entirely, so /api/track inserts and /admin/clicks reads still work.

---

## Final report

Return:

```
## Migration status
- Table created: yes / no
- Indexes (6 total): yes / no — list any missing
- RLS enabled: yes / no
- Deny-all policy present: yes / no
- Insert sanity test: yes / no
- Cleanup delete ran: yes / no

## Anything weird
(free-text)
```

---

## Boundaries

- DO NOT modify any other tables in the SQL editor — the migration only touches `public.click_events`.
- DO NOT skip the cleanup delete — leaving the test_event row will pollute the admin's recent-activity feed.
- If RLS isn't enabled at the end (rowsecurity = false): re-run the `alter table public.click_events enable row level security;` line specifically.
