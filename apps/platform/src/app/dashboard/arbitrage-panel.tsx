'use client'

import Link from 'next/link'
import type { MarketSnapshot } from '@/lib/markets-data'
import { useTier, gates } from '@/lib/tier-gates'
import { MarketLink } from './market-link'

export function ArbitragePanel({ candidates }: { candidates: MarketSnapshot[] }) {
  const tier = useTier()
  const g = gates(tier)
  const paywall = !g.canSeeLiveArbs

  return (
    <div className="rounded border border-stone-200 bg-white h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="text-sm font-semibold text-stone-900">Arbitrage</div>
        <span className="text-[10px] text-stone-400 tracking-wider">
          {candidates.length} CANDIDATES
        </span>
      </div>

      {paywall ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          <div className="text-2xl mb-3">🔒</div>
          <div className="text-sm text-stone-800 font-semibold mb-1">
            Opportunities are delayed on Free.
          </div>
          <div className="text-xs text-stone-500 leading-relaxed mb-4">
            By the time you see them, the edge is gone.{' '}
            <Link
              href="/dashboard/billing"
              className="text-emerald-600 font-semibold hover:underline"
            >
              Upgrade →
            </Link>
          </div>
          <div className="text-[10px] text-stone-400 tracking-wider">
            {candidates.length > 0
              ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} waiting`
              : 'Scanning live…'}
          </div>
        </div>
      ) : (
        <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="text-xs text-stone-500 py-6 text-center">
              No arbitrage candidates right now. Check back after the next scraper run.
            </div>
          ) : (
            candidates.map((m) => (
              <MarketLink
                key={`${m.platform}:${m.platform_market_id}`}
                market={m}
                className="block py-2 border-b border-stone-100 last:border-b-0 hover:bg-stone-50 -mx-4 px-4 transition"
              >
                <div className="text-xs text-stone-800 truncate" title={m.question}>
                  {m.question}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-stone-500">
                  <span>{m.platform.toUpperCase()}</span>
                  {m.overround !== null && (
                    <span className="text-amber-600 font-semibold">
                      +{((m.overround - 1) * 100).toFixed(1)}pp edge
                    </span>
                  )}
                </div>
              </MarketLink>
            ))
          )}
        </div>
      )}
    </div>
  )
}
