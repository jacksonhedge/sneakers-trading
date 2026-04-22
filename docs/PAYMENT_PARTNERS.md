# Payment Partners — Plan (not yet implemented)

Decision doc for how Sneakers collects money from users (subscriptions) and pays money out (affiliate/referral payouts). **Nothing in this doc is wired up yet.** When it's time to build, this is the starting point.

## Revenue streams

Sneakers makes money through:

1. **Affiliate click-through revenue** — user clicks a "Trade on Kalshi" button → we get a CPA or rev-share from the venue. This is **inbound revenue, no user payment needed**. Tracked via each venue's affiliate dashboard (Impact, Rakuten, direct partner portals). Not a payment-partner integration problem; it's an analytics + attribution problem.

2. **Subscription tiers (planned):**
   - **Free** — limited markets, delayed data, no API access. Drives signups + affiliate volume.
   - **Pro** ($25–50/mo) — full live market data, custom alerts, arb scanner, speed scan.
   - **Trader** ($150–250/mo) — historical data access, exportable CSV/parquet, API access.
   - **Enterprise** (custom) — raw data license for quants/funds. Negotiated per-buyer, typically $5k–50k/year.

3. **Data licensing (longer-term)** — once we have 3+ months of historical data in Timescale, expose `/api/historical` endpoints behind paid API keys. Customers: sharps, quant funds, academic researchers, other aggregators. Pricing: usage-based ($0.01/1000 rows queried, or monthly caps at the Trader/Enterprise tier).

4. **Referral payouts (outbound)** — we reward users who refer other users (per `docs/REFERRAL_PLAN.md`). Usually credits/waitlist boosts, not cash, but cash payouts may be desired for the Pro-tier referral program.

## Payment partners — options ranked

### 1. Stripe (primary recommendation)

**Why:** the default for SaaS subscriptions. Next.js has excellent Stripe integration patterns. Webhooks are reliable. Billing portal covers upgrades / cancellations / refunds / failed-card retries out of the box.

**Products to use:**
- **Stripe Billing** for subscription management (monthly Pro/Trader/Enterprise)
- **Stripe Customer Portal** for user-managed plan changes
- **Stripe Connect** if/when we pay referrers cash (Express accounts, ACH transfers)

**Integration effort:** ~2 days for subscription flow (product catalog in Stripe, checkout session route in Next.js, webhook handler to sync subscription state into Supabase, middleware to gate Pro routes). Proven pattern; Stripe's docs are excellent.

**Cost:** 2.9% + $0.30 per charge. On a $50/mo Pro sub, that's ~$1.75/transaction — ~3.5% blended.

### 2. Coinbase Commerce (optional secondary — crypto payments)

**Why:** Sneakers' audience is crypto-native (OG / Polymarket / ProphetX traders skew toward people holding USDC, ETH, BTC). Offering crypto-native payment lets them pay without moving to fiat. Also signals brand alignment.

**Integration effort:** ~half-day on top of Stripe. Accept USDC/ETH/BTC, Coinbase Commerce handles conversion and webhooks.

**Cost:** 1% flat — cheaper than Stripe. But crypto adoption rates for subscriptions are low (<5% of users typically pick crypto when fiat is available). Optional, not blocking.

### 3. Paddle (alternative to Stripe — merchant of record)

**Why:** Paddle is a Merchant of Record — they handle sales tax / VAT / international tax remittance for you. If you anticipate heavy international traffic, this offloads a real compliance burden.

**Downsides:** 5% + $0.50 per transaction (more expensive than Stripe). Less flexible for Stripe-specific features we might want later (Connect for payouts, complex billing portals).

**Decision:** skip unless international revenue becomes a real focus. Stripe is simpler.

### 4. For affiliate attribution (not a payment system)

This is different from payment processing. Affiliate tracking needs:
- **Click attribution** — cookie or URL parameter when user clicks through to a venue
- **Conversion tracking** — when the venue reports back that the user signed up / deposited (via their affiliate dashboard)
- **Aggregation** — consolidating earnings across Impact, Rakuten, direct partners

Tools: Impact.com's own dashboard, or a simple spreadsheet at first (manual monthly reconciliation across 3–5 affiliate programs). Don't over-build this before we have actual affiliate revenue flowing.

## Suggested path

**Phase 1 — nothing yet (current state):** Sneakers is free + pre-launch. No payments anywhere. Focus on building product + getting testers.

**Phase 2 — launch paid tiers (post 100-testers validation, ~2 months out):**
- Stripe Billing for Pro tier
- Supabase `subscriptions` table synced from Stripe webhooks
- `requireProSubscription` middleware on gated routes
- Customer Portal link in dashboard

**Phase 3 — crypto payment (optional, maybe month 3):**
- Coinbase Commerce as a checkout alternative
- Same webhook → `subscriptions` table sync

**Phase 4 — data licensing (month 4+):**
- Separate Stripe product for API metered billing
- API key issuance flow in admin dashboard
- Usage-based billing via Stripe's meter / usage records API

**Phase 5 — referral payouts (when user base justifies, maybe month 6):**
- Stripe Connect Express accounts for referrers
- Monthly batch payouts once balance exceeds threshold (e.g., $50)

## Concrete next step (when ready)

- Create Stripe account under the `jacksonhedge` GitHub org's business entity
- Define the two initial SKUs in Stripe (`Pro Monthly`, `Trader Monthly`)
- Build `/api/stripe/checkout`, `/api/stripe/webhook`, `/api/stripe/portal` routes on the platform app
- Add `subscriptions` table to Supabase (migration 005)
- Gate `/markets` or specific endpoints behind `requireProSubscription()`

Estimated effort: **one focused 2-day session** for Phase 2. Don't start until 100 testers is validated and tiers are actually differentiated.

## Open questions

1. **Pro tier pricing** — $25? $50? What's the delta to make it worth paying?
2. **Free-tier rate limits** — how much do we give away before users hit a paywall?
3. **Referral payouts** — cash via Connect, or stick with credits/tiers (no cash)? Cash introduces KYC complexity.
4. **Annual discount** — 2 months free (17% discount) or 15% off — need to test conversion impact.
5. **Enterprise pricing** — hand-negotiated, but what's the entry price? Probably $5k/year for a small fund; $50k+ for large.
