# Handoff — Stripe subscriptions + tier gating

**Mission:** wire Stripe as the source of truth for the already-existing `plan_tier` column on the `waitlist` table, replace the localStorage tier picker at `/dashboard/billing` with real Stripe Checkout, and add server-side access-control gates ("firewalls") around tier-restricted features on both the Next.js platform app and the iOS app.

**Pre-existing state you must NOT rebuild:**

- `waitlist.plan_tier` column exists with CHECK constraint: `free | pro | elite | business` (migration `005_account_type.sql`). Keep the naming.
- `waitlist.account_type` enforces `individual | business`. Business accounts should only be able to subscribe to the `business` tier; individuals to `pro` or `elite`. Free is the default / unchanged.
- `/dashboard/billing` page exists (localStorage-only tier picker) — you're replacing the picker with Checkout, NOT the whole page.
- Admin page at `/admin` can already write `plan_tier` manually — leave that path alone, Stripe just becomes a parallel write path.
- Supabase magic-link auth is in place. Protected routes are plain HTTP JSON (so iOS consumes the same endpoints).
- Existing migrations numbered sequentially — your migration is `006_stripe_subscriptions.sql`.

**Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + magic-link auth), TypeScript. iOS app consumes HTTP JSON from the same endpoints. Work on a branch named `feat/stripe-subscriptions` off `feat/platform-scaffold`.

---

## Ask the user these BEFORE writing code

Don't guess. Pricing and feature-gating decisions are product decisions. Pause, ask all of these in one batch, then proceed:

1. **Pricing numbers per tier** — monthly + annual for each of `pro`, `elite`, `business`. (SaaS common: annual = ~2 months free, but confirm.)
2. **What each paid tier gates** — draft a feature matrix with what's included at `free` vs `pro` vs `elite` vs `business`. Candidates to assign: markets dashboard read-only, cross-book arb scanner, real-time price alerts, API access for data export, team seats (business only), priority/custom support, white-label embeds.
3. **Trial period** — none / 7-day / 14-day? If trial, does it require a card?
4. **Annual discount display** — show as "$X/mo billed annually" or "$Y/yr (save $Z)"?
5. **Business tier seats** — flat price for the org, or per-seat? (Flat is simpler for v1; per-seat is a metered-billing rebuild later.)
6. **Refund / cancel behavior** — cancel-at-period-end (standard) or immediate with proration? Default to **cancel-at-period-end** unless told otherwise.

Also confirm Stripe access:

7. Does the user have a **Stripe account** already and is it the right legal entity (LLC/Inc that matches the product)? If not, they need to create one before you can create products.
8. Are we using **test mode keys** for this implementation? (Yes — always, until explicit go-ahead to switch to live.)

---

## Deliverables, in order

### Phase 1 — Stripe dashboard setup (user does this, you document)

Write `docs/stripe-setup.md` with step-by-step instructions for the user to do in the Stripe dashboard:
- Create Products: "Sneakers Pro", "Sneakers Elite", "Sneakers Business"
- Create Prices for each (monthly + annual recurring, USD, agreed-upon amounts)
- Copy each price's `price_xxx` ID into `apps/platform/.env.local` as `NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` / same for Elite / Business
- Enable **Customer Portal** (Stripe Dashboard → Settings → Billing → Customer Portal) — configure which changes users can self-serve (cancel, switch plans, update card). Default: allow all.
- Create a **webhook endpoint** pointing to `https://sneakersterminal.com/api/stripe/webhook` (for prod) and `http://localhost:3000/api/stripe/webhook` (for local dev via `stripe listen` CLI). Subscribe to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- Copy publishable + secret keys into `.env.local`: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.

### Phase 2 — Migration `006_stripe_subscriptions.sql`

Extend `waitlist` (do NOT create a new table — one subscription per user is the v1 model):

```sql
alter table public.waitlist
  add column if not exists stripe_customer_id           text unique,
  add column if not exists stripe_subscription_id       text unique,
  add column if not exists subscription_status          text
    check (subscription_status in ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused')),
  add column if not exists subscription_current_period_end  timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean default false,
  add column if not exists subscription_price_id        text;

create index if not exists waitlist_stripe_customer_id_idx on public.waitlist (stripe_customer_id);
create index if not exists waitlist_stripe_subscription_id_idx on public.waitlist (stripe_subscription_id);
create index if not exists waitlist_subscription_status_idx on public.waitlist (subscription_status);
```

Comment every column. Keep `plan_tier` as the denormalized "what tier are they on right now" field — update it from the webhook handler based on `subscription_price_id` → tier mapping.

### Phase 3 — Server-side plumbing

Create these files (paths relative to `apps/platform/`):

- `src/lib/stripe/server.ts` — server Stripe SDK client, initialized with `STRIPE_SECRET_KEY`. Export `stripe` instance.
- `src/lib/stripe/tiers.ts` — **the canonical tier config**. Static mapping: `priceId → { tier, interval, accountType }`. This is what the webhook uses to translate Stripe events into `plan_tier` values. Put pricing display strings here too so the pricing page renders from a single source.
- `src/lib/stripe/checkout.ts` — helper to create a Checkout Session server-side given `{ priceId, userId, userEmail }`. Include `allow_promotion_codes: true`, `subscription_data.trial_period_days` if the user opted for a trial, `success_url` back to `/dashboard/billing?success=true`, `cancel_url` to `/dashboard/billing?canceled=true`. Store `userId` in `client_reference_id` so the webhook can tie back.
- `src/lib/stripe/portal.ts` — helper to create a Customer Portal session for managing subscription. Return the portal URL.
- `src/app/api/stripe/checkout/route.ts` — POST endpoint: auth-gated, takes `{ priceId }`, returns `{ url }` (Checkout redirect).
- `src/app/api/stripe/portal/route.ts` — POST endpoint: auth-gated, returns `{ url }` (Portal redirect).
- `src/app/api/stripe/webhook/route.ts` — POST endpoint: **verifies Stripe signature** using `STRIPE_WEBHOOK_SECRET`, handles the 4 event types. This is the only write path for `plan_tier` outside of admin. On failure to verify, return 400.

### Phase 4 — Access-control utility ("the firewall")

Create `src/lib/auth/require-tier.ts`:

```ts
// Server-side tier check. Use in every API route that needs gating.
// Returns the user record if the tier is >= required; else throws with 402.
export async function requireTier(
  minTier: 'free' | 'pro' | 'elite' | 'business',
  supabase: SupabaseClient,
): Promise<{ userId: string; tier: TierName; accountType: 'individual' | 'business' }>
```

Implementation notes:
- Check `auth.uid()` → join to `waitlist` → read `plan_tier` and `subscription_status`.
- Consider `subscription_status in ('active','trialing')` as "currently paying" — anything else downgrades effectively to `free` regardless of what `plan_tier` says.
- Tier ordering for the comparison: `free < pro < elite < business`.
- Also enforce: `account_type = 'business'` is required to hold the `business` tier. An individual account on `business` is a data inconsistency — log it and return as `free`.

Matching client-side helper `src/lib/auth/use-tier.ts`:

```ts
export function useTier(): { tier: TierName; status: string; isActive: boolean; isLoading: boolean }
```

Fetches from a new `GET /api/me/tier` endpoint. Used for UI gates (show lock icon / upgrade modal on premium features). **UI gates are convenience only — server-side `requireTier` must be called on every protected endpoint regardless.**

### Phase 5 — Pricing / billing UI

Replace the localStorage picker at `/dashboard/billing`:

- Pricing table component: reads from `lib/stripe/tiers.ts`, renders 4 columns (Free, Pro, Elite, Business) with feature checkmarks. Highlight current tier.
- Each paid tier has a "Subscribe" button → POSTs to `/api/stripe/checkout` → redirects to Stripe-hosted Checkout.
- If user has an active subscription: swap Subscribe for "Manage subscription" → POSTs to `/api/stripe/portal` → redirects to Stripe-hosted Customer Portal.
- Success/canceled query params show a flash message at the top of the page.
- Business accounts only see Business-tier CTA. Individuals only see Pro/Elite CTAs. (Gate client-side AND server-side — the Checkout endpoint rejects price/account-type mismatches.)

Also add a public `/pricing` page that renders the same pricing table for not-yet-signed-up users. Bottom CTA is "Sign up to subscribe" → existing `/` waitlist flow.

### Phase 6 — Apply the firewall to existing protected surfaces

Audit protected endpoints and pages, add `requireTier` calls:

- `/api/markets/opportunities` — gate behind `pro`.
- `/dashboard/markets` — gate behind `pro` (show upgrade modal if `free`).
- Any future arb scanner / alerts endpoint — gate at the appropriate tier.
- Admin routes — already gated by email allowlist; leave alone.

Update `middleware.ts` if there's a useful pattern for gating full route trees, but don't over-engineer — per-route `requireTier` calls are fine for v1.

### Phase 7 — iOS integration notes

The iOS app (`apps/ios/`) consumes the same HTTP JSON endpoints. You don't need to write Swift, but:

- Confirm `GET /api/me/tier` returns a stable JSON shape the iOS app can parse.
- Document in `apps/ios/README.md` the tier-check pattern the iOS app should follow. Note that iOS **cannot** run Stripe Checkout directly (Apple requires in-app purchases for digital subscriptions sold in iOS apps — that's a separate rebuild later, NOT v1). For v1, iOS users subscribe via the web and the iOS app just reads their tier status.

---

## Access-control design principle

**Server-side enforcement is the only real firewall.** UI gates are for UX; they must never be the only check. Every protected API route calls `requireTier`. Every protected page reads the tier server-side (in a React Server Component or middleware) and redirects if insufficient — don't gate with client-side `useTier` alone.

Supabase RLS is a **defense-in-depth** layer, not the primary check. Consider adding RLS policies on tier-gated tables (e.g., `only users where plan_tier in ('pro','elite','business') can select from alerts_subscriptions`), but the primary enforcement is still in the API layer because most protected reads are business logic, not table reads.

---

## Safety rails

- **Stripe test mode only** until the user explicitly says to flip to live mode. All Checkout Sessions, webhooks, and the Customer Portal run against test keys.
- **Webhook signature verification is mandatory.** Reject any webhook POST that fails `stripe.webhooks.constructEvent` with 400.
- **Don't trust client-provided `priceId`.** Validate against the canonical map in `lib/stripe/tiers.ts` before creating the Checkout Session.
- **Don't process real payments in development.** The Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) is the standard local-dev pattern.
- **No refund UI, no chargeback handling, no invoice PDFs, no email receipt customization, no tax/VAT integration, no Stripe Tax.** Those are out of scope for v1. Customer Portal handles cancel/update-card; Stripe sends default receipt emails; that's sufficient.

---

## Don't-do list

- Don't rename or drop the existing `plan_tier` column.
- Don't create a separate `subscriptions` table — one-sub-per-user on the existing `waitlist` table is the v1 model.
- Don't implement per-seat Business tier billing (it's a metered-billing overhaul — defer).
- Don't implement coupons / promo codes beyond Stripe's built-in `allow_promotion_codes: true`.
- Don't add Stripe Elements / Custom Checkout — use hosted Checkout. It's PCI-compliant out of the box and we'd get zero value from custom UX at this stage.
- Don't handle `invoice.payment_failed` with a complex dunning flow — just set `subscription_status = 'past_due'` in the DB and let Stripe's default retry logic + email the user. Custom dunning can come later.
- Don't try to support in-app purchase from iOS in v1 (Apple will reject it anyway). Web-only subscription purchase, iOS reads status.

---

## Testing

Before calling it done:

1. **End-to-end checkout in Stripe test mode** using card `4242 4242 4242 4242`:
   - Sign up as an individual → subscribe to Pro monthly → confirm webhook fires → confirm `plan_tier = 'pro'` and `subscription_status = 'active'` in DB → confirm `/dashboard/markets` no longer shows upgrade gate.
   - Cancel via Customer Portal → confirm webhook updates `subscription_cancel_at_period_end = true` → confirm access remains until `current_period_end`.
   - Let the period end (use Stripe CLI: `stripe trigger customer.subscription.deleted`) → confirm `plan_tier` flips back to `free`.
2. **Business account check:** create business account → attempt to subscribe to Pro → should be rejected at the API layer with a clear error.
3. **Webhook signature verification:** POST an invalid-signature webhook → confirm 400 response, no DB write.
4. **Server-side gate bypass attempt:** directly call `GET /api/markets/opportunities` with a `free`-tier auth token → confirm 402 response.
5. **UI gate regression:** verify that `useTier` returning `free` still results in the pricing modal, and that bypassing the modal (devtools) still gets rejected server-side.

Document all five test runs in the PR description with pass/fail + screenshots.

---

## Definition of done

- [ ] `006_stripe_subscriptions.sql` migration applied to Supabase (both local and production-ready to deploy)
- [ ] `lib/stripe/tiers.ts` is the single source of truth for price IDs and tier mapping
- [ ] 3 API routes: `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/webhook` (signature-verified)
- [ ] `requireTier` helper exists and is called on every protected endpoint
- [ ] `/dashboard/billing` shows real Checkout flow, `/pricing` renders the same table publicly
- [ ] Existing localStorage tier picker is removed, not merely hidden
- [ ] `docs/stripe-setup.md` is a runnable checklist the user can follow in the Stripe dashboard
- [ ] All 5 test scenarios pass
- [ ] PR opened against `feat/platform-scaffold` with test-run notes + screenshots

Estimated effort: **8–14 hours** depending on pricing-decision cycle time with the user and how many protected surfaces need firewall retrofits.
