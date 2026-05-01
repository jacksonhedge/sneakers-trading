import type { MarketSnapshot } from '@/lib/markets-data'
import { MarketLink } from './market-link'
import { PlatformLogo } from './platform-logo'
import { VenueCountBadge } from './venue-count-badge'

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function bestProb(m: MarketSnapshot): number | null {
  let best: number | null = null
  for (const o of m.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p !== null && p !== undefined && (best === null || p > best)) best = p
  }
  return best
}

export function UpcomingResolutions({
  markets,
  venueCounts,
}: {
  markets: MarketSnapshot[]
  venueCounts?: Record<string, number>
}) {
  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div>
          <div className="text-sm font-semibold text-stone-900">Upcoming</div>
          <div className="text-sm font-semibold text-stone-900">Resolutions</div>
        </div>
        <div className="text-[11px] text-stone-500 bg-stone-100 rounded px-2 py-1">This Week ▾</div>
      </div>
      <div className="px-4 py-2">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 text-[10px] text-stone-500 tracking-wider pb-2 border-b border-stone-100">
          <div>DATE</div>
          <div>MARKET</div>
          <div className="text-right">YES%</div>
          <div className="text-right">IMPACT</div>
        </div>
        {markets.length === 0 ? (
          <div className="text-xs text-stone-500 py-6 text-center">
            No resolutions in the next week.
          </div>
        ) : (
          markets.map((m) => {
            const p = bestProb(m)
            return (
              <MarketLink
                key={`${m.platform}:${m.platform_market_id}`}
                market={m}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center py-2 border-b border-stone-100 last:border-b-0 hover:bg-stone-50 -mx-4 px-4 transition"
              >
                <div className="text-[11px] text-stone-600 font-mono tabular-nums">{fmtDate(m.resolves_at)}</div>
                <div className="flex items-center gap-2 min-w-0" title={m.question}>
                  <PlatformLogo platform={m.platform} size="sm" />
                  <VenueCountBadge count={venueCounts?.[`${m.platform}:${m.platform_market_id}`]} />
                  <span className="text-xs text-stone-800 truncate">{m.question}</span>
                </div>
                <div className="text-xs font-semibold text-emerald-600 font-mono tabular-nums tracking-tight text-right">
                  {p !== null ? `${Math.round(p * 100)}%` : '—'}
                </div>
                <div className="text-[10px] text-stone-400 text-right">—</div>
              </MarketLink>
            )
          })
        )}
      </div>
    </div>
  )
}

export function MyPositions() {
  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="text-sm font-semibold text-stone-900">My Positions</div>
        <div className="text-[11px] text-stone-500 hover:underline cursor-not-allowed">View All ›</div>
      </div>
      <div className="px-4 py-6">
        <div className="text-center text-xs text-stone-500 mb-3">
          No positions yet. Browse markets and one-click trade to start tracking your P&amp;L here.
        </div>
        <div className="flex items-center justify-between text-xs text-stone-400 border-t border-stone-100 pt-3">
          <span>Total P&amp;L</span>
          <span className="font-mono tabular-nums">—</span>
        </div>
      </div>
    </div>
  )
}
