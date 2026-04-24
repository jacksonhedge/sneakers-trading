import { getTierIdentity, TierError } from '@/lib/require-tier'

// GET /api/me/tier
//
// Returns the authenticated user's effective tier and Stripe-backed metadata.
// Drives the client-side useTier() hook which lights up gates in the UI. The
// shape is stable JSON so the iOS app can consume the same endpoint.
//
// Always re-validate on the server side (requireTier) — this endpoint is
// convenience only.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface MeTierResponse {
  tier: 'free' | 'pro' | 'elite' | 'business'
  rawTier: 'free' | 'pro' | 'elite' | 'business'
  status: string | null
  isActive: boolean
  accountType: 'individual' | 'business'
  businessSubtype: 'standard' | 'fraternity' | null
  email: string
}

export async function GET() {
  try {
    const me = await getTierIdentity()
    const body: MeTierResponse = {
      tier: me.tier,
      rawTier: me.rawTier,
      status: me.status,
      isActive: me.isActive,
      accountType: me.accountType,
      businessSubtype: me.businessSubtype,
      email: me.email,
    }
    return Response.json(body)
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    // Anything else is an unexpected server error — log with detail, return
    // structured JSON so the client's useTier() hook can fall back gracefully
    // to a free-tier default instead of choking on an HTML 500 page.
    console.error('[me/tier] unexpected error', err)
    return Response.json(
      { error: 'server_error', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
