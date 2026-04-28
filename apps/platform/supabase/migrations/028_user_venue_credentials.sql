-- Per-user venue trading credentials. Currently only Polymarket (CLOB
-- API key + secret + passphrase). Schema is multi-venue-ready via the
-- `venue` column so Kalshi / ProphetX / etc. can plug in later.
--
-- Credentials are AES-256-GCM encrypted at rest by lib/autotrade/credentials.ts
-- using the AUTOTRADE_CREDENTIAL_KEY env var. The plaintext NEVER lives in
-- the DB — what's stored here is base64(iv || ciphertext || authTag).
--
-- Service-role-only — RLS denies anon + authenticated. The user-facing
-- API routes (/api/autotrade/credentials, /api/trade/polymarket/place)
-- run with service-role and do their own user-id scoping in code.

create table if not exists public.user_venue_credentials (
  id                       bigserial primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  venue                    text not null check (venue in ('polymarket')),
  -- CLOB API auth trio — required for the request-channel auth.
  api_key_encrypted        text not null,
  api_secret_encrypted     text not null,
  passphrase_encrypted     text,
  -- Trading wallet private key — required to EIP-712-sign orders. Stored
  -- AES-GCM encrypted alongside the API creds. Risk: anyone with both
  -- AUTOTRADE_CREDENTIAL_KEY (env) and DB access can drain the funded
  -- wallet. Mitigations: dedicated trading wallet (not the user's main
  -- holdings), short-rotation key material, future move to relayer-based
  -- signing once Polymarket exposes it.
  private_key_encrypted    text,
  -- Funder address — Polymarket SDK needs this to know which on-chain
  -- account the orders settle against.
  funder_address           text,
  label                    text,
  test_connection_ok       boolean not null default false,
  test_connection_at       timestamptz,
  created_at               timestamptz not null default now(),
  last_used_at             timestamptz,
  unique (user_id, venue)
);

create index if not exists user_venue_credentials_user_idx
  on public.user_venue_credentials (user_id);

alter table public.user_venue_credentials enable row level security;

-- No policies — anon + authenticated denied. Service role bypasses RLS.

-- Audit log of placed orders (manual + future auto-trade). Append-only;
-- no update or delete policies. The handoff brief's auto_trade_log is
-- a superset of this; we'll fold them together when auto-trade lands.
create table if not exists public.trade_executions (
  id                bigserial primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  venue             text not null,
  market_id         text not null,
  side              text not null check (side in ('buy', 'sell')),
  outcome           text not null,
  size_usd          numeric(12, 2) not null,
  order_type        text not null default 'market' check (order_type in ('market', 'limit')),
  source            text not null default 'manual' check (source in ('manual', 'auto')),
  venue_order_id    text,
  venue_response    jsonb,
  status            text not null default 'pending' check (status in ('pending', 'filled', 'rejected', 'cancelled', 'error')),
  filled_size_usd   numeric(12, 2),
  filled_avg_price  numeric(12, 6),
  error_message     text,
  attempted_at      timestamptz not null default now(),
  filled_at         timestamptz
);

create index if not exists trade_executions_user_attempted_idx
  on public.trade_executions (user_id, attempted_at desc);

alter table public.trade_executions enable row level security;

-- Users can read their own trades; writes are service-role only.
create policy trade_executions_self_read on public.trade_executions
  for select to authenticated
  using (user_id = auth.uid());
