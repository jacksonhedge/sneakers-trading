import { getServerClient } from './supabase-server'
import type { AIProvider } from './ai-models'

/**
 * Bring-your-own API key storage. Users paste their Anthropic/OpenAI/Google/xAI
 * key on /dashboard/settings/api-keys; we store it (today as plaintext under
 * RLS — see migration 007 comments), retrieve it on chat calls, and skip
 * credit debit when they use their own key.
 *
 * IMPORTANT: before production, move to pgcrypto or a dedicated secrets
 * store. Plaintext keys in a DB are a real exposure surface even with RLS
 * — anyone with service-role access can dump them.
 */

export type ProviderKeyMeta = {
  provider: AIProvider
  label: string | null
  verifiedAt: string | null
  lastUsedAt: string | null
  createdAt: string
  /** First + last 4 chars only, for display. Full key never leaves server. */
  keyPreview: string
}

function previewKey(raw: string): string {
  if (!raw || raw.length < 12) return '••••'
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`
}

/**
 * Server-side only — returns the full API key for the user+provider or null.
 * Never expose this value to the client; it's for the route to inject into
 * the adapter call.
 */
export async function getUserProviderKey(
  userId: string,
  provider: AIProvider,
): Promise<string | null> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_provider_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) {
    console.error('[provider-keys] getUserProviderKey failed', error)
    return null
  }
  return data?.api_key ?? null
}

/**
 * Metadata-only list for display in settings UI. Omits the raw api_key.
 */
export async function listUserProviderKeys(userId: string): Promise<ProviderKeyMeta[]> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_provider_keys')
    .select('provider, label, verified_at, last_used_at, created_at, api_key')
    .eq('user_id', userId)
  if (error || !data) {
    console.error('[provider-keys] list failed', error)
    return []
  }
  return data.map((r) => ({
    provider: r.provider as AIProvider,
    label: r.label,
    verifiedAt: r.verified_at,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at,
    keyPreview: previewKey(r.api_key as string),
  }))
}

export async function upsertProviderKey(
  userId: string,
  provider: AIProvider,
  apiKey: string,
  label?: string,
): Promise<void> {
  const sb = getServerClient()
  const { error } = await sb.from('user_provider_keys').upsert(
    {
      user_id: userId,
      provider,
      api_key: apiKey,
      label: label ?? null,
      updated_at: new Date().toISOString(),
      // Intentionally not setting verified_at — the settings-save route verifies
      // by doing a cheap test call to the provider and sets verified_at
      // separately on success.
    },
    { onConflict: 'user_id,provider' },
  )
  if (error) throw error
}

export async function deleteProviderKey(
  userId: string,
  provider: AIProvider,
): Promise<void> {
  const sb = getServerClient()
  const { error } = await sb
    .from('user_provider_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
  if (error) throw error
}

export async function markVerified(userId: string, provider: AIProvider): Promise<void> {
  const sb = getServerClient()
  await sb
    .from('user_provider_keys')
    .update({ verified_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider)
}

export async function touchLastUsed(userId: string, provider: AIProvider): Promise<void> {
  const sb = getServerClient()
  await sb
    .from('user_provider_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider)
}
