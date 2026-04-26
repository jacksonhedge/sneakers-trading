-- Idempotency for Stripe credit grants (audit HIGH #9).
--
-- Stripe webhooks retry on non-2xx responses (up to 3 days). Without a
-- unique constraint, a duplicate `checkout.session.completed` delivery
-- inserts a second purchase row → user gets credits twice.
--
-- Add a partial unique index on stripe_charge_id for purchase rows. Refunds
-- and otoole_message rows are exempt (they either share charge IDs with the
-- purchase they reverse, or have null charge IDs).

create unique index if not exists credit_transactions_purchase_charge_uniq
  on public.credit_transactions (stripe_charge_id)
  where kind = 'purchase' and stripe_charge_id is not null;
