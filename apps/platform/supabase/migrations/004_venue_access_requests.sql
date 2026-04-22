-- Venue early-access requests: users click "Request early access" on a venue
-- card; we record email + venue_id so we can (a) rank which venues to prioritize
-- scraping/integrating, (b) email them when that venue goes live.
create table if not exists public.venue_access_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  venue_id    text not null,
  source      text,
  referrer    text,
  ip_country  text,
  created_at  timestamptz not null default now(),
  unique (email, venue_id)
);

create index if not exists venue_access_requests_venue_idx
  on public.venue_access_requests (venue_id, created_at desc);

create index if not exists venue_access_requests_created_at_idx
  on public.venue_access_requests (created_at desc);

-- RLS: nobody reads via anon. Inserts via service-role server endpoint only.
alter table public.venue_access_requests enable row level security;
