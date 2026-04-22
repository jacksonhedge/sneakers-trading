// Shared types for the alert engine. The cron evaluator, the rule
// validator, the API routes, and the UI all import from here.

export type TriggerType =
  | 'price_threshold'
  | 'price_movement'
  | 'overround_threshold'
  | 'arb_appearance'

export type Channel = 'browser_push' | 'email'

export type Direction = 'above' | 'below'

export interface PriceThresholdConfig {
  direction: Direction
  // 0..1 (probability). 0.9 = 90%.
  threshold: number
}

export interface PriceMovementConfig {
  // Required absolute movement in percentage points (5..90).
  delta_pp: number
  // Look-back window in minutes (5, 15, 60, 360, 1440, 10080).
  window_minutes: number
}

export interface OverroundThresholdConfig {
  direction: Direction
  // Typical band 1.00–1.30. Above 1.05 implies a wide book.
  threshold: number
}

export interface ArbAppearanceConfig {
  // Optional minimum edge in percentage points. Edge = (1 - bestSum) * 100.
  // null/undefined = any positive-edge cross-book pair fires.
  min_edge_pp?: number | null
}

export type TriggerConfig =
  | PriceThresholdConfig
  | PriceMovementConfig
  | OverroundThresholdConfig
  | ArbAppearanceConfig

export interface MarketFilter {
  platform?: string
  sport?: string
  category?: string
  // "<platform>:<market_id>" — pin to a single market
  market_key?: string
}

export interface AlertRule {
  id: string
  user_id: string
  name: string
  description?: string | null
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  market_filter: MarketFilter
  channels: Channel[]
  cooldown_minutes: number
  enabled: boolean
  last_fired_at: string | null
  created_at: string
  updated_at: string
}

// What a trigger evaluator returns when the rule fires. Null means no fire.
// market_key is "<platform>:<market_id>" for per-market triggers, or
// "arb:<sport>:<away>:<home>" for cross-book arb triggers.
export type TriggerResult = {
  market_key: string
  trigger_snapshot: Record<string, unknown>
} | null
