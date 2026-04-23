# Railway — diagnose the failing build

For Claude Chrome. The human is getting build-failure email notifications from Railway for the Sneakers Terminal repo but there's no Railway config in the codebase, so we don't know what service is failing or why. Your job is to grab the diagnostic info so we can decide: fix it, or disconnect Railway entirely.

## Step 1 — open the failing project

1. Go to **railway.app** and log in.
2. Find the project tied to the Sneakers Terminal repo. Its name is probably `sneakers-trading`, `sneakers-terminal`, or similar. If there are multiple Railway projects in the account, the relevant one is the one connected to the GitHub repo `jacksonhedge/sneakers-trading`.
3. Report the exact **project name** and how many services are inside it (the project overview shows service cards — just count them).

## Step 2 — identify the failing service

1. Inside the project, look at the service cards. One (or more) will show a red "Failed" or "Crashed" status on its latest deployment.
2. Click into that service.
3. Report:
   - The **service name** (e.g., "web", "worker", "trader", "postgres", etc.)
   - What **type of service** it is (a web app / worker / cron job / database / addon)
   - The **source root** (Settings → Source → "Root Directory" — might be the repo root, or a subpath like `apps/platform` or `apps/trader`)
   - The **start command** and **build command** if visible (Settings → Deploy)

## Step 3 — grab the build log tail

1. On the failing service, click the **Deployments** tab.
2. Click the most recent failed deployment (red X icon).
3. There will be tabs for **Build Logs** and **Deploy Logs**. Open **Build Logs**.
4. Scroll to the very bottom — the actual error message is always in the last ~40 lines. The lines that matter start with something like `ERROR`, `error TS`, `ERR_PNPM`, `Module not found`, `Cannot resolve`, or `Command failed`.
5. Copy the last ~40 lines verbatim. If the build never started (e.g., it failed at "provision" step), grab whatever's there.

## Step 4 — check environment variables

1. Go to **Settings → Variables** on the failing service.
2. Report how many env vars are set, and whether any of these names appear (don't paste values):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `POSTGRES_URL`
   - `STRIPE_SECRET_KEY`
   - `RESEND_API_KEY`
3. If there's an "Import from .env" or "Shared variables" feature in use, note that.

## Step 5 — check the deploy trigger

1. Settings → Source (or "GitHub" tab).
2. Report:
   - Which repo is linked (should be `jacksonhedge/sneakers-trading`)
   - Which **branch** deploys trigger builds from (likely `main`)
   - Whether **Watch Paths** is set to anything (blank = any file change triggers a build)
   - What the **Root Directory** setting says

## Report format

Paste back a block in this shape:

```
Railway project: <name>
Services: <count>
Failing service: <name> (type: <web/worker/cron/db>)
Source root: <path or "/">
Build command: <command or "(default)">
Start command: <command or "(default)">
Trigger branch: <branch>

Env vars present (names only): <list>

--- last 40 lines of build log ---
<paste>
------------------------------------
```

## If Railway was a mistake / unused

If you open the Railway project and it's empty / unused / looks like a half-finished experiment, report:

```
Railway project appears unused:
  - <N> services
  - most-recent deploy <date/age>
  - no env vars / stub config
```

In that case the fix is probably "delete the project" not "fix the build." The human will make that call after seeing your report.

## Things to NOT do

- **Don't change any settings** in the Railway dashboard. Don't click Redeploy. Don't edit env vars. Read-only for this task.
- **Don't share API keys, DB URLs, or Stripe secrets** in your report. Values stay masked; only report which variable **names** are present.
- Don't log in as a different account if the primary one doesn't have access — just report "I don't see access to a Sneakers project under this login" and stop.
