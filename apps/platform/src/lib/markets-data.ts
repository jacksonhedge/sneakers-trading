import { promises as fs } from 'node:fs'
import path from 'node:path'
import { categoryOf, type TerminalCategory } from './market-stats'

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
}

export type LoadedMarketsResult = {
  markets: MarketSnapshot[]
  total: number
  availableSports: string[]
  availablePlatforms: string[]
  dataDate: string | null
}

const SUPPORTED_PLATFORMS = ['polymarket', 'kalshi', 'novig', 'prophetx', 'og'] as const

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
      out.push(JSON.parse(line) as MarketSnapshot)
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
 * Single source of truth for reading the most recent snapshot per market
 * across every supported platform. Both the UI paths (loadMarkets) and the
 * opportunities API consume this. When the Timescale migration lands, this
 * is the only function that needs to change — swap JSONL reads for a SQL
 * query returning the same shape.
 */
export async function loadAllLatestSnapshots(): Promise<LoadedSnapshots> {
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

  return { snapshots, latestDate, perPlatform }
}

export async function loadMarkets(filter: MarketFilter = {}): Promise<LoadedMarketsResult> {
  const { snapshots: all, latestDate } = await loadAllLatestSnapshots()

  const availablePlatforms = [...new Set(all.map((m) => m.platform))].sort()
  const availableSports = [
    ...new Set(all.map((m) => m.sport).filter((s): s is string => typeof s === 'string')),
  ].sort()

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
  }
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
