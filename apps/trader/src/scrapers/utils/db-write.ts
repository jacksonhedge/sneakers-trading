import pg from 'pg'
import type { MarketSnapshot } from '../types.js'

// Direct writer from a scraper → Timescale. Mirrors the insert logic in
// packages/core/db/scripts/load-jsonl.ts so new observations can land in
// the DB at the same time they hit JSONL (dual-write during migration).
//
// Usage:
//   const writer = await createDbWriter()
//   await writer.writeSnapshots(snapshots)
//   await writer.close()
//
// Failure mode: if the DB is unreachable, createDbWriter() throws; the
// caller can catch it and continue with JSONL-only writing. Individual
// writeSnapshot() failures per-row are absorbed and logged — one bad row
// doesn't abort a scrape.

const { Client } = pg

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64) || 'x'
}

function phaseToStatus(phase: string): string {
  switch (phase) {
    case 'opening': return 'pre_open'
    case 'pre_game': return 'pre_open'
    case 'live': return 'open'
    case 'closed': return 'closed'
    default: return 'open'
  }
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function clamp01(n: number | null): number | null {
  if (n == null) return null
  if (n < 0 || n > 1) return null
  return n
}

export interface DbWriter {
  writeSnapshots(snaps: MarketSnapshot[]): Promise<{ markets: number; outcomes: number; observations: number; errors: number }>
  close(): Promise<void>
}

/**
 * One-line dual-write helper for scraper main() functions. Handles the
 * full lifecycle: env-flag opt-out, connect, write, close, log. Never
 * throws — a DB hiccup doesn't break the scrape. Every scraper can line
 * this up right after its writeJsonl() call:
 *
 *   await syncSnapshotsToDb(snapshots)
 *
 * Disable globally with SNEAKERS_SKIP_DB=1.
 */
export async function syncSnapshotsToDb(snapshots: MarketSnapshot[]): Promise<void> {
  if (process.env.SNEAKERS_SKIP_DB === '1') return
  if (snapshots.length === 0) return
  try {
    const writer = await createDbWriter()
    const r = await writer.writeSnapshots(snapshots)
    await writer.close()
    console.log(
      `DB: +${r.markets} markets, +${r.outcomes} outcomes, ${r.observations} observations` +
        (r.errors ? ` (${r.errors} errors)` : ''),
    )
  } catch (e) {
    console.warn(`DB write skipped — ${(e as Error).message}`)
  }
}

export async function createDbWriter(url?: string): Promise<DbWriter> {
  const connectionString = url ?? process.env.POSTGRES_URL ?? 'postgresql://localhost:5432/sneakers'
  const client = new Client({ connectionString })
  await client.connect()

  const seenMarket = new Set<string>()
  const seenOutcome = new Set<string>()

  async function upsertMarket(snap: MarketSnapshot, marketId: string) {
    if (seenMarket.has(marketId)) return
    await client.query(
      `INSERT INTO markets (id, source, question, category, subcategory, close_time, status, raw_metadata, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (id) DO UPDATE
         SET last_seen_at = now(),
             status = EXCLUDED.status,
             close_time = EXCLUDED.close_time`,
      [
        marketId,
        snap.platform,
        snap.question,
        snap.sport ?? 'unknown',
        (snap.tags ?? []).join(','),
        snap.resolves_at ?? null,
        phaseToStatus(snap.phase),
        { tags: snap.tags ?? [], sport: snap.sport, phase: snap.phase },
      ],
    )
    seenMarket.add(marketId)
  }

  async function upsertOutcome(marketId: string, outcomeId: string, label: string) {
    const key = `${marketId}|${outcomeId}`
    if (seenOutcome.has(key)) return
    await client.query(
      `INSERT INTO outcomes (market_id, id, label) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [marketId, outcomeId, label],
    )
    seenOutcome.add(key)
  }

  return {
    async writeSnapshots(snaps: MarketSnapshot[]) {
      let markets = 0
      let outcomes = 0
      let observations = 0
      let errors = 0

      // Build one big observations batch across snapshots. Market + outcome
      // upserts happen per-row to keep the FK integrity simple; they're
      // cheap because seen-sets dedupe within a run.
      const obsRows: Array<unknown[]> = []

      for (const snap of snaps) {
        try {
          const marketId = `${snap.platform}:${snap.platform_market_id}`
          const beforeMarketSeen = seenMarket.has(marketId)
          await upsertMarket(snap, marketId)
          if (!beforeMarketSeen) markets++

          for (const o of snap.outcomes) {
            const outcomeId = slugify(o.name)
            const beforeOutcomeSeen = seenOutcome.has(`${marketId}|${outcomeId}`)
            await upsertOutcome(marketId, outcomeId, o.name)
            if (!beforeOutcomeSeen) outcomes++

            const impliedProb = clamp01(o.best_ask) ?? clamp01(o.last_price)
            obsRows.push([
              snap.ts,
              marketId,
              outcomeId,
              impliedProb,
              clamp01(o.best_bid),
              clamp01(o.best_ask),
              clamp01(o.last_price),
              snap.overround,
              toNum(snap.liquidity),
              toNum(snap.volume_traded),
            ])
          }
        } catch (e) {
          errors++
          console.warn('  db-write: row failed —', (e as Error).message)
        }
      }

      // Flush observations in chunks of 500 so we don't blow Postgres'
      // parameter limit (65535 per statement).
      const CHUNK = 500
      for (let i = 0; i < obsRows.length; i += CHUNK) {
        const chunk = obsRows.slice(i, i + CHUNK)
        const placeholders: string[] = []
        const values: unknown[] = []
        let p = 0
        for (const row of chunk) {
          const base = p * 10
          placeholders.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`,
          )
          values.push(...row)
          p++
        }
        try {
          await client.query(
            `INSERT INTO price_observations
              (observed_at, market_id, outcome_id, implied_prob, best_bid, best_ask, last_price, overround, liquidity_usd, volume_traded)
             VALUES ${placeholders.join(',\n')}
             ON CONFLICT DO NOTHING`,
            values,
          )
          observations += chunk.length
        } catch (e) {
          errors++
          console.warn('  db-write: batch failed —', (e as Error).message)
        }
      }

      return { markets, outcomes, observations, errors }
    },

    async close() {
      await client.end()
    },
  }
}
