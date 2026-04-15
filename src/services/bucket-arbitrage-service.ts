// Bucket Arbitrage Service
// Detects structural mispricings in temperature markets by checking that
// all bucket probabilities sum to ~100%. Any deviation is free money.
//
// Strategy: In a well-priced market, P(15°C) + P(16°C) + ... + P(25°C or higher) = 100%
// If they sum to 105%, some buckets are overpriced. If 95%, some are underpriced.
// Buy the underpriced bucket portfolio or sell the overpriced ones.

import { PolymarketWeatherMarket, PolymarketOutcome } from './polymarket-weather-scanner.js';

export interface BucketArbitrageOpportunity {
  market: PolymarketWeatherMarket;
  probabilitySum: number;        // should be ~1.0
  deviation: number;             // probabilitySum - 1.0 (positive = overpriced, negative = underpriced)
  deviationPct: number;          // deviation as percentage
  type: 'OVERPRICED' | 'UNDERPRICED' | 'FAIR';
  profitIfArbitraged: number;    // theoretical profit from buying/selling the full set
  bucketCount: number;
  mostMispriced: {
    outcome: PolymarketOutcome;
    impliedProb: number;
    fairProb: number;            // normalized probability
    edge: number;                // fairProb - impliedProb
  }[];
  historicalSums: number[];      // track sum over time to spot trends
}

export interface BucketAnalysis {
  location: string;
  targetDate: string;
  outcomes: {
    label: string;
    yesPrice: number;
    normalizedProb: number;
    edge: number;
    tokenId: string;
  }[];
  totalSum: number;
  isArbitrageable: boolean;
}

class BucketArbitrageService {
  private historicalSums: Map<string, number[]> = new Map();

  // Analyze a single market for bucket arbitrage
  analyzeMarket(market: PolymarketWeatherMarket): BucketArbitrageOpportunity | null {
    const outcomes = market.outcomes.filter(o => o.yesPrice > 0);
    if (outcomes.length < 3) return null; // need enough buckets to detect mispricing

    // Sum all YES prices — should equal ~1.0
    const probabilitySum = outcomes.reduce((s, o) => s + o.yesPrice, 0);
    const deviation = probabilitySum - 1.0;
    const deviationPct = deviation * 100;

    // Track historical
    const key = `${market.location}:${market.targetDate}`;
    if (!this.historicalSums.has(key)) this.historicalSums.set(key, []);
    const history = this.historicalSums.get(key)!;
    history.push(probabilitySum);
    if (history.length > 100) history.shift();

    // Only flag if deviation > 3% (inside 3% is normal bid-ask spread noise)
    if (Math.abs(deviation) < 0.03) {
      return {
        market, probabilitySum, deviation, deviationPct,
        type: 'FAIR', profitIfArbitraged: 0,
        bucketCount: outcomes.length,
        mostMispriced: [],
        historicalSums: history.slice(-20),
      };
    }

    const type = deviation > 0 ? 'OVERPRICED' : 'UNDERPRICED';

    // Normalize probabilities to sum to 1.0 — the "fair" distribution
    const normalized = outcomes.map(o => ({
      outcome: o,
      impliedProb: o.yesPrice,
      fairProb: o.yesPrice / probabilitySum,
      edge: (o.yesPrice / probabilitySum) - o.yesPrice,
    }));

    // Sort by absolute edge to find most mispriced
    normalized.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));

    // Theoretical profit: buy all buckets for $probabilitySum, one pays $1
    // If sum < 1: buy all for < $1, guaranteed $1 payout = profit of (1 - sum)
    // If sum > 1: sell all for > $1, one costs $1 = profit of (sum - 1)
    const profitIfArbitraged = Math.abs(deviation);

    return {
      market, probabilitySum, deviation, deviationPct,
      type, profitIfArbitraged,
      bucketCount: outcomes.length,
      mostMispriced: normalized.slice(0, 5),
      historicalSums: history.slice(-20),
    };
  }

  // Analyze all markets and return actionable opportunities
  findArbitrageOpportunities(markets: PolymarketWeatherMarket[]): BucketArbitrageOpportunity[] {
    const opportunities: BucketArbitrageOpportunity[] = [];

    for (const market of markets) {
      const result = this.analyzeMarket(market);
      if (result && result.type !== 'FAIR') {
        opportunities.push(result);
      }
    }

    // Sort by profit potential
    opportunities.sort((a, b) => b.profitIfArbitraged - a.profitIfArbitraged);

    if (opportunities.length > 0) {
      console.log(`[BUCKET-ARB] ${opportunities.length} bucket arbitrage opportunities:`);
      for (const o of opportunities.slice(0, 5)) {
        console.log(`  ${o.market.location} ${o.market.targetDate}: sum=${(o.probabilitySum * 100).toFixed(1)}% (${o.type}, ${o.deviationPct.toFixed(1)}% off) — $${o.profitIfArbitraged.toFixed(3)} per share set`);
      }
    }

    return opportunities;
  }

  // Get full analysis for dashboard display
  getFullAnalysis(markets: PolymarketWeatherMarket[]): BucketAnalysis[] {
    return markets.map(market => {
      const outcomes = market.outcomes.filter(o => o.yesPrice > 0);
      const totalSum = outcomes.reduce((s, o) => s + o.yesPrice, 0);

      return {
        location: market.location,
        targetDate: market.targetDate,
        outcomes: outcomes.map(o => ({
          label: o.label,
          yesPrice: o.yesPrice,
          normalizedProb: totalSum > 0 ? o.yesPrice / totalSum : 0,
          edge: totalSum > 0 ? (o.yesPrice / totalSum) - o.yesPrice : 0,
          tokenId: o.tokenId,
        })),
        totalSum,
        isArbitrageable: Math.abs(totalSum - 1.0) > 0.03,
      };
    });
  }
}

export default BucketArbitrageService;
