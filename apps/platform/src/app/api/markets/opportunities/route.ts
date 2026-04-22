import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

type Outcome = {
  name: string
  best_bid: number | null
  best_ask: number | null
  last_price: number | null
}

type MarketSnapshot = {
  platform: string
  platform_market_id: string
  question: string
  tags?: string[]
  sport?: string
  outcomes: Outcome[]
  overround: number | null
  volume_traded: number | null
  liquidity: number | null
  phase: string
  ts: string
}

const TRADER_DATA_DIR = resolve(process.cwd(), '../trader/data')

function listPlatforms(): string[] {
  if (!existsSync(TRADER_DATA_DIR)) return []
  return readdirSync(TRADER_DATA_DIR).filter((d) => {
    try {
      const p = join(TRADER_DATA_DIR, d)
      if (!statSync(p).isDirectory()) return false
      if (d.startsWith('_')) return false
      return readdirSync(p).some((f) => f.endsWith('.jsonl'))
    } catch {
      return false
    }
  })
}

function loadLatestSnapshots(platform: string): MarketSnapshot[] {
  const dir = join(TRADER_DATA_DIR, platform)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
  if (!files.length) return []
  const latest = files[files.length - 1]
  const text = readFileSync(join(dir, latest), 'utf8')
  const all: MarketSnapshot[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      all.push(JSON.parse(line) as MarketSnapshot)
    } catch {}
  }
  // Keep only the most recent observation per market (JSONL appends over time;
  // rank on the latest state, not the full history).
  const byKey = new Map<string, MarketSnapshot>()
  for (const s of all) {
    const key = `${s.platform}:${s.platform_market_id}`
    const prev = byKey.get(key)
    if (!prev || prev.ts < s.ts) byKey.set(key, s)
  }
  return [...byKey.values()]
}

function passesGate(s: MarketSnapshot): boolean {
  const bothSided = s.outcomes.every(
    (o) => o.best_bid != null && o.best_ask != null && o.best_bid > 0 && o.best_ask > 0
  )
  if (!bothSided) return false
  for (const o of s.outcomes) {
    if (o.best_bid == null || o.best_ask == null) continue
    if (o.best_ask - o.best_bid > 0.15) return false
  }
  const vol = Number(s.volume_traded ?? 0)
  return Number.isFinite(vol) && vol >= 500
}

export async function GET() {
  const platforms = listPlatforms()
  if (!platforms.length) {
    return Response.json(
      {
        platforms: [],
        lastUpdated: null,
        opportunities: [],
        note: 'No scraper data available. Start the scrape loop on the host machine.',
      },
      { headers: { 'cache-control': 'no-store' } }
    )
  }

  const all: MarketSnapshot[] = []
  const perPlatform: Record<string, { markets: number; latestTs: string | null }> = {}
  for (const p of platforms) {
    const snaps = loadLatestSnapshots(p)
    all.push(...snaps)
    perPlatform[p] = {
      markets: snaps.length,
      latestTs: snaps.reduce<string | null>(
        (acc, s) => (acc && acc > s.ts ? acc : s.ts),
        null
      ),
    }
  }

  const gated = all
    .filter((s) => s.overround !== null && passesGate(s))
    .sort((a, b) => (b.overround! - a.overround!))

  const opportunities = gated.slice(0, 100).map((s) => ({
    platform: s.platform,
    market_id: s.platform_market_id,
    question: s.question,
    sport: s.sport,
    outcomes: s.outcomes.map((o) => ({
      name: o.name,
      best_ask: o.best_ask,
      best_bid: o.best_bid,
    })),
    overround: s.overround,
    volume: s.volume_traded,
    liquidity: s.liquidity,
    phase: s.phase,
    ts: s.ts,
  }))

  const lastUpdated = Object.values(perPlatform).reduce<string | null>(
    (acc, v) => (v.latestTs && (!acc || v.latestTs > acc) ? v.latestTs : acc),
    null
  )

  return Response.json(
    {
      platforms: perPlatform,
      lastUpdated,
      totalMarkets: all.length,
      gatedCount: gated.length,
      opportunities,
    },
    { headers: { 'cache-control': 'no-store' } }
  )
}
