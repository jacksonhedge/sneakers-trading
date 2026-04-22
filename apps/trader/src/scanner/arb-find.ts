// Cross-book arb finder — builds on match-moneylines.ts but includes Odds API
// (DraftKings/FanDuel/BetMGM/BetRivers) alongside NoVig + ProphetX. That's the
// sharp-vs-wide comparison where real arbs actually appear.
//
// For every matched game (same sport + teams + scheduled hour), compute:
//   ask_on_book_A_side_home + ask_on_book_B_side_away < 1.00
// Any sum < 1.00 is a real executable arb (ignoring fees).
//
// Usage:
//   pnpm tsx apps/trader/src/scanner/arb-find.ts              # show top candidates
//   pnpm tsx apps/trader/src/scanner/arb-find.ts --arbs-only  # only sub-1.00 results

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MarketSnapshot } from '../scrapers/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TRADER_ROOT = resolve(__dirname, '../..')
const DATA_DIR = join(TRADER_ROOT, 'data')

type Moneyline = {
  platform: string
  book?: string // for Odds API, the specific book (draftkings/fanduel/etc)
  sport: string
  away: string
  home: string
  startsAt: string
  homeAsk: number | null
  awayAsk: number | null
}

const TEAM_ALIASES: Record<string, string[]> = {
  // NBA
  thunder: ['oklahoma city thunder', 'oklahoma city', 'okc'],
  lakers: ['los angeles lakers', 'lakers', 'lal'],
  celtics: ['boston celtics', 'celtics', 'bos'],
  nuggets: ['denver nuggets', 'denver', 'den'],
  timberwolves: ['minnesota timberwolves', 'minnesota', 'min', 'wolves'],
  suns: ['phoenix suns', 'phoenix', 'phx'],
  rockets: ['houston rockets', 'houston', 'hou'],
  pistons: ['detroit pistons', 'detroit', 'det'],
  magic: ['orlando magic', 'orlando', 'orl'],
  cavaliers: ['cleveland cavaliers', 'cleveland', 'cle', 'cavs'],
  raptors: ['toronto raptors', 'toronto', 'tor'],
  knicks: ['new york knicks', 'ny knicks', 'new york', 'nyk'],
  hawks: ['atlanta hawks', 'atlanta', 'atl'],
  '76ers': ['philadelphia 76ers', 'philadelphia', 'phi', '76ers', 'sixers'],
  spurs: ['san antonio spurs', 'san antonio', 'sas'],
  // MLB (partial — add as needed)
  cardinals: ['st louis cardinals', 'st. louis cardinals', 'stl'],
  marlins: ['miami marlins', 'mia'],
  astros: ['houston astros', 'hou'],
  guardians: ['cleveland guardians', 'cle'],
  reds: ['cincinnati reds', 'cin'],
  rays: ['tampa bay rays', 'tb'],
  dodgers: ['los angeles dodgers', 'la dodgers', 'lad'],
  giants: ['san francisco giants', 'sf'],
  yankees: ['new york yankees', 'nyy'],
  phillies: ['philadelphia phillies', 'phi'],
  // NHL (partial)
  penguins: ['pittsburgh penguins', 'pit'],
  flyers: ['philadelphia flyers', 'phi'],
  avalanche: ['colorado avalanche', 'col'],
  kings: ['los angeles kings', 'la kings', 'lak'],
  stars: ['dallas stars', 'dal'],
  wild: ['minnesota wild', 'min'],
  oilers: ['edmonton oilers', 'edm'],
  ducks: ['anaheim ducks', 'ana'],
}

function canonTeam(s: string): string {
  const raw = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, '').trim()
  // direct alias match first — check if the input fully matches any known alias
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    if (aliases.some((a) => raw === a)) return canonical
  }
  // strip spaces for fallback fuzzy compare
  return raw.replace(/\s+/g, '')
}

function sportKey(s: string | undefined): string {
  const raw = (s ?? '').toLowerCase()
  const aliases: Record<string, string> = {
    ice_hockey: 'hockey',
    hockey: 'hockey',
    baseball: 'baseball',
    basketball: 'basketball',
    football: 'football',
    americanfootball_nfl: 'football',
    americanfootball_ncaaf: 'football',
    basketball_nba: 'basketball',
    basketball_wnba: 'basketball',
    basketball_ncaab: 'basketball',
    icehockey_nhl: 'hockey',
    baseball_mlb: 'baseball',
  }
  return aliases[raw] ?? raw
}

function bucketHour(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return iso
  return new Date(Math.floor(t / 3_600_000) * 3_600_000).toISOString()
}

function loadLatest(platform: string): MarketSnapshot[] {
  const dir = join(DATA_DIR, platform)
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
  } catch {
    return []
  }
  if (!files.length) return []
  const text = readFileSync(join(dir, files[files.length - 1]), 'utf8')
  const all: MarketSnapshot[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      all.push(JSON.parse(line))
    } catch {}
  }
  const latest = new Map<string, MarketSnapshot>()
  for (const s of all) {
    const prev = latest.get(s.platform_market_id)
    if (!prev || s.ts > prev.ts) latest.set(s.platform_market_id, s)
  }
  return [...latest.values()]
}

// NoVig MONEY question format: "{HOME_CODE} — {AWAY_FULL} @ {HOME_FULL}"
function parseNovig(s: MarketSnapshot): Moneyline | null {
  const lastTag = s.tags[s.tags.length - 1] ?? ''
  if (lastTag !== 'MONEY') return null
  const dash = s.question.indexOf(' — ')
  if (dash < 0) return null
  const homeCode = s.question.slice(0, dash).trim()
  const rest = s.question.slice(dash + 3)
  const at = rest.indexOf(' @ ')
  if (at < 0) return null
  const away = rest.slice(0, at).trim()
  const home = rest.slice(at + 3).trim()
  let homeAsk: number | null = null
  let awayAsk: number | null = null
  for (const o of s.outcomes) {
    if (o.name.trim().toUpperCase() === homeCode.toUpperCase()) {
      homeAsk = o.best_ask
    } else {
      awayAsk = o.best_ask
    }
  }
  if (!s.starts_at) return null
  return { platform: 'novig', sport: sportKey(s.sport), away, home, startsAt: s.starts_at, homeAsk, awayAsk }
}

// ProphetX: "Moneyline — {AWAY} at {HOME}"
function parseProphet(s: MarketSnapshot): Moneyline | null {
  const q = s.question
  let prefix: string | null = null
  for (const p of ['Moneyline — ', 'Moneyline (2 Way) — ']) {
    if (q.startsWith(p)) { prefix = p; break }
  }
  if (!prefix) return null
  const rest = q.slice(prefix.length)
  const at = rest.indexOf(' at ')
  if (at < 0) return null
  const away = rest.slice(0, at).trim()
  const home = rest.slice(at + 4).trim()
  const oddsRe = /\s[+-]\d+$/
  let homeAsk: number | null = null
  let awayAsk: number | null = null
  const homeC = canonTeam(home)
  const awayC = canonTeam(away)
  for (const o of s.outcomes) {
    const nameOnly = o.name.replace(oddsRe, '').trim()
    const c = canonTeam(nameOnly)
    if (c === homeC) homeAsk = o.best_ask
    else if (c === awayC) awayAsk = o.best_ask
  }
  if (!s.starts_at) return null
  return { platform: 'prophetx', sport: sportKey(s.sport), away, home, startsAt: s.starts_at, homeAsk, awayAsk }
}

// Odds API snapshot: question format "Moneyline — {Away Team} @ {Home Team}"
// with tags including the bookmaker key. Each book has its own snapshot row.
function parseOddsApi(s: MarketSnapshot): Moneyline | null {
  const q = s.question
  if (!q.startsWith('Moneyline — ')) return null
  const rest = q.slice('Moneyline — '.length)
  const at = rest.indexOf(' @ ')
  if (at < 0) return null
  const away = rest.slice(0, at).trim()
  const home = rest.slice(at + 3).trim()
  const book = s.tags.find((t) => ['draftkings', 'fanduel', 'betmgm', 'betrivers', 'williamhill_us', 'pointsbetus'].includes(t)) ?? 'unknown'
  const homeC = canonTeam(home)
  const awayC = canonTeam(away)
  let homeAsk: number | null = null
  let awayAsk: number | null = null
  for (const o of s.outcomes) {
    const c = canonTeam(o.name)
    if (c === homeC) homeAsk = o.best_ask
    else if (c === awayC) awayAsk = o.best_ask
  }
  if (!s.starts_at) return null
  return {
    platform: 'oddsapi',
    book,
    sport: sportKey(s.sport),
    away,
    home,
    startsAt: s.starts_at,
    homeAsk,
    awayAsk,
  }
}

type Pair = {
  sport: string
  away: string
  home: string
  startsAt: string
  a: Moneyline
  b: Moneyline
  sumAhomeBaway: number | null
  sumAawayBhome: number | null
  bestSum: number | null
  bestSide: 'A_home+B_away' | 'A_away+B_home' | null
}

function main() {
  const novig = loadLatest('novig').map(parseNovig).filter((x): x is Moneyline => x !== null)
  const prophet = loadLatest('prophetx').map(parseProphet).filter((x): x is Moneyline => x !== null)
  const oddsapi = loadLatest('oddsapi').map(parseOddsApi).filter((x): x is Moneyline => x !== null)

  console.log(`Loaded moneylines:`)
  console.log(`  NoVig:     ${novig.length}`)
  console.log(`  ProphetX:  ${prophet.length}`)
  console.log(`  Odds API:  ${oddsapi.length}  (${new Set(oddsapi.map((m) => m.book)).size} distinct books)`)

  const all: Moneyline[] = [...novig, ...prophet, ...oddsapi]
  const byKey = new Map<string, Moneyline[]>()
  for (const m of all) {
    const key = `${m.sport}|${[canonTeam(m.away), canonTeam(m.home)].sort().join('|')}|${bucketHour(m.startsAt)}`
    ;(byKey.get(key) ?? byKey.set(key, []).get(key)!).push(m)
  }

  const pairs: Pair[] = []
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        // Skip same-platform pairs (e.g., DK vs FD = both Odds API, but different books is fine)
        if (a.platform === b.platform && a.book === b.book) continue
        const aHomeCanon = canonTeam(a.home)
        const bHomeCanon = canonTeam(b.home)
        const aHomeIsbHome = aHomeCanon === bHomeCanon
        // Orient: we want (A_home, B_away) where the home/away sides are opposite.
        const aHomeAsk = a.homeAsk
        const aAwayAsk = a.awayAsk
        const bHomeAsk = aHomeIsbHome ? b.homeAsk : b.awayAsk
        const bAwayAsk = aHomeIsbHome ? b.awayAsk : b.homeAsk
        const sumAhomeBaway = aHomeAsk != null && bAwayAsk != null ? aHomeAsk + bAwayAsk : null
        const sumAawayBhome = aAwayAsk != null && bHomeAsk != null ? aAwayAsk + bHomeAsk : null
        let bestSum: number | null = null
        let bestSide: Pair['bestSide'] = null
        if (sumAhomeBaway != null && (bestSum == null || sumAhomeBaway < bestSum)) {
          bestSum = sumAhomeBaway
          bestSide = 'A_home+B_away'
        }
        if (sumAawayBhome != null && (bestSum == null || sumAawayBhome < bestSum)) {
          bestSum = sumAawayBhome
          bestSide = 'A_away+B_home'
        }
        pairs.push({
          sport: a.sport,
          away: a.away,
          home: a.home,
          startsAt: a.startsAt,
          a,
          b,
          sumAhomeBaway,
          sumAawayBhome,
          bestSum,
          bestSide,
        })
      }
    }
  }

  pairs.sort((x, y) => (x.bestSum ?? Infinity) - (y.bestSum ?? Infinity))
  const arbs = pairs.filter((p) => p.bestSum != null && p.bestSum < 1.0)

  console.log(`\nMatched cross-platform pairs: ${pairs.length}`)
  console.log(`Real arbs (sum < 1.00):       ${arbs.length}`)
  console.log('')

  const fmt = (n: number | null) => (n == null ? '    —' : n.toFixed(4))
  const plat = (m: Moneyline) => (m.book ? `${m.platform}:${m.book}` : m.platform)

  const onlyArbs = process.argv.includes('--arbs-only')
  const rows = onlyArbs ? arbs : pairs.slice(0, 25)

  const header = onlyArbs ? `=== ARBS (sum < 1.00) ===` : `=== Top 25 tightest cross-book pairs ===`
  console.log(header)
  for (const p of rows) {
    const edge = p.bestSum != null ? `${((1 - p.bestSum) * 100).toFixed(2)}pp` : '—'
    const arbTag = p.bestSum != null && p.bestSum < 1.0 ? '!!! ARB !!!' : '   '
    console.log(
      `${arbTag}  [${p.sport}]  ${p.away} @ ${p.home}   ${p.startsAt.slice(0, 16)}`
    )
    console.log(
      `    ${plat(p.a).padEnd(22)} home=${fmt(p.a.homeAsk)} away=${fmt(p.a.awayAsk)}`
    )
    console.log(
      `    ${plat(p.b).padEnd(22)} home=${fmt(p.b.homeAsk)} away=${fmt(p.b.awayAsk)}`
    )
    console.log(
      `    A-home+B-away=${fmt(p.sumAhomeBaway)}  A-away+B-home=${fmt(p.sumAawayBhome)}  best=${fmt(p.bestSum)}  edge=${edge}`
    )
    console.log('')
  }
}

main()
