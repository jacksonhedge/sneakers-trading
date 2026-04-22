import type { MarketSnapshot, MarketHistory } from './markets-data'

// Bloomberg-style dashboard categorization. Maps the raw `sport` field on a
// snapshot to a display category. Mirrors the column groupings in the target
// layout (Politics / Economics / Crypto / Sports / Tech / Other).
export type TerminalCategory = 'politics' | 'economics' | 'crypto' | 'sports' | 'tech' | 'other'

const CATEGORY_MAP: Record<string, TerminalCategory> = {
  politics: 'politics',
  elections: 'politics',
  economics: 'economics',
  fed: 'economics',
  finance: 'economics',
  crypto: 'crypto',
  bitcoin: 'crypto',
  ethereum: 'crypto',
  technology: 'tech',
  tech: 'tech',
  companies: 'tech',
  // sports
  nba: 'sports',
  basketball: 'sports',
  nfl: 'sports',
  football: 'sports',
  mlb: 'sports',
  baseball: 'sports',
  nhl: 'sports',
  ice_hockey: 'sports',
  soccer: 'sports',
  boxing: 'sports',
  mma: 'sports',
  tennis: 'sports',
  golf: 'sports',
  wnba: 'sports',
  ncaab: 'sports',
  ncaaf: 'sports',
  entertainment: 'other',
}

export function categoryOf(market: Pick<MarketSnapshot, 'sport' | 'tags'>): TerminalCategory {
  const sport = (market.sport ?? '').toLowerCase()
  if (CATEGORY_MAP[sport]) return CATEGORY_MAP[sport]
  // fall back to tags
  for (const tag of market.tags ?? []) {
    const mapped = CATEGORY_MAP[tag.toLowerCase()]
    if (mapped) return mapped
  }
  return 'other'
}

export const CATEGORY_META: Record<TerminalCategory, { label: string; short: string; badgeCls: string; lineCls: string }> = {
  politics: { label: 'Politics', short: 'POL', badgeCls: 'bg-blue-500/15 text-blue-600 ring-blue-400/40', lineCls: 'stroke-blue-500' },
  economics: { label: 'Economics', short: 'ECO', badgeCls: 'bg-emerald-500/15 text-emerald-600 ring-emerald-400/40', lineCls: 'stroke-emerald-500' },
  crypto: { label: 'Crypto', short: 'BTC', badgeCls: 'bg-amber-500/15 text-amber-600 ring-amber-400/40', lineCls: 'stroke-amber-500' },
  sports: { label: 'Sports', short: 'SPT', badgeCls: 'bg-purple-500/15 text-purple-600 ring-purple-400/40', lineCls: 'stroke-purple-500' },
  tech: { label: 'Tech', short: 'TEC', badgeCls: 'bg-rose-500/15 text-rose-600 ring-rose-400/40', lineCls: 'stroke-rose-500' },
  other: { label: 'Other', short: 'OTH', badgeCls: 'bg-stone-500/15 text-stone-600 ring-stone-400/40', lineCls: 'stroke-stone-500' },
}

export type CategoryStats = {
  category: TerminalCategory
  activeCount: number
  avgProb: number | null
  volume24h: number | null
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function representativeProb(market: MarketSnapshot): number | null {
  // Pick the max (best_ask ?? last_price) across outcomes. For 2-outcome Yes/No
  // markets this is the "favorite" probability — the natural headline number.
  let best: number | null = null
  for (const o of market.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p !== null && p !== undefined && (best === null || p > best)) best = p
  }
  return best
}

export function aggregateByCategory(markets: MarketSnapshot[]): Record<TerminalCategory, CategoryStats> {
  const cats: TerminalCategory[] = ['politics', 'economics', 'crypto', 'sports', 'tech', 'other']
  const acc: Record<TerminalCategory, { count: number; probSum: number; probN: number; vol: number; volN: number }> = Object.fromEntries(
    cats.map((c) => [c, { count: 0, probSum: 0, probN: 0, vol: 0, volN: 0 }]),
  ) as typeof acc

  for (const m of markets) {
    if (m.phase === 'closed') continue
    const c = categoryOf(m)
    acc[c].count += 1
    const p = representativeProb(m)
    if (p !== null) {
      acc[c].probSum += p
      acc[c].probN += 1
    }
    const v = toNum(m.volume_traded)
    if (v !== null) {
      acc[c].vol += v
      acc[c].volN += 1
    }
  }

  return Object.fromEntries(
    cats.map((c) => [
      c,
      {
        category: c,
        activeCount: acc[c].count,
        avgProb: acc[c].probN > 0 ? acc[c].probSum / acc[c].probN : null,
        volume24h: acc[c].volN > 0 ? acc[c].vol : null,
      },
    ]),
  ) as Record<TerminalCategory, CategoryStats>
}

export function topByVolume(markets: MarketSnapshot[], limit = 6): MarketSnapshot[] {
  return [...markets]
    .filter((m) => m.phase !== 'closed')
    .sort((a, b) => (toNum(b.volume_traded) ?? 0) - (toNum(a.volume_traded) ?? 0))
    .slice(0, limit)
}

export function upcomingResolutions(markets: MarketSnapshot[], windowDays = 7, limit = 8): MarketSnapshot[] {
  const now = Date.now()
  const cutoff = now + windowDays * 24 * 3600 * 1000
  return [...markets]
    .filter((m) => {
      if (!m.resolves_at) return false
      const t = new Date(m.resolves_at).getTime()
      return Number.isFinite(t) && t >= now && t <= cutoff
    })
    .sort((a, b) => new Date(a.resolves_at!).getTime() - new Date(b.resolves_at!).getTime())
    .slice(0, limit)
}

/**
 * Arbitrage candidates — markets with overround ≥ threshold, indicating a
 * spread wide enough to be worth investigating manually. Not an executable
 * arb — just a ranking heuristic. See apps/trader/src/scanner/rank.ts for
 * the canonical version with liquidity gates.
 */
export function arbCandidates(markets: MarketSnapshot[], limit = 6): MarketSnapshot[] {
  return [...markets]
    .filter((m) => m.phase !== 'closed' && m.overround !== null && m.overround >= 1.05)
    .sort((a, b) => (b.overround ?? 0) - (a.overround ?? 0))
    .slice(0, limit)
}

export type BigMover = {
  market: MarketSnapshot // latest snapshot
  currentProb: number
  minProb: number
  maxProb: number
  delta: number // currentProb - minProb, expressed 0–1
  firstSeenTs: string
  latestTs: string
  samples: number
}

/**
 * Detect markets whose headline probability has risen sharply into
 * near-consensus territory. Default: rose at least `deltaThreshold` (40pp)
 * at any point within the window AND currently trades at or above
 * `currentThreshold` (86%). Requires `minSamples` observations to avoid
 * noise from markets that only just started being scraped.
 */
export function bigMovers(
  histories: MarketHistory[],
  opts: {
    deltaThreshold?: number // e.g. 0.40 = 40 percentage points
    currentThreshold?: number // e.g. 0.86 = must currently be >= 86%
    minSamples?: number
    limit?: number
  } = {},
): BigMover[] {
  const deltaThreshold = opts.deltaThreshold ?? 0.4
  const currentThreshold = opts.currentThreshold ?? 0.86
  const minSamples = opts.minSamples ?? 3
  const limit = opts.limit ?? 12

  const out: BigMover[] = []
  for (const h of histories) {
    if (h.snapshots.length < minSamples) continue
    const latest = h.snapshots[h.snapshots.length - 1]
    if (latest.phase === 'closed') continue
    const current = representativeProb(latest)
    if (current === null || current < currentThreshold) continue

    let min: number | null = null
    let max: number | null = null
    for (const s of h.snapshots) {
      const p = representativeProb(s)
      if (p === null) continue
      if (min === null || p < min) min = p
      if (max === null || p > max) max = p
    }
    if (min === null || max === null) continue

    const delta = current - min
    if (delta < deltaThreshold) continue

    out.push({
      market: latest,
      currentProb: current,
      minProb: min,
      maxProb: max,
      delta,
      firstSeenTs: h.snapshots[0].ts,
      latestTs: latest.ts,
      samples: h.snapshots.length,
    })
  }

  out.sort((a, b) => b.delta - a.delta)
  return out.slice(0, limit)
}

export function formatVolume(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export function formatPct(p: number | null): string {
  if (p === null) return '—'
  return `${Math.round(p * 100)}%`
}
