create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  source      text,
  referrer    text,
  ip_country  text,
  created_at  timestamptz not null default now()
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);

-- Row-level security: nobody can read waitlist via anon key.
-- Inserts happen server-side via service role key.
alter table public.waitlist enable row level security;
