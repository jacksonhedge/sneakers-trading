# Vercel deployment diagnostic

Paste to Claude Chrome. The Sneakers Terminal Vercel project keeps
emailing about failed builds and prod is showing stale code. Open the
Vercel dashboard, find the failures, and report back what's actually
breaking.

---

I need to figure out why my Vercel deploys for `sneakersterminal.com`
keep failing. Production is showing old code from before commits made in
the last few hours. I keep getting "Deployment Failed" emails. Walk
through the Vercel dashboard, find the failures, and report back.

## Setup

1. Open `https://vercel.com/dashboard` in a fresh tab. The user is
   already signed in.
2. Find the project named `sneakersterminal` (or `sneakers-trading` /
   `sneakers-platform` — pick whichever matches).
3. If the user is in multiple teams, the project lives under their
   personal scope or the `sneakers` team — try both if needed.

## Phase 1 — Latest deployment status

1. Click into the project. Default tab should be "Deployments".
2. Look at the top of the list. Note:
   - Latest commit SHA (first ~7 chars)
   - Status: Ready / Building / Error / Canceled
   - Branch (should be `main`)
   - Time deployed

Report:
```
Latest commit: <sha>
Status: <ready/error/building>
Branch: <main?>
Age: <how long ago>
```

## Phase 2 — Find the most recent FAILED build

1. Filter or scroll to find the most recent deployment with status
   "Error" or "Failed". Click into it.
2. Note the commit SHA + commit message (visible in the deployment
   header).
3. Click the "Build Logs" tab.
4. Scroll to the BOTTOM of the logs. Copy the last 30–50 lines.

Report the commit SHA + paste the bottom of the log verbatim, e.g.:
```
Failed commit: abc1234 — "fix: blah blah"

[paste log lines here]
```

Look especially for:
- `Error:` lines
- `Failed to compile`
- `Type error`
- `Missing env variable`
- `Cannot find module`

## Phase 3 — Project settings audit

Click the "Settings" tab (top nav). Walk through these subsections and
report current values:

### General
- **Root Directory**: should be `apps/platform`
- **Framework Preset**: should be `Next.js`
- **Build Command**: note current value
- **Install Command**: note current value
- **Output Directory**: note current value
- **Node.js Version**: should be `22.x`

### Environment Variables
Click "Environment Variables" in the sidebar. List the keys (NOT VALUES)
that are set for **Production** environment. Specifically check whether
each of these is present:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `WAITLIST_FROM_EMAIL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SIGNING_SECRET`
- `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`
- `ADMIN_EMAILS`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY` (and similar PRICE keys)
- `PROVIDER_KEY_ENCRYPTION_KEY`

Mark each ✅ present or ❌ MISSING. **Do not show the values, just
existence.**

🟡 If `AUTH_DEV_RETURN_LINK` is set in Production, that's a CRITICAL
finding — flag it loudly. It must NOT be in production.

### Git
- **Production Branch**: should be `main`
- Note any "Ignored Build Step" — this can silently skip deploys

## Phase 4 — Recent build success rate

Back to "Deployments". Count the last 10 deployments. Report:
- ✅ Ready: <N>
- ❌ Error: <N>
- 🟡 Other: <N>

If 5+ of the last 10 are errors, list the commit messages of each error
so we can see if it's the same failure pattern.

## Phase 5 — Try a manual redeploy

Find the LATEST deployment in the list (regardless of status). Click the
three-dot menu next to it. Select "Redeploy". Confirm. Watch the build
start.

🟡 If "Redeploy" isn't visible, it might be under "More" or labeled
"Re-deploy" — find any way to trigger a fresh build of the latest commit.

After triggering, wait ~90 seconds and refresh. Note whether the new
build:
- Starts (Building status appears)
- Fails immediately (different error than before?)
- Succeeds (status flips to Ready)

If it fails, repeat Phase 2 — paste the new error.

---

## Final report

Format like:

```
**Project**: <name>
**Latest commit on Vercel**: <sha> — <status>
**Latest commit on GitHub main**: <user provides this if needed>
**Match?**: yes / no

**Failed-build error**: <single most-relevant line from the log>

**Settings audit**:
- Root Directory: ✅ apps/platform / ❌ <wrong value>
- Build Command: ✅ default / ❌ <wrong value>
- Node Version: ✅ 22.x / ❌ <wrong>
- Missing env vars: <list, or "none">

**Last 10 builds**: ✅ X · ❌ Y

**Manual redeploy**: ✅ succeeded / ❌ failed with <error>

**Recommended fix**: <one sentence>
```

Keep it under 30 lines total. If anything is unclear, ask the user
rather than guessing.

## Boundaries

- Don't change any settings on your own — just report. The user will
  apply the fix after seeing the diagnosis.
- Don't expose env-var VALUES — only whether each key exists.
- If the project isn't accessible (wrong account / SSO popup), tell
  the user and stop.
