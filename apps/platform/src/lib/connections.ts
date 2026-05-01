import { createBrowserClient } from '@supabase/ssr'

// Per-user "Connected Sites" preferences — which venues the user has an
// account on. Powers the dashboard connections grid + balance card and
// (eventually) market filters scoped to platforms the user can trade on.
//
// Storage: Supabase `user_venue_connections` table, RLS-scoped to the
// current user. Migration 035 introduced it; before that this lib was
// localStorage-backed under the `sneakers:connections:v1` key. The
// migrateLocalConnections() helper does a one-shot push of any stale
// localStorage entries into Supabase, then clears the key.

export type ConnectionSource = 'self_declared' | 'affiliate_click' | 'oauth'

const LEGACY_STORAGE_KEY = 'sneakers:connections:v1'
const MIGRATION_DONE_KEY = 'sneakers:connections:migrated:v1'

function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  return createBrowserClient(url, anon)
}

export async function loadConnections(): Promise<string[]> {
  const sb = browserClient()
  if (!sb) return []
  const { data, error } = await sb
    .from('user_venue_connections')
    .select('venue')
  if (error) {
    console.error('[connections] load failed', error.message)
    return []
  }
  return (data ?? []).map((r) => r.venue as string)
}

export async function saveConnection(
  venueId: string,
  source: ConnectionSource = 'self_declared',
): Promise<void> {
  const sb = browserClient()
  if (!sb) return
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return

  // Affiliate clicks stamp a timestamp for attribution. Plain toggles
  // leave that column untouched (upsert only writes the keys we pass).
  const row: Record<string, unknown> = {
    user_id: user.id,
    venue: venueId,
    source,
  }
  if (source === 'affiliate_click') {
    row.affiliate_clicked_at = new Date().toISOString()
  }

  const { error } = await sb
    .from('user_venue_connections')
    .upsert(row, { onConflict: 'user_id,venue' })
  if (error) console.error('[connections] save failed', error.message)
}

export async function removeConnection(venueId: string): Promise<void> {
  const sb = browserClient()
  if (!sb) return
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return
  const { error } = await sb
    .from('user_venue_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('venue', venueId)
  if (error) console.error('[connections] delete failed', error.message)
}

/**
 * One-shot push of any pre-Supabase localStorage rows into the new table.
 * Safe to call on every mount — guarded by a separate localStorage flag so
 * it only runs once per browser. Returns the number of rows migrated.
 */
export async function migrateLocalConnections(): Promise<number> {
  if (typeof window === 'undefined') return 0
  if (window.localStorage.getItem(MIGRATION_DONE_KEY) === '1') return 0

  let legacy: string[] = []
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        legacy = parsed.filter((v): v is string => typeof v === 'string')
      }
    }
  } catch {
    // Corrupted JSON — treat as empty, mark migration done so we stop trying.
  }

  if (legacy.length === 0) {
    window.localStorage.setItem(MIGRATION_DONE_KEY, '1')
    return 0
  }

  const sb = browserClient()
  if (!sb) return 0
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return 0

  const rows = legacy.map((venue) => ({
    user_id: user.id,
    venue,
    source: 'self_declared' as ConnectionSource,
  }))
  const { error } = await sb
    .from('user_venue_connections')
    .upsert(rows, { onConflict: 'user_id,venue' })
  if (error) {
    console.error('[connections] migration failed', error.message)
    return 0
  }

  window.localStorage.setItem(MIGRATION_DONE_KEY, '1')
  window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  return legacy.length
}
