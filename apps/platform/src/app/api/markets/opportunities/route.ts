import { loadAllLatestSnapshots, type MarketSnapshot } from '@/lib/markets-data'

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
  const { snapshots, perPlatform } = await loadAllLatestSnapshots()

  if (snapshots.length === 0) {
    return Response.json(
      {
        platforms: {},
        lastUpdated: null,
        opportunities: [],
        note: 'No scraper data available. Start the scrape loop on the host machine.',
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  }

  const gated = snapshots
    .filter((s) => s.overround !== null && passesGate(s))
    .sort((a, b) => (b.overround as number) - (a.overround as number))

  const opportunities = gated.slice(0, 100).map((s) => ({
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
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
