# Stripe dashboard setup — subscriptions

Step-by-step checklist for the user to run inside the Stripe dashboard before
the subscription Checkout flow will work end-to-end. **Test mode only** until
you explicitly flip live (and re-do most of this against the live dashboard).

Companion docs:
- `docs/OTOOLE_CREDITS_PLAN.md` — separate prepaid credit-pack flow; reuses the
  same Stripe account but its own price IDs and webhook handler.

## 0. Prerequisites

- Stripe account with test mode enabled (default for new accounts).
- Stripe CLI installed locally: `brew install stripe/stripe-cli/stripe`.
- `apps/platform/.env.local` exists.

## 1. Products & prices

In **Stripe → Products → + Add product**, create one product per tier. For each
product, add **two recurring prices**: monthly (USD) and annual (USD).

| Product name        | Monthly | Annual  |
| ------------------- | ------- | ------- |
| Sneakers Pro        | $39     | $390    |
| Sneakers Elite      | $99     | $990    |
| Sneakers Business   | $299    | $2,990  |
| Sneakers Fraternity | $149    | $1,490  |

After saving each price, copy its `price_xxx` ID and paste into `.env.local`:

```bash
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_ELITE_YEARLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_YEARLY=price_...
```

Why `NEXT_PUBLIC_*`: the pricing table renders these IDs into the client-side
"Subscribe" buttons. They're not secret. The Checkout endpoint re-validates
each ID against the canonical map in `lib/subscriptions.ts` — a forged ID
gets rejected.

**Trial lengths are configured in code, not in the Stripe dashboard.** See
`apps/platform/src/lib/subscriptions.ts`. Stripe pulls them from the Checkout
Session payload at create time.

## 2. Student discount coupon

Stripe → **Products → Coupons → + Create coupon**:

- Type: **Percentage discount**
- Percent off: **75**
- Duration: **Forever**
- Apply to specific products: **Sneakers Pro + Sneakers Elite only**
  (do NOT select Business or Fraternity — students don't get those discounts)
- ID: leave the auto-generated value or set to `STUDENT75`

Copy the coupon ID into `.env.local`:

```bash
STRIPE_COUPON_STUDENT75=STUDENT75   # or whatever ID Stripe assigned
```

The coupon is attached server-side at Checkout time when a user has an
approved `student_verification` row. It is NEVER surfaced to the client.
Stripe's built-in promotion-code box (see §4) is the user-facing entry for
any other coupons.

## 3. Customer Portal

Stripe → **Settings → Billing → Customer Portal**:

- Toggle **Activate test link** ON
- Functionality: enable **Cancel subscriptions**, **Update plan**, **Update payment method**
- Cancellation behaviour: **Cancel at end of billing period** (matches our
  cancel-at-period-end policy)
- Subscription updates: allow **all** active products
- Branding: paste Sneakers Terminal logo + colors when convenient (not
  blocking)

No env var needed — the Portal is reached via the Stripe SDK using just the
secret key.

## 4. Webhook endpoints

Two environments. Subscribe each to the same four event types.

**Two webhook endpoints, two signing secrets.** Subscriptions and credit
packs each have their own route + secret so they can be administered
independently. The credits webhook (`/api/credits/webhook`) was wired in a
previous session and uses `STRIPE_WEBHOOK_SIGNING_SECRET`. The new
subscription webhook (`/api/stripe/webhook`) uses
`STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`.

### 4a. Local development (Stripe CLI)

Run two `stripe listen` processes in parallel — each prints its own
`whsec_...` signing secret on first run.

```bash
# terminal 1 — credits
stripe listen --forward-to localhost:3000/api/credits/webhook \
  --events checkout.session.completed,charge.refunded

# terminal 2 — subscriptions
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed
```

Copy each one's printed secret into `.env.local`:

```bash
STRIPE_WEBHOOK_SIGNING_SECRET=whsec_...              # credits (existing)
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...         # subscriptions (new)
```

### 4b. Production (sneakersterminal.com)

Two endpoints in Stripe → **Developers → Webhooks → + Add endpoint**:

| Endpoint URL                                                | Events                                                                                                                                  | Vercel env var                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `https://sneakersterminal.com/api/credits/webhook`          | `checkout.session.completed`, `charge.refunded`                                                                                         | `STRIPE_WEBHOOK_SIGNING_SECRET`      |
| `https://sneakersterminal.com/api/stripe/webhook`           | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`                | `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` |

After saving each endpoint, click **Reveal signing secret** and paste into
Vercel (Project Settings → Environment Variables) under the matching name
above. Local-dev and production signing secrets differ — keep them per
environment.

## 5. API keys

Stripe → **Developers → API keys**:

- **Publishable key** → `.env.local` as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Secret key** → `.env.local` as `STRIPE_SECRET_KEY`

For production, paste the live-mode equivalents into Vercel env vars when
flipping. Until then, test-mode keys go everywhere.

## 6. Verify

Once envs are populated and `stripe listen` is running:

```bash
cd apps/platform
pnpm dev
# in another shell:
stripe trigger checkout.session.completed
```

You should see a `[stripe-webhook] checkout.session.completed` log line in the
Next.js dev server output (the credits webhook will also log it for one-time
payments — the subscription webhook only acts when `mode === 'subscription'`,
and vice versa). If you see a 400 from either webhook route, that endpoint's
signing secret is wrong.

## 7. Going live (later, not now)

When you flip to live mode:

1. Re-do §1, §2, §4b with the live-mode dashboard. Live-mode price IDs differ
   from test-mode IDs — every `NEXT_PUBLIC_STRIPE_PRICE_*` env var on Vercel
   needs to be updated.
2. Re-do §5 with live-mode keys.
3. Update `STRIPE_WEBHOOK_SECRET` on Vercel to the live endpoint's secret.
4. Customer Portal config in §3 carries over from test → live automatically.
