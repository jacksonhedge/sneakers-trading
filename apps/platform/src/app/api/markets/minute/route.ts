import { loadMinuteMarkets, MAX_WITHIN_MIN, DEFAULT_WITHIN_MIN } from '@/lib/minute-markets'
import { getTierIdentity } from '@/lib/require-tier'
import { tierMeetsMinimum } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Thin wrapper around loadMinuteMarkets. Logic lives in @/lib/minute-markets
// so the dashboard page (/dashboard/minute) and this API agree on filters
// and grouping. See that module's header for design notes.

export async function GET(req: Request) {
  const url = new URL(req.url)
  const withinRaw = parseInt(url.searchParams.get('within') ?? String(DEFAULT_WITHIN_MIN), 10)
  const within = Math.min(
    MAX_WITHIN_MIN,
    Math.max(1, Number.isFinite(withinRaw) ? withinRaw : DEFAULT_WITHIN_MIN),
  )
  const asset = url.searchParams.get('asset')
  const cryptoOnly = url.searchParams.get('cryptoOnly') !== 'false'
  const grouped = url.searchParams.get('grouped') === 'true'

  // Tier flag is informational — minute markets don't sensibly support a
  // 15-min "free delay" (the market itself resolves before the delay window
  // ends). The dashboard UI uses isPaid to surface a Pro upsell on the <=5min
  // bucket while keeping farther-out buckets visible to free users.
  let isPaid = false
  try {
    const me = await getTierIdentity()
    isPaid = me.isActive && tierMeetsMinimum(me.tier, 'pro')
  } catch {
    // anonymous → not paid; do not 401
  }

  const result = await loadMinuteMarkets({ within, asset, cryptoOnly, grouped })

  return Response.json(
    { ...result, isPaid },
    {
      headers: {
        'cache-control': 'no-store',
        'x-tier-realtime': isPaid ? '1' : '0',
      },
    },
  )
}
