import { safeQuery } from './db'
import { VENUES } from './venues'

// Lightweight check: which venues actually have fresh price data
// flowing right now? The connections page (and any other surface that
// wants a "real LIVE" badge) calls this to color the pill green only
// when the scraper is currently writing rows, not just because we
// labeled the venue as live in venues.ts.
//
// Definition of "fresh": at least one price_observation in the last
// FRESH_WINDOW_MINUTES across any market on that source. Cheap query —
// indexed scan on price_observations.observed_at.

const FRESH_WINDOW_MINUTES = 60

export async function getFreshVenueIds(): Promise<Set<string>> {
  const sql = `
    SELECT m.source
    FROM markets m
    WHERE EXISTS (
      SELECT 1
      FROM price_observations p
      WHERE p.market_id = m.id
        AND p.observed_at > NOW() - ($1 || ' minutes')::interval
    )
    GROUP BY m.source
  `
  const res = await safeQuery<{ source: string }>(sql, [FRESH_WINDOW_MINUTES])
  if (!res) return new Set()

  const directSources = new Set<string>(res.rows.map((r) => r.source))

  // Wrapper venues inherit freshness from the venue they wrap. Coinbase
  // Predict / Sleeper Markets / Robinhood Events are Kalshi mirrors —
  // if Kalshi data is flowing, those surfaces are live too.
  const out = new Set<string>(directSources)
  for (const v of VENUES) {
    if (v.wrapperOf && directSources.has(v.wrapperOf)) {
      out.add(v.id)
    }
  }
  return out
}
