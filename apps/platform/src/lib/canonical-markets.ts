/**
 * CanonicalMarket — the top-level entity that collapses per-venue MarketSnapshot
 * rows (same underlying event, priced by multiple books) into one logical
 * "market" for the UI.
 *
 * Two-phase grouping:
 *   Phase 1 — exact normalized-question match. Catches rare cases where two
 *     scrapers happen to emit identical text (e.g., Polymarket + Kalshi for
 *     some prediction-market questions).
 *   Phase 2 — sports signature: (sport, market-type, resolve-date, teams).
 *     Each scraper writes sport markets differently; the signature lets us
 *     collapse "Moneyline — LAL @ BOS" + "LAL vs BOS moneyline" + "Cleveland @
 *     Toronto — Cleveland" into the same canonical row.
 *
 * Anything still ungrouped after Phase 2 is treated as a singleton canonical
 * market. The analyzer in scripts/analyze-canonical-overlap.ts produces
 * histograms so we can tune heuristics against real data.
 */

import { createHash } from 'node:crypto'
import { loadAllLatestSnapshots, type MarketSnapshot } from './markets-data'
import { categoryOf, type TerminalCategory } from './market-stats'
import { canonicalizeTeams, TEAM_LOOKUP, TEAM_PATTERNS } from './team-aliases'

export interface CanonicalMarket {
  id: string // stable signature-derived key
  question: string // display label — first-venue phrasing for now
  category: TerminalCategory
  sport?: string
  marketType?: string // moneyline | spread_X | total_X | futures | prop | ...
  teams?: string[] // normalized team tokens, sorted
  resolveDate?: string // YYYY-MM-DD
  resolves_at?: string // full ISO from first venue
  starts_at?: string
  venueCount: number
  venues: string[] // platform ids participating
  quotes: MarketSnapshot[] // all per-venue snapshots in this group
  groupedBy: 'exact' | 'sport' | 'singleton'
}

export interface GroupingStats {
  totalSnapshots: number
  canonicalCount: number
  singleVenue: number
  twoVenue: number
  threePlus: number
  largestGroup: number
  phase1GroupedSnapshots: number
  phase2GroupedSnapshots: number
  untouchedSingletons: number
}

export interface GroupingResult {
  canonical: CanonicalMarket[]
  stats: GroupingStats
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Stronger normalization that absorbs common phrasing differences across
 * books. Uses the team alias registry (when a sport is known) to replace
 * city-only / city+mascot / mascot-only variants with a single canonical
 * mascot key. Then strips interrogatives, light verb forms, and articles.
 *
 * Goal: "Will the Oklahoma City Thunder win the 2026 NBA Finals?" and
 * "Oklahoma City wins 2026 NBA Finals" both collapse to the same string so
 * Phase 1 groups them without needing Phase 2.
 */
// Precompiled `g` (global) flag patterns for question-level replacement.
// Separate from team-aliases.ts TEAM_PATTERNS (which use `i` flag for
// single-test lookups) because we need `g` to replace every occurrence.
// Built once at module load.
const QUESTION_PATTERNS: Record<string, Array<[RegExp, string]>> = {}
for (const sport of Object.keys(TEAM_PATTERNS)) {
  const entries = [...TEAM_LOOKUP[sport].entries()].sort(
    (a, b) => b[0].length - a[0].length,
  )
  QUESTION_PATTERNS[sport] = entries.map(([alias, canonical]) => [
    new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi'),
    canonical,
  ])
}

function canonicalQuestion(q: string, sport?: string): string {
  let s = q.toLowerCase()

  const canonSport = normalizeSport(sport)
  if (canonSport && QUESTION_PATTERNS[canonSport]) {
    for (const [pattern, canonical] of QUESTION_PATTERNS[canonSport]) {
      s = s.replace(pattern, canonical)
    }
  }

  // Strip leading interrogative + article
  s = s.replace(/^(will\s+(?:the\s+)?|does\s+(?:the\s+)?|can\s+(?:the\s+)?|is\s+(?:the\s+)?|are\s+(?:the\s+)?)/, '')

  // Light verb normalization: wins/winning → win
  s = s.replace(/\bwins\b/g, 'win').replace(/\bwinning\b/g, 'win')

  // Strip articles everywhere
  s = s.replace(/\b(the|a|an)\s+/g, '')

  // Final alphanumeric collapse
  s = s.replace(/[^a-z0-9]+/g, ' ').trim()

  return s
}

// Sport aliasing so Kalshi's `nba` + OddsAPI's `basketball` produce the same
// signature. Keep conservative — football is intentionally left alone because
// "football" means NFL on OddsAPI but potentially soccer elsewhere.
const SPORT_ALIASES: Record<string, string> = {
  basketball: 'basketball',
  nba: 'basketball',
  wnba: 'basketball',
  ncaab: 'basketball',
  baseball: 'baseball',
  mlb: 'baseball',
  hockey: 'hockey',
  ice_hockey: 'hockey',
  nhl: 'hockey',
  // `football` on OddsAPI means NFL/US football. On some other feeds it
  // means soccer. Keep `soccer` distinct — crossing them would produce
  // false positives (Man City FC ≠ Manchester United ≠ anyone in NFL).
  football: 'football_us',
  nfl: 'football_us',
  ncaaf: 'football_us',
  football_us: 'football_us',
  mma: 'mma',
  ufc: 'mma',
  soccer: 'soccer',
}

function normalizeSport(s: string | undefined): string | null {
  if (!s) return null
  const lower = s.toLowerCase().replace(/\s+/g, '_')
  return SPORT_ALIASES[lower] ?? lower
}

function dateKey(iso: string | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

// Market-type detection. Order matters — more specific patterns first so
// "Spread 14.5 — LAL @ BOS" doesn't get swallowed by the futures fallback.
function detectMarketType(q: string): string | null {
  const lower = q.toLowerCase()

  // OddsAPI-style: "Spread -1.5 —" / "Total 216.5 —"
  // Use absolute value so Kalshi's "wins by over 14.5" (always positive) can
  // match OddsAPI's "Spread -14.5" (sign indicates side). The canonical
  // market is the spread line itself; the sign identifies which side you
  // took, not which market you're in.
  const spread1 = lower.match(/\bspread\s*([+-]?\d+(?:\.\d+)?)/)
  if (spread1) return `spread_${Math.abs(parseFloat(spread1[1]))}`
  const total1 = lower.match(/\btotal\s*([+-]?\d+(?:\.\d+)?)/)
  if (total1) return `total_${Math.abs(parseFloat(total1[1]))}`

  // Kalshi-style one-sided spread: "wins by over 14.5 points?"
  const spread2 = lower.match(/by over (\d+(?:\.\d+)?)/)
  if (spread2) return `spread_${Math.abs(parseFloat(spread2[1]))}`

  // Kalshi-style total mislabeled as "Spread" in the question text:
  //   "Game 3: Denver at Minnesota: Spread — Over 217.5 points scored"
  // Anchor on the `: spread — over|under N` shape specifically so we don't
  // over-match prop-style "over N points" phrases that appear in player
  // markets. Keep this narrow — if the book uses different phrasing, let
  // the snapshot stay ungrouped rather than risk a false canonical merge.
  const total2 = lower.match(/:\s*spread\s*—\s*(?:over|under)\s+(\d+(?:\.\d+)?)\s+(?:points?|runs?|goals?)/)
  if (total2) return `total_${Math.abs(parseFloat(total2[1]))}`

  // NoVig-style: "AL_WINNER", "NL_WINNER", "NBA_CHAMP"
  if (/_winner\b|_champ\b|_mvp\b/.test(lower)) return 'futures'

  // Moneyline
  if (/\bmoneyline\b|\bml\b/.test(lower)) return 'moneyline'

  // Futures / outrights — "wins the X", "championship", "title"
  if (
    /\bwins?\s+(?:the\s+)?\w+\s+(?:finals?|championship|cup|title|open|classic)\b/i.test(q) ||
    /\bwill\s+.+\s+win\b/i.test(q) ||
    /\bchampion\b|\bwinner\b/i.test(q)
  ) {
    return 'futures'
  }

  // Player prop — "<Name> <Stat> <Number>"
  if (/\b\d+\.?\d*\b/.test(q) && /\bfantasy|\bpra\b|\bpoints\b|\bassists\b|\brebounds\b/i.test(q)) {
    return 'prop'
  }

  return null
}

// Tokens that appear in Title Case but aren't team/entity names. Without this
// blocklist the signature collapses unrelated futures into one (e.g., every
// "Will Player X win NBA MVP" Polymarket row gets grouped together because
// the only non-stopword tokens are "Player" and "NBA").
const TEAM_STOPWORDS = new Set([
  'will', 'the', 'win', 'wins', 'winner', 'won',
  'moneyline', 'spread', 'total', 'over', 'under', 'points',
  'player', 'coach', 'rookie', 'mvp', 'champion', 'champ',
  'year', 'yr', 'season', 'final', 'finals', 'cup', 'title',
  'game', 'match', 'tournament', 'championship',
  'eastern', 'western', 'conference', 'division', 'league',
  'most', 'improved', 'sixth', 'man', 'defensive',
  'nba', 'nfl', 'mlb', 'nhl', 'ncaa', 'wnba',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
])

// Extract team/entity tokens from a question. Two-pass:
//   1. If the sport has a team registry (NBA/NFL/MLB/NHL), try alias lookup.
//      This is the authoritative path — "Minnesota" → `timberwolves`,
//      "Minnesota Timberwolves" → `timberwolves`, "Los Angeles Lakers" and
//      "Lakers" both → `lakers`. Handles the biggest class of false-negatives
//      (city-only vs city+mascot strings).
//   2. Fall back to heuristic title-case extraction. Used for sports without
//      a registry (tennis, golf, soccer, prediction-market outrights).
function extractTeams(q: string, sport?: string): string[] {
  const canonicalSport = normalizeSport(sport)

  // Pass 1 — alias registry (authoritative for major US sports)
  if (canonicalSport && TEAM_LOOKUP[canonicalSport]) {
    const hits = canonicalizeTeams(q, canonicalSport)
    if (hits.length > 0) return hits
  }

  // Pass 2 — heuristic title-case extraction
  const raw: string[] = []

  const cleaned = q
    .replace(/^(moneyline|spread\s*[+-]?\d+(?:\.\d+)?|total\s*\d+(?:\.\d+)?)\s*—\s*/i, '')
    .trim()

  const m = cleaned.match(
    /([A-Z][A-Za-z .'-]+?)\s+(?:@|vs\.?|at)\s+([A-Z][A-Za-z .'-]+?)(?:\s*—|\s*$|\s*\?)/i,
  )
  if (m) {
    raw.push(m[1], m[2])
  } else {
    const tokens = cleaned.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{1,})*\b/g) ?? []
    for (const t of tokens) {
      const lt = t.toLowerCase()
      if (TEAM_STOPWORDS.has(lt)) continue
      raw.push(t)
    }
  }

  const normalized = raw
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/\s+/g, '_'))

  return [...new Set(normalized)].sort()
}

function sportsSignature(s: MarketSnapshot): string | null {
  const sport = normalizeSport(s.sport)
  const date = dateKey(s.resolves_at) ?? dateKey(s.starts_at)
  const marketType = detectMarketType(s.question)
  const teams = extractTeams(s.question, s.sport)

  if (!sport || !date || !marketType || teams.length === 0) return null
  return `${sport}|${marketType}|${date}|${teams.join('+')}`
}

/**
 * Stable short ID per canonical market. Same signature → same ID across
 * runs, so URLs like /dashboard/markets/c_a1b2c3d4e5 remain valid as the
 * scraper data refreshes. 10 hex chars = 40 bits; collisions are not a
 * concern at our volume (<100k canonical markets expected).
 */
function canonicalIdOf(signatureKey: string): string {
  return 'c_' + createHash('sha1').update(signatureKey).digest('hex').slice(0, 10)
}

function toCanonical(
  group: MarketSnapshot[],
  groupedBy: 'exact' | 'sport' | 'singleton',
  signatureKey: string,
): CanonicalMarket {
  const first = group[0]
  const venues = [...new Set(group.map((g) => g.platform))].sort()
  const marketType = detectMarketType(first.question) ?? undefined
  const teams = extractTeams(first.question, first.sport)
  return {
    id: canonicalIdOf(signatureKey),
    question: first.question,
    category: categoryOf(first),
    sport: first.sport,
    marketType,
    teams: teams.length ? teams : undefined,
    resolveDate: dateKey(first.resolves_at) ?? dateKey(first.starts_at) ?? undefined,
    resolves_at: first.resolves_at,
    starts_at: first.starts_at,
    venueCount: venues.length,
    venues,
    quotes: group,
    groupedBy,
  }
}

export function groupIntoCanonical(snapshots: MarketSnapshot[]): GroupingResult {
  // Phase 1 — canonical-question match (stronger than plain normalize;
  // handles team aliases + prose variation)
  const byExact = new Map<string, MarketSnapshot[]>()
  for (const s of snapshots) {
    const key = canonicalQuestion(s.question, s.sport)
    if (!byExact.has(key)) byExact.set(key, [])
    byExact.get(key)!.push(s)
  }

  const phase1Groups: Array<{ key: string; group: MarketSnapshot[] }> = []
  const phase1Singletons: MarketSnapshot[] = []
  for (const [key, group] of byExact) {
    if (group.length >= 2) phase1Groups.push({ key, group })
    else phase1Singletons.push(group[0])
  }

  // Phase 2 — sport signature on Phase 1 singletons
  const bySport = new Map<string, MarketSnapshot[]>()
  const unmatched: MarketSnapshot[] = []
  for (const s of phase1Singletons) {
    const sig = sportsSignature(s)
    if (sig) {
      if (!bySport.has(sig)) bySport.set(sig, [])
      bySport.get(sig)!.push(s)
    } else {
      unmatched.push(s)
    }
  }

  const phase2Groups: Array<{ key: string; group: MarketSnapshot[] }> = []
  for (const [key, group] of bySport) {
    if (group.length >= 2) phase2Groups.push({ key, group })
    else unmatched.push(group[0])
  }

  // Build canonical list. Each group gets a stable ID derived from its
  // signature key; singletons key off (platform, platform_market_id) so the
  // same snapshot always hashes to the same canonical ID across runs.
  const canonical: CanonicalMarket[] = []
  for (const { key, group } of phase1Groups) {
    canonical.push(toCanonical(group, 'exact', `q|${key}`))
  }
  for (const { key, group } of phase2Groups) {
    canonical.push(toCanonical(group, 'sport', `s|${key}`))
  }
  for (const s of unmatched) {
    canonical.push(
      toCanonical([s], 'singleton', `x|${s.platform}|${s.platform_market_id}`),
    )
  }

  // Stats
  let single = 0
  let two = 0
  let threePlus = 0
  let largest = 0
  for (const c of canonical) {
    if (c.venueCount === 1) single++
    else if (c.venueCount === 2) two++
    else threePlus++
    if (c.venueCount > largest) largest = c.venueCount
  }

  const phase1Count = phase1Groups.reduce((n, { group }) => n + group.length, 0)
  const phase2Count = phase2Groups.reduce((n, { group }) => n + group.length, 0)

  return {
    canonical,
    stats: {
      totalSnapshots: snapshots.length,
      canonicalCount: canonical.length,
      singleVenue: single,
      twoVenue: two,
      threePlus,
      largestGroup: largest,
      phase1GroupedSnapshots: phase1Count,
      phase2GroupedSnapshots: phase2Count,
      untouchedSingletons: unmatched.length,
    },
  }
}

// Short-lived in-memory cache for the grouping result. Server components
// call loadCanonicalMarkets() on every render, and the underlying JSONL
// files only change on scraper runs (minutes apart), so caching for 30s
// cuts repeat /markets + detail-page loads from ~3s to ~instant without
// serving noticeably stale data. Cleared by server restart on code changes
// in dev; in prod this lives for the process lifetime with a TTL.
let cached: { at: number; result: GroupingResult } | null = null
const CACHE_TTL_MS = 30_000

/**
 * Convenience: load all current snapshots and return them already grouped
 * into canonical markets. Use this from server components that render
 * canonical-keyed views (listings, detail pages, arb scanner).
 */
export async function loadCanonicalMarkets(): Promise<GroupingResult> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.result
  const { snapshots } = await loadAllLatestSnapshots()
  const result = groupIntoCanonical(snapshots)
  cached = { at: now, result }
  return result
}

/**
 * Lookup helper for detail-page routes that still use the legacy
 * `(platform, platform_market_id)` URL shape. Finds the canonical group
 * that contains the matching snapshot. Returns null if no such snapshot
 * exists in the current data.
 */
export async function findCanonicalForSnapshot(
  platform: string,
  platformMarketId: string,
): Promise<CanonicalMarket | null> {
  const { canonical } = await loadCanonicalMarkets()
  return (
    canonical.find((c) =>
      c.quotes.some(
        (q) => q.platform === platform && q.platform_market_id === platformMarketId,
      ),
    ) ?? null
  )
}

/**
 * Lookup helper for canonical-keyed URLs (e.g., /dashboard/markets/c_xxxxx).
 */
export async function findCanonicalById(id: string): Promise<CanonicalMarket | null> {
  const { canonical } = await loadCanonicalMarkets()
  return canonical.find((c) => c.id === id) ?? null
}

/**
 * Given a snapshot list (or empty array to load everything), return one
 * representative snapshot per canonical market — the highest-volume quote in
 * each group. Used by dashboard panels that still take MarketSnapshot[] but
 * should no longer show the same underlying market 4 times (once per book).
 *
 * Stats like volume/liquidity on the returned snapshot are the REP's own, not
 * aggregates — caller can re-aggregate via `canonicalOf(snapshot)` if needed.
 */
export async function canonicalReps(limit?: number): Promise<MarketSnapshot[]> {
  const { canonical } = await loadCanonicalMarkets()
  const reps: MarketSnapshot[] = []
  for (const c of canonical) {
    let pick = c.quotes[0]
    let pickVol = toNumSafe(pick.volume_traded)
    for (const q of c.quotes) {
      const v = toNumSafe(q.volume_traded)
      if (v > pickVol) {
        pick = q
        pickVol = v
      }
    }
    reps.push(pick)
    if (limit && reps.length >= limit) break
  }
  return reps
}

function toNumSafe(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Map from `platform:platform_market_id` → canonical venueCount. Lets
 * dashboard panels render a "Nx" badge per row without each panel re-running
 * the whole grouping. Keys always use the raw snapshot id, not the canonical
 * id, so callers hand the map the same string they'd use for MarketLink.
 */
export async function buildVenueCountMap(): Promise<Record<string, number>> {
  const { canonical } = await loadCanonicalMarkets()
  const out: Record<string, number> = {}
  for (const c of canonical) {
    for (const q of c.quotes) {
      out[`${q.platform}:${q.platform_market_id}`] = c.venueCount
    }
  }
  return out
}

/**
 * For dashboard lists that are keyed by (platform, market_id) — BigMovers
 * histories, for example — dedupe by canonical ID using the snapshot lookup.
 * Keeps the first occurrence per canonical.
 */
export async function dedupeByCanonical<T extends { platform: string; platform_market_id: string }>(
  items: T[],
): Promise<T[]> {
  const { canonical } = await loadCanonicalMarkets()
  const canonicalBySnapshot = new Map<string, string>()
  for (const c of canonical) {
    for (const q of c.quotes) {
      canonicalBySnapshot.set(`${q.platform}:${q.platform_market_id}`, c.id)
    }
  }
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const cid =
      canonicalBySnapshot.get(`${item.platform}:${item.platform_market_id}`) ??
      `raw:${item.platform}:${item.platform_market_id}`
    if (seen.has(cid)) continue
    seen.add(cid)
    out.push(item)
  }
  return out
}
