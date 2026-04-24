# Chrome prompt — provision Timescale on Railway + wire up env vars

Paste the block between the `---` lines into Claude Chrome. This gets a Postgres/Timescale database live on Railway and wires the DATABASE_URL into both the Railway scraper and Vercel web app.

The Chrome agent handles the dashboard clicks. You'll run the migrations yourself locally at the end (one command, included below).

---

I need to provision a Timescale-compatible Postgres database on Railway and wire its connection string into two services. Please execute these steps in order. After each major phase, report back what you did and what the next phase's state looks like.

## Context

- Railway project: glorious-playfulness
- Current service: sneakers-trading (scraper worker, already running)
- Vercel project: sneakersterminal.com (Next.js web app at apps/platform)
- Current state: scraper runs with SNEAKERS_SKIP_DB=1 so JSONL doesn't write to a DB. We're about to remove that skip flag once the DB exists.

## Phase 1 — Provision the database on Railway

1. Go to railway.app → open the `glorious-playfulness` project
2. Click the **+ Create** button (top right, or wherever Railway's "New" is)
3. Choose **Database** → **Add PostgreSQL**
   - If Railway offers a **TimescaleDB** template specifically, pick that instead. (It's Postgres with the TimescaleDB extension preloaded.)
   - If only vanilla Postgres is offered, pick that. The scraper works with vanilla Postgres; the TimescaleDB extension is a nice-to-have for hypertables but not required.
4. Wait for the database to provision (should take <1 minute; the service card will go from "Initializing" to "Online")
5. Click the new database service to open its panel
6. Go to the **Variables** tab
7. Find the `DATABASE_URL` variable (Railway generates this automatically — format: `postgres://postgres:PASSWORD@HOST:PORT/railway`)
8. Copy the full value — you'll need it in Phase 2

Report: what database template you picked (TimescaleDB or vanilla Postgres), and confirm `DATABASE_URL` exists. Do NOT paste the full URL back to me — just say "copied".

## Phase 2 — Wire DATABASE_URL into the scraper service

1. Still in the glorious-playfulness project, click the **sneakers-trading** service
2. Go to the **Variables** tab
3. Add a new variable:
   - Name: `POSTGRES_URL`
   - Value: paste the `DATABASE_URL` you copied in Phase 1
   - (Railway services can reference each other's variables via `${{Postgres.DATABASE_URL}}` syntax — if that's available in the Variables UI, prefer it over pasting a literal string. It auto-updates if the DB password rotates.)
4. **Delete** the existing `SNEAKERS_SKIP_DB` variable entirely (or set it to `0` — but deleting is cleaner)
5. Save
6. Trigger a redeploy (Apply Changes → Deploy)

Report: confirm POSTGRES_URL is set and SNEAKERS_SKIP_DB is removed. Note the deploy status.

## Phase 3 — Wire DATABASE_URL into Vercel

1. Go to vercel.com/dashboard → find the `sneakersterminal.com` project (name might be slightly different — look for the Next.js app deploying from the sneakers-trading repo)
2. Settings → Environment Variables
3. Add a new variable:
   - Name: `POSTGRES_URL`
   - Value: paste the same DATABASE_URL from Phase 1
   - Environments: check **Production**, **Preview**, and **Development**
4. Save
5. Go to Deployments → click the most recent production deployment → three-dot menu → **Redeploy**
   - Uncheck "Use existing Build Cache" so the new env var takes effect
   - Click Redeploy

Report: confirm POSTGRES_URL was added to Vercel with all three environments checked, and that a redeploy has started.

## Phase 4 — Confirm everything's healthy

1. Back in Railway → sneakers-trading service → Deploy Logs → watch for scraper output
2. Scraper log success patterns to confirm:
   - `scrape-loop starting`
   - `→ polymarket` followed by `✓ polymarket done` (within 30s)
   - Same pattern for kalshi, novig, og, oddsapi
3. Expected failures (not bugs — known issues):
   - `✗ prophetx failed` — the PROPHETX_BEARER_TOKEN is expired, this is expected until the user refreshes it
   - Underdog is not in the loop (excluded — see comment in scrape-loop.sh)

Report: paste the last 20 lines of scraper deploy logs showing at least one iteration.

## Important boundaries

- Do not modify any other Railway services or any other Vercel projects
- Do not change the existing Build Command or Start Command on sneakers-trading (those are correct)
- Do not run any SQL or migration commands yourself — the user will run migrations locally from their machine after this is done
- If any step can't be completed (permissions, UI has changed, button missing), stop and report what you see rather than improvising

---

## What I (the user) do locally after the Chrome agent finishes

Once the Chrome agent confirms Phases 1–3 are done, run this one command from your laptop to create the schema in the new Railway Postgres:

```bash
# Set this to the DATABASE_URL the Chrome agent reported copying in Phase 1
# (Railway shows both an internal postgres.railway.internal URL and an
# external PUBLIC one — use the public one for local migrations.)
export POSTGRES_URL='postgres://postgres:XXXX@YYYY.proxy.rlwy.net:ZZZZ/railway'

# Run migrations — applies catalog + price_observations + aggregates in order
cd ~/sneakers-trading
for f in packages/core/db/migrations/*.sql; do
  echo "applying $(basename $f)"
  psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

That's it — after the migrations apply:

- Scraper on Railway starts inserting rows into `markets`, `outcomes`, `price_observations` every 10 minutes
- Vercel Next.js app reads from the same Postgres → dashboard switches from seed data to real data
- You can remove `SNEAKERS_ENABLE_SEED=1` from Vercel at your leisure (real data will preempt seed anyway once rows exist)

If `psql` isn't installed locally: `brew install libpq && brew link --force libpq` (the full postgres brew cask is overkill for just the CLI).
