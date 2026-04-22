export type MarketPhase = 'opening' | 'pre_game' | 'live' | 'closed';

export interface PriceObservation {
  platform: string;
  platform_market_id: string;
  question: string;
  tags: string[];
  sport?: string;
  outcome: string;
  best_bid: number | null;
  best_ask: number | null;
  last_price: number | null;
  implied_prob: number | null;
  volume_traded: number | null;
  liquidity: number | null;
  starts_at?: string;
  locks_at?: string;
  resolves_at?: string;
  phase: MarketPhase;
  ts: string;
}

export interface MarketSnapshot {
  platform: string;
  platform_market_id: string;
  question: string;
  tags: string[];
  sport?: string;
  outcomes: Array<{
    name: string;
    best_bid: number | null;
    best_ask: number | null;
    last_price: number | null;
  }>;
  overround: number | null;
  volume_traded: number | null;
  liquidity: number | null;
  starts_at?: string;
  resolves_at?: string;
  phase: MarketPhase;
  ts: string;
}

export function computeOverround(outcomeAsks: Array<number | null>): number | null {
  const valid = outcomeAsks.filter((p): p is number => p !== null && p > 0);
  if (valid.length < 2) return null;
  return valid.reduce((a, b) => a + b, 0);
}
