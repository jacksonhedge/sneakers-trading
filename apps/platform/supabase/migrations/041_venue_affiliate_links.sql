-- Venue affiliate links.
--
-- Lets ops manage the per-venue sign-up URL (and an optional promo
-- code) from /admin/affiliates without redeploying. Backs the Crypto
-- Horse Race join modal's "Sign up via Sneakers" card.
--
-- Reader: lib/venue-affiliate-links.ts -> getAllVenueAffiliateLinks()
-- merges the rows here with hardcoded UI defaults (name, identifier
-- label, etc.) so editing only the URL/code is enough.
--
-- Audit: every upsert writes to admin_audit_events via the server
-- action so we know who changed what when.
--
-- Notes:
--   - venue is the primary key. Five hardcoded enum values for now
--     (polymarket / limitless / og / hyperliquid / kalshi). New
--     venues require a code change anyway (UI labels, validators).
--   - promo_code is nullable — most venues bake the ref into the URL.
--     When set, the join modal surfaces it as a small chip ("Use code
--     XYZ at checkout") for venues whose flow needs the code entered
--     during signup.

create table if not exists public.venue_affiliate_links (
  venue text primary key,
  signup_url text not null,
  promo_code text null,
  updated_at timestamptz not null default now(),
  updated_by text null
);

alter table public.venue_affiliate_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_affiliate_links'
      and policyname = 'venue_affiliate_links_deny_public'
  ) then
    create policy venue_affiliate_links_deny_public
      on public.venue_affiliate_links
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

create or replace function public.venue_affiliate_links_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists venue_affiliate_links_touch_updated_at
  on public.venue_affiliate_links;
create trigger venue_affiliate_links_touch_updated_at
  before update on public.venue_affiliate_links
  for each row
  execute function public.venue_affiliate_links_touch_updated_at();

comment on table public.venue_affiliate_links is
  'Per-venue affiliate sign-up URL + optional promo code, editable from /admin/affiliates. Read via lib/venue-affiliate-links.ts -> getAllVenueAffiliateLinks(). Writes audited.';
