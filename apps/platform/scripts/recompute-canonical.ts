#!/usr/bin/env tsx
// Recompute canonical_id for every non-closed market in the Railway DB.
//
// Self-bootstrapping: ensures the canonical_id column + index exist on first
// run (idempotent ALTER + CREATE INDEX). Then loads all non-closed markets +
// their latest snapshot, runs the same groupIntoCanonical() the platform
// uses, and UPDATEs canonical_id on each market row in batches.
//
// Run manually:
//   cd apps/platform && pnpm recompute:canonical
//
// Or from the Railway scrape-loop, after each iteration's scrapers finish.
// Safe to interrupt — partial canonical_ids are fine; next run computes from
// scratch with the freshest data.

import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import pg from 'pg'

loadEnv({ path: path.join(process.cwd(), '.env.local') })

import { groupIntoCanonical } from '../src/lib/canonical-markets'
import type { MarketSnapshot, MarketPhase } from '../src/lib/markets-data'

const { Client } = pg

function statusToPhase(status: string): MarketPhase {
  switch (status) {
    case 'pre_open': return 'pre_game'
    case 'open': return 'live'
    case 'closed': return 'closed'
    default: return 'opening'
  }
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

async function main() {
  const url = process.env.POSTGRES_URL
  if (!url) {
    console.error('POSTGRES_URL not set')
    process.exit(1)
  }

  const client = new Client({ connectionString: url })
  await client.connect()

  const t0 = Date.now()

  // 1. Self-bootstrap migration. Idempotent — every run is safe.
  await client.query(`
    alter table markets
      add column if not exists canonical_id text;
    create index if not exists markets_canonical_id_idx
      on markets (canonical_id) where canonical_id is not null;
  `)
  console.log(`[recompute-canonical] migration ensured (${Date.now() - t0}ms)`)

  // 2. Pull all non-closed markets + latest snapshot.
  const t1 = Date.now()
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
    WHERE m.status <> 'closed'
    ORDER BY m.id, o.id
  `
  const res = await client.query(sql)
  console.log(`[recompute-canonical] pulled ${res.rows.length} rows (${Date.now() - t1}ms)`)

  // 3. Reconstitute MarketSnapshots (one per market_id).
  const t2 = Date.now()
  const byMarket = new Map<string, typeof res.rows>()
  for (const row of res.rows) {
    let group = byMarket.get(row.market_id)
    if (!group) {
      group = []
      byMarket.set(row.market_id, group)
    }
    group.push(row)
  }

  const snapshots: MarketSnapshot[] = []
  for (const [marketId, rows] of byMarket) {
    const sep = marketId.indexOf(':')
    if (sep < 0) continue
    const platform = marketId.slice(0, sep)
    const platform_market_id = marketId.slice(sep + 1)
    const first = rows[0]
    const ts =
      typeof first.observed_at === 'string'
        ? first.observed_at
        : first.observed_at?.toISOString?.()
    if (!ts) continue
    snapshots.push({
      platform,
      platform_market_id,
      question: first.question,
      tags: first.raw_metadata?.tags ?? [],
      sport: first.raw_metadata?.sport ?? (first.category !== 'unknown' ? first.category : undefined),
      outcomes: rows.map((r: typeof first) => ({
        name: r.label,
        best_bid: num(r.best_bid),
        best_ask: num(r.best_ask),
        last_price: num(r.last_price),
      })),
      overround: num(first.overround),
      volume_traded: num(first.volume_traded),
      liquidity: num(first.liquidity_usd),
      phase: first.raw_metadata?.phase ?? statusToPhase(first.status),
      ts,
      resolves_at:
        first.close_time
          ? typeof first.close_time === 'string'
            ? first.close_time
            : first.close_time.toISOString?.()
          : undefined,
    })
  }
  console.log(`[recompute-canonical] reconstituted ${snapshots.length} snapshots (${Date.now() - t2}ms)`)

  // 4. Run grouping.
  const t3 = Date.now()
  const { canonical } = groupIntoCanonical(snapshots)
  console.log(`[recompute-canonical] grouped into ${canonical.length} canonical groups (${Date.now() - t3}ms)`)

  // 5. Build (market_id, canonical_id) updates.
  const updates: Array<[string, string]> = []
  for (const c of canonical) {
    for (const q of c.quotes) {
      updates.push([`${q.platform}:${q.platform_market_id}`, c.id])
    }
  }
  console.log(`[recompute-canonical] ${updates.length} updates to apply`)

  // 6. Batched UPDATE via UNNEST. One round trip per batch.
  const t4 = Date.now()
  const BATCH = 5000
  let done = 0
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH)
    const ids = slice.map(([id]) => id)
    const cids = slice.map(([, cid]) => cid)
    await client.query(
      `UPDATE markets m
       SET canonical_id = u.canonical_id
       FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS canonical_id) u
       WHERE m.id = u.id AND m.canonical_id IS DISTINCT FROM u.canonical_id`,
      [ids, cids],
    )
    done += slice.length
    if (done % 25_000 === 0 || done === updates.length) {
      console.log(`[recompute-canonical]   ${done}/${updates.length}`)
    }
  }
  console.log(`[recompute-canonical] applied updates (${Date.now() - t4}ms)`)
  console.log(`[recompute-canonical] total ${Date.now() - t0}ms`)

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
