'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { MarketSnapshot } from '@/lib/markets-data'
import { findVenue, VENUES, type Venue } from '@/lib/venues'
import { useTier, gates } from '@/lib/tier-gates'

function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—'
  return `${(p * 100).toFixed(1)}%`
}

function formatNum(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
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

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findCrossVenueMarkets(target: MarketSnapshot, all: MarketSnapshot[]): MarketSnapshot[] {
  const norm = normalize(target.question)
  const out: MarketSnapshot[] = []
  for (const m of all) {
    if (m.platform === target.platform && m.platform_market_id === target.platform_market_id) continue
    if (normalize(m.question) === norm) out.push(m)
  }
  return out
}

function topAsk(m: MarketSnapshot): number | null {
  let best: number | null = null
  for (const o of m.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p != null && (best === null || p < best)) best = p
  }
  return best
}

export function MarketDetailDrawer({ markets }: { markets: MarketSnapshot[] }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const marketKey = params?.get('m') ?? null
  const tier = useTier()
  const g = gates(tier)

  // ESC closes
  useEffect(() => {
    if (!marketKey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const next = new URLSearchParams(params?.toString() ?? '')
        next.delete('m')
        const href = next.toString() ? `${pathname}?${next.toString()}` : pathname
        router.push(href, { scroll: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [marketKey, pathname, params, router])

  // Lock body scroll while open
  useEffect(() => {
    if (!marketKey) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [marketKey])

  if (!marketKey) return null

  const [platform, ...rest] = marketKey.split(':')
  const id = rest.join(':')
  const market = markets.find((m) => m.platform === platform && m.platform_market_id === id)

  const closeParams = new URLSearchParams(params?.toString() ?? '')
  closeParams.delete('m')
  const closeHref = closeParams.toString() ? `${pathname}?${closeParams.toString()}` : pathname

  if (!market) {
    return (
      <DrawerShell closeHref={closeHref}>
        <div className="p-6 text-sm text-stone-600">
          Market not found in the current snapshot. It may have closed or been removed.
        </div>
      </DrawerShell>
    )
  }

  const crossVenue = g.canSeeCrossVenue ? findCrossVenueMarkets(market, markets) : []
  const destinations = tradeDestinations(market.platform)

  return (
    <DrawerShell closeHref={closeHref}>
      <div className="p-6 space-y-5 overflow-y-auto h-full">
        <header>
          <div className="text-[10px] text-stone-400 tracking-wider mb-1">
            {market.platform.toUpperCase()}
            {market.sport ? ` · ${market.sport.toUpperCase()}` : ''}
            {` · ${market.phase.toUpperCase()}`}
          </div>
          <h2 className="text-lg font-semibold text-stone-900 leading-snug">
            {market.question}
          </h2>
        </header>

        <section>
          <div className="text-[10px] text-stone-400 tracking-wider mb-2">Outcomes</div>
          <div className="rounded border border-stone-200">
            {market.outcomes.slice(0, 10).map((o, i) => (
              <div
                key={`${o.name}-${i}`}
                className="flex items-center justify-between px-3 py-2 border-b border-stone-100 last:border-b-0 text-sm"
              >
                <span className="text-stone-800 truncate pr-3">{o.name}</span>
                <span className="tabular-nums text-emerald-600 font-semibold">
                  {pct(o.best_ask ?? o.last_price)}
                </span>
              </div>
            ))}
            {market.outcomes.length > 10 && (
              <div className="px-3 py-2 text-[11px] text-stone-500">
                + {market.outcomes.length - 10} more outcomes
              </div>
            )}
          </div>
          {market.overround !== null && (
            <div className="text-[11px] text-stone-500 mt-2">
              Overround <span className="text-stone-700 font-mono">{market.overround.toFixed(2)}</span>
              {market.overround > 1.05 && (
                <span className="ml-2 text-amber-600">· Wide book</span>
              )}
              {market.overround < 1.01 && (
                <span className="ml-2 text-emerald-600">· Near-zero vig</span>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] text-stone-400 tracking-wider">Other venues</div>
            {!g.canSeeCrossVenue && (
              <Link
                href="/dashboard/billing"
                className="text-[10px] text-emerald-600 hover:underline tracking-wider"
              >
                UNLOCK ON PRO →
              </Link>
            )}
          </div>
          {!g.canSeeCrossVenue ? (
            <div className="rounded border border-dashed border-stone-300 p-4 text-center">
              <div className="text-2xl mb-2">🔒</div>
              <div className="text-xs text-stone-600 mb-1 font-semibold">
                Cross-venue price comparison
              </div>
              <div className="text-[11px] text-stone-500">
                See the same market across Polymarket, Kalshi, NoVig, ProphetX, and sportsbooks side-by-side.
              </div>
            </div>
          ) : crossVenue.length === 0 ? (
            <div className="text-xs text-stone-500 py-3">
              No other venues running this exact market right now.
            </div>
          ) : (
            <div className="rounded border border-stone-200 divide-y divide-stone-100">
              {crossVenue.slice(0, 8).map((m) => {
                const ask = topAsk(m)
                const venue = findVenue(m.platform)
                return (
                  <div
                    key={`${m.platform}:${m.platform_market_id}`}
                    className="px-3 py-2 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-stone-900 truncate">
                        {venue?.name ?? m.platform}
                      </div>
                      {m.overround !== null && (
                        <div className="text-[10px] text-stone-500">
                          overround {m.overround.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="tabular-nums text-sm text-emerald-600 font-semibold">
                      {pct(ask)}
                    </div>
                    {venue?.affiliateUrl ? (
                      <a
                        href={venue.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="text-[10px] tracking-wider px-2 py-1 rounded ring-1 ring-emerald-400/60 text-emerald-700 hover:bg-emerald-500/10 whitespace-nowrap"
                      >
                        TRADE →
                      </a>
                    ) : (
                      <span className="text-[10px] tracking-wider px-2 py-1 rounded ring-1 ring-stone-300 text-stone-500 whitespace-nowrap">
                        NO LINK
                      </span>
                    )}
                  </div>
                )
              })}
              {crossVenue.length > 8 && (
                <div className="px-3 py-2 text-[11px] text-stone-500">
                  + {crossVenue.length - 8} more venues
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="text-[10px] text-stone-400 tracking-wider mb-2">Market info</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {market.resolves_at && (
              <>
                <dt className="text-stone-500">Resolves</dt>
                <dd className="text-stone-800 text-right tabular-nums">
                  {new Date(market.resolves_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </dd>
              </>
            )}
            {market.starts_at && market.starts_at !== market.resolves_at && (
              <>
                <dt className="text-stone-500">Starts</dt>
                <dd className="text-stone-800 text-right tabular-nums">
                  {new Date(market.starts_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </dd>
              </>
            )}
            {market.volume_traded != null && (
              <>
                <dt className="text-stone-500">Volume</dt>
                <dd className="text-stone-800 text-right font-mono">{formatNum(market.volume_traded)}</dd>
              </>
            )}
            {market.liquidity != null && (
              <>
                <dt className="text-stone-500">Liquidity</dt>
                <dd className="text-stone-800 text-right font-mono">{formatNum(market.liquidity)}</dd>
              </>
            )}
            <dt className="text-stone-500">Snapshot</dt>
            <dd className="text-stone-800 text-right tabular-nums">
              {new Date(market.ts).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </dd>
          </dl>
        </section>

        {destinations.length > 0 && (
          <section>
            <div className="text-[10px] text-stone-400 tracking-wider mb-2">Trade this market</div>
            <div className="flex flex-wrap gap-2">
              {destinations.map((v) =>
                v.affiliateUrl ? (
                  <a
                    key={v.id}
                    href={v.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="text-xs tracking-wider px-3 py-2 rounded ring-1 ring-emerald-400/60 text-emerald-700 hover:bg-emerald-500/10 transition font-semibold"
                  >
                    TRADE ON {v.name.toUpperCase()} →
                  </a>
                ) : (
                  <span
                    key={v.id}
                    className="text-xs tracking-wider px-3 py-2 rounded ring-1 ring-stone-300 text-stone-500"
                  >
                    {v.name.toUpperCase()}
                  </span>
                ),
              )}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] text-stone-400 tracking-wider">Price drift</div>
            {!g.canSeeDriftChart && (
              <Link
                href="/dashboard/billing"
                className="text-[10px] text-amber-600 hover:underline tracking-wider"
              >
                UNLOCK ON ELITE →
              </Link>
            )}
          </div>
          {g.canSeeDriftChart ? (
            <div className="rounded border border-stone-200 p-4 text-xs text-stone-500">
              Drift chart coming soon. Historical snapshots are captured; visualization deferred to the next release.
            </div>
          ) : (
            <div className="rounded border border-dashed border-stone-300 p-4 text-center">
              <div className="text-2xl mb-2">🔒</div>
              <div className="text-xs text-stone-600 mb-1 font-semibold">Historical price drift</div>
              <div className="text-[11px] text-stone-500">
                See how this market moved over the last 7 / 30 / 90 days.
              </div>
            </div>
          )}
        </section>
      </div>
    </DrawerShell>
  )
}

function DrawerShell({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  return (
    <>
      <Link
        href={closeHref}
        scroll={false}
        className="fixed inset-0 bg-stone-900/40 z-40"
        aria-label="Close details"
      />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200 flex-shrink-0">
          <div className="text-[10px] text-stone-500 tracking-wider">MARKET DETAIL</div>
          <Link
            href={closeHref}
            scroll={false}
            className="text-stone-400 hover:text-stone-900 text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-stone-100"
            aria-label="Close"
          >
            ✕
          </Link>
        </div>
        {children}
      </aside>
    </>
  )
}
