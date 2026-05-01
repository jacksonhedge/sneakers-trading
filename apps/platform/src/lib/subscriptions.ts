// Subscription tiers, billing flavors, and Stripe price-ID wiring. The single
// source of truth that the Checkout helper, the webhook handler, requireTier,
// the pricing UI, and (eventually) the iOS tier check all read from.
//
// Vocabulary:
//   - Tier        — what access control cares about. 4 values.
//   - Subtype     — narrows business into standard vs fraternity. NULL otherwise.
//   - Flavor      — what the pricing table renders one column per. 6 values
//                   (free / pro / elite / business / fraternity / enterprise).
//                   Maps 1:1 onto (tier, subtype) except enterprise, which is
//                   not a Stripe Checkout flow at all (Contact Sales only).
//   - Interval    — monthly | yearly. Each Stripe price ID is per (flavor, interval).
//
// Flow back from Stripe: webhook receives a price_id → priceIdToFlavor() →
// flavorToTier() → write plan_tier + business_subtype + subscription_status
// + ... on the waitlist row. requireTier reads those columns.

export type Tier = 'free' | 'pro' | 'elite' | 'business'
export type BusinessSubtype = 'standard' | 'fraternity'
export type BillingFlavor =
  | 'free'
  | 'pro'
  | 'elite'
  | 'business'
  | 'fraternity'
  | 'enterprise'
export type BillingInterval = 'monthly' | 'yearly'
export type AccountType = 'individual' | 'business'

// Tier ordering for requireTier comparisons. Higher = more access. Fraternity
// is NOT in this enum — it's a pricing flavor of business and gets the same
// rank.
const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2, business: 3 }
export function tierMeetsMinimum(actual: Tier, minimum: Tier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[minimum]
}

// Status values that grant access. Anything else (past_due, canceled,
// incomplete, etc.) collapses the user back to free regardless of plan_tier.
export const ACTIVE_STATUSES = ['active', 'trialing'] as const
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number]
export function isActiveStatus(s: string | null | undefined): s is ActiveStatus {
  return s === 'active' || s === 'trialing'
}

// ─── Stripe price-ID wiring ────────────────────────────────────────────────
//
// Read at module load. The pricing table renders columns from this; the
// Checkout helper passes the picked ID to Stripe; the webhook reverse-looks
// it up via priceIdToFlavor(). If any env var is missing, that flavor's
// "Subscribe" button is disabled with a "Not configured" tooltip rather
// than 500-ing.

interface FlavorPrices {
  monthly: string | null
  yearly: string | null
}

export const STRIPE_PRICES: Record<Exclude<BillingFlavor, 'free' | 'enterprise'>, FlavorPrices> = {
  pro: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? null,
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY ?? null,
  },
  elite: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_MONTHLY ?? null,
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_YEARLY ?? null,
  },
  business: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY ?? null,
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY ?? null,
  },
  fraternity: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_MONTHLY ?? null,
    yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_FRATERNITY_YEARLY ?? null,
  },
}

export function priceIdFor(flavor: BillingFlavor, interval: BillingInterval): string | null {
  if (flavor === 'free' || flavor === 'enterprise') return null
  return STRIPE_PRICES[flavor][interval]
}

// Reverse: webhook receives a price ID → which flavor + interval is it?
// Used to derive plan_tier and business_subtype from a Stripe event.
export function priceIdToFlavor(
  priceId: string,
): { flavor: BillingFlavor; interval: BillingInterval } | null {
  for (const [flavor, prices] of Object.entries(STRIPE_PRICES) as [
    Exclude<BillingFlavor, 'free' | 'enterprise'>,
    FlavorPrices,
  ][]) {
    if (prices.monthly === priceId) return { flavor, interval: 'monthly' }
    if (prices.yearly === priceId) return { flavor, interval: 'yearly' }
  }
  return null
}

export function flavorToTier(flavor: BillingFlavor): Tier {
  switch (flavor) {
    case 'pro':
      return 'pro'
    case 'elite':
      return 'elite'
    case 'business':
    case 'fraternity':
      return 'business'
    case 'free':
    case 'enterprise':
      return 'free'
  }
}

export function flavorToSubtype(flavor: BillingFlavor): BusinessSubtype | null {
  if (flavor === 'business') return 'standard'
  if (flavor === 'fraternity') return 'fraternity'
  return null
}

export function accountTypeForFlavor(flavor: BillingFlavor): AccountType | null {
  switch (flavor) {
    case 'pro':
    case 'elite':
      return 'individual'
    case 'business':
    case 'fraternity':
      return 'business'
    case 'free':
    case 'enterprise':
      return null // either account type is valid
  }
}

// ─── Trial lengths ─────────────────────────────────────────────────────────
//
// Stripe pulls these from the Checkout Session payload at create time. Trial
// requires a card by default (no special flag needed).
export const TRIAL_DAYS_BY_FLAVOR: Record<BillingFlavor, number> = {
  free: 0,
  pro: 7,
  elite: 7,
  business: 2,
  fraternity: 7,
  enterprise: 0,
}

// ─── O'Toole quotas ────────────────────────────────────────────────────────
//
// Note: O'Toole is moving to a prepaid-credits model (see
// docs/OTOOLE_CREDITS_PLAN.md and lib/credits.ts). The per-tier daily caps
// below remain for the free-tier fallback path in lib/otoole-usage.ts —
// users without credits still get a small free allowance keyed off tier.
// The bundled-quota-with-enrichment-gating model from the original handoff
// is superseded by credits and not built.
export const OTOOLE_DAILY_FREE_CAP_BY_TIER: Record<Tier, number> = {
  free: 5,
  pro: 50,
  elite: 500,
  business: Number.POSITIVE_INFINITY,
}

// ─── Add-ons ───────────────────────────────────────────────────────────────

export type Feature =
  | 'view_simple'
  | 'view_medium'
  | 'view_terminal'
  | 'unlimited_markets'
  | 'all_platforms'
  | 'otoole_insights'
  | 'otoole_execution'
  | 'watchlists'
  | 'price_alerts'
  | 'arbitrage_finder'
  | 'api_access'
  | 'priority_support'
  | 'fast_execution'
  | 'sportsbook_arb'
  | 'historical_export'
  | 'white_label'
  | 'team_seats'

export type AddOnId = 'fast_execution' | 'sportsbook_arb'

export interface AddOnMeta {
  id: AddOnId
  name: string
  tagline: string
  pricing:
    | { kind: 'multiplier'; factor: number }
    | { kind: 'daily'; daily: number; monthly: number }
  features: Feature[]
  requiresTier?: Tier[]
  details: string[]
}

export const ADDONS: AddOnMeta[] = [
  {
    id: 'fast_execution',
    name: 'Fast Execution',
    tagline: "Sub-100ms routing for O'Toole trades",
    pricing: { kind: 'multiplier', factor: 2 },
    features: ['fast_execution'],
    requiresTier: ['pro', 'elite'],
    details: [
      'Priority queue — your orders hit the book first',
      'Sub-100ms fill latency (vs 400ms standard)',
      'Dedicated routing infra, separate rate-limit bucket',
    ],
  },
  {
    id: 'sportsbook_arb',
    name: 'Sportsbook Arbitrage',
    tagline: 'Cross-book arb alerts on DK, FD, MGM, Caesars +',
    pricing: { kind: 'daily', daily: 0.99, monthly: 29.7 },
    features: ['sportsbook_arb'],
    details: [
      'Real-time alerts when the same line diverges across sportsbooks',
      'Covers DK, FanDuel, BetMGM, Caesars, ESPN Bet, BetRivers, Hard Rock, Fanatics',
      'Deep-links to both legs with pre-sized stakes',
      'Billed $0.99/day (~$29.70/mo), cancel anytime',
    ],
  },
]

// ─── Plans (UI metadata, one entry per pricing-table column) ───────────────
//
// `priceMonthly` / `priceYearly` are the dollar amounts to display, NOT the
// Stripe-side cents. Stripe's source of truth is the price ID in the
// dashboard; the numbers here drive the pricing-table UI only. If you change
// a price in Stripe, change it here too.
//
// `accountType: null` means either type can subscribe (free) or the row is
// not a Stripe flow (enterprise).

export interface TierPlan {
  flavor: BillingFlavor
  tier: Tier
  subtype?: BusinessSubtype
  name: string
  tagline: string
  accent: string
  priceMonthly: number | null  // null → "Contact Sales"
  priceYearly: number | null
  trialDays: number
  accountType: AccountType | null
  features: Feature[]
  highlights: string[]
  seatLimit: number
}

export const PLANS: TierPlan[] = [
  {
    flavor: 'free',
    tier: 'free',
    name: 'Free',
    tagline: 'Watch the markets',
    accent: 'stone',
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 0,
    accountType: null,
    features: ['view_simple', 'view_medium'],
    highlights: [
      'Simple + Medium modes',
      'Top 100 markets, 15-minute delayed prices',
      '3 alerts/day',
      "O'Toole limited (5 free messages/day; credits stack on top)",
    ],
    seatLimit: 1,
  },
  {
    flavor: 'pro',
    tier: 'pro',
    name: 'Pro',
    tagline: 'Every market, every mode, real-time',
    accent: 'emerald',
    priceMonthly: 39,
    priceYearly: 390,
    trialDays: 7,
    accountType: 'individual',
    features: [
      'view_simple', 'view_medium', 'view_terminal',
      'unlimited_markets', 'all_platforms',
      'otoole_insights', 'watchlists', 'price_alerts',
    ],
    highlights: [
      'Real-time prices across every platform',
      'Unlimited markets · Terminal mode',
      'Cross-venue arb scanner',
      'Affiliate routing baked in',
      "O'Toole Insights (50/day free; credits stack)",
    ],
    seatLimit: 1,
  },
  {
    flavor: 'elite',
    tier: 'elite',
    name: 'Elite',
    tagline: 'Pros + API + history + sub-minute',
    accent: 'amber',
    priceMonthly: 99,
    priceYearly: 990,
    trialDays: 7,
    accountType: 'individual',
    features: [
      'view_simple', 'view_medium', 'view_terminal',
      'unlimited_markets', 'all_platforms',
      'otoole_insights', 'otoole_execution',
      'watchlists', 'price_alerts',
      'arbitrage_finder', 'api_access', 'priority_support',
      'historical_export',
    ],
    highlights: [
      'Everything in Pro, plus:',
      'REST API access for custom bots',
      'Sub-minute alerts',
      'Historical CSV export + backtest',
      "O'Toole Execution (auto-trading via API)",
    ],
    seatLimit: 1,
  },
  {
    flavor: 'business',
    tier: 'business',
    subtype: 'standard',
    name: 'Business',
    tagline: 'For desks, funds, and syndicates',
    accent: 'violet',
    priceMonthly: 299,
    priceYearly: 2990,
    trialDays: 2,
    accountType: 'business',
    features: [
      'view_simple', 'view_medium', 'view_terminal',
      'unlimited_markets', 'all_platforms',
      'otoole_insights', 'otoole_execution',
      'watchlists', 'price_alerts',
      'arbitrage_finder', 'api_access', 'priority_support',
      'historical_export', 'white_label', 'team_seats',
    ],
    highlights: [
      'Everything in Elite, plus:',
      'Team seats (up to 10 per org)',
      'White-label embed',
      'Priority support',
      'Custom data feeds on request',
    ],
    seatLimit: 10,
  },
  {
    flavor: 'fraternity',
    tier: 'business',
    subtype: 'fraternity',
    name: 'Fraternity',
    tagline: 'Trading desk for the house — terminal access for up to 25 brothers',
    accent: 'sky',
    priceMonthly: 799,
    priceYearly: 7990,
    trialDays: 7,
    accountType: 'business',
    features: [
      'view_simple', 'view_medium', 'view_terminal',
      'unlimited_markets', 'all_platforms',
      'otoole_insights', 'otoole_execution',
      'watchlists', 'price_alerts',
      'arbitrage_finder', 'api_access', 'priority_support',
      'historical_export', 'white_label', 'team_seats',
    ],
    highlights: [
      'Up to 25 seats — every active brother gets a login',
      'Optional hardware add-on (Mac Studio or MacBook Pro): see /hardware',
      'For college fraternities — self-declared at signup',
    ],
    seatLimit: 25,
  },
  {
    flavor: 'enterprise',
    tier: 'free', // tier is meaningless for this row — it's not a Stripe flow
    name: 'Enterprise',
    tagline: 'Bespoke deployments, SSO, custom SLAs',
    accent: 'zinc',
    priceMonthly: null,
    priceYearly: null,
    trialDays: 0,
    accountType: null,
    features: [], // listed in ad copy, not gated by feature matrix
    highlights: [
      'Custom integrations + private deployment',
      '$20K onboarding + $1.5–3K/mo recurring',
      'Optional Mac Studio / MacBook Pro bundle — billed into the recurring fee, not free',
      'White-glove onboarding, SSO, audit logs',
      'Invoiced separately — Contact Sales',
    ],
    seatLimit: Number.POSITIVE_INFINITY,
  },
]

export function planForFlavor(flavor: BillingFlavor): TierPlan {
  const p = PLANS.find((x) => x.flavor === flavor)
  if (!p) throw new Error(`Unknown billing flavor: ${flavor}`)
  return p
}

// Cents-accurate yearly savings for the "save $X" copy.
export function yearlySavings(plan: TierPlan): number {
  if (plan.priceMonthly == null || plan.priceYearly == null) return 0
  return plan.priceMonthly * 12 - plan.priceYearly
}

export function hasFeature(tier: Tier, addons: AddOnId[], feature: Feature): boolean {
  const plan = PLANS.find((p) => p.tier === tier && (p.subtype ?? 'standard') === 'standard')
  if (plan?.features.includes(feature)) return true
  for (const id of addons) {
    const meta = ADDONS.find((a) => a.id === id)
    if (meta?.features.includes(feature)) return true
  }
  return false
}

