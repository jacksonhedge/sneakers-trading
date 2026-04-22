import type { MarketSnapshot } from '@/lib/markets-data'
import { findVenue, VENUES, type Venue } from '@/lib/venues'

function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—'
  return `${(p * 100).toFixed(p >= 0.995 ? 1 : 1)}%`
}

function phaseBadge(phase: MarketSnapshot['phase']): { label: string; cls: string } {
  switch (phase) {
    case 'live':
      return { label: 'LIVE', cls: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40' }
    case 'pre_game':
      return { label: 'PRE', cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30' }
    case 'opening':
      return { label: 'OPENING', cls: 'bg-sky-500/15 text-sky-300 ring-sky-400/30' }
    case 'closed':
      return { label: 'CLOSED', cls: 'bg-stone-700/40 text-stone-400 ring-stone-600/30' }
  }
}

function tradeDestinations(platform: string): Venue[] {
  const out: Venue[] = []
  const primary = findVenue(platform)
  if (primary) out.push(primary)
  for (const v of VENUES) {
    if (v.wrapperOf === platform) out.push(v)
  }
  return out
}

function formatNum(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

export function MarketCard({ market }: { market: MarketSnapshot }) {
  const phase = phaseBadge(market.phase)
  const destinations = tradeDestinations(market.platform)

  // Render up to 6 outcomes to keep cards compact. Most binary / YES-NO
  // markets have 2; futures can have 20+ — we trim and note the overflow.
  const shown = market.outcomes.slice(0, 6)
  const overflow = Math.max(0, market.outcomes.length - shown.length)

  return (
    <div className="flex flex-col rounded-lg bg-stone-950/80 ring-1 ring-stone-800 p-5 hover:ring-emerald-400/40 transition">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-stone-500 tracking-wider mb-1">
            {market.platform.toUpperCase()}
            {market.sport ? ` · ${market.sport.toUpperCase()}` : ''}
          </div>
          <div className="text-sm font-semibold text-white leading-snug line-clamp-3">
            {market.question}
          </div>
        </div>
        <span
          className={`text-[10px] font-semibold tracking-wider rounded-full ring-1 px-2 py-0.5 whitespace-nowrap ${phase.cls}`}
        >
          {phase.label}
        </span>
      </div>

      <div className="space-y-1.5 mb-4">
        {shown.map((o, i) => (
          <div
            key={`${o.name}-${i}`}
            className="flex items-center justify-between text-xs bg-stone-900/60 px-3 py-2 rounded"
          >
            <span className="text-stone-300 truncate pr-3">{o.name}</span>
            <div className="flex gap-3 tabular-nums text-stone-400 flex-shrink-0">
              {o.best_ask !== null ? (
                <span className="text-emerald-300 font-semibold">{pct(o.best_ask)}</span>
              ) : o.last_price !== null ? (
                <span className="text-stone-400">{pct(o.last_price)}</span>
              ) : (
                <span className="text-stone-500">—</span>
              )}
            </div>
          </div>
        ))}
        {overflow > 0 && (
          <div className="text-[11px] text-stone-500 pl-3">
            + {overflow} more outcome{overflow === 1 ? '' : 's'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-stone-500 mb-3">
        {market.overround !== null && (
          <span>
            overround <span className="text-stone-300 font-mono">{market.overround.toFixed(2)}</span>
          </span>
        )}
        {market.volume_traded && (
          <span>
            vol <span className="text-stone-300 font-mono">{formatNum(market.volume_traded)}</span>
          </span>
        )}
      </div>

      {destinations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-stone-800">
          {destinations.map((v) =>
            v.affiliateUrl ? (
              <a
                key={v.id}
                href={v.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="text-[10px] tracking-wider px-2.5 py-1 rounded ring-1 ring-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10 transition"
              >
                TRADE ON {v.name.toUpperCase()} →
              </a>
            ) : (
              <span
                key={v.id}
                className="text-[10px] tracking-wider px-2.5 py-1 rounded ring-1 ring-stone-700 text-stone-500"
              >
                {v.name.toUpperCase()}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  )
}
