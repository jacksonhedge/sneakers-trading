import { getAuthClient } from '@/lib/supabase-auth'
import { loadUserCredentials, touchLastUsed } from '@/lib/autotrade/credentials'
import { fetchBalance } from '@/lib/autotrade/polymarket'

// GET /api/autotrade/balance
//
// Returns the user's Polymarket USDC.e balance (in cents). Auth-gated.
// Decrypts credentials server-side, calls Polymarket's balance endpoint,
// returns just the cents — never echoes the credential bundle.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const creds = await loadUserCredentials(user.id, 'polymarket')
  if (!creds) {
    return Response.json(
      { error: 'no_credentials', message: 'Connect Polymarket first.' },
      { status: 404 },
    )
  }

  try {
    const { usdcCents } = await fetchBalance(creds)
    await touchLastUsed(user.id, 'polymarket')
    return Response.json({ ok: true, usdcCents })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[autotrade/balance] fetch failed', message)
    return Response.json({ error: 'venue_error', message }, { status: 502 })
  }
}
