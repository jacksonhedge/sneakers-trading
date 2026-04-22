// Subscription tiers + add-ons. Structure ported from the "add-web-terminal"
// branch; for now tier + add-ons are stored in localStorage (demo mode). When
// Stripe integration lands, the source of truth moves to a Supabase table
// scoped by auth.uid() and this file becomes a pure metadata catalog.

export type Tier = 'free' | 'pro' | 'elite' | 'business'

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

export interface TierPlan {
  id: Tier
  name: string
  priceMonthly: number
  tagline: string
  features: Feature[]
  highlights: string[]
  accent: string
}

export const PLANS: TierPlan[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    tagline: 'Watch the markets',
    accent: 'stone',
    features: ['view_simple', 'view_medium'],
    highlights: [
      'Simple + Medium modes',
      '10 markets per platform',
      'Up to 2 connected sites',
      "O'Toole Off (no AI)",
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 29,
    tagline: 'Every market, every mode',
    accent: 'emerald',
    features: [
      'view_simple', 'view_medium', 'view_terminal',
      'unlimited_markets', 'all_platforms',
      'otoole_insights', 'watchlists', 'price_alerts',
    ],
    highlights: [
      'Terminal mode (Bloomberg-style layout)',
      'Unlimited markets · all platforms',
      "O'Toole Insights (scanning + edge detection)",
      'Watchlists & price alerts',
    ],
  },
  {
    id: 'elite',
    name: 'Elite',
    priceMonthly: 199,
    tagline: "O'Toole trades for you",
    accent: 'amber',
    features: [
      'view_simple', 'view_medium', 'view_terminal',
      'unlimited_markets', 'all_platforms',
      'otoole_insights', 'otoole_execution',
      'watchlists', 'price_alerts',
      'arbitrage_finder', 'api_access', 'priority_support',
    ],
    highlights: [
      'Everything in Pro, plus:',
      "O'Toole Execution — auto-trading via API",
      'Cross-platform arbitrage alerts',
      'API access for custom bots',
      'Priority support',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    priceMonthly: 999,
    tagline: 'For desks, funds, and syndicates',
    accent: 'violet',
    features: [
      'view_simple', 'view_medium', 'view_terminal',
      'unlimited_markets', 'all_platforms',
      'otoole_insights', 'otoole_execution',
      'watchlists', 'price_alerts',
      'arbitrage_finder', 'api_access', 'priority_support',
    ],
    highlights: [
      'Everything in Elite, plus:',
      'Team seats (up to 10 per org)',
      'Shared watchlists + positions',
      'SSO + audit logs',
      'White-glove onboarding + dedicated Slack channel',
      'Custom data feeds on request',
    ],
  },
]

const STORAGE_KEY = 'sneakers:tier:v1'
const ADDONS_KEY = 'sneakers:addons:v1'

export function loadTier(): Tier {
  if (typeof window === 'undefined') return 'free'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'pro' || raw === 'elite' || raw === 'free') return raw
  } catch {
    // ignore
  }
  return 'free'
}

export function saveTier(t: Tier) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, t)
}

export function loadAddons(): AddOnId[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ADDONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((a): a is AddOnId => a === 'fast_execution' || a === 'sportsbook_arb')
      : []
  } catch {
    return []
  }
}

export function saveAddons(a: AddOnId[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ADDONS_KEY, JSON.stringify(a))
}

export function hasFeature(tier: Tier, addons: AddOnId[], feature: Feature): boolean {
  const plan = PLANS.find((p) => p.id === tier)
  if (plan?.features.includes(feature)) return true
  for (const id of addons) {
    const meta = ADDONS.find((a) => a.id === id)
    if (meta?.features.includes(feature)) return true
  }
  return false
}
