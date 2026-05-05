import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getVenueAffiliateLinkMap } from '@/lib/venue-affiliate-links'
import { HorseRaceLobby } from './horse-race-lobby'

// Crypto Horse Race — tournament surface wrapping the short-duration
// crypto strike markets (5min, 10min, 60min). Buy-in converts to chips
// (10% fee to Sneakers); chips trade against the strikes; top stacks
// at resolution split the prize pool. v1 is a teaser lobby — the live
// race UI ships when chip-economics + payouts are wired.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Crypto Horse Race — Sneakers Terminal' }

export default async function HorseRacePage() {
  const supabase = await getAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  // Per-venue affiliate URL + optional promo code, server-loaded from
  // public.venue_affiliate_links (admin-editable at /admin/affiliates).
  // Falls back to hardcoded defaults when the row doesn't exist.
  const affiliateOverrides = await getVenueAffiliateLinkMap()

  return <HorseRaceLobby affiliateOverrides={affiliateOverrides} />
}
