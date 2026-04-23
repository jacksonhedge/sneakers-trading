# Railway — repoint at `apps/trader` + run scrapers as a 24/7 worker

For Claude Chrome. We're repurposing the existing Railway project (`glorious-playfulness` / service `sneakers-trading`) to run the Sneakers Terminal scraper loop continuously. The scrapers currently run on the human's laptop via `scrape-loop.sh`; moving them to Railway means `sneakersterminal.com` gets fresh data even when the laptop is asleep.

## What's broken today

- `Root Directory` is set to `curitiba` (typo from an earlier experiment; directory doesn't exist in the repo) → every push to `main` triggers a build that dies in 4 seconds.
- Zero user-defined env vars.
- Service type is "web" but we want it to be a continuous worker that makes outbound HTTP calls to scraper APIs, writes to Timescale, and doesn't serve inbound HTTP.

## What to do, in order

### Step 1 — point at the right directory

1. Open **railway.app** → `glorious-playfulness` → `sneakers-trading` → **Settings → Source**.
2. **Root Directory**: change from `curitiba` to **`apps/trader`**. Save.

### Step 2 — set the build + start commands

1. Still in the service settings, find **Settings → Deploy → Build Command**.
2. Set build command to:
   ```
   cd ../.. && pnpm install --frozen-lockfile
   ```
   (We `cd ../..` up to the monorepo root so pnpm sees the workspace config, install once, and all workspaces share one node_modules.)
3. Find **Start Command**.
4. Set start command to:
   ```
   bash scripts/scrape-loop.sh
   ```
   That script lives at `apps/trader/scripts/scrape-loop.sh`; it polls every platform on a cadence, never exits, and writes JSONL + optionally Timescale.
5. Save.

### Step 3 — make it a worker, not a web service

Railway's "web" service type expects the process to bind a port. The scrape loop doesn't — it's a background worker. If you don't do this step, Railway's healthcheck will keep restarting the container.

1. Settings → Deploy → find **Healthcheck** and **disable** it (or set "Healthcheck Path" to blank / None).
2. Settings → find anything labeled **"Service Type"** or **"HTTP expose"** — set to NOT expose an HTTP port. If there's no such setting, the healthcheck disable alone is enough.

### Step 4 — add environment variables

Settings → **Variables**. The scraper needs these to reach upstream APIs and write to Timescale. The human has the actual values in `apps/platform/.env.local` and `apps/trader/.env` on their laptop.

Add these as Railway variables (the human will paste values when prompted; do NOT guess or fabricate values):

| Variable | Purpose | Where the human finds the value |
|---|---|---|
| `POSTGRES_URL` | Timescale connection string for dual-write | Railway's own Postgres addon URL, OR their local Timescale tunnel URL if they want cloud-to-local writes |
| `NOVIG_BEARER_TOKEN` | NoVig scraper auth | `apps/trader/.env` — `NOVIG_BEARER_TOKEN` |
| `PROPHETX_BEARER_TOKEN` | ProphetX scraper auth | `apps/trader/.env` — `PROPHETX_BEARER_TOKEN` |
| `ODDSAPI_KEY` | OddsAPI scraper auth (4 sportsbooks) | `apps/trader/.env` — `ODDSAPI_KEY` |
| `SNEAKERS_SKIP_DB` | Set to `1` if no Postgres is available yet; scraper gracefully skips DB writes and keeps running | Default `0` / leave blank once Timescale is up |

**Do not add the Stripe, Supabase, or Resend keys.** Those are for the Next.js platform on Vercel, not the scraper.

### Step 5 — trigger a fresh deploy

1. Go to **Deployments** tab.
2. Click **Deploy** (or `⋯` → **Redeploy**) on the top card.
3. Uncheck "Use existing Build Cache" if the option appears.
4. Wait 2–5 minutes. The build should now:
   - Complete (no more `curitiba does not exist` error)
   - Transition to "Deploying"
   - Transition to "Running"
   - Stay running (not crash immediately)

### Step 6 — verify via the deploy logs

Open **Deploy Logs** on the running deployment. You should see output every ~10 min like:
```
[scrape-loop] iteration 1 starting at 2026-04-23T...
[scrape-loop] polymarket: 2734 markets (1.2s)
[scrape-loop] kalshi: 1480 markets (0.9s)
...
[scrape-loop] sleeping 600s
```

If you see any of these, something's wrong:
- Repeated crashes + restarts → missing env var → report which variable's name appears in the error
- `ECONNREFUSED` on Postgres → Timescale not reachable → set `SNEAKERS_SKIP_DB=1` temporarily
- Authentication errors for a specific book (e.g., NoVig 401) → bearer token stale → needs rotation from the human

## Report back

```
Root Directory now: apps/trader (was: curitiba)
Service type:       worker / healthcheck disabled
Env vars added:     <count> / 5
Build status:       success / failed ({reason})
Runtime status:     running / crashed ({reason})
First log line showing a scraper iteration completing: "<paste>"
```

## Things to NOT do

- **Don't paste scraper token values in your report.** Just report whether each variable is present, not what it equals.
- Don't touch the `RAILWAY_*` system env vars — those are Railway-managed.
- Don't change the GitHub-connected repo or branch. Keep it on `main`.
- Don't delete the project — we're repurposing it, not recreating it.
- Don't set service type to "cron" if there's an option — the scrape loop already handles its own cadence, a cron schedule on top would double-trigger.

## If the human hasn't filled in the env vars yet

It's fine to stop after Step 3 with the build command fixed and the service type set. The container will start, immediately complain about missing env vars, and exit. The human can then come back and add values. Just make sure the `curitiba` typo is gone and the service won't spam build-failure emails anymore.
