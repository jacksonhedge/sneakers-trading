import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import {
  loadMarkets,
  type MarketPhase,
  type MarketSort,
} from '@/lib/markets-data'
import type { TerminalCategory } from '@/lib/market-stats'
import { MarketCard } from './market-card'
import { FilterBar } from './filter-bar'
import { PlatformFreshnessStrip } from './platform-freshness-strip'
import { MarketDetailDrawer } from '@/app/dashboard/market-detail-drawer'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Markets — Sneakers Terminal',
  description: 'Live prediction-market prices across every book Sneakers tracks.',
}

type SP = Promise<{
  q?: string
  platform?: string
  sport?: string
  category?: string
  phase?: string
  sort?: string
  page?: string
}>

const PAGE_SIZE = 50

const VALID_CATEGORIES: TerminalCategory[] = [
  'politics',
  'economics',
  'crypto',
  'sports',
  'tech',
  'other',
]
const VALID_PHASES: MarketPhase[] = ['opening', 'pre_game', 'live', 'closed']
const VALID_SORTS: MarketSort[] = ['volume', 'overround', 'resolves_at', 'updated']

export default async function MarketsPage({ searchParams }: { searchParams: SP }) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/markets')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const platform = (sp.platform ?? '').trim().toLowerCase()
  const sport = (sp.sport ?? '').trim().toLowerCase()
  const categoryRaw = (sp.category ?? '').trim().toLowerCase()
  const phaseRaw = (sp.phase ?? '').trim().toLowerCase()
  const sortRaw = (sp.sort ?? '').trim().toLowerCase()
  const category = (VALID_CATEGORIES as string[]).includes(categoryRaw)
    ? (categoryRaw as TerminalCategory)
    : undefined
  const phase = (VALID_PHASES as string[]).includes(phaseRaw)
    ? (phaseRaw as MarketPhase)
    : undefined
  const sort: MarketSort = (VALID_SORTS as string[]).includes(sortRaw)
    ? (sortRaw as MarketSort)
    : 'volume'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const { markets, total, availablePlatforms, availableSports, dataDate, perBook } =
    await loadMarkets({
      q,
      platform: platform || undefined,
      sport: sport || undefined,
      category,
      phase,
      sort,
      page,
      pageSize: PAGE_SIZE,
    })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const buildPageUrl = (newPage: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (platform) params.set('platform', platform)
    if (sport) params.set('sport', sport)
    if (category) params.set('category', category)
    if (phase) params.set('phase', phase)
    if (sort !== 'volume') params.set('sort', sort)
    if (newPage > 1) params.set('page', String(newPage))
    const qs = params.toString()
    return `/markets${qs ? '?' + qs : ''}`
  }

  return (
    <main className="min-h-screen bg-stone-950 text-white px-6 py-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <header>
          <Link
            href="/dashboard"
            className="text-xs text-emerald-300/80 tracking-wider hover:text-emerald-300"
          >
            ← DASHBOARD
          </Link>
          <div className="mt-6 flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Markets</h1>
              <p className="text-sm text-stone-400 mt-2 max-w-xl">
                Live prices across {availablePlatforms.length} prediction books.
                Click through to trade on any venue you already have an account with.
              </p>
            </div>
            <div className="text-xs text-stone-500 tracking-wider">
              {total.toLocaleString()} MARKET{total === 1 ? '' : 'S'}
              {dataDate && <span className="text-stone-600"> · snapshot {dataDate}</span>}
            </div>
          </div>
        </header>

        <PlatformFreshnessStrip perBook={perBook} />

        <div className="border-y border-stone-800 py-6">
          <FilterBar
            platforms={availablePlatforms}
            sports={availableSports}
            currentQuery={q}
            currentPlatform={platform}
            currentSport={sport}
            currentCategory={category ?? ''}
            currentPhase={phase ?? ''}
            currentSort={sort}
          />
        </div>

        {markets.length === 0 ? (
          <div className="rounded-lg ring-1 ring-stone-800 bg-stone-950/80 p-10 text-center">
            <div className="text-sm text-stone-300 font-semibold mb-2">
              No markets match these filters.
            </div>
            <div className="text-xs text-stone-500">
              {total === 0 && availablePlatforms.length === 0
                ? 'No snapshot data loaded yet. Run a scraper from apps/trader (e.g. `pnpm scrape:kalshi`) to populate.'
                : 'Try a different search, platform, or sport.'}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {markets.map((m) => (
                <MarketCard key={`${m.platform}:${m.platform_market_id}`} market={m} />
              ))}
            </div>

            <div className="flex justify-between items-center text-xs text-stone-500 pt-4">
              <div>
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={buildPageUrl(page - 1)}
                    className="ring-1 ring-stone-700 text-stone-300 px-3 py-1.5 rounded hover:ring-stone-500 transition"
                  >
                    ← prev
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={buildPageUrl(page + 1)}
                    className="ring-1 ring-stone-700 text-stone-300 px-3 py-1.5 rounded hover:ring-stone-500 transition"
                  >
                    next →
                  </Link>
                )}
              </div>
            </div>
          </>
        )}

        <footer className="pt-8 border-t border-stone-800 text-[11px] text-stone-500">
          Prices are unit-normalized to probability space across platforms. Sneakers is not an
          exchange — trades execute on the venue you click through to. Data refreshes when a
          scraper run completes; snapshots append and we render the latest observation per market.
        </footer>
      </div>

      <MarketDetailDrawer markets={markets} />
    </main>
  )
}
