#!/usr/bin/env node
// Backfill price_observations from apps/trader/data/<platform>/<date>.jsonl.
// Idempotent — composite PK (observed_at, market_id, outcome_id) means
// re-running is safe; duplicates are skipped via ON CONFLICT DO NOTHING.
//
// Usage:
//   pnpm tsx packages/core/db/scripts/load-jsonl.ts                       # loads every jsonl in apps/trader/data/*
//   pnpm tsx packages/core/db/scripts/load-jsonl.ts --platform=polymarket # one platform
//   pnpm tsx packages/core/db/scripts/load-jsonl.ts --date=2026-04-22     # one date
//
// Set POSTGRES_URL env var if not using the default localhost connection.

import { Client } from 'pg'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')
const DATA_DIR = join(REPO_ROOT, 'apps/trader/data')

type Outcome = { name: string; best_bid: number | null; best_ask: number | null; last_price: number | null }
type Snapshot = {
  platform: string
  platform_market_id: string
  question: string
  tags?: string[]
  sport?: string
  outcomes: Outcome[]
  overround: number | null
  volume_traded: number | string | null
  liquidity: number | null
  starts_at?: string
  resolves_at?: string
  phase: string
  ts: string
}

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

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const get = (k: string) => {
    const a = args.find((x) => x.startsWith(`--${k}=`))
    return a ? a.slice(k.length + 3) : undefined
  }
  return { platform: get('platform'), date: get('date'), batchSize: Number(get('batch-size') ?? '500') }
}

function listJsonl(opts: { platform?: string; date?: string }): string[] {
  const files: string[] = []
  const platforms = opts.platform ? [opts.platform] : readdirSync(DATA_DIR).filter((d) => {
    try { return statSync(join(DATA_DIR, d)).isDirectory() && !d.startsWith('_') } catch { return false }
  })
  for (const p of platforms) {
    const dir = join(DATA_DIR, p)
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue
        if (opts.date && !f.startsWith(opts.date)) continue
        files.push(join(dir, f))
      }
    } catch {}
  }
  return files.sort()
}

async function main() {
  const opts = parseArgs()
  const files = listJsonl(opts)
  if (files.length === 0) {
    console.error('No JSONL files found under', DATA_DIR)
    process.exit(1)
  }
  console.log(`Found ${files.length} JSONL files`)

  const url = process.env.POSTGRES_URL ?? 'postgresql://localhost:5432/sneakers'
  const client = new Client({ connectionString: url })
  await client.connect()
  console.log(`Connected to ${url}`)

  let totalMarkets = 0
  let totalOutcomes = 0
  let totalObservations = 0
  const seenMarket = new Set<string>()
  const seenOutcome = new Set<string>()

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    console.log(`\n${file}: ${lines.length} rows`)

    let batch: Array<{
      observed_at: string
      market_id: string
      outcome_id: string
      implied_prob: number | null
      best_bid: number | null
      best_ask: number | null
      last_price: number | null
      overround: number | null
      liquidity_usd: number | null
      volume_traded: number | null
    }> = []

    const flushObservations = async () => {
      if (batch.length === 0) return
      const values: unknown[] = []
      const placeholders: string[] = []
      let i = 0
      for (const r of batch) {
        const base = i * 10
        placeholders.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10})`)
        values.push(r.observed_at, r.market_id, r.outcome_id, r.implied_prob, r.best_bid, r.best_ask, r.last_price, r.overround, r.liquidity_usd, r.volume_traded)
        i++
      }
      const sql = `
        INSERT INTO price_observations
          (observed_at, market_id, outcome_id, implied_prob, best_bid, best_ask, last_price, overround, liquidity_usd, volume_traded)
        VALUES ${placeholders.join(',\n')}
        ON CONFLICT DO NOTHING
      `
      await client.query(sql, values)
      totalObservations += batch.length
      batch = []
    }

    for (const line of lines) {
      let snap: Snapshot
      try {
        snap = JSON.parse(line) as Snapshot
      } catch { continue }

      const marketId = `${snap.platform}:${snap.platform_market_id}`

      if (!seenMarket.has(marketId)) {
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
          ]
        )
        seenMarket.add(marketId)
        totalMarkets++
      }

      for (const o of snap.outcomes) {
        const outcomeId = slugify(o.name)
        const outcomeKey = `${marketId}|${outcomeId}`
        if (!seenOutcome.has(outcomeKey)) {
          await client.query(
            `INSERT INTO outcomes (market_id, id, label) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [marketId, outcomeId, o.name]
          )
          seenOutcome.add(outcomeKey)
          totalOutcomes++
        }

        const impliedProb = clamp01(o.best_ask) ?? clamp01(o.last_price)
        batch.push({
          observed_at: snap.ts,
          market_id: marketId,
          outcome_id: outcomeId,
          implied_prob: impliedProb,
          best_bid: clamp01(o.best_bid),
          best_ask: clamp01(o.best_ask),
          last_price: clamp01(o.last_price),
          overround: snap.overround,
          liquidity_usd: toNum(snap.liquidity),
          volume_traded: toNum(snap.volume_traded),
        })

        if (batch.length >= opts.batchSize) await flushObservations()
      }
    }
    await flushObservations()
  }

  await client.end()
  console.log(`\n✓ Loaded ${totalMarkets.toLocaleString()} markets, ${totalOutcomes.toLocaleString()} outcomes, ${totalObservations.toLocaleString()} observations`)
}

main().catch((err) => {
  console.error('✗ load-jsonl failed:', err)
  process.exit(1)
})
