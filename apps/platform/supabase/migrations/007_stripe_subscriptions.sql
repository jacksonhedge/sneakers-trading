-- 007_stripe_subscriptions.sql
-- Wires Stripe as the source of truth for waitlist.plan_tier (introduced in
-- migration 005) by attaching the customer + subscription identifiers Stripe
-- gives us, the live status, and per-subscription metadata.
--
-- Design choices:
--   - One subscription per user. Multiple concurrent subscriptions are not a
--     v1 model, so columns live on `waitlist` rather than a separate table.
--     If/when team seats or multiple plans per user become a thing, peel
--     this into its own table.
--   - business_subtype distinguishes Fraternity (cheaper, 30 seats, same
--     features) from standard Business. Treated as a "flavor" of the
--     business tier — access control treats them the same; only seat limits
--     and pricing differ.
--   - subscription_status mirrors Stripe's lifecycle. requireTier collapses
--     anything not in (active, trialing) back to free regardless of
--     plan_tier, so a past_due user loses access immediately.
--   - cancel-at-period-end is recorded so the UI can show "ending DD-MM" and
--     so we don't accidentally treat a scheduled-cancel user as already
--     downgraded.

alter table public.waitlist
  add column if not exists stripe_customer_id     text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists subscription_status    text
    check (subscription_status in (
      'active','trialing','past_due','canceled',
      'incomplete','incomplete_expired','unpaid','paused'
    )),
  add column if not exists subscription_current_period_end    timestamptz,
  add column if not exists subscription_cancel_at_period_end  boolean not null default false,
  add column if not exists subscription_price_id  text,
  add column if not exists business_subtype       text
    check (business_subtype in ('standard','fraternity'));

create index if not exists waitlist_stripe_customer_id_idx
  on public.waitlist (stripe_customer_id);
create index if not exists waitlist_stripe_subscription_id_idx
  on public.waitlist (stripe_subscription_id);
create index if not exists waitlist_subscription_status_idx
  on public.waitlist (subscription_status);
create index if not exists waitlist_business_subtype_idx
  on public.waitlist (business_subtype)
  where business_subtype is not null;

comment on column public.waitlist.stripe_customer_id is
  'Stripe Customer ID (cus_...). One-to-one with waitlist row. Created on '
  'first Checkout Session and reused for all future subscriptions/invoices.';
comment on column public.waitlist.stripe_subscription_id is
  'Stripe Subscription ID (sub_...) of the active or most-recently-canceled '
  'subscription. Cleared by the webhook only on full deletion, never on '
  'cancel-at-period-end (we keep the row until the period actually ends).';
comment on column public.waitlist.subscription_status is
  'Mirrors Stripe subscription.status. requireTier treats anything outside '
  '(active, trialing) as effectively free regardless of plan_tier.';
comment on column public.waitlist.subscription_current_period_end is
  'Stripe subscription.current_period_end. Used to display "renews on DD-MM" '
  'and "access ends DD-MM" copy when cancel_at_period_end is true.';
comment on column public.waitlist.subscription_cancel_at_period_end is
  'True if the user has scheduled cancellation. Access remains until '
  'current_period_end; the webhook flips status to canceled at that boundary.';
comment on column public.waitlist.subscription_price_id is
  'Stripe Price ID currently subscribed to (price_...). Looked up against '
  'lib/subscriptions.ts to derive plan_tier and business_subtype on each '
  'webhook event — Stripe is the source of truth, this column is the cache.';
comment on column public.waitlist.business_subtype is
  'Sub-flavor when plan_tier = business: "standard" (10 seats, $299/mo) or '
  '"fraternity" (30 seats, $149/mo). NULL for non-business tiers; the '
  'partial index reflects that.';

-- Enterprise tier is not self-serve. Sales captures these inquiries and
-- quotes manually; no Stripe Customer or Subscription is created. The
-- contact form submits a row here whether or not the user is logged in
-- (waitlist_user_id is nullable for the public /pricing page form).
create table if not exists public.enterprise_inquiries (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  waitlist_user_id  uuid references public.waitlist(id) on delete set null,
  contact_name      text not null,
  contact_email     text not null,
  company_name      text,
  phone             text,
  use_case          text,
  volume_estimate   text,
  referral_source   text,
  status            text not null default 'new'
    check (status in ('new','contacted','qualified','negotiating','won','lost')),
  notes             text,
  assigned_to       text,
  quoted_amount_usd numeric(12,2),
  closed_at         timestamptz
);

create index if not exists enterprise_inquiries_status_idx
  on public.enterprise_inquiries (status);
create index if not exists enterprise_inquiries_created_at_idx
  on public.enterprise_inquiries (created_at desc);

comment on table public.enterprise_inquiries is
  'Contact-Sales submissions from the Enterprise column on /pricing and '
  '/dashboard/billing. Not a Stripe flow — sales follows up manually and '
  'invoices via Stripe Invoicing or wire when a deal closes.';
comment on column public.enterprise_inquiries.waitlist_user_id is
  'Nullable: public /pricing page lets non-signed-in users submit too.';

alter table public.enterprise_inquiries enable row level security;
-- No client-side select policy — admin reads via the service-role server
-- client at /admin/enterprise. Nobody else needs to read this table.
