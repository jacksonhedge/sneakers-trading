# Vercel — push Stripe LIVE env vars + verify webhook

For Claude Chrome. You're driving two dashboards — Stripe live mode and Vercel — to get the Sneakers Terminal production deploy talking to live Stripe.

## Preflight — verify the webhook endpoint exists in Stripe live mode

Before touching Vercel, confirm the webhook secret we're about to install actually signs events fired at the live site.

1. Open **dashboard.stripe.com** — make sure the top-right toggle says **"Live mode"** (not "Test mode"). If it says Test, click to flip.
2. Go to **Developers → Webhooks**.
3. Look for an endpoint with URL `https://sneakersterminal.com/api/stripe/webhook`.
   - If it exists: click it → click **"Signing secret" → Reveal** and copy the `whsec_...` value. Use this value in step 5 below. **If it differs from the one the human has, the human's secret is stale.**
   - If it does NOT exist: create it now. Click **"Add endpoint"**, URL = `https://sneakersterminal.com/api/stripe/webhook`, select events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.trial_will_end`
     - `invoice.paid`
     - `invoice.payment_failed`
     - Save. Copy the newly-generated `whsec_...`.
4. Report back which path you took and which `whsec_...` value is authoritative. DO NOT paste the secret into your report — just confirm "endpoint existed, using the dashboard's secret" or "created new endpoint, new secret captured."

## Install env vars on Vercel (Production only)

1. Open **vercel.com** — log in if needed.
2. Navigate to the **sneakersterminal** (or whatever the project is called — the one deployed at sneakersterminal.com) project.
3. **Settings → Environment Variables**.
4. Click **"Import .env"** (top-right, next to "Add New").
5. Paste the block below into the import textarea, then — before hitting save — **replace the two `<PLACEHOLDER>` values** with the real secrets the human provided in the chat transcript (`sk_live_51SvS8d...` and the `whsec_...` from the preflight step above). **Do not paste the secrets into this prompt report.** The publishable key, price IDs, and coupon ID can stay verbatim; those aren't secret.

```
STRIPE_SECRET_KEY=<PASTE_SK_LIVE_FROM_TRANSCRIPT>
STRIPE_WEBHOOK_SECRET=<PASTE_WHSEC_FROM_PREFLIGHT>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51SvS8dLoYPHmlnV8Jks7lql4nDbHphYBC7Ef7LuuLs1G4h2BkoEAH8pPRwjdDJstTyyAGMiZtMoAS1r0TkpE0sA300beK02mqy
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_1TPH4yLoYPHmlnV83n9PZiCt
NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY=price_1TPH51LoYPHmlnV8H2UBiq8G
NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY=price_1TPH6PLoYPHmlnV8g9sl9lsY
NEXT_PUBLIC_STRIPE_PRICE_ELITE_YEARLY=price_1TPH6TLoYPHmlnV8L0uULOcu
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY=price_1TPH6VLoYPHmlnV8Iwt2EWuX
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY=price_1TPH6WLoYPHmlnV8UIUttw6I
NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_MONTHLY=price_1TPH6XLoYPHmlnV8ax6yFWMT
NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_YEARLY=price_1TPH6YLoYPHmlnV86QXNEGZY
STRIPE_COUPON_STUDENT75=STUDENT75
```

6. **Environments checkboxes: tick Production ONLY.** Uncheck Preview. Uncheck Development. (Preview should stay on test-mode keys; Development runs locally off `.env.local`.)
7. Click **Save**.

## Redeploy production so the new env loads

New env vars don't apply to already-running deployments. Trigger a rebuild:

1. Go to **Deployments**.
2. Find the latest production deployment (marker: **"Production Current"**).
3. Click the `⋯` menu → **"Redeploy"**.
4. When the modal appears, **uncheck "Use existing Build Cache"** (force a fresh build so env changes are picked up cleanly). Confirm.
5. Wait for the deploy to turn green. Usually 1–3 minutes for Next.js.

## Verify live

1. Open `https://sneakersterminal.com/pricing` in an incognito window.
2. Scroll to the Pro card. The CTA should say **"SIGN UP TO START"** (not "Pro monthly is not configured"). Screenshot.
3. Do the same sanity-check in-browser:
   - Open DevTools → Network tab.
   - Reload the page.
   - Confirm no 500s on any API call.
4. If signed in (or after creating a new account), click the Pro "START 7-DAY TRIAL" button. It should bounce to `checkout.stripe.com/...` showing a $39/mo Pro subscription with 7-day trial.
5. **Do NOT complete checkout with a real card** — just confirm the Stripe page loads at the correct price. Close the tab.

## If any step fails

- **Vercel env-import rejected**: look for a red warning about duplicate vars. If env vars with these names already exist, the UI shows an overwrite warning — click overwrite (the old values were test-mode).
- **Redeploy fails with a build error referencing a Stripe env var**: most likely a typo in one of the pasted values. Go back to Environment Variables, eyeball the price IDs against the list above (they all follow the pattern `price_1TPH...LoYPHmlnV8...`).
- **Live site still says "not configured"**: check the deployment's **"Build Logs"** → **"Runtime Logs"** for any line starting with `[stripe/checkout]` or `[pricing-table]`. Paste whatever you find.

## Report back

A 4-line report is enough:
1. Webhook preflight path (existed / created)
2. All 12 env vars imported (yes / partial with notes)
3. Production redeploy status (green / failed)
4. `/pricing` live-site spot-check (Pro CTA = "SIGN UP TO START" or still "not configured")

## Reminder to the human

The `sk_live_...` secret key has now been in the chat transcript, the MCP agent's memory, and possibly clipboard history on multiple machines. **Rotate it from dashboard.stripe.com after this task succeeds** — Developers → API keys → Roll key → update Vercel env var → redeploy once more. Takes ~90 seconds; closes the exposure window.
