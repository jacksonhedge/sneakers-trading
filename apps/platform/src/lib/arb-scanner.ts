import type { MarketPhase, MarketSnapshot } from './markets-data'
import { safeQuery } from './db'

// Cross-book moneyline scanner. Mirrors the logic in
// apps/trader/src/scanner/match-moneylines.ts, ported to the platform app so
// the dashboard can render pairs server-side without reaching across the
// monorepo. The two files must stay in sync on parser shape and safety
// guards — if the trader matcher changes, this does too.

export type ParsedMoneyline = {
  away: string
  home: string
  homeAsk: number | null
  homeBid: number | null
  awayAsk: number | null
  awayBid: number | null
}

export type CrossBookQuote = {
  platform: string
  homeAsk: number | null
  homeBid: number | null
  awayAsk: number | null
  awayBid: number | null
  phase: MarketPhase
  ts: string
}

export type CrossBookPair = {
  sport: string
  away: string
  home: string
  startsAt: string
  quotes: CrossBookQuote[]
  cheapestHome: { platform: string; ask: number } | null
  cheapestAway: { platform: string; ask: number } | null
  bestSum: number | null
  isArb: boolean
}

// One collision in today's MLB team-name set: Athletics vs Oakland Athletics.
// Extend as new aliases surface across books.
const TEAM_ALIASES: Record<string, string> = {
  oaklandathletics: 'athletics',
}

function canonTeam(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '')
  return TEAM_ALIASES[base] ?? base
}

function bucketHour(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return iso
  return new Date(Math.floor(t / 3_600_000) * 3_600_000).toISOString()
}

const SPORT_ALIAS: Record<string, string> = {
  hockey: 'hockey',
  ice_hockey: 'hockey',
  baseball: 'baseball',
  basketball: 'basketball',
  football: 'football',
  american_football: 'football',
  soccer: 'soccer',
}

function sportKey(s: string | undefined): string {
  const raw = (s ?? '').toLowerCase()
  return SPORT_ALIAS[raw] ?? raw
}

// NoVig MONEY: question is "{HOME_CODE} — {AWAY_FULL} @ {HOME_FULL}"
// Outcomes are 3-letter codes. Home bet is whichever outcome name matches
// HOME_CODE.
function parseNovig(s: MarketSnapshot): ParsedMoneyline | null {
  const lastTag = s.tags[s.tags.length - 1] ?? ''
  if (lastTag !== 'MONEY') return null
  const dashIdx = s.question.indexOf(' — ')
  if (dashIdx < 0) return null
  const homeCode = s.question.slice(0, dashIdx).trim().toUpperCase()
  const rest = s.question.slice(dashIdx + 3)
  const atIdx = rest.indexOf(' @ ')
  if (atIdx < 0) return null
  const away = rest.slice(0, atIdx).trim()
  const home = rest.slice(atIdx + 3).trim()
  let homeAsk: number | null = null
  let homeBid: number | null = null
  let awayAsk: number | null = null
  let awayBid: number | null = null
  for (const o of s.outcomes) {
    const code = o.name.trim().toUpperCase()
    if (code === homeCode) {
      homeAsk = o.best_ask
      homeBid = o.best_bid
    } else {
      awayAsk = o.best_ask
      awayBid = o.best_bid
    }
  }
  return { away, home, homeAsk, homeBid, awayAsk, awayBid }
}

function parseProphet(s: MarketSnapshot): ParsedMoneyline | null {
  const q = s.question
  let prefix: string | null = null
  for (const p of ['Moneyline — ', 'Moneyline (2 Way) — ']) {
    if (q.startsWith(p)) {
      prefix = p
      break
    }
  }
  if (!prefix) return null
  const rest = q.slice(prefix.length)
  const atIdx = rest.indexOf(' at ')
  if (atIdx < 0) return null
  const away = rest.slice(0, atIdx).trim()
  const home = rest.slice(atIdx + 4).trim()
  const oddsRe = /\s[+-]\d+$/
  return matchOutcomesByCanon(s, away, home, (n) => n.replace(oddsRe, '').trim())
}

function parseOddsApiH2H(s: MarketSnapshot): ParsedMoneyline | null {
  const tagMarket = s.tags[s.tags.length - 2] ?? ''
  if (tagMarket !== 'h2h') return null
  const prefix = 'Moneyline — '
  if (!s.question.startsWith(prefix)) return null
  const rest = s.question.slice(prefix.length)
  const atIdx = rest.indexOf(' @ ')
  if (atIdx < 0) return null
  const away = rest.slice(0, atIdx).trim()
  const home = rest.slice(atIdx + 3).trim()
  return matchOutcomesByCanon(s, away, home, (n) => n.trim())
}

function matchOutcomesByCanon(
  s: MarketSnapshot,
  away: string,
  home: string,
  strip: (n: string) => string,
): ParsedMoneyline {
  let homeAsk: number | null = null
  let homeBid: number | null = null
  let awayAsk: number | null = null
  let awayBid: number | null = null
  const homeC = canonTeam(home)
  const awayC = canonTeam(away)
  for (const o of s.outcomes) {
    const c = canonTeam(strip(o.name))
    if (c === homeC) {
      homeAsk = o.best_ask
      homeBid = o.best_bid
    } else if (c === awayC) {
      awayAsk = o.best_ask
      awayBid = o.best_bid
    }
  }
  return { away, home, homeAsk, homeBid, awayAsk, awayBid }
}

function parseAny(s: MarketSnapshot): ParsedMoneyline | null {
  switch (s.platform) {
    case 'novig':
      return parseNovig(s)
    case 'prophetx':
      return parseProphet(s)
    case 'fanduel':
    case 'draftkings':
    case 'betmgm':
    case 'betrivers':
    case 'caesars':
    case 'pointsbet':
    case 'unibet':
    case 'barstool':
    case 'wynnbet':
      return parseOddsApiH2H(s)
    default:
      return null
  }
}

export type CrossBookPairOptions = {
  limit?: number
  // Max allowed ts-spread between freshest and stalest quote on a game, in
  // minutes. Pairs outside the window are dropped — see match-moneylines.ts
  // for the reasoning.
  maxQuoteSkewMinutes?: number
}

/**
 * Group snapshots into cross-book pairs keyed on game. Safety guards mirror
 * the CLI matcher: pre-game phases only, bounded ts-skew across books.
 * Returns the ranked list (tightest bestSum first).
 */
export function findCrossBookPairs(
  snapshots: MarketSnapshot[],
  options: CrossBookPairOptions = {},
): CrossBookPair[] {
  const maxSkewMin = options.maxQuoteSkewMinutes ?? 10

  type Game = {
    sport: string
    away: string
    home: string
    startsAt: string
    quotes: CrossBookQuote[]
  }
  const games = new Map<string, Game>()

  for (const s of snapshots) {
    const parsed = parseAny(s)
    if (!parsed) continue
    if (!s.starts_at) continue
    const sport = sportKey(s.sport)
    const key = `${sport}|${canonTeam(parsed.away)}|${canonTeam(parsed.home)}|${bucketHour(s.starts_at)}`
    let g = games.get(key)
    if (!g) {
      g = { sport, away: parsed.away, home: parsed.home, startsAt: s.starts_at, quotes: [] }
      games.set(key, g)
    }
    const existingIdx = g.quotes.findIndex((q) => q.platform === s.platform)
    const quote: CrossBookQuote = {
      platform: s.platform,
      homeAsk: parsed.homeAsk,
      homeBid: parsed.homeBid,
      awayAsk: parsed.awayAsk,
      awayBid: parsed.awayBid,
      phase: s.phase,
      ts: s.ts,
    }
    if (existingIdx >= 0) g.quotes[existingIdx] = quote
    else g.quotes.push(quote)
  }

  const rows: CrossBookPair[] = []
  for (const g of games.values()) {
    if (g.quotes.length < 2) continue

    // Pre-game allowlist. Live/closed quotes get dropped because books update
    // at different cadences during play, which produces fake arbs.
    if (g.quotes.some((q) => q.phase !== 'opening' && q.phase !== 'pre_game')) continue

    // Stale-skew guard.
    const tsMs = g.quotes.map((q) => new Date(q.ts).getTime())
    const skew = Math.max(...tsMs) - Math.min(...tsMs)
    if (skew > maxSkewMin * 60_000) continue

    let chHome: { platform: string; ask: number } | null = null
    let chAway: { platform: string; ask: number } | null = null
    for (const q of g.quotes) {
      if (q.homeAsk != null && (chHome == null || q.homeAsk < chHome.ask)) {
        chHome = { platform: q.platform, ask: q.homeAsk }
      }
      if (q.awayAsk != null && (chAway == null || q.awayAsk < chAway.ask)) {
        chAway = { platform: q.platform, ask: q.awayAsk }
      }
    }
    const bestSum = chHome && chAway ? chHome.ask + chAway.ask : null
    rows.push({
      sport: g.sport,
      away: g.away,
      home: g.home,
      startsAt: g.startsAt,
      quotes: g.quotes,
      cheapestHome: chHome,
      cheapestAway: chAway,
      bestSum,
      isArb: bestSum != null && bestSum < 1.0,
    })
  }

  rows.sort((a, b) => (a.bestSum ?? Infinity) - (b.bestSum ?? Infinity))

  const limit = options.limit
  return typeof limit === 'number' ? rows.slice(0, limit) : rows
}

interface CrossBookPairRow {
  sport: string | null
  away: string | null
  home: string | null
  starts_at: Date | string | null
  quotes: CrossBookQuote[]
  cheapest_home_platform: string | null
  cheapest_home_ask: string | number | null
  cheapest_away_platform: string | null
  cheapest_away_ask: string | number | null
  best_sum: string | number | null
  is_arb: boolean
}

function n(v: string | number | null): number | null {
  if (v == null) return null
  const x = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(x) ? x : null
}

// Read precomputed pairs from cross_book_pairs (populated by
// scripts/recompute-arb-pairs.ts every scrape iteration). Replaces the
// inline findCrossBookPairs(allMarkets) call from the dashboard, which
// previously iterated 188k snapshots in-memory on every render.
export async function loadCrossBookPairs(limit = 10): Promise<CrossBookPair[]> {
  const sql = `
    SELECT sport, away, home, starts_at, quotes,
           cheapest_home_platform, cheapest_home_ask,
           cheapest_away_platform, cheapest_away_ask,
           best_sum, is_arb
    FROM cross_book_pairs
    ORDER BY best_sum NULLS LAST
    LIMIT $1
  `
  const res = await safeQuery<CrossBookPairRow>(sql, [limit])
  if (!res) return []
  return res.rows.map((r) => ({
    sport: r.sport ?? '',
    away: r.away ?? '',
    home: r.home ?? '',
    startsAt:
      r.starts_at == null
        ? ''
        : typeof r.starts_at === 'string'
          ? r.starts_at
          : r.starts_at.toISOString(),
    quotes: r.quotes ?? [],
    cheapestHome: r.cheapest_home_platform
      ? { platform: r.cheapest_home_platform, ask: n(r.cheapest_home_ask) ?? 0 }
      : null,
    cheapestAway: r.cheapest_away_platform
      ? { platform: r.cheapest_away_platform, ask: n(r.cheapest_away_ask) ?? 0 }
      : null,
    bestSum: n(r.best_sum),
    isArb: r.is_arb,
  }))
}
