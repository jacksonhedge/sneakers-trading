import { loadAllLatestSnapshots, type MarketSnapshot } from '@/lib/markets-data'
import { getTierIdentity } from '@/lib/require-tier'
import { tierMeetsMinimum } from '@/lib/subscriptions'

// Free-tier delay (ms). The API only returns snapshots older than this for
// free + anonymous users, matching the public pricing-page promise of
// "15-minute delayed prices on Free." Pro and above get real-time.
const FREE_DELAY_MS = 15 * 60 * 1000

// Cap on how many opportunities the response includes. Per the feature
// matrix, free and paid both get 100; the difference is delay + access to
// the real-time arb/alerts endpoints (gated separately).
const MAX_OPPORTUNITIES = 100

function passesGate(s: MarketSnapshot): boolean {
  const bothSided = s.outcomes.every(
    (o) => o.best_bid != null && o.best_ask != null && o.best_bid > 0 && o.best_ask > 0,
  )
  if (!bothSided) return false
  for (const o of s.outcomes) {
    if (o.best_bid == null || o.best_ask == null) continue
    if (o.best_ask - o.best_bid > 0.15) return false
  }
  const vol =
    typeof s.volume_traded === 'number'
      ? s.volume_traded
      : parseFloat(String(s.volume_traded ?? '0'))
  return Number.isFinite(vol) && vol >= 500
}

export async function GET() {
  // Tier-aware degradation: anonymous and free users see 15-min-delayed prices;
  // pro+ get real-time. Identity lookup is best-effort — we don't want to 401
  // anonymous iOS app pings because they're served the free experience.
  let isPaid = false
  try {
    const me = await getTierIdentity()
    isPaid = me.isActive && tierMeetsMinimum(me.tier, 'pro')
  } catch {
    // Treat as anonymous → free
  }

  const { snapshots, perPlatform } = await loadAllLatestSnapshots()

  if (snapshots.length === 0) {
    return Response.json(
      {
        platforms: {},
        lastUpdated: null,
        opportunities: [],
        delayed: !isPaid,
        note: 'No scraper data available. Start the scrape loop on the host machine.',
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  }

  const cutoff = isPaid ? Infinity : Date.now() - FREE_DELAY_MS
  const visible = isPaid
    ? snapshots
    : snapshots.filter((s) => {
        if (!s.ts) return false
        const t = new Date(s.ts).getTime()
        return Number.isFinite(t) && t <= cutoff
      })

  const gated = visible
    .filter((s) => s.overround !== null && passesGate(s))
    .sort((a, b) => (b.overround as number) - (a.overround as number))

  const opportunities = gated.slice(0, MAX_OPPORTUNITIES).map((s) => ({
    platform: s.platform,
    market_id: s.platform_market_id,
    question: s.question,
    sport: s.sport,
    outcomes: s.outcomes.map((o) => ({
      name: o.name,
      best_ask: o.best_ask,
      best_bid: o.best_bid,
    })),
    overround: s.overround,
    volume: s.volume_traded,
    liquidity: s.liquidity,
    phase: s.phase,
    ts: s.ts,
  }))

  const platformStats: Record<string, { markets: number; latestTs: string | null }> =
    Object.fromEntries(
      Object.entries(perPlatform).map(([k, v]) => [k, { markets: v.count, latestTs: v.latestTs }]),
    )

  const lastUpdated = Object.values(perPlatform).reduce<string | null>(
    (acc, v) => (v.latestTs && (!acc || v.latestTs > acc) ? v.latestTs : acc),
    null,
  )

  return Response.json(
    {
      platforms: platformStats,
      lastUpdated,
      totalMarkets: snapshots.length,
      gatedCount: gated.length,
      opportunities,
      delayed: !isPaid,
      delayMinutes: isPaid ? 0 : 15,
    },
    {
      headers: {
        'cache-control': 'no-store',
        'x-tier-delay': isPaid ? 'realtime' : '15m',
      },
    },
  )
}
