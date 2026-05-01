import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { getBalanceAdapter } from '@/lib/balance/adapters'

// GET /api/balance
//
// Aggregated Sneakers balance across every prediction-market venue
// the user has connected. Per-venue failures are isolated — one bad
// venue surfaces as { status: 'error' } and the rest still return.
//
// Response:
//   { ok, totalCents, currency: 'USD', fetchedAt, byVenue: [
//     { venue, status: 'ok' | 'error' | 'unsupported' | 'no_credentials',
//       cents?, error? }
//   ] }

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface VenueRow {
  venue: string
  cents?: number
  status: 'ok' | 'error' | 'unsupported' | 'no_credentials'
  error?: string
}

export async function GET() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const service = getServerClient()
  const { data: credRows, error: credErr } = await service
    .from('user_venue_credentials')
    .select('venue')
    .eq('user_id', user.id)
  if (credErr) {
    console.error('[balance] cred lookup failed', credErr)
    return Response.json({ error: 'lookup_failed' }, { status: 500 })
  }

  const venues = (credRows ?? []).map((r) => r.venue as string)
  const fetchedAt = new Date().toISOString()

  const byVenue: VenueRow[] = await Promise.all(
    venues.map(async (venue): Promise<VenueRow> => {
      const adapter = getBalanceAdapter(venue)
      if (!adapter) return { venue, status: 'unsupported' }
      try {
        const res = await adapter.fetch(user.id)
        if (res.status === 'no_credentials') return { venue, status: 'no_credentials' }
        return { venue, status: 'ok', cents: res.cents }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error'
        console.error(`[balance] ${venue} fetch failed`, message)
        return { venue, status: 'error', error: message }
      }
    }),
  )

  const totalCents = byVenue.reduce(
    (sum, row) => (row.status === 'ok' && row.cents ? sum + row.cents : sum),
    0,
  )

  return Response.json({
    ok: true,
    totalCents,
    currency: 'USD',
    fetchedAt,
    byVenue,
  })
}
