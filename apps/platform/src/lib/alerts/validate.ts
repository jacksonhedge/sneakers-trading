import type {
  ArbAppearanceConfig,
  Channel,
  MarketFilter,
  OverroundThresholdConfig,
  PriceMovementConfig,
  PriceThresholdConfig,
  TriggerConfig,
  TriggerType,
} from './types'

// Server-side validation for trigger_config + market_filter shapes. The DB
// enforces only the trigger_type enum; this catches everything else.
//
// Returns null on success, or an error object {field, message} on failure.

export type ValidationError = { field: string; message: string } | null

const VALID_CHANNELS: ReadonlySet<Channel> = new Set(['browser_push', 'email'])

const ALLOWED_PLATFORMS = new Set([
  'polymarket', 'kalshi', 'novig', 'prophetx', 'og',
  'prizepicks', 'underdog', 'oddsapi',
  'fanduel', 'draftkings', 'betmgm', 'betrivers',
])

const ALLOWED_CATEGORIES = new Set([
  'politics', 'economics', 'crypto', 'sports', 'tech', 'other',
])

const ALLOWED_WINDOWS = new Set([5, 15, 60, 360, 1440, 10080])

export function validateTriggerConfig(
  type: TriggerType,
  config: unknown,
): ValidationError {
  if (!isObj(config)) return { field: 'trigger_config', message: 'must be a JSON object' }
  switch (type) {
    case 'price_threshold':
      return validatePriceThreshold(config as Record<string, unknown>)
    case 'price_movement':
      return validatePriceMovement(config as Record<string, unknown>)
    case 'overround_threshold':
      return validateOverround(config as Record<string, unknown>)
    case 'arb_appearance':
      return validateArbAppearance(config as Record<string, unknown>)
  }
}

function validatePriceThreshold(c: Record<string, unknown>): ValidationError {
  if (c.direction !== 'above' && c.direction !== 'below') {
    return { field: 'direction', message: 'must be "above" or "below"' }
  }
  if (typeof c.threshold !== 'number' || c.threshold < 0 || c.threshold > 1) {
    return { field: 'threshold', message: 'must be a number between 0 and 1 (probability)' }
  }
  return null
}

function validatePriceMovement(c: Record<string, unknown>): ValidationError {
  if (typeof c.delta_pp !== 'number' || c.delta_pp < 5 || c.delta_pp > 90) {
    return { field: 'delta_pp', message: 'must be 5–90 (percentage points)' }
  }
  if (typeof c.window_minutes !== 'number' || !ALLOWED_WINDOWS.has(c.window_minutes)) {
    return { field: 'window_minutes', message: `must be one of ${[...ALLOWED_WINDOWS].join(', ')}` }
  }
  return null
}

function validateOverround(c: Record<string, unknown>): ValidationError {
  if (c.direction !== 'above' && c.direction !== 'below') {
    return { field: 'direction', message: 'must be "above" or "below"' }
  }
  if (typeof c.threshold !== 'number' || c.threshold < 0.5 || c.threshold > 2) {
    return { field: 'threshold', message: 'must be a number between 0.5 and 2 (overround)' }
  }
  return null
}

function validateArbAppearance(c: Record<string, unknown>): ValidationError {
  if (c.min_edge_pp != null) {
    if (typeof c.min_edge_pp !== 'number' || c.min_edge_pp < 0 || c.min_edge_pp > 50) {
      return { field: 'min_edge_pp', message: 'must be a number between 0 and 50' }
    }
  }
  return null
}

export function validateMarketFilter(filter: unknown): ValidationError {
  if (!isObj(filter)) return { field: 'market_filter', message: 'must be a JSON object' }
  const f = filter as Record<string, unknown>
  // At least one filter field must be set — no unbounded "match everything" rules.
  const hasField =
    typeof f.platform === 'string' ||
    typeof f.sport === 'string' ||
    typeof f.category === 'string' ||
    typeof f.market_key === 'string'
  if (!hasField) {
    return {
      field: 'market_filter',
      message: 'set at least one of platform, sport, category, market_key',
    }
  }
  if (f.platform != null && !ALLOWED_PLATFORMS.has(String(f.platform).toLowerCase())) {
    return { field: 'market_filter.platform', message: `unknown platform "${f.platform}"` }
  }
  if (f.category != null && !ALLOWED_CATEGORIES.has(String(f.category).toLowerCase())) {
    return { field: 'market_filter.category', message: `unknown category "${f.category}"` }
  }
  if (f.market_key != null && typeof f.market_key !== 'string') {
    return { field: 'market_filter.market_key', message: 'must be a string' }
  }
  return null
}

export function validateChannels(channels: unknown): ValidationError {
  if (!Array.isArray(channels) || channels.length === 0) {
    return { field: 'channels', message: 'pick at least one channel' }
  }
  for (const c of channels) {
    if (typeof c !== 'string' || !VALID_CHANNELS.has(c as Channel)) {
      return { field: 'channels', message: `unknown channel "${String(c)}"` }
    }
  }
  return null
}

export function validateCooldown(minutes: unknown): ValidationError {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) {
    return { field: 'cooldown_minutes', message: 'must be an integer' }
  }
  if (minutes < 5 || minutes > 10080) {
    return { field: 'cooldown_minutes', message: 'must be between 5 and 10080 (one week)' }
  }
  return null
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Per-tier active-rule cap. Enforced server-side on rule create.
export const RULE_CAP_BY_TIER: Record<string, number> = {
  free: 0,
  pro: 3,
  elite: 20,
  business: Number.POSITIVE_INFINITY,
}
// Fraternity is `business` tier with subtype 'fraternity'; cap differs.
export const FRATERNITY_RULE_CAP = 20

/**
 * Compute the user's effective rule cap given tier + business_subtype.
 */
export function ruleCapFor(
  tier: 'free' | 'pro' | 'elite' | 'business',
  businessSubtype: 'standard' | 'fraternity' | null,
): number {
  if (tier === 'business' && businessSubtype === 'fraternity') return FRATERNITY_RULE_CAP
  return RULE_CAP_BY_TIER[tier] ?? 0
}

/**
 * Cron evaluation tier groupings. Standard cron handles Pro/Elite/Fraternity
 * (5-min cadence); Business cron handles standard Business only (1-min).
 */
export const TIERS_FOR_STANDARD_CRON = ['pro', 'elite'] as const
export const TIERS_FOR_BUSINESS_CRON = ['business'] as const
