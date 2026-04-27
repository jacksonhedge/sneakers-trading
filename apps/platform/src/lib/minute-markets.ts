import { loadAllLatestSnapshots, type MarketSnapshot } from './markets-data'
import { safeQuery } from './db'

// Minute Markets — short-duration markets (≤ 60 min to resolution) that don't
// fit the orderbook-style gate in /api/markets/opportunities. Limitless and OG
// are AMM markets exposing only an implied probability (no separate best_bid),
// so we use an AMM-friendly gate here. Logic is shared between the API route
// and the /dashboard/minute page so they always agree on what's tradeable.

export const DEFAULT_WITHIN_MIN = 60
export const MAX_WITHIN_MIN = 240
export const MAX_RESPONSE_MARKETS = 500

const ASSET_PATTERNS: Array<[string, RegExp]> = [
  // More specific patterns first — "Bitcoin Cash" must match BCH before BTC's
  // bitcoin alternation captures it; "Ethereum Classic" same vs ETH. OG names
  // markets long-form ("Litecoin price..."), Limitless uses tickers ("LTC
  // above $X..."), Kalshi mixes both. Cover both phrasings per asset.
  ['BCH', /\b(BCH|bitcoin\s+cash)\b/i],
  ['ETC', /\b(ETC|ethereum\s+classic)\b/i],
  ['PAXG', /\b(PAXG|gold)\b/i],
  ['BTC', /\b(BTC|bitcoin)\b/i],
  ['ETH', /\b(ETH|ethereum)\b/i],
  ['SOL', /\b(SOL|solana)\b/i],
  ['XRP', /\b(XRP|ripple)\b/i],
  ['DOGE', /\b(DOGE|dogecoin)\b/i],
  ['XLM', /\b(XLM|stellar)\b/i],
  ['LTC', /\b(LTC|litecoin)\b/i],
  ['HYPE', /\bHYPE\b/i],
  ['ZEC', /\b(ZEC|zcash)\b/i],
  ['ADA', /\b(ADA|cardano)\b/i],
  ['AVAX', /\b(AVAX|avalanche)\b/i],
  ['LINK', /\b(LINK|chainlink)\b/i],
  ['DOT', /\b(DOT|polkadot)\b/i],
  ['MATIC', /\b(MATIC|polygon)\b/i],
  ['TRX', /\b(TRX|tron)\b/i],
  ['SUI', /\bSUI\b/i],
  ['HBAR', /\b(HBAR|hedera)\b/i],
  ['LEO', /\bLEO\b/i],
  ['WLFI', /\bWLFI\b/i],
  ['XMR', /\b(XMR|monero)\b/i],
]

const CRYPTO_SPORTS = new Set(['crypto', 'bitcoin', 'ethereum', 'solana', 'daily'])

export type Bucket = '5m' | '15m' | '30m' | '60m'

export interface MinuteMarket {
  platform: string
  market_id: string
  question: string
  sport?: string
  asset: string | null
  strike: number | null
  direction: 'above' | 'below' | null
  outcomes: Array<{
    name: string
    best_bid: number | null
    best_ask: number | null
    last_price: number | null
  }>
  volume: number | null
  liquidity: number | null
  resolves_at: string
  minutes_to_resolve: number
  bucket: Bucket | null
  phase: MarketSnapshot['phase']
  ts: string
  change_5m: number | null
  movement_samples: number
}

export interface MinuteGroup {
  asset: string | null
  resolves_at: string
  minutes_to_resolve: number
  bucket: Bucket | null
  platforms: string[]
  market_count: number
  strike_min: number | null
  strike_max: number | null
  markets: MinuteMarket[]
}

export interface MinuteMarketsResult {
  generatedAt: string
  lastUpdated: string | null
  windowMinutes: number
  assetFilter: string | null
  totalMarkets: number
  bucketCounts: Record<Bucket, number>
  platformBreakdown: Record<string, number>
  assetsAvailable: string[]
  markets?: MinuteMarket[]
  groups?: MinuteGroup[]
  totalGroups?: number
}

function extractAsset(question: string): string | null {
  for (const [sym, re] of ASSET_PATTERNS) if (re.test(question)) return sym
  return null
}

function extractStrike(question: string): number | null {
  const m = question.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function extractDirection(question: string): 'above' | 'below' | null {
  if (/\babove\b|>\s*\$|≥\s*\$|>=\s*\$/i.test(question)) return 'above'
  if (/\bbelow\b|<\s*\$|≤\s*\$|<=\s*\$/i.test(question)) return 'below'
  return null
}

function bucketize(minutes: number): Bucket | null {
  if (minutes <= 5) return '5m'
  if (minutes <= 15) return '15m'
  if (minutes <= 30) return '30m'
  if (minutes <= 60) return '60m'
  return null
}

function isMinuteTradeable(s: MarketSnapshot): boolean {
  return s.outcomes.some((o) => o.best_ask != null && o.best_ask > 0 && o.best_ask <= 1)
}

interface MovementRow {
  market_id: string
  observed_at: Date | string
  best_ask: number | string | null
}

async function fetchMovements(
  marketIds: string[],
): Promise<Map<string, { change_5m: number | null; samples: number }>> {
  const out = new Map<string, { change_5m: number | null; samples: number }>()
  if (marketIds.length === 0) return out
  const sql = `
    SELECT p.market_id, p.observed_at, p.best_ask
    FROM price_observations p
    WHERE p.market_id = ANY($1)
      AND p.outcome_id = 'yes'
      AND p.best_ask IS NOT NULL
      AND p.observed_at >= NOW() - interval '7 minutes'
    ORDER BY p.market_id, p.observed_at
  `
  const res = await safeQuery<MovementRow>(sql, [marketIds])
  if (!res) return out
  const byMarket = new Map<string, MovementRow[]>()
  for (const row of res.rows) {
    let g = byMarket.get(row.market_id)
    if (!g) { g = []; byMarket.set(row.market_id, g) }
    g.push(row)
  }
  for (const [marketId, rows] of byMarket) {
    if (rows.length < 2) {
      out.set(marketId, { change_5m: null, samples: rows.length })
      continue
    }
    const first = rows[0]
    const last = rows[rows.length - 1]
    const a = typeof first.best_ask === 'number' ? first.best_ask : parseFloat(String(first.best_ask))
    const b = typeof last.best_ask === 'number' ? last.best_ask : parseFloat(String(last.best_ask))
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      out.set(marketId, { change_5m: null, samples: rows.length })
      continue
    }
    out.set(marketId, { change_5m: Math.round((b - a) * 10000) / 10000, samples: rows.length })
  }
  return out
}

export async function loadMinuteMarkets(opts: {
  within?: number
  asset?: string | null
  cryptoOnly?: boolean
  grouped?: boolean
} = {}): Promise<MinuteMarketsResult> {
  const within = Math.min(MAX_WITHIN_MIN, Math.max(1, opts.within ?? DEFAULT_WITHIN_MIN))
  const assetFilter = opts.asset?.toUpperCase()?.trim() || null
  const cryptoOnly = opts.cryptoOnly !== false
  const grouped = opts.grouped === true

  const { snapshots, perPlatform } = await loadAllLatestSnapshots()
  const now = Date.now()
  const cutoffMs = now + within * 60 * 1000

  const candidates = snapshots
    .filter((s) => {
      if (!s.resolves_at) return false
      const t = Date.parse(s.resolves_at)
      if (!Number.isFinite(t)) return false
      if (t <= now || t > cutoffMs) return false
      if (s.phase === 'closed') return false
      if (cryptoOnly && !CRYPTO_SPORTS.has(s.sport ?? '')) return false
      return isMinuteTradeable(s)
    })
    .map((s): Omit<MinuteMarket, 'change_5m' | 'movement_samples'> => {
      const t = Date.parse(s.resolves_at!)
      const minutes = (t - now) / 60_000
      return {
        platform: s.platform,
        market_id: s.platform_market_id,
        question: s.question,
        sport: s.sport,
        asset: extractAsset(s.question),
        strike: extractStrike(s.question),
        direction: extractDirection(s.question),
        outcomes: s.outcomes.map((o) => ({
          name: o.name,
          best_bid: o.best_bid,
          best_ask: o.best_ask,
          last_price: o.last_price,
        })),
        volume: typeof s.volume_traded === 'number' ? s.volume_traded : null,
        liquidity: s.liquidity,
        resolves_at: s.resolves_at!,
        minutes_to_resolve: Math.round(minutes * 10) / 10,
        bucket: bucketize(minutes),
        phase: s.phase,
        ts: s.ts,
      }
    })
    .filter((m) => (assetFilter ? m.asset === assetFilter : true))
    .sort((a, b) => a.minutes_to_resolve - b.minutes_to_resolve)
    .slice(0, MAX_RESPONSE_MARKETS)

  const movementKeys = candidates.map((m) => `${m.platform}:${m.market_id}`)
  const movements = await fetchMovements(movementKeys)
  const enriched: MinuteMarket[] = candidates.map((m) => {
    const mv = movements.get(`${m.platform}:${m.market_id}`)
    return { ...m, change_5m: mv?.change_5m ?? null, movement_samples: mv?.samples ?? 0 }
  })

  const platformBreakdown: Record<string, number> = {}
  for (const m of enriched) platformBreakdown[m.platform] = (platformBreakdown[m.platform] ?? 0) + 1

  const bucketCounts: Record<Bucket, number> = { '5m': 0, '15m': 0, '30m': 0, '60m': 0 }
  for (const m of enriched) if (m.bucket) bucketCounts[m.bucket]++

  const assetsAvailable = [
    ...new Set(enriched.map((m) => m.asset).filter((a): a is string => !!a)),
  ].sort()

  const lastUpdated = Object.values(perPlatform).reduce<string | null>(
    (acc, v) => (v.latestTs && (!acc || v.latestTs > acc) ? v.latestTs : acc),
    null,
  )

  const base: MinuteMarketsResult = {
    generatedAt: new Date().toISOString(),
    lastUpdated,
    windowMinutes: within,
    assetFilter,
    totalMarkets: enriched.length,
    bucketCounts,
    platformBreakdown,
    assetsAvailable,
  }

  if (!grouped) return { ...base, markets: enriched }

  // Cluster markets by (asset, resolves_at-rounded-to-minute) so the same
  // underlying event across platforms appears together. Within each group,
  // sort by strike ascending → dashboard renders a clean ladder.
  const byKey = new Map<string, MinuteGroup>()
  for (const m of enriched) {
    const t = Date.parse(m.resolves_at)
    const minuteIso = new Date(Math.round(t / 60000) * 60000).toISOString()
    const key = `${m.asset ?? 'unknown'}|${minuteIso}`
    let g = byKey.get(key)
    if (!g) {
      g = {
        asset: m.asset,
        resolves_at: minuteIso,
        minutes_to_resolve: m.minutes_to_resolve,
        bucket: m.bucket,
        platforms: [],
        market_count: 0,
        strike_min: null,
        strike_max: null,
        markets: [],
      }
      byKey.set(key, g)
    }
    g.markets.push(m)
  }
  for (const g of byKey.values()) {
    g.markets.sort(
      (a, b) => (a.strike ?? Number.POSITIVE_INFINITY) - (b.strike ?? Number.POSITIVE_INFINITY),
    )
    g.platforms = [...new Set(g.markets.map((m) => m.platform))].sort()
    g.market_count = g.markets.length
    const strikes = g.markets
      .map((m) => m.strike)
      .filter((s): s is number => typeof s === 'number')
    g.strike_min = strikes.length ? Math.min(...strikes) : null
    g.strike_max = strikes.length ? Math.max(...strikes) : null
  }
  const groups = [...byKey.values()].sort(
    (a, b) => a.minutes_to_resolve - b.minutes_to_resolve,
  )
  return { ...base, groups, totalGroups: groups.length }
}
