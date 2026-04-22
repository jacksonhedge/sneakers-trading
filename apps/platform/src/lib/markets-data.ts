import { promises as fs } from 'node:fs'
import path from 'node:path'

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

export type MarketFilter = {
  q?: string
  platform?: string
  sport?: string
  phase?: MarketPhase
  page?: number
  pageSize?: number
}

export async function loadMarkets(filter: MarketFilter = {}): Promise<LoadedMarketsResult> {
  const all: MarketSnapshot[] = []
  let latestDate: string | null = null

  for (const platform of SUPPORTED_PLATFORMS) {
    const file = await resolveLatestFile(platform)
    if (!file) continue
    const base = path.basename(file, '.jsonl')
    if (!latestDate || base > latestDate) latestDate = base
    try {
      const text = await fs.readFile(file, 'utf8')
      const parsed = parseJsonlLines(text)
      all.push(...dedupeLatest(parsed))
    } catch {
      // file disappeared between listdir and read — keep going
    }
  }

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
  if (filter.phase) {
    filtered = filtered.filter((m) => m.phase === filter.phase)
  }
  if (filter.q && filter.q.trim()) {
    const q = filter.q.toLowerCase().trim()
    filtered = filtered.filter((m) => {
      if (m.question.toLowerCase().includes(q)) return true
      for (const o of m.outcomes) if (o.name.toLowerCase().includes(q)) return true
      return false
    })
  }

  // Stable sort: by volume_traded desc (nulls last), then by question for ties.
  filtered.sort((a, b) => {
    const av = typeof a.volume_traded === 'number' ? a.volume_traded : parseFloat(String(a.volume_traded ?? '0'))
    const bv = typeof b.volume_traded === 'number' ? b.volume_traded : parseFloat(String(b.volume_traded ?? '0'))
    if (bv !== av) return (bv || 0) - (av || 0)
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
