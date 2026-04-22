'use client'

import Link from 'next/link'
import { useTier, gates } from '@/lib/tier-gates'
import type { CrossBookPair } from '@/lib/arb-scanner'

const FREE_VISIBLE = 3

function formatEdge(sum: number | null): string {
  if (sum == null) return '—'
  const pp = (1 - sum) * 100
  const sign = pp >= 0 ? '+' : ''
  return `${sign}${pp.toFixed(2)}pp`
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

export function ArbitragePanel({ candidates }: { candidates: CrossBookPair[] }) {
  const tier = useTier()
  const g = gates(tier)
  const isPaid = g.canSeeLiveArbs

  // Free tier sees a teaser: top 3 pairs, with book names hidden on
  // actionable (sub-1.00) arbs. Pro+ sees the whole list.
  const visible = isPaid ? candidates : candidates.slice(0, FREE_VISIBLE)
  const hiddenCount = Math.max(0, candidates.length - visible.length)

  return (
    <div className="rounded border border-stone-200 bg-white h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="text-sm font-semibold text-stone-900">Cross-Book Spread</div>
        <span className="text-[10px] text-stone-400 tracking-wider">
          {candidates.length} PAIR{candidates.length === 1 ? '' : 'S'}
        </span>
      </div>

      <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="text-xs text-stone-500 py-6 text-center">
            No cross-book pairs yet. Need 2+ books quoting the same pre-game market
            within a 10-minute window.
          </div>
        ) : (
          visible.map((p) => {
            const redact = p.isArb && !isPaid
            const edge = formatEdge(p.bestSum)
            const edgeCls = p.isArb
              ? 'text-emerald-600 font-bold'
              : 'text-amber-600 font-semibold'
            return (
              <div
                key={`${p.sport}:${p.away}@${p.home}:${p.startsAt}`}
                className="py-2 border-b border-stone-100 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-stone-800 truncate" title={`${p.away} @ ${p.home}`}>
                    <span className="text-[10px] text-stone-400 tracking-wider mr-1.5">
                      {p.sport.toUpperCase()}
                    </span>
                    {p.away} @ {p.home}
                  </div>
                  <span className={`text-[11px] tabular-nums whitespace-nowrap ${edgeCls}`}>
                    {p.isArb ? `${edge} ARB` : edge}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-stone-500 flex flex-wrap gap-x-3 gap-y-0.5">
                  {p.cheapestHome && (
                    <span>
                      cheapest HOME:{' '}
                      {redact ? (
                        <span className="text-stone-400">premium</span>
                      ) : (
                        <span className="text-stone-700 font-medium">
                          {p.cheapestHome.platform}
                        </span>
                      )}{' '}
                      <span className="tabular-nums">{pct(p.cheapestHome.ask)}</span>
                    </span>
                  )}
                  {p.cheapestAway && (
                    <span>
                      AWAY:{' '}
                      {redact ? (
                        <span className="text-stone-400">premium</span>
                      ) : (
                        <span className="text-stone-700 font-medium">
                          {p.cheapestAway.platform}
                        </span>
                      )}{' '}
                      <span className="tabular-nums">{pct(p.cheapestAway.ask)}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {!isPaid && (hiddenCount > 0 || visible.some((p) => p.isArb)) && (
        <div className="px-4 py-2.5 border-t border-stone-200 bg-stone-50 text-[11px] text-stone-600 leading-snug">
          {hiddenCount > 0 && (
            <>
              +{hiddenCount} more pair{hiddenCount === 1 ? '' : 's'} behind{' '}
            </>
          )}
          {hiddenCount === 0 && <>Book names on real arbs behind </>}
          <Link
            href="/dashboard/billing"
            className="text-emerald-600 font-semibold hover:underline"
          >
            Pro →
          </Link>
        </div>
      )}
    </div>
  )
}
