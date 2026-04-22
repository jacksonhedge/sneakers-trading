// Per-user "Connected Sites" preferences — which venues the user has an
// account on. Used by the dashboard sidebar chip, and by future filters
// ("only show me markets on platforms I can actually trade on").
//
// Currently localStorage-backed (v1, preview). When Stripe + proper user
// settings land, this moves to a Supabase `user_connections` table keyed
// by auth.uid() so it syncs across devices and into the iOS app.

const STORAGE_KEY = 'sneakers:connections:v1'

export function loadConnections(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function saveConnections(ids: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]))
}

export function isConnected(venueId: string, connections: string[]): boolean {
  return connections.includes(venueId)
}
