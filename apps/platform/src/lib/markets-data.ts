import { promises as fs } from 'node:fs'
import path from 'node:path'
import { cache } from 'react'
import { categoryOf, type TerminalCategory } from './market-stats'
import { safeQuery } from './db'
import { SEED_SNAPSHOTS } from './seed-snapshots'

// Mirror of the MarketSnapshot contract from apps/trader/src/scrapers/types.ts.
// Kept as a local copy so the platform app doesn't reach across the monorepo
// into the trader package at build time. Keep in sync if the contract changes.
export type MarketPhase = 'opening' | 'pre_game' | 'live' | 'closed'

export interface MarketSnapshot {
  platform: string
  platform_market_id: string
  question: string
  tags: string[]
  sport?: string
  outcomes: Array<{
    name: string
    best_bid: number | null
    best_ask: number | null
    last_price: number | null
  }>
  overround: number | null
  volume_traded: number | string | null
  liquidity: number | null
  starts_at?: string
  resolves_at?: string
  phase: MarketPhase
  ts: string
  /**
   * 24-hour delta in implied probability (best_ask of the favorite outcome).
   * Positive = favorite got more likely; negative = less likely. Null when
   * we don't have enough history to compute. Populated by the dashboard
   * loader when `loadMarketHistory` data is available; manually set in
   * seed-snapshots.ts for the demo path.
   */
  change24h?: number | null
}

export type BookFreshness = { count: number; latestTs: string | null }

export type LoadedMarketsResult = {
  markets: MarketSnapshot[]
  total: number
  availableSports: string[]
  availablePlatforms: string[]
  dataDate: string | null
  // Freshness per actual platform (row.platform). Unlike the directory-based
  // perPlatform in LoadedSnapshots, this buckets OddsAPI output by its
  // individual bookmakers (fanduel, draftkings, betmgm, betrivers) instead
  // of lumping them into one "oddsapi" key. Used by the /markets freshness
  // strip so users can see how stale each book's prices are.
  perBook: Record<string, BookFreshness>
}

const SUPPORTED_PLATFORMS = ['polymarket', 'kalshi', 'novig', 'prophetx', 'og', 'prizepicks', 'underdog', 'oddsapi', 'opinion', 'limitless'] as const

function dataDir(): string {
  // Next.js server components run with cwd = apps/platform at dev time and the
  // project root at build/deploy time depending on the host. Try both.
  const candidates = [
    path.join(process.cwd(), '..', 'trader', 'data'),
    path.join(process.cwd(), 'apps', 'trader', 'data'),
  ]
  return candidates[0]
}

async function resolveLatestFile(platform: string): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), '..', 'trader', 'data', platform),
    path.join(process.cwd(), 'apps', 'trader', 'data', platform),
  ]
  for (const dir of candidates) {
    try {
      const files = await fs.readdir(dir)
      const jsonl = files.filter((f) => f.endsWith('.jsonl')).sort()
      if (jsonl.length === 0) continue
      return path.join(dir, jsonl[jsonl.length - 1])
    } catch {
      // dir doesn't exist — try next candidate
    }
  }
  return null
}

function parseJsonlLines(text: string): MarketSnapshot[] {
  const out: MarketSnapshot[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    try {
      const snap = JSON.parse(line) as MarketSnapshot
      // Scraper rows occasionally land with null/undefined outcomes (usually
      // from a 500 response the scraper chose to log anyway). Every consumer
      // assumes outcomes is a real array (the TS type says so), so drop
      // these here rather than propagate and crash downstream.
      if (!Array.isArray(snap.outcomes)) continue
      out.push(snap)
    } catch {
      // malformed line — skip silently; the scraper's appending, partial writes
      // can happen mid-run
    }
  }
  return out
}

/**
 * Take the last snapshot per `platform_market_id` within a platform's file.
 * Scrapers append over time; we only care about the freshest observation.
 */
function dedupeLatest(snapshots: MarketSnapshot[]): MarketSnapshot[] {
  const latest = new Map<string, MarketSnapshot>()
  for (const s of snapshots) {
    const existing = latest.get(s.platform_market_id)
    if (!existing || (existing.ts && s.ts && s.ts > existing.ts)) {
      latest.set(s.platform_market_id, s)
    }
  }
  return [...latest.values()]
}

export type MarketSort = 'volume' | 'overround' | 'resolves_at' | 'updated'

export type MarketFilter = {
  q?: string
  platform?: string
  sport?: string
  category?: TerminalCategory
  phase?: MarketPhase
  minOverround?: number
  sort?: MarketSort
  page?: number
  pageSize?: number
}

export type LoadedSnapshots = {
  snapshots: MarketSnapshot[]
  latestDate: string | null
  perPlatform: Record<string, { count: number; latestTs: string | null }>
}

/**
 * Reconstructs a MarketSnapshot from a set of DB rows sharing the same
 * (market_id, observed_at). Each row is one outcome of the snapshot;
 * market-level fields (overround, volume, liquidity) are denormalized
 * in price_observations so any row can supply them.
 */
export interface DbRow {
  market_id: string
  source: string
  question: string
  category: string
  // pg returns `timestamp with time zone` as Date; stringify at the boundary.
  close_time: Date | string | null
  status: string
  raw_metadata: { tags?: string[]; sport?: string; phase?: MarketPhase } | null
  outcome_id: string
  label: string
  observed_at: Date | string
  best_bid: number | string | null
  best_ask: number | string | null
  last_price: number | string | null
  overround: number | string | null
  liquidity_usd: number | string | null
  volume_traded: number | string | null
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function toIso(v: Date | string | null | undefined): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  return v.toISOString()
}

export function dbRowsToSnapshot(rows: DbRow[]): MarketSnapshot | null {
  if (rows.length === 0) return null
  const first = rows[0]
  // market_id is "<platform>:<platform_market_id>" per load-jsonl's composite.
  const sep = first.market_id.indexOf(':')
  if (sep < 0) return null
  const platform = first.market_id.slice(0, sep)
  const platform_market_id = first.market_id.slice(sep + 1)
  const phase = first.raw_metadata?.phase ?? statusToPhase(first.status)
  const sport = first.raw_metadata?.sport ?? (first.category !== 'unknown' ? first.category : undefined)
  const tags = first.raw_metadata?.tags ?? []

  const ts = toIso(first.observed_at)
  if (!ts) return null

  return {
    platform,
    platform_market_id,
    question: first.question,
    tags,
    sport,
    outcomes: rows.map((r) => ({
      name: r.label,
      best_bid: num(r.best_bid),
      best_ask: num(r.best_ask),
      last_price: num(r.last_price),
    })),
    overround: num(first.overround),
    volume_traded: num(first.volume_traded),
    liquidity: num(first.liquidity_usd),
    starts_at: undefined,
    resolves_at: toIso(first.close_time),
    phase,
    ts,
  }
}

function statusToPhase(status: string): MarketPhase {
  switch (status) {
    case 'pre_open': return 'pre_game'
    case 'open': return 'live'
    case 'closed': return 'closed'
    default: return 'opening'
  }
}

async function loadAllLatestSnapshotsFromDb(): Promise<LoadedSnapshots | null> {
  // LATERAL join hits the composite PK on price_observations
  // (observed_at, market_id, outcome_id) via the secondary index on
  // (market_id, outcome_id, observed_at DESC) — one index seek per
  // (market, outcome) pair.
  //
  // The observed_at >= now() - 24h bound is critical: price_observations
  // is a TimescaleDB hypertable with compressed older chunks. Without
  // the bound, the planner checks every chunk (including compressed
  // ones, which fall back to ~95K-row seq scans each) — turning a
  // sub-second query into 30+ minute pile-ups. "Latest" is by
  // definition recent, so 24h is a safe ceiling for any market the
  // dashboard cares about. Stale markets (>24h since last observation)
  // simply drop out of the result; the JSONL fallback would have
  // re-introduced them but we'd rather show fresh data only.
  const sql = `
    SELECT
      m.id AS market_id,
      m.source,
      m.question,
      m.category,
      m.close_time,
      m.status,
      m.raw_metadata,
      o.id AS outcome_id,
      o.label,
      l.observed_at,
      l.best_bid,
      l.best_ask,
      l.last_price,
      l.overround,
      l.liquidity_usd,
      l.volume_traded
    FROM markets m
    JOIN outcomes o ON o.market_id = m.id
    JOIN LATERAL (
      SELECT observed_at, best_bid, best_ask, last_price, overround, liquidity_usd, volume_traded
      FROM price_observations p
      WHERE p.market_id = m.id AND p.outcome_id = o.id
        AND p.observed_at >= now() - interval '24 hours'
      ORDER BY p.observed_at DESC
      LIMIT 1
    ) l ON TRUE
    WHERE m.status <> 'closed'
    ORDER BY m.id, o.id
  `
  const res = await safeQuery<DbRow>(sql)
  if (!res) return null

  // Group rows by market_id → build snapshots.
  const byMarket = new Map<string, DbRow[]>()
  for (const row of res.rows) {
    let group = byMarket.get(row.market_id)
    if (!group) {
      group = []
      byMarket.set(row.market_id, group)
    }
    group.push(row)
  }

  const snapshots: MarketSnapshot[] = []
  const perPlatform: Record<string, { count: number; latestTs: string | null }> = {}
  let latestTsGlobal: string | null = null
  for (const group of byMarket.values()) {
    const snap = dbRowsToSnapshot(group)
    if (!snap) continue
    snapshots.push(snap)
    const bucket = perPlatform[snap.platform]
    if (!bucket) {
      perPlatform[snap.platform] = { count: 1, latestTs: snap.ts }
    } else {
      bucket.count += 1
      if (!bucket.latestTs || snap.ts > bucket.latestTs) bucket.latestTs = snap.ts
    }
    if (!latestTsGlobal || snap.ts > latestTsGlobal) latestTsGlobal = snap.ts
  }

  return {
    snapshots,
    latestDate: latestTsGlobal ? latestTsGlobal.slice(0, 10) : null,
    perPlatform,
  }
}

async function loadAllLatestSnapshotsFromJsonl(): Promise<LoadedSnapshots> {
  const snapshots: MarketSnapshot[] = []
  const perPlatform: Record<string, { count: number; latestTs: string | null }> = {}
  let latestDate: string | null = null

  for (const platform of SUPPORTED_PLATFORMS) {
    const file = await resolveLatestFile(platform)
    if (!file) continue
    const base = path.basename(file, '.jsonl')
    if (!latestDate || base > latestDate) latestDate = base
    try {
      const text = await fs.readFile(file, 'utf8')
      const deduped = dedupeLatest(parseJsonlLines(text))
      snapshots.push(...deduped)
      const latestTs = deduped.reduce<string | null>(
        (acc, s) => (acc && acc > s.ts ? acc : s.ts),
        null,
      )
      perPlatform[platform] = { count: deduped.length, latestTs }
    } catch {
      // file disappeared between listdir and read — keep going
    }
  }

  // Seed fallback: if neither Timescale nor JSONL produced anything AND the
  // SNEAKERS_ENABLE_SEED env flag is on, return a small hardcoded sample so
  // the dashboard has something plausible to render. Temporary — remove once
  // the scraper→Timescale pipeline is wired on prod.
  if (snapshots.length === 0 && process.env.SNEAKERS_ENABLE_SEED === '1') {
    for (const s of SEED_SNAPSHOTS) {
      snapshots.push(s)
      const existing = perPlatform[s.platform]
      if (!existing) {
        perPlatform[s.platform] = { count: 1, latestTs: s.ts }
      } else {
        existing.count += 1
        if (!existing.latestTs || s.ts > existing.latestTs) existing.latestTs = s.ts
      }
    }
    latestDate = latestDate ?? new Date().toISOString().slice(0, 10)
  }

  return { snapshots, latestDate, perPlatform }
}

/**
 * Single source of truth for reading the most recent snapshot per market
 * across every supported platform. Tries Timescale first; falls back to
 * JSONL on disk if the DB is unreachable. Same LoadedSnapshots shape
 * either way so callers don't branch.
 */
// React `cache()` deduplicates within a single request. Critical for the
// dashboard, which fans this out via loadMarkets() AND loadCanonicalMarkets()
// in parallel — without this wrapper, both would hit Postgres concurrently
// for the same 376k-row pull, doubling DB load + temp-tablespace pressure.
export const loadAllLatestSnapshots = cache(
  async (): Promise<LoadedSnapshots> => {
    const fromDb = await loadAllLatestSnapshotsFromDb()
    if (fromDb && fromDb.snapshots.length > 0) return fromDb
    return loadAllLatestSnapshotsFromJsonl()
  },
)

// Cheap count of non-closed markets. The full loadAllLatestSnapshots() pulls
// 376k rows / 125 MB to compute this — overkill when the caller (e.g. landing
// page stats strip) only needs a number. Index-only scan, sub-50ms.
export async function loadMarketCount(): Promise<number> {
  const res = await safeQuery<{ n: string | number }>(
    "SELECT count(*)::bigint AS n FROM markets WHERE status <> 'closed'",
  )
  if (!res || res.rows.length === 0) return 0
  const raw = res.rows[0].n
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * Targeted single-market loader. Used by the market-detail page so we
 * don't pull every non-closed snapshot just to find one row. Hits the
 * primary key m.id = "<platform>:<platform_market_id>" — index seek.
 * Falls back to scanning JSONL only if the DB query yields nothing.
 */
export async function loadSingleMarketSnapshot(
  platform: string,
  platformMarketId: string,
): Promise<MarketSnapshot | null> {
  const compositeId = `${platform}:${platformMarketId}`
  const sql = `
    SELECT
      m.id AS market_id,
      m.source,
      m.question,
      m.category,
      m.close_time,
      m.status,
      m.raw_metadata,
      o.id AS outcome_id,
      o.label,
      l.observed_at,
      l.best_bid,
      l.best_ask,
      l.last_price,
      l.overround,
      l.liquidity_usd,
      l.volume_traded
    FROM markets m
    JOIN outcomes o ON o.market_id = m.id
    JOIN LATERAL (
      SELECT observed_at, best_bid, best_ask, last_price, overround, liquidity_usd, volume_traded
      FROM price_observations p
      WHERE p.market_id = m.id AND p.outcome_id = o.id
      ORDER BY p.observed_at DESC
      LIMIT 1
    ) l ON TRUE
    WHERE m.id = $1
    ORDER BY o.id
  `
  const res = await safeQuery<DbRow>(sql, [compositeId])
  if (res && res.rows.length > 0) {
    return dbRowsToSnapshot(res.rows)
  }
  // DB miss → fall back to a JSONL scan for just this platform.
  const file = await resolveLatestFile(platform)
  if (!file) return null
  try {
    const text = await fs.readFile(file, 'utf8')
    const all = dedupeLatest(parseJsonlLines(text))
    return all.find((s) => s.platform_market_id === platformMarketId) ?? null
  } catch {
    return null
  }
}

export async function loadMarkets(filter: MarketFilter = {}): Promise<LoadedMarketsResult> {
  const { snapshots: all, latestDate } = await loadAllLatestSnapshots()

  const availablePlatforms = [...new Set(all.map((m) => m.platform))].sort()
  const availableSports = [
    ...new Set(all.map((m) => m.sport).filter((s): s is string => typeof s === 'string')),
  ].sort()

  const perBook: Record<string, BookFreshness> = {}
  for (const s of all) {
    const b = perBook[s.platform]
    if (!b) {
      perBook[s.platform] = { count: 1, latestTs: s.ts }
    } else {
      b.count += 1
      if (!b.latestTs || s.ts > b.latestTs) b.latestTs = s.ts
    }
  }

  let filtered = all
  if (filter.platform) {
    const plat = filter.platform.toLowerCase()
    filtered = filtered.filter((m) => m.platform === plat)
  }
  if (filter.sport) {
    const sport = filter.sport.toLowerCase()
    filtered = filtered.filter((m) => (m.sport ?? '').toLowerCase() === sport)
  }
  if (filter.category) {
    filtered = filtered.filter((m) => categoryOf(m) === filter.category)
  }
  if (filter.phase) {
    filtered = filtered.filter((m) => m.phase === filter.phase)
  }
  if (typeof filter.minOverround === 'number') {
    const min = filter.minOverround
    filtered = filtered.filter((m) => m.overround !== null && m.overround >= min)
  }
  if (filter.q && filter.q.trim()) {
    const q = filter.q.toLowerCase().trim()
    filtered = filtered.filter((m) => {
      if (m.question.toLowerCase().includes(q)) return true
      for (const o of m.outcomes) if (o.name.toLowerCase().includes(q)) return true
      return false
    })
  }

  const volOf = (m: MarketSnapshot): number => {
    const v = typeof m.volume_traded === 'number' ? m.volume_traded : parseFloat(String(m.volume_traded ?? '0'))
    return Number.isFinite(v) ? v : 0
  }

  const sortKey: MarketSort = filter.sort ?? 'volume'
  filtered.sort((a, b) => {
    switch (sortKey) {
      case 'overround': {
        // Nulls last.
        const av = a.overround ?? -Infinity
        const bv = b.overround ?? -Infinity
        if (bv !== av) return bv - av
        break
      }
      case 'resolves_at': {
        // Soonest first, unknowns last.
        const at = a.resolves_at ? new Date(a.resolves_at).getTime() : Infinity
        const bt = b.resolves_at ? new Date(b.resolves_at).getTime() : Infinity
        if (at !== bt) return at - bt
        break
      }
      case 'updated': {
        // Freshest first. ts is ISO so string compare is correct.
        if (a.ts !== b.ts) return a.ts < b.ts ? 1 : -1
        break
      }
      case 'volume':
      default: {
        const av = volOf(a)
        const bv = volOf(b)
        if (bv !== av) return bv - av
        break
      }
    }
    return a.question.localeCompare(b.question)
  })

  const total = filtered.length
  const pageSize = filter.pageSize ?? 50
  const page = Math.max(1, filter.page ?? 1)
  const start = (page - 1) * pageSize
  const paged = filtered.slice(start, start + pageSize)

  return {
    markets: paged,
    total,
    availableSports,
    availablePlatforms,
    dataDate: latestDate,
    perBook,
  }
}

export type MarketHistory = {
  key: string // `${platform}:${platform_market_id}`
  platform: string
  platform_market_id: string
  question: string
  sport?: string
  snapshots: MarketSnapshot[] // chronological, oldest first
}

// Hard cap on rows pulled from price_observations in one history call. With
// the scrape loop running every few minutes across ~5 platforms, a multi-day
// window can balloon into millions of rows and time out the dashboard
// function. 200k is enough for ~2k markets × 100 observations × 1 day at the
// current scrape cadence — beyond that we'd want a downsampled materialized
// view, not a fatter LIMIT.
const HISTORY_ROW_CAP_DEFAULT = 200_000
// Short windows (1-day dashboard sparklines) only need a fraction of the
// rows the multi-day chart pulls. Capping the SQL LIMIT for these cases
// trims the dashboard query from ~hundreds of MB to ~tens. The cap was
// blowing up cold-render times even though the data on the wire was
// orders of magnitude smaller.
const HISTORY_ROW_CAP_SHORT = 25_000

async function loadMarketHistoryFromDb(days: number): Promise<MarketHistory[] | null> {
  const cap = days <= 1 ? HISTORY_ROW_CAP_SHORT : HISTORY_ROW_CAP_DEFAULT
  const sql = `
    SELECT
      m.id AS market_id,
      m.source,
      m.question,
      m.category,
      m.close_time,
      m.status,
      m.raw_metadata,
      o.id AS outcome_id,
      o.label,
      p.observed_at,
      p.best_bid,
      p.best_ask,
      p.last_price,
      p.overround,
      p.liquidity_usd,
      p.volume_traded
    FROM price_observations p
    JOIN outcomes o ON o.market_id = p.market_id AND o.id = p.outcome_id
    JOIN markets m ON m.id = p.market_id
    WHERE p.observed_at >= NOW() - ($1 || ' days')::interval
      AND m.status <> 'closed'
    ORDER BY p.market_id, p.observed_at, o.id
    LIMIT ${cap}
  `
  const res = await safeQuery<DbRow>(sql, [days])
  if (!res) return null

  // Group by (market_id, observed_at) to reconstitute snapshots (all
  // outcomes of one scrape run share the same ts), then group snapshots
  // by market_id → MarketHistory[].
  const byMarketAndTs = new Map<string, DbRow[]>()
  const marketOrder: string[] = []
  const seenMarket = new Set<string>()
  for (const row of res.rows) {
    if (!seenMarket.has(row.market_id)) {
      seenMarket.add(row.market_id)
      marketOrder.push(row.market_id)
    }
    const key = `${row.market_id}|${toIso(row.observed_at)}`
    let group = byMarketAndTs.get(key)
    if (!group) {
      group = []
      byMarketAndTs.set(key, group)
    }
    group.push(row)
  }

  // Build per-market MarketHistory by walking snapshots in ts order.
  const byKey = new Map<string, MarketHistory>()
  for (const [key, group] of byMarketAndTs) {
    const snap = dbRowsToSnapshot(group)
    if (!snap) continue
    const marketId = key.slice(0, key.lastIndexOf('|'))
    let bucket = byKey.get(marketId)
    if (!bucket) {
      bucket = {
        key: marketId,
        platform: snap.platform,
        platform_market_id: snap.platform_market_id,
        question: snap.question,
        sport: snap.sport,
        snapshots: [],
      }
      byKey.set(marketId, bucket)
    }
    bucket.snapshots.push(snap)
  }

  // Preserve order for determinism, and sort snapshots within each market
  // (SQL ORDER BY already handles this but defensive).
  const out: MarketHistory[] = []
  for (const marketId of marketOrder) {
    const h = byKey.get(marketId)
    if (!h) continue
    h.snapshots.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
    out.push(h)
  }
  return out
}

async function loadMarketHistoryFromJsonl(days: number): Promise<MarketHistory[]> {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
  const byKey = new Map<string, MarketHistory>()

  for (const platform of SUPPORTED_PLATFORMS) {
    const files = await listPlatformFiles(platform)
    for (const file of files) {
      // filename is YYYY-MM-DD.jsonl; skip files older than our window.
      const base = path.basename(file, '.jsonl')
      const fileTime = Date.parse(`${base}T23:59:59Z`)
      if (Number.isFinite(fileTime) && fileTime < cutoffMs) continue
      try {
        const text = await fs.readFile(file, 'utf8')
        for (const snap of parseJsonlLines(text)) {
          const ts = Date.parse(snap.ts)
          if (Number.isFinite(ts) && ts < cutoffMs) continue
          const key = `${snap.platform}:${snap.platform_market_id}`
          let bucket = byKey.get(key)
          if (!bucket) {
            bucket = {
              key,
              platform: snap.platform,
              platform_market_id: snap.platform_market_id,
              question: snap.question,
              sport: snap.sport,
              snapshots: [],
            }
            byKey.set(key, bucket)
          }
          bucket.snapshots.push(snap)
        }
      } catch {
        // file vanished — skip
      }
    }
  }

  // Sort each market's snapshots chronologically so consumers can reason
  // about oldest / latest without defensive sorts at the call site.
  for (const bucket of byKey.values()) {
    bucket.snapshots.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  }

  return [...byKey.values()]
}

/**
 * Time-series history per market over the last `days`. Tries Timescale
 * first; falls back to reading rolled-up JSONL files. Same MarketHistory
 * shape either way. Drives BigMovers detection and the drift chart.
 */
export async function loadMarketHistory(days = 7): Promise<MarketHistory[]> {
  const fromDb = await loadMarketHistoryFromDb(days)
  if (fromDb && fromDb.length > 0) return fromDb
  return loadMarketHistoryFromJsonl(days)
}

// Targeted history for one market. The global loadMarketHistory hits a
// LIMIT 200k that's eaten alphabetically (Kalshi alone consumes it in
// ~7d), so any caller that only needs one market's series should use
// this — index seek on m.id, no global cap.
export async function loadSingleMarketHistory(
  platform: string,
  platformMarketId: string,
  days: number,
): Promise<MarketHistory | null> {
  const compositeId = `${platform}:${platformMarketId}`
  const sql = `
    SELECT
      m.id AS market_id,
      m.source,
      m.question,
      m.category,
      m.close_time,
      m.status,
      m.raw_metadata,
      o.id AS outcome_id,
      o.label,
      p.observed_at,
      p.best_bid,
      p.best_ask,
      p.last_price,
      p.overround,
      p.liquidity_usd,
      p.volume_traded
    FROM price_observations p
    JOIN outcomes o ON o.market_id = p.market_id AND o.id = p.outcome_id
    JOIN markets m ON m.id = p.market_id
    WHERE p.market_id = $1
      AND p.observed_at >= NOW() - ($2 || ' days')::interval
    ORDER BY p.observed_at, o.id
  `
  const res = await safeQuery<DbRow>(sql, [compositeId, days])
  if (!res || res.rows.length === 0) return null

  const byTs = new Map<string, DbRow[]>()
  for (const row of res.rows) {
    const key = toIso(row.observed_at)
    if (!key) continue
    let group = byTs.get(key)
    if (!group) {
      group = []
      byTs.set(key, group)
    }
    group.push(row)
  }

  const snapshots: MarketSnapshot[] = []
  for (const group of byTs.values()) {
    const snap = dbRowsToSnapshot(group)
    if (snap) snapshots.push(snap)
  }
  snapshots.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))

  const first = snapshots[0]
  return {
    key: compositeId,
    platform: first.platform,
    platform_market_id: first.platform_market_id,
    question: first.question,
    sport: first.sport,
    snapshots,
  }
}

async function listPlatformFiles(platform: string): Promise<string[]> {
  const candidates = [
    path.join(process.cwd(), '..', 'trader', 'data', platform),
    path.join(process.cwd(), 'apps', 'trader', 'data', platform),
  ]
  for (const dir of candidates) {
    try {
      const files = await fs.readdir(dir)
      const jsonl = files.filter((f) => f.endsWith('.jsonl')).sort()
      return jsonl.map((f) => path.join(dir, f))
    } catch {
      // try next
    }
  }
  return []
}

/**
 * Given a primary platform (e.g. "kalshi"), return the set of venue ids that
 * can trade the same underlying — the platform itself plus any wrapper venues.
 * The caller resolves ids to full Venue objects from @/lib/venues.
 */
export function tradeDestinationIdsForPlatform(
  platform: string,
  allVenueIds: Array<{ id: string; wrapperOf?: string }>,
): string[] {
  const direct = allVenueIds.find((v) => v.id === platform)?.id
  const wrappers = allVenueIds.filter((v) => v.wrapperOf === platform).map((v) => v.id)
  return direct ? [direct, ...wrappers] : wrappers
}
