/* -------------------------------------------------------------------------- */
/*  Subscriptions — viewability + functionality tiers                          */
/*                                                                            */
/*  Feature gates checked everywhere in the UI via hasFeature(tier, feature). */
/*  Tier is stored client-side for now (demo) — will move to Supabase session */
/*  when auth lands.                                                          */
/* -------------------------------------------------------------------------- */

export type Tier = "free" | "pro" | "elite";

export type Feature =
  | "view_simple"           // Simple mode
  | "view_medium"           // Medium mode
  | "view_terminal"         // Terminal mode (Pro+)
  | "unlimited_markets"     // no per-platform cap (Free capped at 10 per platform)
  | "all_platforms"         // connect > 2 platforms
  | "otoole_insights"       // O'Toole chat + edge detection (Pro+)
  | "otoole_execution"      // O'Toole auto-trades via API (Elite only)
  | "watchlists"            // Save markets for quick access (Pro+)
  | "price_alerts"          // Notify on threshold (Pro+)
  | "arbitrage_finder"      // Cross-platform PREDICTION arb detector (Elite only)
  | "api_access"            // Programmatic access (Elite only)
  | "priority_support"      // Direct line (Elite only)
  // ── Add-on features (unlocked via ADDONS, not base tier) ───────────────
  | "fast_execution"        // Sub-100ms order routing for O'Toole
  | "sportsbook_arb";       // Cross-book arb alerts on DK/FD/MGM/Caesars…

export type AddOnId = "fast_execution" | "sportsbook_arb";

export interface AddOnMeta {
  id: AddOnId;
  name: string;
  emoji: string;
  tagline: string;
  /** How this add-on is billed. */
  pricing:
    | { kind: "multiplier"; factor: number }      // total monthly = base × factor
    | { kind: "daily"; daily: number; monthly: number }; // flat add-on
  features: Feature[];
  /** If set, add-on only buyable when base tier matches. */
  requiresTier?: Tier[];
  details: string[];
}

export const ADDONS: AddOnMeta[] = [
  {
    id: "fast_execution",
    name: "Fast Execution",
    emoji: "🚀",
    tagline: "Sub-100ms routing for O'Toole trades",
    pricing: { kind: "multiplier", factor: 2 },
    features: ["fast_execution"],
    requiresTier: ["pro", "elite"],
    details: [
      "Priority queue — your orders hit the book first",
      "Sub-100ms fill latency (vs 400ms standard)",
      "Dedicated routing infra, separate rate-limit bucket",
    ],
  },
  {
    id: "sportsbook_arb",
    name: "Sportsbook Arbitrage",
    emoji: "🎯",
    tagline: "Cross-book arb alerts on DK, FD, MGM, Caesars +",
    pricing: { kind: "daily", daily: 0.99, monthly: 29.70 },
    features: ["sportsbook_arb"],
    details: [
      "Real-time alerts when the same line diverges across sportsbooks",
      "Covers DK, FanDuel, BetMGM, Caesars, ESPN Bet, BetRivers, Hard Rock, Fanatics",
      "Deep-links to both legs with pre-sized stakes",
      "Billed $0.99/day (~$29.70/mo), cancel anytime",
    ],
  },
];

export interface TierPlan {
  id: Tier;
  name: string;
  priceMonthly: number;
  emoji: string;
  tagline: string;
  features: Feature[];
  /** Human-readable feature highlights for the pricing card. */
  highlights: string[];
  color: string;
}

export const PLANS: TierPlan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    emoji: "🆓",
    tagline: "Watch the markets",
    color: "#9ca3af",
    features: ["view_simple", "view_medium"],
    highlights: [
      "Simple + Medium modes",
      "10 markets per platform",
      "Up to 2 connected sites",
      "O'Toole Off (no AI)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 29,
    emoji: "⚡",
    tagline: "Every market, every mode",
    color: "#22c55e",
    features: [
      "view_simple", "view_medium", "view_terminal",
      "unlimited_markets", "all_platforms",
      "otoole_insights", "watchlists", "price_alerts",
    ],
    highlights: [
      "Terminal mode (Bloomberg-style)",
      "Unlimited markets · all platforms",
      "O'Toole Insights (scanning + edge detection)",
      "Watchlists & price alerts",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    priceMonthly: 199,
    emoji: "💎",
    tagline: "O'Toole trades for you",
    color: "#f59e0b",
    features: [
      "view_simple", "view_medium", "view_terminal",
      "unlimited_markets", "all_platforms",
      "otoole_insights", "otoole_execution",
      "watchlists", "price_alerts",
      "arbitrage_finder", "api_access", "priority_support",
    ],
    highlights: [
      "Everything in Pro, plus:",
      "O'Toole Execution — auto-trading via API",
      "Cross-platform arbitrage alerts",
      "API access for custom bots",
      "Priority support",
    ],
  },
];

const STORAGE_KEY = "otoole:tier:v1";
const ADDONS_KEY = "otoole:addons:v1";

export function loadTier(): Tier {
  if (typeof window === "undefined") return "free";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "pro" || raw === "elite" || raw === "free") return raw;
    return "free";
  } catch {
    return "free";
  }
}

export function saveTier(t: Tier) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, t);
}

export function loadAddons(): AddOnId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ADDONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a): a is AddOnId => a === "fast_execution" || a === "sportsbook_arb") : [];
  } catch {
    return [];
  }
}

export function saveAddons(a: AddOnId[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADDONS_KEY, JSON.stringify(a));
}

export function planFor(tier: Tier): TierPlan {
  return PLANS.find((p) => p.id === tier) ?? PLANS[0];
}

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return planFor(tier).features.includes(feature);
}

/** True if feature is unlocked by tier OR any active add-on. */
export function featureEnabled(tier: Tier, addons: AddOnId[], feature: Feature): boolean {
  if (hasFeature(tier, feature)) return true;
  for (const a of addons) {
    const meta = ADDONS.find((x) => x.id === a);
    if (meta?.features.includes(feature)) return true;
  }
  return false;
}

/** True if the user is allowed to buy this add-on given their current tier. */
export function canBuyAddon(tier: Tier, addon: AddOnId): boolean {
  const meta = ADDONS.find((x) => x.id === addon);
  if (!meta?.requiresTier) return true;
  return meta.requiresTier.includes(tier);
}

/** Monthly cost given a tier + active add-ons. */
export function calculateMonthly(tier: Tier, addons: AddOnId[]): number {
  const base = planFor(tier).priceMonthly;
  let total = base;
  for (const a of addons) {
    const meta = ADDONS.find((x) => x.id === a);
    if (!meta) continue;
    if (meta.pricing.kind === "multiplier") {
      // factor 2 → total doubles → add an extra "base"
      total += base * (meta.pricing.factor - 1);
    } else {
      total += meta.pricing.monthly;
    }
  }
  return total;
}

/** Per-platform market cap based on tier. Returns null for unlimited. */
export function marketCapPerPlatform(tier: Tier): number | null {
  return hasFeature(tier, "unlimited_markets") ? null : 10;
}

/** Max number of platforms a user may connect. */
export function platformCap(tier: Tier): number {
  return hasFeature(tier, "all_platforms") ? Infinity : 2;
}
