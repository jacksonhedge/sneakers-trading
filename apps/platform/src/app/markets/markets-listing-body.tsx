import Link from 'next/link'
import {
  loadAllLatestSnapshots,
  loadMarketHistory,
  type MarketPhase,
  type MarketSnapshot,
  type MarketSort,
} from '@/lib/markets-data'
import type { ChartPoint } from '@/components/robinhood-chart'
import { type TerminalCategory } from '@/lib/market-stats'
import { groupIntoCanonical, type CanonicalMarket } from '@/lib/canonical-markets'
import { MarketCard } from './market-card'
import { FilterBar } from './filter-bar'
import { PlatformFreshnessStrip } from './platform-freshness-strip'

// Body of the /markets listing — data loading + filter/sort/paginate +
// the listing JSX (h1, freshness strip, filter bar, grid of MarketCards,
// pagination, footer). Reused by:
//   - /markets/page.tsx (public-style chrome — DashboardTopbar + DashboardSidebar)
//   - /dashboard/markets/page.tsx (dashboard layout chrome — inherits topbar +
//     OToole panel from the parent layout, no body remount on nav)
//
// Auth is the parent's job (each consumer either redirect()s or relies on
// the dashboard layout for the gate). This component just renders given
// the resolved searchParams.

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

const PAGE_SIZE = 50

function aggregateVolume(c: CanonicalMarket): number {
  let total = 0
  for (const q of c.quotes) {
    const v = typeof q.volume_traded === 'number' ? q.volume_traded : parseFloat(String(q.volume_traded ?? '0'))
    if (Number.isFinite(v)) total += v
  }
  return total
}

export interface MarketsListingParams {
  q?: string
  platform?: string
  sport?: string
  category?: string
  phase?: string
  sort?: string
  page?: string
}

export async function MarketsListingBody({
  searchParams,
  hrefBase,
}: {
  searchParams: MarketsListingParams
  /** URL prefix for pagination links — `/markets` for the public page,
   *  `/dashboard/markets` for the in-app page. */
  hrefBase: '/markets' | '/dashboard/markets'
}) {
  const sp = searchParams
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

  // Load + group + filter at canonical level. One card per canonical;
  // singletons and multi-venue alike.
  const { snapshots, latestDate } = await loadAllLatestSnapshots()
  const { canonical } = groupIntoCanonical(snapshots)

  const qLower = q.toLowerCase()
  const filtered = canonical.filter((c) => {
    if (platform && !c.venues.includes(platform)) return false
    if (sport && (c.sport ?? '').toLowerCase() !== sport) return false
    if (category && c.category !== category) return false
    if (phase && c.quotes[0].phase !== phase) return false
    if (qLower) {
      if (c.question.toLowerCase().includes(qLower)) return true
      for (const qt of c.quotes) {
        for (const o of qt.outcomes) {
          if (o.name.toLowerCase().includes(qLower)) return true
        }
      }
      return false
    }
    return true
  })

  filtered.sort((a, b) => {
    switch (sort) {
      case 'overround': {
        const av = a.quotes[0].overround ?? -Infinity
        const bv = b.quotes[0].overround ?? -Infinity
        if (bv !== av) return bv - av
        break
      }
      case 'resolves_at': {
        const at = a.resolves_at ? Date.parse(a.resolves_at) : Infinity
        const bt = b.resolves_at ? Date.parse(b.resolves_at) : Infinity
        if (at !== bt) return at - bt
        break
      }
      case 'updated': {
        const at = Math.max(...a.quotes.map((q) => Date.parse(q.ts) || 0))
        const bt = Math.max(...b.quotes.map((q) => Date.parse(q.ts) || 0))
        if (bt !== at) return bt - at
        break
      }
      case 'volume':
      default: {
        const av = aggregateVolume(a)
        const bv = aggregateVolume(b)
        if (bv !== av) return bv - av
        break
      }
    }
    if (a.venueCount !== b.venueCount) return b.venueCount - a.venueCount
    return a.question.localeCompare(b.question)
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = (page - 1) * PAGE_SIZE
  const paged = filtered.slice(start, start + PAGE_SIZE)

  // Sparklines on visible cards only.
  const visibleKeys = new Set(
    paged.map((c) => `${c.quotes[0].platform}:${c.quotes[0].platform_market_id}`),
  )
  let sparklineByKey = new Map<string, ChartPoint[]>()
  try {
    const history = await loadMarketHistory(7)
    for (const h of history) {
      const key = `${h.platform}:${h.platform_market_id}`
      if (!visibleKeys.has(key)) continue
      const pickYesAsk = (s: MarketSnapshot): number | null => {
        const yes = s.outcomes.find((o) => /^yes\b|\byes\s/i.test(o.name)) ?? s.outcomes[0]
        return yes?.best_ask ?? null
      }
      const points: ChartPoint[] = []
      for (const s of h.snapshots) {
        const v = pickYesAsk(s)
        if (v != null) points.push({ ts: s.ts, value: v })
      }
      if (points.length >= 2) sparklineByKey.set(key, points)
    }
  } catch (err) {
    console.warn('[markets-listing-body] history load failed', err)
    sparklineByKey = new Map()
  }

  const availablePlatforms = [...new Set(canonical.flatMap((c) => c.venues))].sort()
  const availableSports = [
    ...new Set(canonical.map((c) => c.sport).filter((s): s is string => !!s)),
  ].sort()

  const perBook: Record<string, { count: number; latestTs: string | null }> = {}
  for (const s of snapshots) {
    const b = perBook[s.platform]
    if (!b) perBook[s.platform] = { count: 1, latestTs: s.ts }
    else {
      b.count += 1
      if (!b.latestTs || s.ts > b.latestTs) b.latestTs = s.ts
    }
  }

  const multiVenueCount = canonical.filter((c) => c.venueCount >= 2).length

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
    return `${hrefBase}${qs ? '?' + qs : ''}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-stone-900">All markets</h1>
        <div className="text-[11px] text-stone-500 tracking-wider font-mono tabular-nums">
          {total.toLocaleString()} markets
          <span className="text-stone-300 mx-2">·</span>
          <span className="text-stone-600">{multiVenueCount.toLocaleString()}</span> multi-book
          {latestDate && (
            <>
              <span className="text-stone-300 mx-2">·</span>
              snapshot {latestDate}
            </>
          )}
        </div>
      </div>

      <PlatformFreshnessStrip perBook={perBook} />

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

      {paged.length === 0 ? (
        <div className="rounded-lg ring-1 ring-stone-200 bg-white p-10 text-center">
          <div className="text-sm text-stone-800 font-semibold mb-2">
            No markets match these filters.
          </div>
          <div className="text-xs text-stone-500">
            {total === 0 && availablePlatforms.length === 0
              ? 'No live data yet — markets will populate shortly.'
              : 'Try a different search, platform, or sport.'}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((c) => {
              const key = `${c.quotes[0].platform}:${c.quotes[0].platform_market_id}`
              return (
                <MarketCard
                  key={c.id}
                  market={c}
                  sparkline={sparklineByKey.get(key)}
                />
              )
            })}
          </div>

          <div className="flex justify-between items-center text-xs text-stone-500 pt-4">
            <div>
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildPageUrl(page - 1)}
                  prefetch={false}
                  className="ring-1 ring-stone-300 text-stone-700 px-3 py-1.5 rounded hover:bg-stone-100 hover:ring-stone-400 transition"
                >
                  ← prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildPageUrl(page + 1)}
                  prefetch={false}
                  className="ring-1 ring-stone-300 text-stone-700 px-3 py-1.5 rounded hover:bg-stone-100 hover:ring-stone-400 transition"
                >
                  next →
                </Link>
              )}
            </div>
          </div>
        </>
      )}

      <footer className="pt-6 border-t border-stone-200 text-[11px] text-stone-500">
        Each card is a canonical market — the same underlying question on one or more books.
        Sneakers groups duplicate listings so you see one row per market. Click through to the
        detail view for per-venue prices. Sneakers is not an exchange; trades execute on the
        venue you select.
      </footer>
    </div>
  )
}
