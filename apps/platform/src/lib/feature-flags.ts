import { getServerClient } from './supabase-server'

// Feature flags reader.
//
// Reads a boolean flag from public.feature_flags (migration 033). Falls
// back to the supplied default when the row doesn't exist OR the DB read
// fails. Callers should treat the default as the source of truth — the
// table is just an override surface.
//
// Server-side only (uses service-role client). Client components that
// need flags should get them via props from a server component, or via
// a /api/flags endpoint we'll build when the demand materializes.
//
// Caveat: NO caching today. Each call hits the DB. With <50 flags total
// and admin pages being the only callers, this is fine. Add a 30-second
// in-memory cache if/when a hot path starts reading flags per-request.

export async function getFlag(key: string, defaultValue: boolean): Promise<boolean> {
  try {
    const admin = getServerClient()
    const { data, error } = await admin
      .from('feature_flags')
      .select('value_bool')
      .eq('key', key)
      .maybeSingle()
    if (error) {
      console.warn('[feature-flags] read failed', key, error.message)
      return defaultValue
    }
    if (!data) return defaultValue
    return Boolean(data.value_bool)
  } catch (e) {
    console.warn('[feature-flags] unexpected', e instanceof Error ? e.message : e)
    return defaultValue
  }
}

export type FeatureFlagRow = {
  key: string
  value_bool: boolean
  description: string | null
  updated_at: string
  updated_by: string | null
}

/**
 * List ALL flags for the /admin/flags page. Includes any flag that has
 * been touched at least once. Newly-introduced flags that haven't been
 * written yet won't appear — they live only in code defaults.
 */
export async function listFlags(): Promise<FeatureFlagRow[]> {
  const admin = getServerClient()
  const { data, error } = await admin
    .from('feature_flags')
    .select('key, value_bool, description, updated_at, updated_by')
    .order('key', { ascending: true })
  if (error) {
    console.warn('[feature-flags] list failed', error.message)
    return []
  }
  return (data ?? []) as FeatureFlagRow[]
}
