import type { MarketSnapshot } from '@/lib/markets-data'
import { formatVolume } from '@/lib/market-stats'

function bestProb(m: MarketSnapshot): number | null {
  let best: number | null = null
  for (const o of m.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p !== null && p !== undefined && (best === null || p > best)) best = p
  }
  return best
}

function platformBadge(platform: string): { short: string; cls: string } {
  const p = platform.toLowerCase()
  if (p === 'kalshi') return { short: 'K', cls: 'bg-emerald-500/15 text-emerald-700 ring-emerald-400/40' }
  if (p === 'polymarket') return { short: 'P', cls: 'bg-sky-500/15 text-sky-700 ring-sky-400/40' }
  if (p === 'novig') return { short: 'N', cls: 'bg-amber-500/15 text-amber-700 ring-amber-400/40' }
  if (p === 'prophetx') return { short: 'X', cls: 'bg-violet-500/15 text-violet-700 ring-violet-400/40' }
  return { short: platform[0].toUpperCase(), cls: 'bg-stone-500/15 text-stone-700 ring-stone-400/40' }
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function BiggestVolume({ markets }: { markets: MarketSnapshot[] }) {
  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="text-sm font-semibold text-stone-900">Biggest Volume</div>
      </div>
      <div className="px-4 py-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[10px] text-stone-400 tracking-wider pb-2 border-b border-stone-100">
          <div>MARKET</div>
          <div className="text-right">YES</div>
          <div className="text-right">EDGE</div>
          <div className="text-right">VOL</div>
        </div>
        {markets.length === 0 ? (
          <div className="text-xs text-stone-500 py-6 text-center">No markets loaded.</div>
        ) : (
          markets.map((m) => {
            const p = bestProb(m)
            const vol = toNum(m.volume_traded)
            const badge = platformBadge(m.platform)
            return (
              <div
                key={`${m.platform}:${m.platform_market_id}`}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center py-2 border-b border-stone-100 last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-stone-400 flex-shrink-0" />
                  <span className="text-xs text-stone-800 truncate" title={m.question}>
                    {m.question}
                  </span>
                </div>
                <div className="text-xs font-bold text-emerald-600 tabular-nums">
                  {p !== null ? `${Math.round(p * 100)}%` : '—'}
                </div>
                <div className="text-xs text-stone-400 tabular-nums">
                  {m.overround !== null && m.overround > 1.001 ? `${((m.overround - 1) * 100).toFixed(1)}pp` : 'n/a'}
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-[11px] text-stone-600 tabular-nums">{formatVolume(vol)}</span>
                  <span
                    className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ring-1 ${badge.cls}`}
                  >
                    {badge.short}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
