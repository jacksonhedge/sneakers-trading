# Stripe MCP setup — Sneakers Terminal pricing

## Context

Sneakers Terminal (https://sneakersterminal.com) is a prediction-markets trading terminal. We have a four-tier subscription model plus a student discount coupon that drives checkout on our web app. The web app already has the wiring — we just need the Stripe-side objects created and their IDs returned so I can paste them into `.env.local`.

**Mode:** create everything in **TEST mode** first (`sk_test_...`). We'll recreate in live mode after the test flow validates end-to-end.

**Currency:** USD.

**Account:** whichever account is logged in — Sneakers' active Stripe account. Confirm before you start.

Read the whole document before executing, then create the objects in the order below.

---

## 1. Products — four subscription tiers

Create four `Product` objects. Each represents a tier. Copy the fields exactly; these strings are referenced in the pricing UI and webhook logs.

### Product A — Pro

| field | value |
|---|---|
| name | `Sneakers Terminal — Pro` |
| description | `Every market, every mode, real-time. Cross-venue arb scanner, O'Toole Insights, unlimited markets.` |
| statement_descriptor | `SNEAKERS PRO` |
| tax_code | Leave default |
| metadata | `{"flavor": "pro", "tier": "pro", "account_type": "individual", "seat_limit": "1"}` |

### Product B — Elite

| field | value |
|---|---|
| name | `Sneakers Terminal — Elite` |
| description | `Pros + REST API + historical export + sub-minute alerts + O'Toole Execution (auto-trading via API).` |
| statement_descriptor | `SNEAKERS ELITE` |
| metadata | `{"flavor": "elite", "tier": "elite", "account_type": "individual", "seat_limit": "1"}` |

### Product C — Business

| field | value |
|---|---|
| name | `Sneakers Terminal — Business` |
| description | `For desks, funds, syndicates. Team seats (10), white-label embed, priority support, custom data feeds on request.` |
| statement_descriptor | `SNEAKERS BIZ` |
| metadata | `{"flavor": "business", "tier": "business", "subtype": "standard", "account_type": "business", "seat_limit": "10"}` |

### Product D — Fraternity

| field | value |
|---|---|
| name | `Sneakers Terminal — Fraternity` |
| description | `Same Business features, sized for college organizations. 30 seats. Self-declared at signup.` |
| statement_descriptor | `SNEAKERS FRAT` |
| metadata | `{"flavor": "fraternity", "tier": "business", "subtype": "fraternity", "account_type": "business", "seat_limit": "30"}` |

---

## 2. Prices — two recurring prices per product

For each product above, create two prices — monthly and yearly. All are `recurring`, `USD`, with the amounts below in dollars (convert to cents: `unit_amount = dollars * 100`).

**Trial days are handled server-side at Checkout Session create, NOT on the price object.** Do NOT set `recurring.trial_period_days` on the price — leave it off.

| product | interval | amount (USD) | unit_amount (cents) | nickname | metadata |
|---|---|---|---|---|---|
| Pro | monthly | $39 | 3900 | `Pro monthly` | `{"flavor": "pro", "interval": "monthly"}` |
| Pro | yearly | $390 | 39000 | `Pro yearly` | `{"flavor": "pro", "interval": "yearly"}` |
| Elite | monthly | $99 | 9900 | `Elite monthly` | `{"flavor": "elite", "interval": "monthly"}` |
| Elite | yearly | $990 | 99000 | `Elite yearly` | `{"flavor": "elite", "interval": "yearly"}` |
| Business | monthly | $299 | 29900 | `Business monthly` | `{"flavor": "business", "interval": "monthly"}` |
| Business | yearly | $2990 | 299000 | `Business yearly` | `{"flavor": "business", "interval": "yearly"}` |
| Fraternity | monthly | $149 | 14900 | `Fraternity monthly` | `{"flavor": "fraternity", "interval": "monthly"}` |
| Fraternity | yearly | $1490 | 149000 | `Fraternity yearly` | `{"flavor": "fraternity", "interval": "yearly"}` |

For every price set `recurring.interval = month` (monthly) or `year` (yearly), `recurring.interval_count = 1`, `billing_scheme = per_unit`.

---

## 3. Coupon — student 75% off

Create one `Coupon`:

| field | value |
|---|---|
| id | `STUDENT75` (set explicitly — we reference this exact ID from server code) |
| name | `Student 75% off` |
| percent_off | `75` |
| duration | `forever` |
| applies_to.products | `[Pro product id, Elite product id]` only — must NOT apply to Business or Fraternity |
| metadata | `{"scope": "student", "eligible_tiers": "pro,elite"}` |

The `applies_to` restriction is critical. Our server code only attaches this coupon when the user is a verified student AND subscribing to Pro or Elite. Restricting at the coupon level is defense-in-depth against the server being wrong.

---

## 4. Webhook endpoint (optional — local dev skips)

Only do this if the Sneakers site is reachable from the public internet (prod or a preview URL). **For local development, skip this section** — the user runs `stripe listen --forward-to localhost:3000/api/stripe/webhook` from their dev machine instead, which returns its own short-lived webhook secret.

If creating for prod:

| field | value |
|---|---|
| url | `https://sneakersterminal.com/api/stripe/webhook` |
| enabled_events | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed` |
| api_version | leave default (latest) |

Capture the `whsec_...` signing secret it emits — that's the `STRIPE_WEBHOOK_SECRET`.

---

## 5. Report back in this exact format

When you're done, return a single code block I can paste directly into `apps/platform/.env.local`. Use the IDs Stripe actually generated — do not invent them.

```dotenv
# ─── Stripe — Sneakers Terminal (TEST mode) ────────────────────────────────

STRIPE_SECRET_KEY=sk_test_<the test secret key from the dashboard>
STRIPE_WEBHOOK_SECRET=whsec_<from `stripe listen` locally, or from the prod endpoint>

# Subscription prices — one env var per (flavor × interval)
NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_<...>
NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY=price_<...>
NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY=price_<...>
NEXT_PUBLIC_STRIPE_PRICE_ELITE_YEARLY=price_<...>
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY=price_<...>
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY=price_<...>
NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_MONTHLY=price_<...>
NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_YEARLY=price_<...>

# Student discount coupon (set restricted to Pro + Elite products)
STRIPE_COUPON_STUDENT75=STUDENT75
```

Plus, separately, a summary of what you created with the Stripe object IDs so I can spot-check in the Stripe dashboard:

| object | id | note |
|---|---|---|
| Product: Pro | `prod_...` | — |
| Price: Pro monthly | `price_...` | $39 / month |
| ... | ... | ... |
| Coupon: STUDENT75 | `STUDENT75` | 75% off, restricted to Pro + Elite |

---

## Things to NOT do

- **Don't create one-time / credit-pack prices.** The web app creates those dynamically with `price_data` inside each Checkout Session — see `src/app/api/credits/checkout/route.ts`. Nothing to pre-create in the Stripe dashboard for credits.
- **Don't create a product / price for "Free" or "Enterprise".** Free needs no Stripe object. Enterprise is a Contact-Sales path, not Checkout.
- **Don't set `trial_period_days` on the price.** We set trial length at Checkout Session create time, per flavor (Pro/Elite/Fraternity = 7 days, Business = 2). Price-level trial would double-apply.
- **Don't enable automatic tax yet.** Our Checkout helper uses `automatic_tax: { enabled: false }` — consistency matters, flip both together in a follow-up.
- **Don't touch live mode.** Test mode only for this pass.

## If you hit an error

If any step fails (e.g. statement_descriptor too long, metadata too large), report back the exact error and which step failed. Don't guess a workaround — we'll tune the spec and re-run.
