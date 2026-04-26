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
-- role) is unaffected. Other (non-secret) columns retain their existing
-- table-level read grant.
--
-- Phase 2 (separate migration, after the app rolls with PROVIDER_KEY_ENCRYPTION_KEY
-- set): re-encrypt the api_key column with AES-GCM and drop the plaintext.

-- 1) Add the new columns we need (idempotent).
alter table public.user_provider_keys
  add column if not exists api_key_encrypted text;

-- Write-time-derived preview so settings UI can show "sk-a…f2d4" without
-- ever reading the secret column.
alter table public.user_provider_keys
  add column if not exists key_preview text;

-- 2) Revoke column-level SELECT on the secret columns. PostgREST honors
--    column grants in addition to RLS, so a user calling
--    `select('api_key')` will get a permission error instead of the raw key.
--    Wrapped in DO blocks so we only revoke on columns that actually exist
--    (defensive — if migration 009 wasn't fully applied, api_key may not
--    be present yet).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_provider_keys'
      and column_name = 'api_key'
  ) then
    execute 'revoke select (api_key) on public.user_provider_keys from authenticated';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_provider_keys'
      and column_name = 'api_key_encrypted'
  ) then
    execute 'revoke select (api_key_encrypted) on public.user_provider_keys from authenticated';
  end if;
end $$;

-- Service role bypasses RLS + column grants, so the chat route can still
-- decrypt + inject keys into upstream provider calls.

-- The existing self_read RLS policy stays — it scopes rows to the user.
-- Combined with the column-level revoke above, the user can read their
-- own metadata but never the secret.
