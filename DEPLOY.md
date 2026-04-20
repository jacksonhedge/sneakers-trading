# Deploy — Railway

Both `web/` (Next.js terminal) and the root `src/` (Express + WS + scrapers + SQLite) deploy to Railway.

## One-time setup

1. In Railway, create a new **Project** and connect it to `jacksonhedge/sneakers-trading`.
2. Add **two services** inside that project, both pointing at the same repo:
   - **`sneakers-api`** — Root Directory: `/` (default). Reads `railway.json`.
   - **`sneakers-web`** — Root Directory: `web`. Reads `web/railway.json`.
3. On `sneakers-api`, attach a **Volume** mounted at `/data` so `better-sqlite3` snapshots persist across deploys. Set env `SNEAKERS_DB_PATH=/data/sneakers.db`.
4. On `sneakers-web`, set env `NEXT_PUBLIC_API_BASE=https://<sneakers-api public URL>`.
5. Generate a public domain for each service in the Railway UI.

## Env vars

| Service | Var | Purpose |
|---------|-----|---------|
| api | `SNEAKERS_DB_PATH` | SQLite file location (volume-backed) |
| api | `KALSHI_API_KEY_ID` / `KALSHI_PRIVATE_KEY` | Authenticated Kalshi calls (not needed for read-only market data) |
| api | `API_KEY_HASH_SECRET` | HMAC for user API keys |
| web | `NEXT_PUBLIC_API_BASE` | Points the web terminal at the api service |

Mark every secret as **Sealed** in Railway so they never appear in logs.

## Deploy workflow

- Push to any branch → Railway builds a preview environment per service
- Merge to `main` → both services auto-deploy to production

## Local dev

```bash
# API + scrapers
npm run dashboard               # :3333

# Web terminal
cd web && npm run dev           # :3030
```

## Scrapers on a schedule

Right now scrapers poll via `setInterval` inside the `dashboard-server` process (fine for 20 beta testers). If we outgrow that, move each scraper's `poll()` onto a **Railway Cron** service — same repo, different start command per cron entry.
