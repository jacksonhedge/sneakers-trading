-- Make api_secret_encrypted nullable.
--
-- Original 028 marked it NOT NULL because Polymarket's CLOB auth trio
-- always includes a secret. Kalshi (RSA keypair: key_id + PEM), Opinion
-- (single API key), and Limitless (private key only) don't have an
-- equivalent. Loosening the constraint lets every venue share the same
-- table without a JSONB extras column.
--
-- Idempotent.

alter table public.user_venue_credentials
  alter column api_secret_encrypted drop not null;
