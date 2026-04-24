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

  const { count: earlierCount } = await admin
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', row.created_at)

  const rawOrder = (earlierCount ?? 0) + 1 + WAITLIST_DISPLAY_OFFSET
  const boost = 5 * row.direct_referrals + 2 * row.indirect_referrals
  const position = Math.max(1, rawOrder - boost)

  // Load every market once. `markets` is still per-snapshot for helpers that
  // need the full set (findCrossBookPairs is inherently multi-venue); the
  // display panels get a canonical-deduped view via `reps` so the same
  // underlying market no longer appears 4× (once per OddsAPI book).
  const { markets, total, dataDate } = await loadMarkets({ pageSize: 10_000 })
  const reps = await canonicalReps()
  const stats = aggregateByCategory(reps)
  const volumeTop = topByVolume(reps, 6)
  // Real cross-book arb candidates: one pair per game that 2+ books quote,
  // ranked by tightest combined home_ask + away_ask. Runs on per-snapshot
  // markets because arb detection requires the different books' raw prices.
  const crossBookPairs = findCrossBookPairs(markets, { limit: 10 })
  const resolutions = upcomingResolutions(reps, 7, 6)

  // Movers need the full time series per (platform, market_id). After
  // detection, dedupe the output by canonical so a single Lakers @ Celtics
  // swing doesn't surface as 4 separate mover rows.
  const history = await loadMarketHistory(7)
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
          <CategoryNav />
          <CategoryCards stats={stats} />

          {/* Center 3-column: Biggest Volume · Arbitrage · Performance */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.5fr] gap-4">
            <BiggestVolume markets={volumeTop} venueCounts={venueCounts} />
            <div data-hide-in="simple">
              <ArbitragePanel candidates={crossBookPairs} />
            </div>
            <div data-hide-in="simple">
              <PerformanceChart avgProbs={avgProbs} />
            </div>
          </div>

          {/* Biggest Movers — full-width row between center 3-col and lower row */}
          <div data-hide-in="simple">
            <BigMovers movers={movers} venueCounts={venueCounts} />
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
