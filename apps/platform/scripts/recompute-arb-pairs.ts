#!/usr/bin/env tsx
// Recompute cross-book moneyline arb pairs and persist to the cross_book_pairs
// table. Mirrors recompute-canonical.ts: self-bootstraps schema, runs the
// existing in-memory findCrossBookPairs() over current snapshots, then
// TRUNCATE+INSERT the results in a single transaction so consumers always
// see a coherent set.
//
// Run manually:
//   cd apps/platform && pnpm recompute:arb-pairs
//
// Or from the Railway scrape-loop (added after recompute-canonical).

import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import pg from 'pg'

loadEnv({ path: path.join(process.cwd(), '.env.local') })

import type { MarketSnapshot, MarketPhase } from '../src/lib/markets-data'
import { findCrossBookPairs } from '../src/lib/arb-scanner'

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

const { Client } = pg

async function main() {
  const url = process.env.POSTGRES_URL
  if (!url) {
    console.error('POSTGRES_URL not set')
    process.exit(1)
  }
  const client = new Client({ connectionString: url })
  await client.connect()
  const t0 = Date.now()

  // 1. Self-bootstrap schema. Idempotent.
  await client.query(`
    create table if not exists cross_book_pairs (
      id              serial primary key,
      sport           text,
      away            text,
      home            text,
      starts_at       timestamptz,
      quotes          jsonb not null,
      cheapest_home_platform text,
      cheapest_home_ask      numeric(6,5),
      cheapest_away_platform text,
      cheapest_away_ask      numeric(6,5),
      best_sum        numeric(7,5),
      is_arb          boolean not null default false,
      computed_at     timestamptz not null default now()
    );
    create index if not exists cross_book_pairs_best_sum_idx
      on cross_book_pairs (best_sum nulls last);
    create index if not exists cross_book_pairs_starts_at_idx
      on cross_book_pairs (starts_at);
  `)
  console.log(`[recompute-arb-pairs] schema ensured (${Date.now() - t0}ms)`)

  // 2. Pull current snapshots directly. Mirrors loadAllLatestSnapshotsFromDb
  //    in markets-data.ts but uses this script's already-connected client (the
  //    platform loader's 2s connection timeout drops Railway public-proxy
  //    queries from CLI contexts and falls through to JSONL).
  const t1 = Date.now()
  const snapSql = `
    SELECT
      m.id AS market_id, m.source, m.question, m.category, m.close_time,
      m.status, m.raw_metadata,
      o.id AS outcome_id, o.label,
      l.observed_at, l.best_bid, l.best_ask, l.last_price,
      l.overround, l.liquidity_usd, l.volume_traded
    FROM markets m
    JOIN outcomes o ON o.market_id = m.id
    JOIN LATERAL (
      SELECT observed_at, best_bid, best_ask, last_price, overround, liquidity_usd, volume_traded
      FROM price_observations p
      WHERE p.market_id = m.id AND p.outcome_id = o.id
      ORDER BY p.observed_at DESC LIMIT 1
    ) l ON TRUE
    WHERE m.status <> 'closed'
    ORDER BY m.id, o.id
  `
  const res = await client.query(snapSql)
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
    const first = rows[0]
    const ts =
      typeof first.observed_at === 'string'
        ? first.observed_at
        : first.observed_at?.toISOString?.()
    if (!ts) continue
    snapshots.push({
      platform: marketId.slice(0, sep),
      platform_market_id: marketId.slice(sep + 1),
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
      starts_at: undefined,
      resolves_at:
        first.close_time
          ? typeof first.close_time === 'string'
            ? first.close_time
            : first.close_time.toISOString?.()
          : undefined,
    })
  }
  console.log(`[recompute-arb-pairs] loaded ${snapshots.length} snapshots (${Date.now() - t1}ms)`)

  // 3. Compute pairs (no LIMIT — store all, dashboard slices).
  const t2 = Date.now()
  const pairs = findCrossBookPairs(snapshots)
  console.log(`[recompute-arb-pairs] computed ${pairs.length} pairs (${Date.now() - t2}ms)`)

  // 4. Atomic swap: TRUNCATE + INSERT in one txn so consumers don't see an
  //    empty table mid-recompute. If the txn fails, the prior pairs stay.
  const t3 = Date.now()
  await client.query('BEGIN')
  try {
    await client.query('TRUNCATE cross_book_pairs')
    if (pairs.length > 0) {
      const cols = ['sport','away','home','starts_at','quotes','cheapest_home_platform','cheapest_home_ask','cheapest_away_platform','cheapest_away_ask','best_sum','is_arb']
      const BATCH = 1000
      for (let i = 0; i < pairs.length; i += BATCH) {
        const slice = pairs.slice(i, i + BATCH)
        const placeholders: string[] = []
        const values: unknown[] = []
        let p = 0
        for (const r of slice) {
          const base = p * cols.length
          placeholders.push(
            '(' + cols.map((_, j) => `$${base + j + 1}`).join(',') + ')',
          )
          values.push(
            r.sport, r.away, r.home, r.startsAt,
            JSON.stringify(r.quotes),
            r.cheapestHome?.platform ?? null,
            r.cheapestHome?.ask ?? null,
            r.cheapestAway?.platform ?? null,
            r.cheapestAway?.ask ?? null,
            r.bestSum, r.isArb,
          )
          p++
        }
        await client.query(
          `INSERT INTO cross_book_pairs (${cols.join(',')}) VALUES ${placeholders.join(',')}`,
          values,
        )
      }
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }
  console.log(`[recompute-arb-pairs] persisted ${pairs.length} pairs (${Date.now() - t3}ms)`)
  console.log(`[recompute-arb-pairs] total ${Date.now() - t0}ms`)

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
