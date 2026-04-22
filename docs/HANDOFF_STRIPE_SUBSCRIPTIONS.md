# Handoff — Stripe subscriptions + tier gating

**Mission:** wire Stripe as the source of truth for the already-existing `plan_tier` column on the `waitlist` table, replace the localStorage tier picker at `/dashboard/billing` with real Stripe Checkout, and add server-side access-control gates ("firewalls") around tier-restricted features on both the Next.js platform app and the iOS app.

**Pre-existing state you must NOT rebuild:**

- `waitlist.plan_tier` column exists with CHECK constraint: `free | pro | elite | business` (migration `005_account_type.sql`). **Keep the naming even though we're introducing a Fraternity variant — Fraternity is a sub-flavor of `business`, not a new top-level tier.**
- `waitlist.account_type` enforces `individual | business`. Business accounts subscribe to `business` (with Fraternity sub-flavor); individuals subscribe to `pro` or `elite`. Free is default.
- `/dashboard/billing` page exists (localStorage-only tier picker) — you're replacing the picker with Checkout, NOT the whole page.
- Admin page at `/admin` can already write `plan_tier` manually — leave that path alone, Stripe just becomes a parallel write path.
- Supabase magic-link auth is in place. Protected routes are plain HTTP JSON (so iOS consumes the same endpoints).
- Existing migrations numbered sequentially — your migrations are `006_stripe_subscriptions.sql` and `007_student_verification.sql`.

**Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + magic-link auth), TypeScript. iOS app consumes HTTP JSON from the same endpoints. Work on a branch named `feat/stripe-subscriptions` off `feat/platform-scaffold`.

---

## Decisions locked in by the user (2026-04-22)

All pre-code product decisions are answered. Do NOT re-ask these — execute against them:

### Pricing (USD)

| Tier | Account type | Monthly | Annual | Trial | Notes |
|---|---|---|---|---|---|
| **Free** | individual | $0 | — | n/a | Lead-gen: 15-min delayed prices, 3 alerts/day, top-100 markets only |
| **Pro** | individual | $39 | $390 (save $78) | **7 days, card required** | Full real-time, unlimited alerts, cross-venue arb scanner, affiliate routing |
| **Elite** | individual | $99 | $990 (save $198) | **7 days, card required** | Pro + API access + historical export + sub-minute alerts + backtest |
| **Business** | business | $299 | $2,990 (save $598) | **2 days, card required** | Elite + 10 seats + white-label embed + priority support |
| **Fraternity** | business (`subtype = 'fraternity'`) | $149 | $1,490 (save $298) | **7 days, card required** | 30 seats, same features as Business |
| **Enterprise** | business | Contact sales | Contact sales | n/a | **NOT self-serve**. $20K onboarding + $1.5–3K/mo recurring. Invoiced separately, tracked in `enterprise_inquiries` table. Pricing page shows "Contact Sales" CTA → form submission, no Stripe Checkout. |

### Feature matrix (gate these server-side via `requireTier`)

| Feature | Free | Pro | Elite | Business | Fraternity |
|---|---|---|---|---|---|
| Markets dashboard (read) | ✓ (delayed 15min, top 100) | ✓ real-time, all | ✓ real-time, all | ✓ real-time, all | ✓ real-time, all |
| Cross-venue arb scanner | — | ✓ | ✓ | ✓ | ✓ |
| Price alerts | 3/day | unlimited | unlimited, sub-minute | unlimited, sub-minute | unlimited, sub-minute |
| Affiliate link routing | — | ✓ | ✓ | ✓ | ✓ |
| Historical data export (CSV) | — | — | ✓ | ✓ | ✓ |
| REST API access | — | — | ✓ | ✓ | ✓ |
| Backtest tool | — | — | ✓ | ✓ | ✓ |
| **O'Toole AI queries/day** | 0 | 5 | 50 | 200/seat | 50/seat |
| **O'Toole weather + news enrichment** | — | — | ✓ | ✓ | ✓ |
| **O'Toole injury + depth-chart context** | — | — | ✓ | ✓ | — |
| **O'Toole trade-suggestion mode** | — | — | — | ✓ | — |
| **O'Toole custom API plug-ins (BYO keys)** | — | — | — | ✓ | — |
| Team seats | 1 | 1 | 1 | 10 | 30 |
| White-label embed | — | — | — | ✓ | ✓ |
| Priority support | — | — | — | ✓ | ✓ |

### Other locked-in settings

- **Cancel behavior:** cancel-at-period-end (access retained until current billing period ends).
- **Annual discount display:** `$X/yr (save $Y)` format. Also show `$X/yr ≈ $Y/mo` helper text next to the annual toggle.
- **Promotion codes:** `allow_promotion_codes: true` on Checkout so Stripe's built-in coupon box appears.
- **Stripe mode:** TEST MODE ONLY until user explicitly says to flip live. All keys, products, webhooks must be test-mode.
- **Business seats:** flat (10 for Business, 30 for Fraternity). Per-seat metered billing is deferred; not v1.

### Student discount — 75% off Pro/Elite (separate flow, Phase 8)

Requires **all three**: (1) `.edu` email from an allowlisted US university, (2) Instagram handle, (3) LinkedIn URL.

Implementation details in Phase 8 below. Student discount does NOT apply to Business or Fraternity tiers.

---

## Deliverables, in order

### Phase 1 — Stripe dashboard setup (user does this, you document)

Write `docs/stripe-setup.md` with step-by-step instructions for the user to do in the Stripe dashboard:
- Create Products: "Sneakers Pro", "Sneakers Elite", "Sneakers Business", "Sneakers Fraternity"
- Create Prices for each (monthly + annual recurring, USD):
  - Pro: $39/mo, $390/yr
  - Elite: $99/mo, $990/yr
  - Business: $299/mo, $2,990/yr
  - Fraternity: $149/mo, $1,490/yr
- Copy each price's `price_xxx` ID into `apps/platform/.env.local`:
  - `NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY`
  - `NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY` / `_YEARLY`
  - `NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY` / `_YEARLY`
  - `NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_MONTHLY` / `_YEARLY`
- **Create a Stripe Coupon** named `STUDENT75` — 75% off, "forever" duration, **restricted to Pro + Elite price IDs only** (use the Stripe dashboard's product restriction). Copy the coupon ID into `.env.local` as `STRIPE_COUPON_STUDENT75`.
- Enable **Customer Portal** (Stripe Dashboard → Settings → Billing → Customer Portal) — allow cancel, switch plans, update card. Default: allow all.
- Create a **webhook endpoint** pointing to `https://sneakersterminal.com/api/stripe/webhook` (for prod) and `http://localhost:3000/api/stripe/webhook` (for local dev via `stripe listen` CLI). Subscribe to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- Copy publishable + secret keys into `.env.local`: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.

### Phase 2 — Migration `006_stripe_subscriptions.sql`

Extend `waitlist` (do NOT create a new table — one subscription per user is the v1 model). Also add a `business_subtype` column so we can distinguish Fraternity from standard Business, and create the `enterprise_inquiries` table for the Contact-Sales flow:

```sql
alter table public.waitlist
  add column if not exists stripe_customer_id           text unique,
  add column if not exists stripe_subscription_id       text unique,
  add column if not exists subscription_status          text
    check (subscription_status in ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused')),
  add column if not exists subscription_current_period_end  timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean default false,
  add column if not exists subscription_price_id        text,
  add column if not exists business_subtype             text
    check (business_subtype in ('standard','fraternity'))
    default null;

create index if not exists waitlist_stripe_customer_id_idx on public.waitlist (stripe_customer_id);
create index if not exists waitlist_stripe_subscription_id_idx on public.waitlist (stripe_subscription_id);
create index if not exists waitlist_subscription_status_idx on public.waitlist (subscription_status);
create index if not exists waitlist_business_subtype_idx on public.waitlist (business_subtype);

-- Enterprise inquiries: NOT a Stripe flow. Sales captures these, quotes manually.
create table if not exists public.enterprise_inquiries (
  id                bigserial primary key,
  created_at        timestamptz default now(),
  waitlist_user_id  bigint references public.waitlist(id) on delete set null,
  contact_name      text not null,
  contact_email     text not null,
  company_name      text,
  phone             text,
  use_case          text,   -- freeform from the form
  volume_estimate   text,   -- e.g., "100 markets/sec" or "team of 5"
  referral_source   text,
  status            text check (status in ('new','contacted','qualified','negotiating','won','lost'))
                          default 'new',
  notes             text,
  assigned_to       text,   -- admin email
  quoted_amount_usd numeric(12,2),
  closed_at         timestamptz
);
create index if not exists enterprise_inquiries_status_idx on public.enterprise_inquiries (status);
create index if not exists enterprise_inquiries_created_at_idx on public.enterprise_inquiries (created_at desc);
```

Comment every column. Keep `plan_tier` as the denormalized "what tier are they on right now" field — update it from the webhook handler based on `subscription_price_id` → tier mapping. `business_subtype` is set at subscription creation (Fraternity Checkout sets it to `'fraternity'`; standard Business sets it to `'standard'`).

### Phase 3 — Server-side plumbing

Create these files (paths relative to `apps/platform/`):

- `src/lib/stripe/server.ts` — server Stripe SDK client, initialized with `STRIPE_SECRET_KEY`. Export `stripe` instance.
- `src/lib/stripe/tiers.ts` — **the canonical tier config**. Static mapping: `priceId → { tier, interval, accountType }`. This is what the webhook uses to translate Stripe events into `plan_tier` values. Put pricing display strings here too so the pricing page renders from a single source.
- `src/lib/stripe/checkout.ts` — helper to create a Checkout Session server-side given `{ priceId, userId, userEmail }`. Include `allow_promotion_codes: true`, `success_url` back to `/dashboard/billing?success=true`, `cancel_url` to `/dashboard/billing?canceled=true`. Store `userId` in `client_reference_id` so the webhook can tie back. **Trial length is per-tier, driven by `lib/stripe/tiers.ts`:**
  - Pro / Elite / Fraternity: `trial_period_days: 7`
  - Business (standard): `trial_period_days: 2`
  - All trials require a card (default Stripe behavior, no special flag needed).
  - Pass the trial value from the tier config, not hard-coded in the helper.
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
- Check `auth.uid()` → join to `waitlist` → read `plan_tier`, `subscription_status`, `business_subtype`.
- Consider `subscription_status in ('active','trialing')` as "currently paying" — anything else downgrades effectively to `free` regardless of what `plan_tier` says.
- Tier ordering for the comparison: `free < pro < elite < business`.
- **Fraternity is NOT a separate tier for the purposes of `requireTier`** — it's a pricing flavor of `business`. Access control treats Fraternity = Business. (Seat limits differ: 30 vs 10 — enforce that separately in the seat-management path, not in `requireTier`.)
- Enforce: `account_type = 'business'` is required to hold the `business` tier. An individual account on `business` is a data inconsistency — log it and return as `free`.
- Enforce: `business_subtype` is only meaningful when `plan_tier = 'business'`. If it's set while tier is not business, ignore it and log the inconsistency.

Matching client-side helper `src/lib/auth/use-tier.ts`:

```ts
export function useTier(): { tier: TierName; status: string; isActive: boolean; isLoading: boolean }
```

Fetches from a new `GET /api/me/tier` endpoint. Used for UI gates (show lock icon / upgrade modal on premium features). **UI gates are convenience only — server-side `requireTier` must be called on every protected endpoint regardless.**

### Phase 5 — Pricing / billing UI

Replace the localStorage picker at `/dashboard/billing`:

- **Pricing table component** — reads from `lib/stripe/tiers.ts`, renders columns for Free / Pro / Elite / Business / Fraternity / Enterprise. Highlight current tier. Monthly ↔ Annual toggle at the top (show the savings amount next to the annual option).
- **CTA differs by column:**
  - Free: "Current plan" if on free, else "Downgrade" (which really means "cancel via Portal").
  - Pro / Elite / Business / Fraternity: "Start 7-day trial" (or "Start 2-day trial" for Business) → POSTs to `/api/stripe/checkout` → Stripe-hosted Checkout.
  - Enterprise: "Contact Sales" → inline form (captures the fields in `enterprise_inquiries` schema) → POSTs to `/api/enterprise/inquiry` → flash "We'll be in touch within 1 business day". **No Stripe Checkout for this column.**
- **If user has an active subscription:** swap Subscribe for "Manage subscription" → POSTs to `/api/stripe/portal` → Customer Portal.
- Success/canceled query params show a flash message at the top of the page.
- **Account-type gates** (client-side AND server-side):
  - Individuals: see Pro / Elite / Enterprise only. Business + Fraternity columns either hidden or disabled with "For business accounts — switch account type in settings" tooltip.
  - Business accounts: see Business / Fraternity / Enterprise only. Fraternity column includes a note: "For college fraternities — select this if your org qualifies". **No hard gate on Fraternity selection** (we can't verify "is a fraternity" automatically); admin flags misuse and refunds manually if abused.
  - The Checkout endpoint validates the `priceId` vs `account_type` and rejects mismatches regardless of client-side gating.
- Student discount surface: if the user has `student_verification.status = 'approved'`, show a green "75% student discount applied at checkout" badge on Pro + Elite columns. The Checkout endpoint applies the coupon server-side (`discounts: [{ coupon: STRIPE_COUPON_STUDENT75 }]`) when the user has approved verification and is subscribing to Pro/Elite.

Also add a **public `/pricing` page** that renders the same table for not-yet-signed-up users. CTA is "Sign up to subscribe" → existing `/` waitlist flow. Enterprise column's Contact Sales form works on the public page too (captures without a user account; sets `waitlist_user_id = null`).

### Phase 6 — Apply the firewall to existing protected surfaces

Audit protected endpoints and pages, add `requireTier` calls:

- `/api/markets/opportunities` — gate behind `pro`.
- `/dashboard/markets` — gate behind `pro` (show upgrade modal if `free`).
- Any future arb scanner / alerts endpoint — gate at the appropriate tier.
- Admin routes — already gated by email allowlist; leave alone.

Update `middleware.ts` if there's a useful pattern for gating full route trees, but don't over-engineer — per-route `requireTier` calls are fine for v1.

### Phase 7 — iOS integration notes

The iOS app (`apps/ios/`) consumes the same HTTP JSON endpoints. You don't need to write Swift, but:

- Confirm `GET /api/me/tier` returns a stable JSON shape the iOS app can parse. Include `business_subtype` in the response so the iOS app can render "Fraternity" branding if relevant.
- Document in `apps/ios/README.md` the tier-check pattern the iOS app should follow. Note that iOS **cannot** run Stripe Checkout directly (Apple requires in-app purchases for digital subscriptions sold in iOS apps — that's a separate rebuild later, NOT v1). For v1, iOS users subscribe via the web and the iOS app just reads their tier status.

### Phase 8 — O'Toole AI quota + enrichment gating + cost telemetry

**Context:** O'Toole is an Anthropic-backed AI chat already wired up on the platform (commit `dcac661`), currently unmetered. This phase adds per-tier quota enforcement, enrichment gating, and cost telemetry — the "viable business" layer so heavy users don't burn the Anthropic budget.

**Model A pricing decision (locked in 2026-04-22):** O'Toole is bundled into each paid tier with query caps + increasing enrichment depth. NOT a separate add-on. See feature matrix above for caps per tier.

**Unit-economics note:** Per-query marginal cost is ~$0.04–0.05 (Anthropic tokens + lightweight enrichments). Elite at 50/day uncapped is ~$60/user/mo worst-case — the cap is the margin-protection lever. If caps prove too generous after real usage data, tighten them without touching subscription prices.

#### 8a. Migration `008_o_toole_usage.sql`

```sql
create table if not exists public.o_toole_usage (
  user_id          bigint not null references public.waitlist(id) on delete cascade,
  query_date       date not null default current_date,
  query_count      int not null default 0,
  total_tokens_in  bigint not null default 0,
  total_tokens_out bigint not null default 0,
  enrichment_calls int not null default 0,   -- how many external API hits
  cost_cents       int not null default 0,   -- running sum: Anthropic + enrichments, in cents
  primary key (user_id, query_date)
);

create index if not exists o_toole_usage_query_date_idx on public.o_toole_usage (query_date desc);
create index if not exists o_toole_usage_user_date_idx on public.o_toole_usage (user_id, query_date desc);

comment on table public.o_toole_usage is
  'Per-user daily rollup of O''Toole AI usage. One row per user per day; upserted on each query. Drives quota enforcement + admin cost dashboard.';
```

No reset job needed — the `query_date` key means "today" auto-resets at midnight UTC. Keep rows around for analytics (don't auto-prune).

#### 8b. Quota helper — `src/lib/otoole/require-quota.ts`

```ts
// Checks quota, atomically increments on success, returns remaining.
// Throws 429 with upsell copy if over cap.
export async function requireOTooleQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ queriesRemaining: number; enrichmentsAllowed: EnrichmentSet; tradeSuggestEnabled: boolean }>
```

Implementation:
- Look up user's tier via the same `requireTier` pattern.
- Look up tier's `oTooleQueriesPerDay` from `lib/stripe/tiers.ts` (0 for free, 5 pro, 50 elite, 200 business/seat, 50 fraternity/seat).
- `upsert` into `o_toole_usage` with an atomic increment; enforce the cap in the same SQL (`update ... where query_count < <cap>` → if 0 rows affected, over cap).
- Business + Fraternity: the cap is per-seat; compute org-level cap as `seat_count × per_seat_cap` for v1 (single-seat orgs work fine, multi-seat orgs share the pool until a seat-assignment system exists).
- Return the enrichment set — `EnrichmentSet = { weather: bool, news: bool, injury: bool }` — so the chat endpoint knows which context to inject.
- `tradeSuggestEnabled` is Business-only.

#### 8c. Chat endpoint modifications

Find the existing O'Toole chat endpoint (grep for `@anthropic-ai/sdk` import under `apps/platform/src/`). Add:

1. `requireOTooleQuota(supabase, userId)` at the top — **before** any Anthropic call. If 429, return upsell copy pointing at `/dashboard/billing`.
2. Inject enrichment context into the prompt only per the returned `enrichmentsAllowed` set:
   - `weather` on → include today's weather for the game venue (OpenWeatherMap call, cache 1hr).
   - `news` on → include top 3 news headlines for the market's subject (NewsAPI, cache 15min).
   - `injury` on → include latest injury report for any players mentioned (SportsDataIO or equivalent, cache 1hr). **If injury API isn't contracted yet, stub this with "injury data not available for this market" — don't block shipping on the vendor deal.**
3. `tradeSuggestEnabled` flag toggles whether the system prompt allows concrete trade suggestions vs. just analysis. When false, the prompt explicitly says "Do not recommend specific trades. Provide analytical context only."
4. After the Anthropic response returns, update the `o_toole_usage` row with actual token counts + estimated cost. Cost estimate = `(tokens_in × $3/M) + (tokens_out × $15/M) + (enrichment_calls × $0.01)`, converted to cents. Sonnet 4.6 pricing assumed; update when switching models.
5. Response includes headers: `X-OToole-Queries-Remaining`, `X-OToole-Cap`, `X-OToole-Resets-At`. The UI reads these to render a "N queries left today" counter.

#### 8d. UI additions

- Chat panel shows query counter: `You have 43 of 50 queries remaining today. Resets at midnight UTC.`
- When quota hit: inline upsell modal — "You've used all 5 Pro queries today. Upgrade to Elite for 50/day + injury context + weather enrichment."
- Pricing table (`/dashboard/billing` and `/pricing`) surfaces the O'Toole quota row with explicit numbers, not just checkmarks.

#### 8e. Admin cost dashboard

New page at `/admin/otoole-costs` (admin-only):
- Last 30 days: total queries, total cost, cost per tier, cost per user (top 20 spenders)
- Alert banner if total monthly cost > 50% of monthly AI subscription revenue (user-configurable threshold in `.env.local` as `OTOOLE_COST_ALERT_PCT`, default 50)
- Per-user drill-in: query-by-query log for debugging abuse or unusual patterns
- Export CSV for accounting

#### 8f. Don't-do (O'Toole-specific)

- Don't build the injury-data vendor integration as part of this phase. Stub it; separate procurement conversation.
- Don't meter per-token (e.g., "1 query = up to 5K tokens, longer conversations count as multiple"). Queries are whole-request units for v1. If users abuse by sending ultra-long prompts, add token caps later.
- Don't expose the cost-per-query number to end users — it invites gaming. Only queries-remaining is surfaced.
- Don't build a "buy more queries" overage flow in v1. Hitting the cap upsells to the next tier. Overage pricing is deferred.
- Don't support streaming responses from Anthropic yet — normal JSON responses only. Streaming is a UX upgrade, not a business requirement.

### Phase 9 — Student verification + 75% discount

New migration `007_student_verification.sql`:

```sql
create table if not exists public.student_verification (
  id                bigserial primary key,
  waitlist_user_id  bigint not null unique references public.waitlist(id) on delete cascade,
  edu_email         text not null,
  instagram_handle  text not null,  -- no @, lowercase
  linkedin_url      text not null,
  university_name   text,            -- auto-derived from edu domain if known
  grad_year         int,             -- user-declared at submission
  status            text not null
    check (status in ('pending','approved','rejected'))
    default 'pending',
  submitted_at      timestamptz default now(),
  verified_at       timestamptz,
  verified_by       text,            -- admin email
  rejection_reason  text,
  expires_at        timestamptz,     -- derived from grad_year + 30d slack; re-verify annually
  created_at        timestamptz default now()
);
create index if not exists student_verification_status_idx on public.student_verification (status);
create index if not exists student_verification_expires_at_idx on public.student_verification (expires_at);
```

**Edu-email allowlist:** hard-code a list of known US university domains in `src/lib/student/edu-domains.ts` for v1. Accept `.edu` endings by default, reject `.edu.xx` (not a real university), and flag unknown .edu domains for manual review. Community colleges: accept if explicitly listed, otherwise manual review. This list is imperfect — don't over-engineer it; admin spot-checks are the real validation.

**Verification flow:**

1. On `/dashboard/billing`, below the pricing table: "Get 75% off with student verification" CTA → opens a form.
2. Form collects: `.edu` email, Instagram handle, LinkedIn URL, declared graduation year. Single submit.
3. Submit creates a `student_verification` row with `status='pending'`. User sees "Verification pending — typically reviewed within 24 hours."
4. Admin page at `/admin/students` (new) — paginated queue of pending verifications. Each row shows the three pieces of info + quick-link buttons to open the Instagram / LinkedIn profiles in new tabs. Admin clicks **Approve** (sets `status='approved'`, `verified_at`, `verified_by`, and derives `expires_at = grad_year + 30 days`) or **Reject** (with a reason dropdown: "not a student", "fake profile", "already graduated", "other").
5. On approval, the user's next visit to `/dashboard/billing` shows the "75% student discount applied" badge on Pro + Elite.
6. The Checkout endpoint checks `student_verification.status = 'approved'` AND `status = 'approved'` is not expired → applies coupon server-side. Client-side flag is display only.
7. **Expiration cron** (Phase 8c, deferrable): a weekly job flips `status='pending_reverification'` for rows where `expires_at < now()`. User must re-submit (reusing the same row) to keep the discount.

**Don't:**
- Don't OAuth into Instagram or LinkedIn. Just collect the handle/URL as text; admins eyeball.
- Don't email the admin queue automatically on each submission — batch review. The admin opens `/admin/students` when they have time.
- Don't store the edu email's mail-server validation. We trust the magic-link the user already verified on their primary account; the `.edu` submission is a claim, not a re-auth.

**Fraud considerations noted in ROADMAP, not blocking:**
- Someone could use an old .edu they still have access to. Annual re-verification mitigates.
- Someone could fake the Instagram/LinkedIn. The three-signal requirement (+ admin eyeball) raises the cost enough to be non-trivial for the 75% discount.
- Bulk abuse flags: more than 5 student verifications from the same university per day → auto-flag for manual review.

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

- Don't rename or drop the existing `plan_tier` column. Fraternity is a `business_subtype` flavor, not a new tier.
- Don't create a separate `subscriptions` table — one-sub-per-user on the existing `waitlist` table is the v1 model.
- Don't implement per-seat Business tier billing (it's a metered-billing overhaul — defer).
- Don't implement the Enterprise tier as a self-serve Checkout. It's a Contact-Sales inquiry form → `enterprise_inquiries` table → human sales follow-up. $20K setup + recurring is invoiced manually (Stripe Invoicing if you want, not subscription billing).
- Don't implement coupons / promo codes beyond Stripe's built-in `allow_promotion_codes: true` + the STUDENT75 coupon.
- Don't add Stripe Elements / Custom Checkout — use hosted Checkout. It's PCI-compliant out of the box and we'd get zero value from custom UX at this stage.
- Don't handle `invoice.payment_failed` with a complex dunning flow — just set `subscription_status = 'past_due'` in the DB and let Stripe's default retry logic + email the user. Custom dunning can come later.
- Don't try to support in-app purchase from iOS in v1 (Apple will reject it anyway). Web-only subscription purchase, iOS reads status.
- Don't OAuth-verify Instagram or LinkedIn for the student discount. Text capture + admin eyeball is the v1.
- Don't automatically verify Fraternity accounts as "really a fraternity" — we trust the self-declaration at signup and refund abusers manually.

---

## Testing

Before calling it done:

1. **End-to-end checkout in Stripe test mode** using card `4242 4242 4242 4242`:
   - Sign up as an individual → subscribe to Pro monthly → confirm trial starts, `subscription_status = 'trialing'`, `plan_tier = 'pro'` → confirm `/dashboard/markets` no longer shows upgrade gate.
   - Cancel via Customer Portal → confirm webhook updates `subscription_cancel_at_period_end = true` → confirm access remains until `current_period_end`.
   - Let the period end (use Stripe CLI: `stripe trigger customer.subscription.deleted`) → confirm `plan_tier` flips back to `free`.
2. **Business account check:** create business account → attempt to subscribe to Pro → should be rejected at the API layer with a clear error.
3. **Fraternity path:** business account → subscribe to Fraternity monthly → confirm `plan_tier = 'business'`, `business_subtype = 'fraternity'`, 7-day trial, 30-seat limit recorded somewhere accessible.
4. **Trial length verification:** Pro subscription trial = 7 days, Business standard trial = 2 days, Fraternity trial = 7 days — inspect the Checkout Session's `trial_period_days` in Stripe test dashboard.
5. **Student discount end-to-end:** submit student verification form with fake data → admin approves in `/admin/students` → Checkout for Pro shows 75% off line-item → post-subscription `plan_tier = 'pro'` with Stripe discount recorded on the subscription.
6. **Student rejection:** submit verification → admin rejects → Checkout for Pro shows full price, no discount applied even if user tries to pass the coupon code manually (the coupon should be server-attached only, never client-side).
7. **Enterprise inquiry:** fill Contact Sales form → confirm row in `enterprise_inquiries` with `status='new'` → confirm NO Stripe customer or subscription was created.
8. **Webhook signature verification:** POST an invalid-signature webhook → confirm 400 response, no DB write.
9. **Server-side gate bypass attempt:** directly call `GET /api/markets/opportunities` with a `free`-tier auth token → confirm 402 response.
10. **UI gate regression:** verify that `useTier` returning `free` still results in the pricing modal, and that bypassing the modal (devtools) still gets rejected server-side.
11. **O'Toole quota enforcement:** as a Pro user, fire 5 O'Toole queries → confirm 6th returns 429 with upsell copy. Confirm `o_toole_usage.query_count = 5` for today, `cost_cents > 0`, and `X-OToole-Queries-Remaining: 0` header on the 429.
12. **O'Toole enrichment gating:** as a Pro user, query about an NBA game → confirm response does NOT include weather/injury/news context. As an Elite user on the same market, confirm it DOES include weather + news (injury stub message if vendor not wired). Inspect the prompt sent to Anthropic to verify context injection matches tier.
13. **O'Toole trade-suggest gate:** as Elite, ask "Should I bet on X?" → response avoids concrete trade recommendations. As Business, same query → response may include specific trade suggestions. Diff the system prompts to confirm.
14. **O'Toole quota reset:** manually backdate a usage row's `query_date` to yesterday → next query creates a new row with `query_count=1`. Confirms date-keyed rollup logic.
15. **O'Toole admin dashboard:** fire a mix of queries across multiple test users → `/admin/otoole-costs` shows last-30-days totals, per-tier breakdown, top-spender list. CSV export downloads with correct columns.

Document all 15 test runs in the PR description with pass/fail + screenshots.

---

## Definition of done

- [ ] 3 migrations applied: `006_stripe_subscriptions.sql`, `007_student_verification.sql`, `008_o_toole_usage.sql`
- [ ] `lib/stripe/tiers.ts` is the single source of truth for price IDs, trial lengths, tier mapping, feature matrix, AND O'Toole quotas + enrichment sets
- [ ] 4 core API routes: `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/webhook` (signature-verified), `/api/enterprise/inquiry`
- [ ] 2 student-flow API routes: `POST /api/student/submit`, `POST /api/admin/student/review`
- [ ] `requireTier` helper exists and is called on every protected endpoint. Fraternity treated as Business for access; seat limits enforced separately.
- [ ] `requireOTooleQuota` helper exists and is called on the O'Toole chat endpoint before any Anthropic call
- [ ] O'Toole chat endpoint injects enrichment context per tier (weather/news/injury) and toggles trade-suggest mode
- [ ] `/dashboard/billing` shows real Checkout flow + student verification CTA; `/pricing` renders the same table publicly with Enterprise Contact-Sales form and O'Toole quota columns
- [ ] `/admin/students` admin queue works (pending verifications pagination, approve/reject)
- [ ] `/admin/otoole-costs` admin dashboard works (last-30-days totals, per-tier, top spenders, CSV export)
- [ ] Existing localStorage tier picker is removed, not merely hidden
- [ ] `docs/stripe-setup.md` is a runnable checklist the user can follow in the Stripe dashboard (incl. STUDENT75 coupon creation)
- [ ] All 15 test scenarios pass
- [ ] PR opened against `feat/platform-scaffold` with test-run notes + screenshots

Estimated effort: **20–30 hours** including student verification + O'Toole quota/telemetry. Without O'Toole phase, 14–22 hours. Without both, 10–14 hours.
