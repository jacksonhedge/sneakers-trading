import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { loadMarkets, loadMarketCount, loadMarketHistory, type MarketSnapshot } from '@/lib/markets-data'
import { loadCanonicalMarkets } from '@/lib/canonical-markets'
import {
  aggregateByCategory,
  bigMovers,
  topByVolume,
  upcomingResolutions,
  type TerminalCategory,
} from '@/lib/market-stats'
import { CategoryCards } from './category-row'
import { WalletStatusCard } from './wallet-status-card'
import { BalanceCard } from './balance-card'
import { OtooleSpotlight } from './otoole-spotlight'
import { BiggestVolume } from './biggest-volume'
import { DashboardTournamentsTile } from './dashboard-tournaments-tile'
import { TeachBotTile } from './teach-bot-tile'
import { UpcomingResolutions, MyPositions } from './upcoming-positions'
import { BigMovers } from './big-movers'
import './view-mode.css'

export const dynamic = 'force-dynamic'

// Auth + chrome (top bar, OToole panel) live in dashboard/layout.tsx so
// they persist across navigations. This page just produces the trading
// content that fills the right-hand slot.

function toNumSafe(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export default async function DashboardPage() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  const admin = getServerClient()

  // Independent loads run in parallel — sequential walks were exceeding
  // Vercel's 60s function ceiling on prod. History window is 24h: enough
  // signal for sparklines + movers without scanning millions of rows.
  // We also pull the canonical grouping ONCE here and reuse it below
  // (used to call canonicalReps/buildVenueCountMap/dedupeByCanonical
  // separately, each re-running loadCanonicalMarkets internally).
  const [
    marketsResult,
    history,
    { canonical },
    marketCount,
  ] = await Promise.all([
    loadMarkets({ pageSize: 10_000 }),
    loadMarketHistory(1),
    loadCanonicalMarkets(),
    loadMarketCount(),
  ])

  const { dataDate } = marketsResult
  // Footer count uses the targeted count query (sub-100ms, always accurate)
  // rather than marketsResult.total — the latter is computed from the full
  // snapshot pull and can be stale or partial under DB load.
  const total = marketCount

  // Reps = highest-volume quote per canonical group. Replaces canonicalReps().
  const reps: MarketSnapshot[] = []
  for (const c of canonical) {
    let pick = c.quotes[0]
    let pickVol = toNumSafe(pick.volume_traded)
    for (const q of c.quotes) {
      const v = toNumSafe(q.volume_traded)
      if (v > pickVol) {
        pick = q
        pickVol = v
      }
    }
    reps.push(pick)
  }

  // Snapshot-key → venueCount map. Replaces buildVenueCountMap().
  const venueCounts: Record<string, number> = {}
  // Snapshot-key → canonical id, used to dedupe movers by canonical.
  const canonicalBySnapshot = new Map<string, string>()
  for (const c of canonical) {
    for (const q of c.quotes) {
      const key = `${q.platform}:${q.platform_market_id}`
      venueCounts[key] = c.venueCount
      canonicalBySnapshot.set(key, c.id)
    }
  }

  const stats = aggregateByCategory(reps)
  const volumeTop = topByVolume(reps, 6)
  const resolutions = upcomingResolutions(reps, 7, 6)

  // Sparkline points per market — used by BiggestVolume + BigMovers row
  // decorations. Empty / single-point histories are dropped so the chart
  // components don't render degenerate lines.
  const sparklineByKey = new Map<string, Array<{ ts: string; value: number }>>()
  for (const h of history) {
    const points: Array<{ ts: string; value: number }> = []
    for (const s of h.snapshots) {
      const yes = s.outcomes.find((o) => /^yes\b|\byes\s/i.test(o.name)) ?? s.outcomes[0]
      const v = yes?.best_ask
      if (typeof v === 'number') points.push({ ts: s.ts, value: v })
    }
    if (points.length >= 2) {
      sparklineByKey.set(`${h.platform}:${h.platform_market_id}`, points)
    }
  }

  // Big movers: dedupe by canonical id (replaces dedupeByCanonical()).
  const moversRaw = bigMovers(history, {
    deltaThreshold: 0.4,
    currentThreshold: 0.86,
    minSamples: 3,
    limit: 24,
  })
  const seenCanonical = new Set<string>()
  const moversDeduped: typeof moversRaw = []
  for (const m of moversRaw) {
    const key = `${m.market.platform}:${m.market.platform_market_id}`
    const cid = canonicalBySnapshot.get(key) ?? `raw:${key}`
    if (seenCanonical.has(cid)) continue
    seenCanonical.add(cid)
    moversDeduped.push(m)
  }
  const movers = moversDeduped.slice(0, 12)

  return (
    <div className="px-6 py-5 space-y-5">
      <BalanceCard />
      <WalletStatusCard />
      <OtooleSpotlight />
      <CategoryCards stats={stats} />

      {/* Center 3-column: Biggest Volume · Tournaments · Teach-your-bot */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.5fr] gap-4">
        <BiggestVolume
          markets={volumeTop}
          venueCounts={venueCounts}
          sparklineByKey={sparklineByKey}
        />
        <div data-hide-in="simple">
          <DashboardTournamentsTile />
        </div>
        <div data-hide-in="simple">
          <TeachBotTile />
        </div>
      </div>

      {/* Biggest Movers — full-width row */}
      <div data-hide-in="simple">
        <BigMovers
          movers={movers}
          venueCounts={venueCounts}
          sparklineByKey={sparklineByKey}
        />
      </div>

      {/* Lower row: Upcoming Resolutions · My Positions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-hide-in="simple">
        <UpcomingResolutions markets={resolutions} venueCounts={venueCounts} />
        <MyPositions />
      </div>

      <footer className="pt-4 border-t border-stone-200 text-[11px] text-stone-500">
        Snapshot {dataDate ?? '—'} · {total.toLocaleString()} markets across Kalshi,
        Polymarket, OG Markets, NoVig, and ProphetX. Live prices refresh every few minutes.
      </footer>
    </div>
  )
}
