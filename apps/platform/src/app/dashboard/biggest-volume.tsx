import type { MarketSnapshot } from '@/lib/markets-data'
import { formatVolume } from '@/lib/market-stats'
import { MarketLink } from './market-link'
import { PlatformLogo } from './platform-logo'
import { VenueCountBadge } from './venue-count-badge'
import { RobinhoodSparkline, type ChartPoint } from '@/components/robinhood-chart'

function topOutcome(m: MarketSnapshot) {
  let pick: MarketSnapshot['outcomes'][number] | null = null
  let best: number | null = null
  for (const o of m.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p !== null && p !== undefined && (best === null || p > best)) {
      best = p
      pick = o
    }
  }
  return { outcome: pick, prob: best }
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function BiggestVolume({
  markets,
  venueCounts,
  sparklineByKey,
}: {
  markets: MarketSnapshot[]
  venueCounts?: Record<string, number>
  /** Optional Map<`${platform}:${market_id}`, points>. When present, each row
   *  renders a tiny Robinhood-style sparkline alongside the price/volume. */
  sparklineByKey?: Map<string, ChartPoint[]>
}) {
  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="text-sm font-semibold text-stone-900">Biggest Volume</div>
        <span className="text-[10px] text-stone-500 tracking-wider">
          {markets.length} SHOWN
        </span>
      </div>
      <div className="px-4 py-2">
        <div className="grid grid-cols-[1fr_70px_auto_auto] gap-3 text-[10px] text-stone-500 tracking-wider pb-2 border-b border-stone-100">
          <div>MARKET</div>
          <div></div>
          <div className="text-right">YES</div>
          <div className="text-right">VOL</div>
        </div>
        {markets.length === 0 ? (
          <div className="text-xs text-stone-700 py-8 text-center">
            Scrapers warming up. Fresh data every 10 min.
          </div>
        ) : (
          markets.map((m) => {
            const { prob } = topOutcome(m)
            const vol = toNum(m.volume_traded)
            const key = `${m.platform}:${m.platform_market_id}`
            const points = sparklineByKey?.get(key)
            return (
              <MarketLink
                key={key}
                market={m}
                className="grid grid-cols-[1fr_70px_auto_auto] gap-3 items-center py-2.5 border-b border-stone-100 last:border-b-0 hover:bg-stone-50 -mx-4 px-4 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <PlatformLogo platform={m.platform} size="md" />
                  <VenueCountBadge count={venueCounts?.[`${m.platform}:${m.platform_market_id}`]} />
                  <span
                    className="text-xs text-stone-800 truncate leading-snug"
                    title={m.question}
                  >
                    {m.question}
                  </span>
                </div>
                <div className="flex items-center justify-end h-full">
                  {points && points.length >= 2 ? (
                    <RobinhoodSparkline points={points} height={28} className="w-full" />
                  ) : (
                    <span className="text-[10px] text-stone-300">—</span>
                  )}
                </div>
                <div className="flex flex-col items-end leading-tight">
                  <div className="text-sm font-semibold text-stone-900 font-mono tabular-nums tracking-tight">
                    {prob !== null ? `${Math.round(prob * 100)}%` : '—'}
                  </div>
                  {prob !== null && (
                    <div className="text-[10px] text-stone-500 font-mono tabular-nums tracking-tight">
                      ${prob.toFixed(2)}
                    </div>
                  )}
                  {typeof m.change24h === 'number' && m.change24h !== 0 && (
                    <div
                      className={`text-[10px] font-semibold font-mono tabular-nums tracking-tight flex items-center gap-0.5 ${
                        m.change24h > 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                      title="24h change in implied probability"
                    >
                      <span aria-hidden>{m.change24h > 0 ? '▲' : '▼'}</span>
                      {Math.abs(m.change24h * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-stone-700 font-mono tabular-nums text-right whitespace-nowrap">
                  {formatVolume(vol)}
                </div>
              </MarketLink>
            )
          })
        )}
      </div>
    </div>
  )
}
