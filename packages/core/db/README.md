# Sneakers Time-Series Database

Postgres + TimescaleDB running locally on Albus. Stores every price observation
from every scraper, plus auto-updating 1m / 5m / 1h OHLC aggregates. This is
the analytical store — cleanly separate from Supabase (which holds user data).

## Setup (once per machine)

```bash
brew tap timescale/tap
brew install timescaledb
timescaledb-tune --quiet --yes
brew services start postgresql@16

# Create the DB and load the extension
psql postgres -c "CREATE DATABASE sneakers;"
psql sneakers -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
psql sneakers -c "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';"
```

## Apply migrations

```bash
cd packages/core/db
./scripts/migrate.sh
```

Idempotent — safe to re-run; every statement uses `IF NOT EXISTS` /
`if_not_exists`.

## Verify

```bash
cd ../../..   # back to repo root
pnpm tsx packages/core/db/scripts/verify.ts
```

Expected output: TimescaleDB version, 1 hypertable (`price_observations`),
3 continuous aggregates (`price_bars_1m` / `_5m` / `_1h`), 1 smoke observation
inserted and read back.

## Backfill from JSONL

All scrapers currently append to `apps/trader/data/<platform>/<date>.jsonl` as
their source of truth. To load that history into Timescale:

```bash
pnpm tsx packages/core/db/scripts/load-jsonl.ts                          # everything
pnpm tsx packages/core/db/scripts/load-jsonl.ts --platform=polymarket    # one platform
pnpm tsx packages/core/db/scripts/load-jsonl.ts --date=2026-04-22        # one date
```

Idempotent — composite PK `(observed_at, market_id, outcome_id)` + `ON CONFLICT DO NOTHING`.
Re-running is safe.

## Schema

- `markets` — catalog row per unique market across all providers
  (id = `{source}:{platform_market_id}`)
- `outcomes` — one row per outcome within a market (YES/NO or N candidates)
- `price_observations` — hypertable, 1-day chunks, compressed after 7 days,
  dropped after 180 days
- `price_bars_1m` / `_5m` / `_1h` — continuous aggregates, OHLC + count +
  liquidity/volume/overround stats

## Retention

| Layer | Retention | Purpose |
|---|---|---|
| Raw `price_observations` | 180 days | Tick-level replay |
| `price_bars_1m` | 30 days | Short-term drift charts |
| `price_bars_5m` | 180 days | Medium-horizon analytics |
| `price_bars_1h` | **forever** | Data product surface — historical odds license |
| Compression | chunks >7 days | ~10× storage savings |

## Connection

Default: `postgresql://localhost:5432/sneakers` — no auth on localhost.
Override via `POSTGRES_URL` env var (see `.env.example`).

## Relationship to other stores

- **JSONL** at `apps/trader/data/<platform>/<date>.jsonl` is the write-ahead log
  — scrapers append there first so nothing is lost if the DB is down. Once the
  pipeline writes to Timescale directly, JSONL becomes archival.
- **Supabase** is for user data only (waitlist, auth, affiliate clicks,
  venue-access requests). Never store scraped market data in Supabase — bill
  mismatch and retention model are wrong for high-frequency time-series.

## Next steps (after first `verify.ts` passes)

1. **Backfill JSONL** with `scripts/load-jsonl.ts` — gives you immediate
   historical data.
2. **Point scrapers at Timescale** — swap the JSONL writers in
   `apps/trader/src/scrapers/*/scrape.ts` for a pg INSERT helper (keep JSONL
   append as fallback).
3. **Nightly `pg_dump` to R2/S3** — disaster recovery + future parquet export
   for buyers.
4. **Expose a read API** on the platform app (e.g.,
   `/api/historical?market_id=…&from=…&to=…`) — eventually behind auth +
   Stripe billing for data licensing.
