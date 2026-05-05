// Catalog of AI models available to O'Toole. Each entry has a provider,
// a credit cost per message (loose approximation of the underlying API cost
// × margin), and UX metadata.
//
// Credit conversion: 1 credit ≈ $0.001 of underlying model spend before markup.
// So a $10 credit pack = 10,000 credits. A Haiku message (3 credits) costs
// ~$0.003; a Sonnet message (30 credits) ~$0.03; an Opus message (150 credits)
// ~$0.15. Real per-message cost varies with input/output token mix — these are
// "typical short-conversation" estimates to show users up front.

export type AIProvider = 'anthropic' | 'openai' | 'google' | 'xai'

export type AIModelId =
  // Anthropic
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'
  // OpenAI (not yet wired — shown as Coming Soon in UI)
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-5'
  // Google
  | 'gemini-2-5-flash'
  | 'gemini-2-5-pro'
  // xAI
  | 'grok-3'

export interface AIModelMeta {
  id: AIModelId
  provider: AIProvider
  displayName: string
  tagline: string
  creditCostPerMessage: number
  // Tier gating — which subscription tiers can use this model. Free users
  // get Haiku only; Pro unlocks Sonnet; Elite unlocks Opus + premium models.
  // Business tier gets everything.
  minTier: 'free' | 'pro' | 'elite' | 'business'
  // If the provider isn't wired up yet, the UI shows "Coming Soon" and the
  // API route rejects attempts to use it.
  enabled: boolean
  // Pricing per 1M tokens (USD). Used by the daily-cost cap to back-of-the-
  // envelope estimate what a request will cost us when the user is on
  // Sneakers' shared key. Keep these conservative — undercount = overspend.
  priceInputPerMTok: number
  priceOutputPerMTok: number
}

export const AI_MODELS: AIModelMeta[] = [
  // ── Anthropic (live) ──────────────────────────────────────────────────
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    tagline: 'Fast, cheap — good for quick market scans',
    creditCostPerMessage: 3,
    minTier: 'free',
    enabled: true,
    priceInputPerMTok: 1.0,
    priceOutputPerMTok: 5.0,
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    tagline: 'Balanced — the default for most analysis',
    creditCostPerMessage: 30,
    minTier: 'pro',
    enabled: true,
    priceInputPerMTok: 3.0,
    priceOutputPerMTok: 15.0,
  },
  {
    id: 'claude-opus-4-7',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.7',
    tagline: 'Deepest reasoning — multi-market, multi-variable',
    creditCostPerMessage: 150,
    minTier: 'elite',
    enabled: true,
    priceInputPerMTok: 15.0,
    priceOutputPerMTok: 75.0,
  },
  // ── OpenAI (planned) ──────────────────────────────────────────────────
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o mini',
    tagline: 'Fastest + cheapest GPT for quick scans',
    creditCostPerMessage: 2,
    minTier: 'free',
    enabled: true,
    priceInputPerMTok: 0.15,
    priceOutputPerMTok: 0.6,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    tagline: 'Strong generalist for most analysis',
    creditCostPerMessage: 20,
    minTier: 'pro',
    enabled: true,
    priceInputPerMTok: 2.5,
    priceOutputPerMTok: 10.0,
  },
  {
    id: 'gpt-5',
    provider: 'openai',
    displayName: 'GPT-5',
    tagline: 'Frontier reasoning — OpenAI flagship',
    creditCostPerMessage: 180,
    minTier: 'elite',
    enabled: true,
    priceInputPerMTok: 15.0,
    priceOutputPerMTok: 75.0,
  },
  // ── Google (planned) ──────────────────────────────────────────────────
  {
    id: 'gemini-2-5-flash',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    tagline: 'Fast, multi-modal — Google flagship',
    creditCostPerMessage: 2,
    minTier: 'free',
    enabled: true,
    priceInputPerMTok: 0.3,
    priceOutputPerMTok: 2.5,
  },
  {
    id: 'gemini-2-5-pro',
    provider: 'google',
    displayName: 'Gemini 2.5 Pro',
    tagline: 'Long context, strong at data analysis',
    creditCostPerMessage: 25,
    minTier: 'pro',
    enabled: true,
    priceInputPerMTok: 1.25,
    priceOutputPerMTok: 10.0,
  },
  // ── xAI (planned) ─────────────────────────────────────────────────────
  {
    id: 'grok-3',
    provider: 'xai',
    displayName: 'Grok 3',
    tagline: 'Real-time search + reasoning from xAI',
    creditCostPerMessage: 30,
    minTier: 'pro',
    enabled: true,
    priceInputPerMTok: 3.0,
    priceOutputPerMTok: 15.0,
  },
]

/**
 * Estimate the USD cost of a single request given the model and token
 * counts. Used by the daily-cost cap on Sneakers' shared key. Cached
 * tokens aren't broken out here — we charge them at full input price,
 * so any cache discount is upside (cap stays conservative). Returns
 * dollars (e.g. 0.0125 for 1.25 cents).
 */
export function estimateRequestCostUsd(
  model: AIModelMeta,
  tokens: { input: number; output: number },
): number {
  const input = (tokens.input * model.priceInputPerMTok) / 1_000_000
  const output = (tokens.output * model.priceOutputPerMTok) / 1_000_000
  return input + output
}

// Universal default — every user starts on Haiku. Heavier models are
// "locked" in the picker UI and require an unlock path (paid tier,
// BYO key, or earn-through-referral) that we'll wire up shortly.
// Until then, the picker visually grays them out and the server still
// rejects attempts at the tier gate.
export const DEFAULT_MODEL: AIModelId = 'claude-haiku-4-5'
export const FREE_TIER_DEFAULT_MODEL: AIModelId = 'claude-haiku-4-5'

// Models that are unlockable but currently locked behind a paywall or
// upgrade. The model picker uses this to render padlock + tooltip; the
// server-side tier gate still enforces actual access. Add Haiku to this
// list to make it free-for-all (it's the only currently-unlocked model).
export const UNLOCKED_MODEL_IDS: ReadonlySet<AIModelId> = new Set([
  'claude-haiku-4-5',
])

const TIER_RANK: Record<AIModelMeta['minTier'], number> = {
  free: 0,
  pro: 1,
  elite: 2,
  business: 3,
}

export function modelById(id: string): AIModelMeta | undefined {
  return AI_MODELS.find((m) => m.id === id)
}

export function canUseModel(
  model: AIModelMeta,
  userTier: 'free' | 'pro' | 'elite' | 'business',
): boolean {
  if (!model.enabled) return false
  return TIER_RANK[userTier] >= TIER_RANK[model.minTier]
}

export function modelsAvailableTo(
  userTier: 'free' | 'pro' | 'elite' | 'business',
): AIModelMeta[] {
  // Return every model so the UI can show locked ones with an upsell, but
  // mark which are usable. Callers filter if needed.
  return [...AI_MODELS].sort((a, b) => {
    const at = TIER_RANK[a.minTier]
    const bt = TIER_RANK[b.minTier]
    if (at !== bt) return at - bt
    return a.creditCostPerMessage - b.creditCostPerMessage
  })
}
