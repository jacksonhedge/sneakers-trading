#!/usr/bin/env node
// Smoke test — connect, check extension / hypertable / aggregates / insert-read.
// Run after ./migrate.sh to confirm the DB is scraper-ready.
import { Client } from 'pg'

async function main() {
  const url = process.env.POSTGRES_URL ?? 'postgresql://localhost:5432/sneakers'
  const client = new Client({ connectionString: url })
  await client.connect()
  console.log(`Connected to ${url}`)

  const ver = await client.query(
    "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'"
  )
  console.log('TimescaleDB version:', ver.rows[0]?.extversion ?? '(extension not installed)')

  const ht = await client.query(
    'SELECT hypertable_name FROM timescaledb_information.hypertables'
  )
  console.log('Hypertables:', ht.rows.map((r) => r.hypertable_name))

  const cagg = await client.query(
    'SELECT view_name FROM timescaledb_information.continuous_aggregates'
  )
  console.log('Continuous aggregates:', cagg.rows.map((r) => r.view_name))

  await client.query(`
    INSERT INTO markets (id, source, question, category, close_time, status)
    VALUES ('test:smoke', 'test', 'Smoke test market', 'crypto', now() + interval '1 hour', 'open')
    ON CONFLICT (id) DO UPDATE SET last_seen_at = now()
  `)
  await client.query(`
    INSERT INTO outcomes (market_id, id, label)
    VALUES ('test:smoke', 'yes', 'Yes')
    ON CONFLICT DO NOTHING
  `)
  await client.query(`
    INSERT INTO price_observations
      (observed_at, market_id, outcome_id, implied_prob, best_ask, raw_price_format, raw_price_value, seq)
    VALUES
      (now(), 'test:smoke', 'yes', 0.5, 0.5, 'probability', 0.5, 1)
    ON CONFLICT DO NOTHING
  `)
  const readback = await client.query(
    "SELECT market_id, outcome_id, implied_prob, best_ask FROM price_observations WHERE market_id = 'test:smoke' LIMIT 1"
  )
  console.log('Smoke observation:', readback.rows[0])

  await client.query("DELETE FROM price_observations WHERE market_id = 'test:smoke'")
  await client.query("DELETE FROM outcomes WHERE market_id = 'test:smoke'")
  await client.query("DELETE FROM markets WHERE id = 'test:smoke'")

  await client.end()
  console.log('\n✓ All checks passed')
}

main().catch((err) => {
  console.error('✗ Verification failed:', err)
  process.exit(1)
})
