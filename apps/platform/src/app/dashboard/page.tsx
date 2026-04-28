import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { loadMarkets, loadMarketHistory } from '@/lib/markets-data'
import { findCrossBookPairs } from '@/lib/arb-scanner'
import { buildVenueCountMap, canonicalReps, dedupeByCanonical } from '@/lib/canonical-markets'
import {
  aggregateByCategory,
  bigMovers,
  topByVolume,
  upcomingResolutions,
  type TerminalCategory,
} from '@/lib/market-stats'
import { WAITLIST_DISPLAY_OFFSET } from '@/lib/waitlist'
import { DashboardSidebar } from './sidebar'
import { DashboardTopbar } from './topbar'
import { CategoryNav, CategoryCards } from './category-row'
import { WalletStatusCard } from './wallet-status-card'
import { OtooleSpotlight } from './otoole-spotlight'
import { BiggestVolume } from './biggest-volume'
import { ArbitragePanel } from './arbitrage-panel'
import { PerformanceChart } from './performance-chart'
import { UpcomingResolutions, MyPositions } from './upcoming-positions'
import { RightSidebar } from './right-sidebar'
import { BigMovers } from './big-movers'
import './view-mode.css'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    redirect('/signup')
  }

  const admin = getServerClient()
  const { data: row, error: rowErr } = await admin
    .from('waitlist')
    .select('email, referral_code, direct_referrals, indirect_referrals, created_at')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  if (rowErr || !row) {
    redirect('/signup?error=no_waitlist_row')
  }

  // Independent loads run in parallel — the dashboard previously walked them
  // sequentially and exceeded Vercel's 60s function ceiling on prod. History
  // window is 24h (was 7 days): enough signal for sparklines + movers, but
  // shrinks the price_observations scan from millions of rows to thousands.
  const [
    { count: earlierCount },
    marketsResult,
    history,
  ] = await Promise.all([
    admin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', row.created_at),
    loadMarkets({ pageSize: 10_000 }),
    loadMarketHistory(1),
  ])

  const rawOrder = (earlierCount ?? 0) + 1 + WAITLIST_DISPLAY_OFFSET
  const boost = 5 * row.direct_referrals + 2 * row.indirect_referrals
  const position = Math.max(1, rawOrder - boost)

  const { markets, total, dataDate } = marketsResult
  const reps = await canonicalReps()
  const stats = aggregateByCategory(reps)
  const volumeTop = topByVolume(reps, 6)
  // Cross-book arb candidates need raw per-venue snapshots, so they run on
  // `markets` (not `reps`).
  const crossBookPairs = findCrossBookPairs(markets, { limit: 10 })
  const resolutions = upcomingResolutions(reps, 7, 6)

  // Sparkline points per market — used by BiggestVolume + BigMovers row
  // decorations. Same history loader they both already need; we extract the
  // YES ask trajectory once and index by composite key. Empty arrays /
  // single-point markets are dropped so the chart components don't try to
  // render degenerate lines.
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

  const moversRaw = bigMovers(history, { deltaThreshold: 0.4, currentThreshold: 0.86, minSamples: 3, limit: 24 })
  const moversDeduped = await dedupeByCanonical(moversRaw.map((m) => ({ ...m, platform: m.market.platform, platform_market_id: m.market.platform_market_id })))
  const movers = moversDeduped.slice(0, 12)
  const venueCounts = await buildVenueCountMap()
  const avgProbs = Object.fromEntries(
    (Object.keys(stats) as TerminalCategory[]).map((k) => [k, stats[k].avgProb]),
  ) as Partial<Record<TerminalCategory, number | null>>

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col">
      <DashboardTopbar
        dataDate={dataDate}
        marketCount={total}
        email={row.email}
        latestTs={markets.reduce<string | null>(
          (acc, m) => (acc && acc > m.ts ? acc : m.ts),
          null,
        )}
      />
      <div className="flex-1 flex min-h-0" data-dashboard-grid>
        <DashboardSidebar
          email={row.email}
          position={position}
          directRefs={row.direct_referrals}
          indirectRefs={row.indirect_referrals}
        />

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-w-0">
          <WalletStatusCard />
          <OtooleSpotlight />
          <CategoryNav />
          <CategoryCards stats={stats} />

          {/* Center 3-column: Biggest Volume · Arbitrage · Performance */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.5fr] gap-4">
            <BiggestVolume
              markets={volumeTop}
              venueCounts={venueCounts}
              sparklineByKey={sparklineByKey}
            />
            <div data-hide-in="simple">
              <ArbitragePanel candidates={crossBookPairs} />
            </div>
            <div data-hide-in="simple">
              <PerformanceChart avgProbs={avgProbs} />
            </div>
          </div>

          {/* Biggest Movers — full-width row between center 3-col and lower row */}
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
            Polymarket, NoVig, and ProphetX. Data refreshes on scraper run — see{' '}
            <code className="bg-stone-100 px-1 rounded">pnpm scrape:*</code> in{' '}
            <code className="bg-stone-100 px-1 rounded">apps/trader</code>.
          </footer>
        </main>

        {/* Right sidebar holds O'Toole AI chat — hidden in Simple mode
            because Simple intentionally excludes AI. Simple mode users who
            want O'Toole must upgrade to Medium or Terminal. */}
        <div data-hide-in="simple">
          <RightSidebar stats={stats} />
        </div>
      </div>

    </div>
  )
}
