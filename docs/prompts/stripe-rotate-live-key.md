# Chrome prompt — rotate Stripe live secret key

Paste to Claude Chrome. The previous `sk_live_` was exposed in chat transcripts + MCP agent memory on another machine. Rotating closes the leak.

---

I need to rotate my Stripe live secret key and propagate the new value to Vercel so the production app picks it up. Please execute in this exact order.

## Phase 1 — Roll the key in Stripe

1. Navigate to https://dashboard.stripe.com/apikeys
2. Ensure you're in **Live mode** (top-right toggle should be NOT showing "Test mode"). Report which mode you're in.
3. Find the row labeled **Secret key** starting with `sk_live_`
4. Click **Roll key** (or the three-dot menu → Roll)
5. Stripe will prompt for an expiration on the old key. Choose **Expire now** (we want the old one dead immediately since it's exposed).
6. Stripe will display the new key exactly once. **Copy it to clipboard** — you'll paste it into Vercel in Phase 2. Do NOT paste it back to me.

Report: confirm the old key is expired and the new key is copied.

## Phase 2 — Update Vercel env var

1. Navigate to https://vercel.com/dashboard
2. Click the `sneakers-terminal` project (or whichever project deploys sneakersterminal.com)
3. Settings → Environment Variables
4. Find `STRIPE_SECRET_KEY` — click the three-dot menu → **Edit**
5. Paste the new key from clipboard
6. Ensure **Production** is checked (Preview + Development don't need live keys; leave test keys there or remove entirely)
7. Save

Report: confirm the env var is updated, masked value now shows new key prefix.

## Phase 3 — Redeploy

1. Vercel Deployments tab
2. Most recent production deployment → three-dot menu → **Redeploy**
3. **Uncheck** "Use existing Build Cache" so the new env var actually propagates (Vercel sometimes caches resolved env during build)
4. Click Redeploy. Watch until status = Ready.

Report: confirm the redeploy completed, paste the deploy URL.

## Phase 4 — Sanity check (post-deploy)

1. Open https://sneakersterminal.com/pricing in a new tab
2. Confirm the page loads without 500 errors (Stripe price IDs are read at build time; if the new key is somehow wrong, this page might blank out)
3. Do NOT click Subscribe — that's a separate end-to-end test for another day

Report: PASS or FAIL on the /pricing page load.

## Boundaries

- Do not change webhook signing secrets (those are separate from the API key, don't need rotation)
- Do not change Price IDs
- Do not touch test-mode keys — only the live key needs rotating
