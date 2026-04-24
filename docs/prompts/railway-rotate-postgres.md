# Chrome prompt — rotate Railway Postgres password

Paste to Claude Chrome. The current password was exposed in chat transcripts when we ran local migrations. Rotating cleans the leak.

The good news: both the Railway scraper service and the Vercel web app reference the Postgres URL via Railway's `${{Postgres.DATABASE_URL}}` variable syntax (set up earlier today), so password rotation propagates automatically. Verify both services still work after.

---

I need to rotate the Postgres password for my Railway database and verify both downstream services still connect. Please execute in this exact order.

## Phase 1 — Rotate password

1. Navigate to https://railway.app/dashboard
2. Open the `glorious-playfulness` project
3. Click the **Postgres** service (the database tile — separate from the sneakers-trading scraper tile)
4. Go to the **Variables** tab
5. Find the `PGPASSWORD` variable. Click the three-dot menu → **Regenerate** (or the circular arrow icon if that's the Railway UI pattern)
6. Confirm on the "Are you sure?" prompt
7. Railway will auto-update `DATABASE_URL` and `DATABASE_PUBLIC_URL` with the new password — this is the cascade we want

Report: confirm password was rotated. Railway may briefly show the services as "Deploying" — that's expected.

## Phase 2 — Verify scraper still works

1. Back in the project, click the **sneakers-trading** service (the scraper worker)
2. Go to **Deployments** tab
3. Wait for the auto-redeploy triggered by the password change to complete (usually 2-3 minutes)
4. Once status = Active, click **View Logs**
5. Switch to **Deploy Logs** tab (not Build Logs)
6. Wait for the next scraper iteration (runs every 10 minutes). Look for:
   - `scrape-loop starting, interval=600s`
   - `→ polymarket` followed by `✓ polymarket done`
   - No `ECONNREFUSED`, `password authentication failed`, or `FATAL` errors

Report: paste the last 10 log lines. Confirm no Postgres connection errors.

## Phase 3 — Verify Vercel web app still works

1. Navigate to https://vercel.com/dashboard → sneakers-terminal project
2. Check: did Vercel auto-redeploy when Railway rotated the password? (It should have if `POSTGRES_URL` was set via Railway reference syntax — but some configs don't trigger auto-redeploy)
3. If no auto-redeploy happened, trigger one manually: Deployments → most recent prod → three-dot menu → Redeploy (uncheck Build Cache)
4. Once Ready, open https://sneakersterminal.com/dashboard in a new tab
5. Confirm the dashboard loads — it queries Postgres on every render. A 500 error here means the password didn't propagate.

Report: PASS or FAIL on dashboard load.

## If anything goes sideways

If the scraper or Vercel starts erroring with `password authentication failed`:
1. In Railway → sneakers-trading service → Variables → check `POSTGRES_URL`
2. If it shows a literal value starting with `postgresql://postgres:OLD_PASSWORD...`, the reference syntax didn't take hold. Delete the variable, re-add as: Name=`POSTGRES_URL`, Value=`${{Postgres.DATABASE_URL}}` (the exact literal string with braces — Railway resolves it at deploy time)
3. Redeploy
4. Same check on Vercel — `POSTGRES_URL` should either be the Railway reference (if you're using Railway's Vercel integration) or a literal pasted value that needs manual updating

## Boundaries

- Only rotate PGPASSWORD — do not touch other Postgres service variables
- Do not delete or modify the Postgres service itself
- If Railway's UI looks different from what's described, report before improvising
