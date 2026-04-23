# Vercel — point production at `main` so sneakersterminal.com serves the latest code

For Claude Chrome. Sneakers Terminal's production domain (sneakersterminal.com) is still serving a stale build that predates the Stripe / student / pricing / settings work. The code is all merged on `main` as of commit `e8557e7`, but Vercel's production routing hasn't been updated. Your job is to make Vercel serve `main` at sneakersterminal.com, then verify.

## Step 1 — open the project

1. Go to **vercel.com**. If you're not logged in as the Sneakers account, log in.
2. Navigate to the project that owns **sneakersterminal.com**. If there are multiple projects, pick the one whose Overview shows `sneakersterminal.com` under "Domains".

## Step 2 — check and fix the Production Branch

1. Go to **Settings → Git** (left sidebar under Settings).
2. Find the **"Production Branch"** field near the top of that page. It should contain a branch name.
3. If it already says **`main`**, skip to Step 3. Tell me what it said.
4. If it says anything else (e.g. `feat/platform-scaffold`, `feat/autotrade-tos`, `feat/stripe-billing-ui`):
   - Clear the field.
   - Type **`main`**.
   - Click **Save** (or whatever the confirm control says).
   - Report back what the previous value was.

## Step 3 — promote `main`'s latest deploy to production

Changing the Production Branch doesn't automatically promote existing preview builds. Do this:

1. Navigate to **Deployments** (left sidebar).
2. Look at the top of the list. You're looking for a deployment whose **Commit** is `e8557e7` (or the current tip of `main` — whichever is newer) and whose **Branch** is `main`.
3. If that deployment exists and is **green ("Ready")**:
   - Click its `⋯` menu on the right → **Promote to Production**.
4. If that deployment does NOT exist, or is still building:
   - Click the **Redeploy** button at the top of the page (or the `⋯` menu on the top `main`-branch deployment → Redeploy).
   - In the modal, **uncheck "Use existing Build Cache"** (old cache restores may carry stale state). Confirm.
   - Wait 2–4 minutes for the build to go green.
5. Once there's a green deployment for commit `e8557e7` on branch `main` with a **Production** badge, you're done with Vercel.

## Step 4 — verify

Open these three URLs in a fresh incognito window. Report the status you see.

| URL | Expected |
|---|---|
| https://sneakersterminal.com/ | Landing page renders. Form now has an **ACCESS CODE** field above the email input. Button label is "SIGN IN" when code is filled, "JOIN WAITLIST" otherwise. |
| https://sneakersterminal.com/pricing | Four-tier pricing table renders (Free / Pro / Elite / Business / Fraternity / Enterprise). Pro card's CTA should be "SIGN UP TO START" — NOT "Pro monthly is not configured". |
| https://sneakersterminal.com/students | "75% off." hero with a waitlist form. Renders cleanly, no 404. |

If any of those 404, or if /pricing still shows "not configured", something's still wrong — report exactly which URL and what you see and we'll debug.

## Step 5 — quick in-DevTools check on /pricing

1. On the `/pricing` page, open DevTools → **Network** tab.
2. Reload the page.
3. Scan the request list. Every row should be 200 or 304. Report any 404, 500, or red rows.

## Report back

Five-line report is enough:

1. Production Branch was: **`<previous value>`** → now: `main` (or "already main")
2. Deployment for `e8557e7`: **Ready / Redeploying / Not found**
3. `/` CTA button label (when code field is empty): **`<label>`**
4. `/pricing` Pro card CTA label: **`<label>`**
5. `/students` status code: **200 / 404 / other**

## Things to NOT do

- Don't touch Environment Variables. The Stripe env vars are already in place from the previous session.
- Don't change the "Install Command" or "Build Command" in Settings → General. Those are already configured for the pnpm monorepo.
- If you see a "Redeploy Production" button that offers to rebuild from a SPECIFIC older deployment, don't use it — we want the latest `main` tip, not an older snapshot.
- Don't cancel any in-progress build unless it's been running for more than 5 minutes AND has no log output.
