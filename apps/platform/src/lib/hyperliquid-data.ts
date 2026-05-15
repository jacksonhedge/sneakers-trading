// Hyperliquid live data for O'Toole tools + admin signals view.
//
// Data path: hits HL's public /info endpoint directly (no auth, single POST
// returns all 230+ perps with funding/OI/mark/vol). The trader app's JSONL
// poller writes the same data to disk for historical analysis; this module
// is the live read path and doesn't depend on those files.

const API_BASE = process.env.HYPERLIQUID_API_BASE ?? 'https://api.hyperliquid.xyz'
const REQUEST_TIMEOUT_MS = 15_000
const LIVE_CACHE_TTL_MS = 30_000
// Free-tier "delayed snapshot" mode: same upstream call, longer TTL so the
// data the user sees is meaningfully stale vs Pro. 15 minutes matches the
// delayed-prices framing on prediction-market venues.
const DELAYED_CACHE_TTL_MS = 15 * 60 * 1000

export interface HlPerp {
  coin: string
  mark_px: number | null
  oracle_px: number | null
  mid_px: number | null
  prev_day_px: number | null
  funding_hourly: number | null
  funding_apr: number | null  // hourly * 24 * 365
  open_interest: number | null  // coin units
  open_interest_usd: number | null
  day_ntl_vlm: number | null  // 24h notional USD
  premium: number | null  // (mark - oracle) / oracle
  max_leverage: number | null
  pct_24h: number | null  // (mark - prev_day) / prev_day
}

interface HlMetaUniverseEntry {
  name: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated?: boolean
}

interface HlAssetCtx {
  funding: string
  openInterest: string
  prevDayPx: string
  dayNtlVlm: string
  premium: string | null
  oraclePx: string
  markPx: string
  midPx: string | null
  impactPxs: string[] | null
}

type MetaAndCtxsResponse = [{ universe: HlMetaUniverseEntry[] }, HlAssetCtx[]]

type Mode = 'live' | 'delayed'
const caches: Record<Mode, { fetchedAt: number; perps: HlPerp[] } | null> = {
  live: null,
  delayed: null,
}

function num(s: string | null | undefined): number | null {
  if (s == null) return null
  const n = typeof s === 'number' ? s : parseFloat(s)
  return Number.isFinite(n) ? n : null
}

async function fetchAll(): Promise<HlPerp[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HL /info HTTP ${res.status}`)
    const [meta, ctxs] = (await res.json()) as MetaAndCtxsResponse
    return buildPerps(meta, ctxs)
  } finally {
    clearTimeout(timer)
  }
}

function buildPerps(
  meta: { universe: HlMetaUniverseEntry[] },
  ctxs: HlAssetCtx[],
): HlPerp[] {
  const out: HlPerp[] = []
  for (let i = 0; i < meta.universe.length; i++) {
    const u = meta.universe[i]
    const c = ctxs[i]
    if (!u || !c) continue
    const mark = num(c.markPx)
    const oi = num(c.openInterest)
    const prev = num(c.prevDayPx)
    const fundingHourly = num(c.funding)
    out.push({
      coin: u.name,
      mark_px: mark,
      oracle_px: num(c.oraclePx),
      mid_px: num(c.midPx),
      prev_day_px: prev,
      funding_hourly: fundingHourly,
      funding_apr: fundingHourly != null ? fundingHourly * 24 * 365 : null,
      open_interest: oi,
      open_interest_usd: oi != null && mark != null ? oi * mark : null,
      day_ntl_vlm: num(c.dayNtlVlm),
      premium: num(c.premium),
      max_leverage: u.maxLeverage ?? null,
      pct_24h:
        prev != null && mark != null && prev > 0 ? (mark - prev) / prev : null,
    })
  }
  return out
}

export async function getAllHlPerps(opts?: { mode?: Mode }): Promise<{
  perps: HlPerp[]
  fetchedAt: number
  fromCache: boolean
  mode: Mode
}> {
  const mode: Mode = opts?.mode ?? 'live'
  const ttl = mode === 'live' ? LIVE_CACHE_TTL_MS : DELAYED_CACHE_TTL_MS
  const now = Date.now()
  const hit = caches[mode]
  if (hit && now - hit.fetchedAt < ttl) {
    return { perps: hit.perps, fetchedAt: hit.fetchedAt, fromCache: true, mode }
  }
  const perps = await fetchAll()
  caches[mode] = { fetchedAt: now, perps }
  return { perps, fetchedAt: now, fromCache: false, mode }
}

export async function getHlPerp(coin: string): Promise<HlPerp | null> {
  const { perps } = await getAllHlPerps()
  const c = coin.toUpperCase()
  return perps.find((p) => p.coin === c) ?? null
}

export async function getFundingOutliers(opts: {
  direction?: 'positive' | 'negative' | 'absolute'
  limit?: number
  minOiUsd?: number
}): Promise<HlPerp[]> {
  const { perps } = await getAllHlPerps()
  const direction = opts.direction ?? 'absolute'
  const limit = Math.max(1, Math.min(50, opts.limit ?? 10))
  const minOi = opts.minOiUsd ?? 0

  const filtered = perps.filter(
    (p) => p.funding_apr != null && (p.open_interest_usd ?? 0) >= minOi,
  )

  filtered.sort((a, b) => {
    const fa = a.funding_apr!
    const fb = b.funding_apr!
    if (direction === 'positive') return fb - fa
    if (direction === 'negative') return fa - fb
    return Math.abs(fb) - Math.abs(fa)
  })
  return filtered.slice(0, limit)
}
