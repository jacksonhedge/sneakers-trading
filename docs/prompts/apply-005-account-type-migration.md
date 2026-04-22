# Chrome prompt — apply migration 005 (account_type + plan_tier)

Adds three columns to the `waitlist` table that the new signup form + admin UI rely on:

- `account_type` — `individual` (default) or `business`, captured at signup
- `company_name` — optional, populated when user picks Business
- `plan_tier` — `free` (default) / `pro` / `elite` / `business`; admin-writable source of truth for subscription level

Until this migration runs on production Supabase, the landing page signup form will silently fail to persist the Business selection and the admin `/admin/users` table will error loading user data.

---

Task: apply migration `005_account_type.sql` to the Sneakers Terminal Supabase project.

Prerequisites:
- Logged into supabase.com with access to project **ujfgtkebslesepbjrhyr**

---

## Step 1 — Open the SQL editor

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/sql/new
2. Screenshot the empty editor.

---

## Step 2 — Paste the migration SQL

Paste this entire block (verbatim, including comments) into the editor:

```sql
-- 005_account_type.sql
-- Adds account-type + company metadata so users can self-identify as
-- individual vs business at signup, and so admins can segment the waitlist.
-- Also introduces `plan_tier` as the server-side source of truth for the
-- user's subscription level (Free | Pro | Elite | Business) — currently
-- only written by the admin UI; the client-side localStorage tier picker
-- at /dashboard/billing stays in place until Stripe integration lands.

alter table public.waitlist
  add column if not exists account_type  text
    check (account_type in ('individual', 'business'))
    default 'individual',
  add column if not exists company_name  text,
  add column if not exists plan_tier     text
    check (plan_tier in ('free', 'pro', 'elite', 'business'))
    default 'free';

create index if not exists waitlist_account_type_idx
  on public.waitlist (account_type);
create index if not exists waitlist_plan_tier_idx
  on public.waitlist (plan_tier);

comment on column public.waitlist.account_type is
  'individual or business; captured at signup on the landing page form.';
comment on column public.waitlist.company_name is
  'Company name — only populated when account_type = business.';
comment on column public.waitlist.plan_tier is
  'Subscription tier. Server-side truth for admin visibility; user-facing '
  'selection at /dashboard/billing still localStorage until Stripe wires up.';
```

---

## Step 3 — Run it

1. Click **Run** (bottom-right).
2. Expected: "Success. No rows returned."
3. Screenshot the result panel.

---

## Step 4 — Verify via Table Editor

1. Go to https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/editor
2. Click the **waitlist** table in the left sidebar.
3. Scroll the column list to the right. You should see three new columns: `account_type`, `company_name`, `plan_tier`.
4. Spot-check any existing row: `account_type` should be `individual`, `plan_tier` should be `free` (the migration backfills defaults).
5. Screenshot the table showing the new columns + an existing row's values.

---

## Step 5 — Report

Summarize:
- "Success. No rows returned." confirmed from Step 3
- Screenshot of the table confirming all three new columns exist
- Any errors if the migration didn't run cleanly (copy the full error message)

Don't touch any other tables or run any queries beyond what's in Step 2. If the SQL fails with a "column already exists" warning, that's fine — the `if not exists` clause is idempotent.
