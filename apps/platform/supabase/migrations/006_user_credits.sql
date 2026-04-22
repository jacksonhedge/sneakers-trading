-- Pre-paid AI credits system. Users buy credit packs (Stripe), credits
-- deduct on each O'Toole message based on the model chosen.
--
-- Two tables:
--   user_credits       — current balance, one row per user
--   credit_transactions — append-only ledger of purchases + consumptions
--
-- The ledger is the source of truth. user_credits.balance is a materialized
-- cache of SUM(delta) kept current by a trigger on insert.

create table if not exists public.user_credits (
  user_id      uuid primary key,
  balance      bigint not null default 0,
  lifetime_purchased bigint not null default 0,
  lifetime_spent bigint not null default 0,
  last_updated timestamptz not null default now()
);

alter table public.user_credits enable row level security;

create policy user_credits_self_read on public.user_credits
  for select using (auth.uid() = user_id);

-- Transactions ledger — both purchases (delta > 0) and consumptions (delta < 0).
create table if not exists public.credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  kind         text not null check (kind in ('purchase', 'otoole_message', 'admin_grant', 'refund', 'expiry')),
  delta        bigint not null,          -- signed: purchases +, consumptions -
  description  text,
  model_id     text,                      -- for otoole_message rows: which model was used
  stripe_charge_id text,                  -- for purchase rows
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists credit_transactions_user_time_idx
  on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

create policy credit_transactions_self_read on public.credit_transactions
  for select using (auth.uid() = user_id);

-- Balance-maintenance trigger: whenever a ledger row is inserted, update
-- user_credits.balance (upserting the row if it doesn't exist yet).
create or replace function public.apply_credit_transaction()
returns trigger language plpgsql as $$
begin
  insert into public.user_credits (user_id, balance, lifetime_purchased, lifetime_spent, last_updated)
  values (
    new.user_id,
    new.delta,
    case when new.delta > 0 then new.delta else 0 end,
    case when new.delta < 0 then -new.delta else 0 end,
    now()
  )
  on conflict (user_id) do update set
    balance = public.user_credits.balance + new.delta,
    lifetime_purchased = public.user_credits.lifetime_purchased
      + case when new.delta > 0 then new.delta else 0 end,
    lifetime_spent = public.user_credits.lifetime_spent
      + case when new.delta < 0 then -new.delta else 0 end,
    last_updated = now();
  return new;
end;
$$;

drop trigger if exists credit_transactions_apply on public.credit_transactions;
create trigger credit_transactions_apply
  after insert on public.credit_transactions
  for each row execute function public.apply_credit_transaction();
