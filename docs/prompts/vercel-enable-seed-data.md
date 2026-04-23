# Vercel — turn on seed data on prod

For Vercel MCP server (or Claude Chrome). Adds one env var and redeploys so `sneakersterminal.com` starts rendering market data on the dashboard while the real Timescale pipeline is still being wired up.

## What needs to happen (3 actions)

1. **Find the Vercel project** that owns `sneakersterminal.com`.
   Search projects for "sneakers" — should be a single match. The project ID will look like `prj_xxx...`.

2. **Add an environment variable** to that project:
   - Key: `SNEAKERS_ENABLE_SEED`
   - Value: `1`
   - Target: **Production only** (not Preview, not Development)
   - Type: Plain (not encrypted — it's a feature flag, not a secret)

3. **Trigger a fresh production deployment** of the latest `main` branch:
   - Either redeploy the most recent production deployment with **build cache disabled**, OR
   - Push an empty commit to `main` (less ideal — only do this if redeploy isn't available)

## Verify

After the deploy turns green (~3 min), curl the live API:

```
curl https://sneakersterminal.com/api/markets/opportunities | head -c 200
```

Expected: `{"platforms":{"novig":{"markets":...}, "kalshi":...}, "lastUpdated":"...", "totalMarkets":13, ...}`

If `totalMarkets` is still null/0 or platforms is `[]`, the env didn't take effect — check it actually saved on Production scope and the redeploy used the new env (build cache disabled).

## Report back

Three lines:

```
Project: <project name + id>
Env var SNEAKERS_ENABLE_SEED=1 added to Production: yes / no
New deploy hash: <git sha or "deploy id">
Live /api/markets/opportunities totalMarkets: <number>
```

## What this enables (context, not instructions)

The app's `loadAllLatestSnapshots()` falls back to a 13-row hardcoded sample when both Timescale and JSONL return empty AND `SNEAKERS_ENABLE_SEED === '1'`. The sample covers MLB / NBA / NHL moneylines from NoVig / FanDuel / DK / BetMGM / ProphetX, a player prop, and prediction markets across Kalshi / Polymarket / OG (politics, economics, crypto). Every platform_market_id is realistic; the cross-book arb scanner produces real pairs from the seed (Yankees/Red Sox and Lakers/Warriors are quoted on multiple books).

**This is temporary.** Remove the env var the moment real scraper data lands in Timescale. The fallback code is marked for deletion in `apps/platform/src/lib/seed-snapshots.ts`.

## Things to NOT do

- Don't add the var to Preview or Development scopes — only Production.
- Don't redeploy without disabling build cache (cached builds may not pick up env changes).
- Don't delete or modify any existing env vars while you're in there.
- Don't change the Production Branch setting — it's already `main`.
