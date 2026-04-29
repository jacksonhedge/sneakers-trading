'use client'

import Link from 'next/link'
import type { BigMover } from '@/lib/market-stats'
import { useTier, gates } from '@/lib/tier-gates'
import { MarketLink } from './market-link'
import { VenueCountBadge } from './venue-count-badge'
import { PlatformLogo } from './platform-logo'
import { Price } from './price'
import { RobinhoodSparkline, type ChartPoint } from '@/components/robinhood-chart'

function ppDelta(delta: number): string {
  return `+${Math.round(delta * 100)}pp`
}

function fmtAge(tsA: string, tsB: string): string {
  const ms = Math.abs(Date.parse(tsB) - Date.parse(tsA))
  if (!Number.isFinite(ms)) return '—'
  const hrs = ms / (1000 * 60 * 60)
  if (hrs < 1) return `${Math.round(hrs * 60)}m`
  if (hrs < 24) return `${Math.round(hrs)}h`
  const days = Math.round(hrs / 24)
  return `${days}d`
}

export function BigMovers({
  movers,
  venueCounts,
  sparklineByKey,
}: {
  movers: BigMover[]
  venueCounts?: Record<string, number>
  /** Map<`${platform}:${market_id}`, points>. When present, each row renders
   *  a Robinhood-style sparkline showing the trajectory that triggered the
   *  big-mover hit. Built once at the page level from loadMarketHistory. */
  sparklineByKey?: Map<string, ChartPoint[]>
}) {
  const tier = useTier()
  const g = gates(tier)
  // Gate: "biggest movers" visibility uses the same gate as live arbs —
  // it's a near-real-time signal that represents product value.
  const paywall = !g.canSeeLiveArbs

  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold text-stone-900">Biggest Movers</div>
          <div className="text-[10px] text-stone-500 tracking-wider">
            ≥40PP RISE · NOW ≥86%
          </div>
        </div>
        <span className="text-[10px] text-stone-500 tracking-wider">
          {paywall ? `${movers.length} HIDDEN` : `${movers.length} SHOWN`}
        </span>
      </div>

      {paywall ? (
        <div className="px-6 py-8 text-center">
          <div className="text-2xl mb-2">🔒</div>
          <div className="text-sm text-stone-800 font-semibold mb-1">
            Catch breakouts as they happen.
          </div>
          <div className="text-xs text-stone-500 leading-relaxed mb-3">
            Markets that surged 40+ points into near-consensus territory —{' '}
            <Link
              href="/dashboard/billing"
              className="text-emerald-600 font-semibold hover:underline"
            >
              Upgrade to Pro →
            </Link>
          </div>
          <div className="text-[10px] text-stone-500 tracking-wider">
            {movers.length > 0
              ? `${movers.length} mover${movers.length === 1 ? '' : 's'} this week`
              : 'Scanning…'}
          </div>
        </div>
      ) : movers.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-stone-500">
          No ≥40pp movers in the current window. Movers refresh as new prices come in — check back in a few minutes.
        </div>
      ) : (
        <div className="px-4 py-2">
          <div className="grid grid-cols-[auto_1fr_90px_auto_auto_auto] gap-3 text-[10px] text-stone-500 tracking-wider pb-2 border-b border-stone-100">
            <div></div>
            <div>MARKET</div>
            <div></div>
            <div className="text-right">NOW</div>
            <div className="text-right">Δ</div>
            <div className="text-right">WINDOW</div>
          </div>
          {movers.map((m) => {
            const key = `${m.market.platform}:${m.market.platform_market_id}`
            const points = sparklineByKey?.get(key)
            return (
              <MarketLink
                key={key}
                market={m.market}
                className="grid grid-cols-[auto_1fr_90px_auto_auto_auto] gap-3 items-center py-2 border-b border-stone-100 last:border-b-0 hover:bg-stone-50 -mx-4 px-4 transition"
              >
                <PlatformLogo platform={m.market.platform} size="md" />
                <div className="flex items-center gap-2 min-w-0">
                  <VenueCountBadge
                    count={venueCounts?.[`${m.market.platform}:${m.market.platform_market_id}`]}
                  />
                  <span
                    className="text-xs text-stone-800 truncate leading-snug"
                    title={m.market.question}
                  >
                    {m.market.question}
                  </span>
                </div>
                <div className="flex items-center justify-end h-full">
                  {points && points.length >= 2 ? (
                    <RobinhoodSparkline points={points} height={28} className="w-full" />
                  ) : (
                    <span className="text-[10px] text-stone-300">—</span>
                  )}
                </div>
                <div className="text-xs font-semibold text-emerald-600 font-mono tabular-nums tracking-tight text-right">
                  <Price value={m.currentProb} />
                </div>
                <div className="text-xs font-semibold text-amber-600 font-mono tabular-nums tracking-tight text-right">
                  {ppDelta(m.delta)}
                </div>
                <div className="text-[10px] text-stone-500 font-mono tabular-nums text-right whitespace-nowrap">
                  {fmtAge(m.firstSeenTs, m.latestTs)}
                </div>
              </MarketLink>
            )
          })}
          <div className="text-[10px] text-stone-400 pt-2 border-t border-stone-100 mt-2">
            Movers persist once they hit the threshold; re-evaluated as new prices arrive.
          </div>
        </div>
      )}
    </div>
  )
}
