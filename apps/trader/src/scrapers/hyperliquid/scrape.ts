import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PerpSnapshot } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TRADER_ROOT = resolve(__dirname, '../../..')

const API_BASE = process.env.HYPERLIQUID_API_BASE ?? 'https://api.hyperliquid.xyz'
const REQUEST_TIMEOUT_MS = 15_000

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

function num(s: string | null | undefined): number | null {
  if (s == null) return null
  const n = typeof s === 'number' ? s : parseFloat(s)
  return Number.isFinite(n) ? n : null
}

async function postInfo<T>(body: object): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${txt.slice(0, 200)}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function buildSnapshots(
  ts: string,
  meta: { universe: HlMetaUniverseEntry[] },
  ctxs: HlAssetCtx[],
): PerpSnapshot[] {
  const out: PerpSnapshot[] = []
  for (let i = 0; i < meta.universe.length; i++) {
    const u = meta.universe[i]
    const c = ctxs[i]
    if (!u || !c) continue

    const mark = num(c.markPx)
    const oi = num(c.openInterest)
    const fundingHourly = num(c.funding)

    out.push({
      ts,
      coin: u.name,
      mark_px: mark,
      oracle_px: num(c.oraclePx),
      mid_px: num(c.midPx),
      prev_day_px: num(c.prevDayPx),
      funding_hourly: fundingHourly,
      funding_apr: fundingHourly != null ? fundingHourly * 24 * 365 : null,
      open_interest: oi,
      open_interest_usd: oi != null && mark != null ? oi * mark : null,
      day_ntl_vlm: num(c.dayNtlVlm),
      premium: num(c.premium),
      max_leverage: u.maxLeverage ?? null,
      sz_decimals: u.szDecimals ?? null,
    })
  }
  return out
}

function writeJsonl(snapshots: PerpSnapshot[]): string {
  const ts = snapshots[0]?.ts ?? new Date().toISOString()
  const day = ts.slice(0, 10)
  const filename = `perps-${ts.replace(/[:.]/g, '-')}.jsonl`
  const dir = join(TRADER_ROOT, 'data', 'hyperliquid', day)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = join(dir, filename)
  const body = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n'
  writeFileSync(path, body, 'utf8')
  return path
}

async function main() {
  const t0 = Date.now()
  const ts = new Date().toISOString()
  console.log(`hyperliquid · scrape start ${ts}`)

  let snapshots: PerpSnapshot[] = []
  let errors = 0

  try {
    const [meta, ctxs] = await postInfo<MetaAndCtxsResponse>({
      type: 'metaAndAssetCtxs',
    })
    snapshots = buildSnapshots(ts, meta, ctxs)
    console.log(`  fetched ${snapshots.length} perps`)
  } catch (e) {
    errors++
    console.error(`  metaAndAssetCtxs failed — ${(e as Error).message}`)
  }

  if (snapshots.length === 0) {
    console.warn('  nothing to write')
    process.exit(errors > 0 ? 1 : 0)
  }

  const path = writeJsonl(snapshots)
  console.log(`  wrote ${snapshots.length} rows → ${path}`)

  const duration = Date.now() - t0
  console.log(
    `hyperliquid · done ${duration}ms · coins=${snapshots.length} errors=${errors}`,
  )
}

main().catch((e) => {
  console.error('fatal', e)
  process.exit(1)
})
