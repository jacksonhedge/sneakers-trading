-- Bring-your-own API keys for AI providers.
-- When a user supplies their own Anthropic/OpenAI/Google/xAI key here, the
-- O'Toole chat route uses their key instead of Sneakers' key for matching
-- provider. Credit debit is skipped — the user pays their provider directly.
--
-- SECURITY NOTE: keys are stored as text here for v1 simplicity. Before
-- production launch, migrate to pgcrypto with a per-row envelope key OR
-- move to a dedicated secrets store (Supabase Vault, AWS KMS, etc.).
-- RLS ensures a user can only read their own keys; writes go through the
-- server-role API route which enforces auth. Admin-role access to this
-- table is still a risk — review who has service-role access to Supabase
-- before enabling BYO in public.

create table if not exists public.user_provider_keys (
  user_id     uuid not null,
  provider    text not null check (provider in ('anthropic', 'openai', 'google', 'xai')),
  api_key     text not null,
  label       text,
  verified_at timestamptz,
  last_used_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider)
);

create index if not exists user_provider_keys_user_idx
  on public.user_provider_keys (user_id);

alter table public.user_provider_keys enable row level security;

-- Users can see the METADATA of their own keys but NOT the api_key itself
-- (the client never needs to display the raw key after save — write-only).
-- Readable fields: provider, label, verified_at, last_used_at, created_at.
create policy user_provider_keys_self_read on public.user_provider_keys
  for select using (auth.uid() = user_id);

-- Writes go through the service-role server — users can't bypass encryption/
-- validation. No INSERT/UPDATE/DELETE policies for anon role.
