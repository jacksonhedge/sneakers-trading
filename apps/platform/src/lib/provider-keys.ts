import { getServerClient } from './supabase-server'
import type { AIProvider } from './ai-models'
import { decryptSecret, encryptSecret, previewSecret } from './secrets'

/**
 * Bring-your-own API key storage. Users paste their Anthropic/OpenAI/Google/xAI
 * key on /dashboard/settings/api-keys; we encrypt it at rest with AES-GCM
 * (key in PROVIDER_KEY_ENCRYPTION_KEY env var) and decrypt only inside the
 * O'Toole chat route to inject into the upstream provider call.
 *
 * Rows live in `user_provider_keys`. The `authenticated` role has column-
 * level SELECT only on metadata (provider, label, verified_at, last_used_at,
 * created_at, key_preview) — the api_key/api_key_encrypted columns are
 * service-role-only. See migration 021 for the column grants.
 */

export type ProviderKeyMeta = {
  provider: AIProvider
  label: string | null
  verifiedAt: string | null
  lastUsedAt: string | null
  createdAt: string
  /** First + last 4 chars only, derived at write time. Full key never leaves server. */
  keyPreview: string
}

/**
 * Server-side only — returns the full API key for the user+provider or null.
 * Never expose this value to the client; it's for the route to inject into
 * the adapter call.
 *
 * Reads `api_key_encrypted` first; falls back to legacy `api_key` (plaintext)
 * for rows that haven't been backfilled yet. Once backfill ships, drop the
 * fallback and the plaintext column.
 */
export async function getUserProviderKey(
  userId: string,
  provider: AIProvider,
): Promise<string | null> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_provider_keys')
    .select('api_key, api_key_encrypted')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) {
    console.error('[provider-keys] getUserProviderKey failed', error)
    return null
  }
  if (!data) return null
  if (data.api_key_encrypted) {
    try {
      return decryptSecret(data.api_key_encrypted as string)
    } catch (err) {
      console.error('[provider-keys] decrypt failed', err)
      return null
    }
  }
  return (data.api_key as string | null) ?? null
}

/**
 * Metadata-only list for display in settings UI. Never reads the secret
 * columns — only the safe fields the authenticated role can see.
 */
export async function listUserProviderKeys(userId: string): Promise<ProviderKeyMeta[]> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('user_provider_keys')
    .select('provider, label, verified_at, last_used_at, created_at, key_preview')
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
    keyPreview: (r.key_preview as string | null) ?? '••••',
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
      api_key_encrypted: encryptSecret(apiKey),
      api_key: null, // never store new plaintext, even transitionally
      key_preview: previewSecret(apiKey),
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
