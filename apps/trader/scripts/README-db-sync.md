# JSONL → Timescale sync

Two paths to get scraped market data into Timescale:

1. **Cron sync (safety net).** launchd runs `db:load-jsonl` every 5 minutes, picking up whatever JSONL has appeared since last run. Idempotent via the composite PK on `price_observations`.
2. **Direct write from scrapers.** Scrapers that import `utils/db-write.ts` land data in the DB at the same time they append to JSONL — no wait for the cron.

Both can run in parallel safely — duplicates are silently dropped by `ON CONFLICT DO NOTHING`.

## Install the cron

```bash
cp apps/trader/scripts/com.sneakers.db-loader.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.sneakers.db-loader.plist

# Verify it registered
launchctl list | grep sneakers
# com.sneakers.db-loader should appear

# Check logs (first run fires immediately via RunAtLoad)
tail -f apps/trader/data/_loop-logs/db-sync.log
```

Runs every 5 minutes (`StartInterval=300`). Logs to `apps/trader/data/_loop-logs/db-sync.log`; stdout/stderr from launchd itself at `/tmp/sneakers-db-loader.{out,err}`.

## Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.sneakers.db-loader.plist
rm ~/Library/LaunchAgents/com.sneakers.db-loader.plist
```

## Adopt direct-write in a scraper

After the existing `writeJsonl(snapshots)` call, add:

```ts
if (process.env.SNEAKERS_SKIP_DB !== '1') {
  try {
    const { createDbWriter } = await import('../utils/db-write.js');
    const writer = await createDbWriter();
    const result = await writer.writeSnapshots(snapshots);
    await writer.close();
    console.log(`DB: +${result.markets} markets, +${result.outcomes} outcomes, ${result.observations} observations`);
  } catch (e) {
    console.warn(`DB write skipped — ${(e as Error).message}`);
  }
}
```

Pattern: dual-write with soft fail. If the DB is unreachable, the scraper keeps shipping to JSONL and the cron picks up the gap on its next pass. Set `SNEAKERS_SKIP_DB=1` to force JSONL-only.

Already integrated: **oddsapi**. TODO to adopt: kalshi, novig, og, polymarket, prizepicks, prophetx, underdog.

## Connecting to a non-default Postgres

Set `POSTGRES_URL` env var:
```bash
export POSTGRES_URL="postgresql://user:pass@host:5432/sneakers"
```

Both the cron and direct-writer honor it. Default: `postgresql://localhost:5432/sneakers`.
