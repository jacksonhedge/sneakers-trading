-- Sneakers Wallet — phase 1.5 backend tables.
--
-- DO NOT auto-apply on top of unapplied migrations or before KYB clears.
-- This migration sits in the repo as design intent; it's applied by hand
-- against prod Supabase after the wallet vendor (MoonPay phase 1) is
-- live in sandbox.
--
-- Shape mirrors the WalletProvider interface in src/lib/wallet/types.ts.
-- We mirror MoonPay's truth here via webhook so /dashboard/wallet doesn't
-- have to round-trip the vendor on every render.

-- ============================================================
-- wallet_balances — one row per user, owned by the user.
-- ============================================================

create table if not exists wallet_balances (
  user_id        uuid        primary key references auth.users(id) on delete cascade,
  -- USD-equivalent, in cents. Signed bigint so a stuck refund / clawback
  -- can transiently go negative without bumping the type.
  amount_cents   bigint      not null default 0,
  currency       text        not null default 'USD',
  -- Track which vendor authoritatively reported this balance. When we
  -- swap MoonPay -> Coinbase CDP later, this field flips on the row.
  vendor         text        not null default 'mock',
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- wallet_transactions — append-only ledger, one row per vendor event.
-- ============================================================

create table if not exists wallet_transactions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  -- Stable vendor id: 'mock' | 'moonpay' | 'coinbase-cdp'
  vendor         text        not null,
  -- Vendor's id for this txn — used to de-dupe on webhook re-delivery.
  vendor_txn_id  text,
  -- One of: deposit | withdraw | trade_buy | trade_settle | transfer_in | transfer_out
  kind           text        not null,
  -- One of: pending | completed | failed | canceled
  status         text        not null,
  -- Display strings shown in the ledger UI.
  label          text        not null,
  source         text        not null,
  -- Signed cents. Positive = inflow, negative = outflow.
  amount_cents   bigint      not null,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  -- Optional client memo we round-tripped through the vendor.
  memo           text,

  constraint wallet_transactions_kind_chk
    check (kind in (
      'deposit', 'withdraw', 'trade_buy', 'trade_settle',
      'transfer_in', 'transfer_out'
    )),
  constraint wallet_transactions_status_chk
    check (status in ('pending', 'completed', 'failed', 'canceled')),
  -- A vendor's txn id is unique within that vendor. Guards against
  -- double-counting on webhook re-delivery.
  constraint wallet_transactions_vendor_txn_unique
    unique (vendor, vendor_txn_id)
);

create index if not exists wallet_transactions_user_occurred_idx
  on wallet_transactions (user_id, occurred_at desc);

create index if not exists wallet_transactions_status_idx
  on wallet_transactions (status)
  where status = 'pending';

-- ============================================================
-- RLS — user can read their own; only the service role writes.
-- ============================================================

alter table wallet_balances enable row level security;
alter table wallet_transactions enable row level security;

drop policy if exists "users read own wallet balance" on wallet_balances;
create policy "users read own wallet balance"
  on wallet_balances
  for select
  using (auth.uid() = user_id);

drop policy if exists "users read own wallet transactions" on wallet_transactions;
create policy "users read own wallet transactions"
  on wallet_transactions
  for select
  using (auth.uid() = user_id);

-- No insert / update / delete policies — wallet writes happen exclusively
-- through the webhook receiver running with the service role. Any future
-- "send to a friend" P2P flow goes through a server route, never client.

comment on table wallet_balances is
  'Sneakers Wallet — current balance per user, mirrored from the active vendor (currently MoonPay) via webhook. Source of truth for the /dashboard/wallet display.';

comment on table wallet_transactions is
  'Sneakers Wallet — append-only ledger. One row per vendor-confirmed event. UI reads from here; the wallet provider populates via parseWebhookRequest. De-dupes on (vendor, vendor_txn_id).';
