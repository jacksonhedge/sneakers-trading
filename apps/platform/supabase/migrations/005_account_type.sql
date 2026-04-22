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
