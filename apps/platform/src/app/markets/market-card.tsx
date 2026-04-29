import Link from 'next/link'
import type { CanonicalMarket } from '@/lib/canonical-markets'
import type { MarketSnapshot } from '@/lib/markets-data'
import { findVenue, VENUES, type Venue } from '@/lib/venues'
import { PlatformLogo } from '../dashboard/platform-logo'
import { RobinhoodSparkline, type ChartPoint } from '@/components/robinhood-chart'

function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—'
  return `${(p * 100).toFixed(1)}%`
}

// Sport-id (lowercased, scraper-canonical) → display emoji.
const SPORT_EMOJI: Record<string, string> = {
  nba: '🏀', basketball: '🏀', ncaab: '🏀', cbb: '🏀', wnba: '🏀',
  nfl: '🏈', football: '🏈', ncaaf: '🏈', cfb: '🏈',
  mlb: '⚾', baseball: '⚾',
  nhl: '🏒', hockey: '🏒',
  soccer: '⚽', mls: '⚽', epl: '⚽', laliga: '⚽', champions_league: '⚽',
  tennis: '🎾', atp: '🎾', wta: '🎾',
  golf: '⛳', pga: '⛳', lpga: '⛳',
  ufc: '🥊', mma: '🥊', boxing: '🥊',
  f1: '🏎️', nascar: '🏎️', motorsport: '🏎️',
  cricket: '🏏', rugby: '🏉', esports: '🎮',
}

function emojiForSport(sport: string | undefined): string | null {
  if (!sport) return null
  return SPORT_EMOJI[sport.toLowerCase()] ?? null
}

function phaseBadge(phase: MarketSnapshot['phase']): { label: string; cls: string } {
  switch (phase) {
    case 'live':
      return { label: 'LIVE', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-300' }
    case 'pre_game':
      return { label: 'PRE', cls: 'bg-amber-50 text-amber-700 ring-amber-300' }
    case 'opening':
      return { label: 'OPENING', cls: 'bg-sky-50 text-sky-700 ring-sky-300' }
    case 'closed':
      return { label: 'CLOSED', cls: 'bg-stone-100 text-stone-600 ring-stone-300' }
  }
}

function tradeDestinations(platforms: string[]): Venue[] {
  const out: Venue[] = []
  const seen = new Set<string>()
  for (const plat of platforms) {
    const v = findVenue(plat)
    if (v && !seen.has(v.id)) {
      seen.add(v.id)
      out.push(v)
    }
    for (const w of VENUES) {
      if (w.wrapperOf === plat && !seen.has(w.id)) {
        seen.add(w.id)
        out.push(w)
      }
    }
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

function topAsk(m: MarketSnapshot): number | null {
  let best: number | null = null
  for (const o of m.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p != null && (best === null || p < best)) best = p
  }
  return best
}

/**
 * Renders one canonical market. If the canonical has multiple venues quoting
 * it, the card shows a "N books" badge and the price is the tightest top-ask
 * across the group. Click-through uses the primary venue's legacy URL — the
 * detail page resolves the full canonical group from that.
 */
export function MarketCard({
  market,
  sparkline,
}: {
  market: CanonicalMarket
  /** Recent price-history points for the primary venue's market_id. Renders a
   *  Robinhood-style sparkline if 2+ points are present; otherwise omitted. */
  sparkline?: ChartPoint[]
}) {
  const primary = market.quotes[0]
  const phase = phaseBadge(primary.phase)
  const destinations = tradeDestinations(market.venues)

  const shown = primary.outcomes.slice(0, 6)
  const overflow = Math.max(0, primary.outcomes.length - shown.length)

  // Best top-ask across venues — this is the tightest price the user can
  // actually trade at right now across all books in the canonical group.
  let bestAsk: number | null = null
  for (const q of market.quotes) {
    const a = topAsk(q)
    if (a != null && (bestAsk === null || a < bestAsk)) bestAsk = a
  }

  const detailHref = `/dashboard/markets/${encodeURIComponent(primary.platform)}/${encodeURIComponent(primary.platform_market_id)}`

  // Aggregate volume across venues — more informative than any single book's
  // volume when the market trades in multiple places.
  let totalVolume = 0
  for (const q of market.quotes) {
    const v = typeof q.volume_traded === 'number' ? q.volume_traded : parseFloat(String(q.volume_traded ?? '0'))
    if (Number.isFinite(v)) totalVolume += v
  }

  return (
    <div className="flex flex-col rounded-lg bg-white ring-1 ring-stone-200 p-5 hover:ring-[#004225]/40 transition">
      <Link href={detailHref} className="block group cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-3">
          <PlatformLogo platform={primary.platform} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-stone-500 tracking-wider mb-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                {market.sport && emojiForSport(market.sport) && (
                  <span aria-hidden>{emojiForSport(market.sport)}</span>
                )}
                <span>{market.sport ? market.sport.toUpperCase() : primary.platform.toUpperCase()}</span>
              </span>
              {market.venueCount > 1 && (
                <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 ring-1 ring-emerald-300">
                  {market.venueCount} BOOKS
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-stone-900 leading-snug line-clamp-3 group-hover:text-[#004225] transition">
              {market.question}
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold tracking-wider rounded-full ring-1 px-2 py-0.5 whitespace-nowrap ${phase.cls}`}
          >
            {phase.label}
          </span>
        </div>

        {sparkline && sparkline.length >= 2 && (
          <div className="mb-3 -mx-1">
            <RobinhoodSparkline points={sparkline} height={40} className="w-full" />
          </div>
        )}

        <div className="space-y-1.5 mb-4">
          {shown.map((o, i) => (
            <div
              key={`${o.name}-${i}`}
              className="flex items-center justify-between text-xs bg-stone-50 px-3 py-2 rounded"
            >
              <span className="text-stone-700 truncate pr-3">{o.name}</span>
              <div className="flex gap-3 font-mono tabular-nums text-stone-500 flex-shrink-0">
                {o.best_ask !== null ? (
                  <span className="text-emerald-700 font-semibold">{pct(o.best_ask)}</span>
                ) : o.last_price !== null ? (
                  <span className="text-stone-500">{pct(o.last_price)}</span>
                ) : (
                  <span className="text-stone-400">—</span>
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
          {bestAsk !== null && market.venueCount > 1 && (
            <span>
              best <span className="text-emerald-700 font-mono">{pct(bestAsk)}</span>
            </span>
          )}
          {totalVolume > 0 && (
            <span>
              vol <span className="text-stone-700 font-mono">{formatNum(totalVolume)}</span>
            </span>
          )}
        </div>
      </Link>

      {destinations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-stone-100">
          {destinations.map((v) =>
            v.affiliateUrl ? (
              <a
                key={v.id}
                href={v.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex items-center gap-1.5 text-[10px] tracking-wider pl-1 pr-2 py-0.5 rounded-full ring-1 ring-[#004225]/40 text-[#004225] hover:bg-[#004225]/5 transition"
                title={`Trade ${v.name} →`}
              >
                <PlatformLogo platform={v.id} size="xs" />
                <span>{v.name.toUpperCase()}</span>
                <span aria-hidden>→</span>
              </a>
            ) : (
              <span
                key={v.id}
                className="inline-flex items-center gap-1.5 text-[10px] tracking-wider pl-1 pr-2 py-0.5 rounded-full ring-1 ring-stone-300 text-stone-500"
              >
                <PlatformLogo platform={v.id} size="xs" />
                <span>{v.name.toUpperCase()}</span>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  )
}
