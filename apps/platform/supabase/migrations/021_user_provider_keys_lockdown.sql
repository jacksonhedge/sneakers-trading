-- Phase 1 of provider-key hardening (audit CRITICAL #4).
--
-- Background: migration 009 enabled RLS with a SELECT policy that returned
-- every column to the row's owner — including `api_key`. RLS in Postgres is
-- row-scoped, not column-scoped, so any authenticated user (or anyone with
-- their session cookie) could fetch their own raw provider API key via the
-- Supabase JS client. Combined with a service-role compromise, every
-- customer's third-party LLM keys would be recoverable.
--
-- This migration closes the user-side leak by revoking column-level SELECT
-- on the secret columns from the `authenticated` role. The server (service
-- role) is unaffected.
--
-- Phase 2 (separate migration, after the app rolls with PROVIDER_KEY_ENCRYPTION_KEY
-- set): re-encrypt the api_key column with AES-GCM, drop the plaintext, add
-- the api_key_encrypted text column.

-- Add the encrypted-storage column. Existing rows keep their plaintext in
-- `api_key` until the backfill step in phase 2.
alter table public.user_provider_keys
  add column if not exists api_key_encrypted text;

-- Add a write-time-derived preview so the settings UI can show e.g.
-- "sk-a…f2d4" without ever reading the secret column.
alter table public.user_provider_keys
  add column if not exists key_preview text;

-- Lock down column-level SELECT for the `authenticated` role. PostgREST
-- (the API layer Supabase exposes) honors column-level grants in addition
-- to RLS — a user trying `select('api_key')` will now get a permission
-- error instead of the raw key.
revoke select on public.user_provider_keys from authenticated;
grant select (
  user_id,
  provider,
  label,
  verified_at,
  last_used_at,
  created_at,
  updated_at,
  key_preview
) on public.user_provider_keys to authenticated;

-- Service role still has full access (needed for the chat route to
-- decrypt + inject the key into the upstream provider call).

-- The existing self_read RLS policy stays — it scopes rows to the user.
-- Combined with the column-level revoke above, the user can read their
-- own metadata but never the secret.
