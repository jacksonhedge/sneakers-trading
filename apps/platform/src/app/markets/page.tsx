import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
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
import { WAITLIST_DISPLAY_OFFSET } from '@/lib/waitlist'
import { DashboardTopbar } from '@/app/dashboard/topbar'
import { DashboardSidebar } from '@/app/dashboard/sidebar'
import { MarketCard } from './market-card'
import { FilterBar } from './filter-bar'
import { PlatformFreshnessStrip } from './platform-freshness-strip'

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

function aggregateVolume(c: CanonicalMarket): number {
  let total = 0
  for (const q of c.quotes) {
    const v = typeof q.volume_traded === 'number' ? q.volume_traded : parseFloat(String(q.volume_traded ?? '0'))
    if (Number.isFinite(v)) total += v
  }
  return total
}

export default async function MarketsPage({ searchParams }: { searchParams: SP }) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/login?next=/markets')

  // Fetch waitlist data for the sidebar (position, referrals). Same shape as
  // /dashboard fetches so the sidebar renders consistently across views.
  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('email, referral_code, direct_referrals, indirect_referrals, created_at')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  const sidebarEmail = row?.email ?? user.email
  let sidebarPosition = 0
  let directRefs = 0
  let indirectRefs = 0
  if (row) {
    const { count: earlierCount } = await admin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', row.created_at)
    const rawOrder = (earlierCount ?? 0) + 1 + WAITLIST_DISPLAY_OFFSET
    const boost = 5 * row.direct_referrals + 2 * row.indirect_referrals
    sidebarPosition = Math.max(1, rawOrder - boost)
    directRefs = row.direct_referrals
    indirectRefs = row.indirect_referrals
  }

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

  // Load all snapshots, group into canonical markets, then filter/sort/paginate
  // at canonical level. One card per canonical — singletons and multi-venue
  // alike. This replaces the per-snapshot listing where the same underlying
  // market could appear 3-4 times (once per book).
  const { snapshots, latestDate, perPlatform } = await loadAllLatestSnapshots()
  const { canonical } = groupIntoCanonical(snapshots)

  // Canonical-level filter
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

  // Sort
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
    // Tie-breaker: venueCount desc so multi-book markets float to the top
    if (a.venueCount !== b.venueCount) return b.venueCount - a.venueCount
    return a.question.localeCompare(b.question)
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = (page - 1) * PAGE_SIZE
  const paged = filtered.slice(start, start + PAGE_SIZE)

  // Sparkline data — load 7d of history once, index by primary-quote key, then
  // attach to each card. We only need points for the 50 visible cards; the
  // history loader doesn't support per-id filtering yet so we load all and
  // filter in memory. Same query the dashboard makes — cheap relative to the
  // page render.
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
    console.warn('[markets/page] history load failed; cards render without sparklines', err)
    sparklineByKey = new Map()
  }

  // Facet values: derive from the full canonical set, not the filtered one,
  // so users can always see what's available to filter by.
  const availablePlatforms = [...new Set(canonical.flatMap((c) => c.venues))].sort()
  const availableSports = [
    ...new Set(canonical.map((c) => c.sport).filter((s): s is string => !!s)),
  ].sort()

  // Per-book freshness — still snapshot-level, so derive from raw snapshots.
  const perBook: Record<string, { count: number; latestTs: string | null }> = {}
  for (const s of snapshots) {
    const b = perBook[s.platform]
    if (!b) perBook[s.platform] = { count: 1, latestTs: s.ts }
    else {
      b.count += 1
      if (!b.latestTs || s.ts > b.latestTs) b.latestTs = s.ts
    }
  }
  // perPlatform used only to silence unused warnings; structural equivalence
  // with perBook. Keep both for now to avoid touching PlatformFreshnessStrip.
  void perPlatform

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
    return `/markets${qs ? '?' + qs : ''}`
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col">
      <DashboardTopbar
        dataDate={latestDate}
        marketCount={total}
        latestTs={canonical
          .flatMap((c) => c.quotes.map((q) => q.ts))
          .reduce<string | null>(
            (acc, t) => (acc && acc > t ? acc : t),
            null,
          )}
      />

      <div className="flex-1 flex min-h-0">
        <DashboardSidebar
          email={sidebarEmail}
          position={sidebarPosition}
          directRefs={directRefs}
          indirectRefs={indirectRefs}
        />

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-bold text-black">All markets</h1>
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
                      className="ring-1 ring-stone-300 text-stone-700 px-3 py-1.5 rounded hover:bg-stone-100 hover:ring-stone-400 transition"
                    >
                      ← prev
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={buildPageUrl(page + 1)}
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
            Sneakers groups duplicate listings so you see one row per market. Click through to the detail view for per-venue prices.
            Sneakers is not an exchange; trades execute on the venue you select.
          </footer>
        </main>
      </div>
    </div>
  )
}
