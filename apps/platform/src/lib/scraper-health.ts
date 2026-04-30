import { safeQuery } from './db'

export interface ScraperHealth {
  platform: string
  lastWriteTs: string | null
  rowsLast24h: number
  ageMinutes: number | null
}

// Per-platform health snapshot for the admin dashboard. Reads
// price_observations directly so it works in prod (where JSONL files
// don't exist on Vercel). Indexed scan on observed_at via the existing
// composite index — cheap.
//
// Sorted freshest → stalest so the admin sees the healthy ones up top
// and the broken ones near the bottom.
export async function loadScraperHealth(): Promise<ScraperHealth[]> {
  const sql = `
    SELECT m.source AS platform,
           MAX(p.observed_at)::text AS last_write,
           COUNT(*) FILTER (WHERE p.observed_at > NOW() - interval '24 hours')::bigint AS rows_24h
    FROM markets m
    JOIN price_observations p ON p.market_id = m.id
    GROUP BY m.source
    ORDER BY MAX(p.observed_at) DESC NULLS LAST
  `
  const res = await safeQuery<{
    platform: string
    last_write: string | null
    rows_24h: string | number
  }>(sql)
  if (!res) return []
  return res.rows.map((r) => {
    const lastTs = r.last_write
    const ageMinutes = lastTs
      ? (Date.now() - new Date(lastTs).getTime()) / 60_000
      : null
    return {
      platform: r.platform,
      lastWriteTs: lastTs,
      rowsLast24h: Number(r.rows_24h),
      ageMinutes,
    }
  })
}

export type HealthStatus = 'live' | 'lagging' | 'stale' | 'dead'

export function statusFor(h: ScraperHealth): HealthStatus {
  if (h.ageMinutes == null) return 'dead'
  if (h.ageMinutes <= 30) return 'live'
  if (h.ageMinutes <= 120) return 'lagging'
  if (h.ageMinutes <= 1440) return 'stale'
  return 'dead'
}
