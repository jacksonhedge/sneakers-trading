// Weather Edge Calculator
// Compares forecast-derived probabilities vs Polymarket prices to find mispriced outcomes
// Uses ABSOLUTE edge (not percentage) as the primary signal to avoid tail noise

import { TemperatureForecast, buildTemperatureDistribution } from './noaa-weather-service.js';
import { PolymarketWeatherMarket, PolymarketOutcome } from './polymarket-weather-scanner.js';

export interface WeatherEdge {
  market: PolymarketWeatherMarket;
  outcome: PolymarketOutcome;
  forecastProbability: number;
  marketPrice: number;
  edge: number;            // Absolute: forecastProb - marketPrice (e.g., 0.08 = 8 cents)
  edgePct: number;         // Relative: edge / marketPrice * 100 (informational only)
  expectedProfit: number;  // edge * recommendedSize (real dollar expectation)
  kellyFraction: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  hoursUntilResolution: number;
  recommendedSide: 'BUY' | 'SELL';
  recommendedSize: number;
}

interface EdgeConfig {
  minAbsoluteEdge: number;   // Minimum absolute edge to consider (default 0.05 = 5 cents)
  minForecastProb: number;   // Ignore outcomes where forecast < this (default 0.03 = 3%)
  minMarketPrice: number;    // Ignore outcomes priced below this (default 0.02 = 2 cents)
  minExpectedProfit: number; // Minimum expected profit in dollars (default 2)
  maxPositionSize: number;   // Max dollars per outcome (default 500)
  kellyMultiplier: number;   // Fraction of Kelly (default 0.5 = half-Kelly)
  bankroll: number;          // Total bankroll for Kelly sizing
}

const DEFAULT_CONFIG: EdgeConfig = {
  minAbsoluteEdge: 0.05,
  minForecastProb: 0.03,
  minMarketPrice: 0.02,
  minExpectedProfit: 2,
  maxPositionSize: 500,
  kellyMultiplier: 0.5,
  bankroll: 5000,
};

class WeatherEdgeCalculator {
  private config: EdgeConfig;

  constructor(config: Partial<EdgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  calculateEdges(forecast: TemperatureForecast, market: PolymarketWeatherMarket): WeatherEdge[] {
    const edges: WeatherEdge[] = [];

    const forecastMean = market.metric === 'high'
      ? forecast.pointForecastHighF
      : forecast.pointForecastLowF;

    const stdDev = forecast.modelSpreadF;

    // Build probability distribution matching market buckets
    const buckets = market.outcomes.map(o => ({
      label: o.label,
      lowF: o.rangeLowF,
      highF: o.rangeHighF,
    }));

    const distribution = buildTemperatureDistribution(forecastMean, stdDev, buckets);

    for (let i = 0; i < market.outcomes.length; i++) {
      const outcome = market.outcomes[i];
      const forecastProb = distribution[i].probability;
      const marketPrice = outcome.price;

      // Skip dead markets and tail noise
      if (marketPrice <= 0 || marketPrice >= 1) continue;
      if (marketPrice < this.config.minMarketPrice && forecastProb < this.config.minForecastProb) continue;

      const edge = forecastProb - marketPrice;
      const absEdge = Math.abs(edge);

      // Primary filter: absolute edge must be meaningful
      if (absEdge < this.config.minAbsoluteEdge) continue;

      const side: 'BUY' | 'SELL' = edge > 0 ? 'BUY' : 'SELL';
      const edgePct = (edge / marketPrice) * 100;

      const kelly = this.kellyFraction(absEdge, side === 'BUY' ? marketPrice : 1 - marketPrice);
      const confidence = this.scoreConfidence(forecast.hoursUntilTarget, stdDev, market.volume, absEdge);

      const recommendedSize = Math.min(
        this.config.maxPositionSize,
        Math.round(kelly * this.config.bankroll * 100) / 100
      );

      const expectedProfit = absEdge * recommendedSize;

      // Skip if expected profit is too small to bother
      if (expectedProfit < this.config.minExpectedProfit) continue;
      if (recommendedSize < 5) continue;

      edges.push({
        market,
        outcome,
        forecastProbability: forecastProb,
        marketPrice,
        edge,
        edgePct,
        expectedProfit: Math.round(expectedProfit * 100) / 100,
        kellyFraction: kelly,
        confidence,
        hoursUntilResolution: forecast.hoursUntilTarget,
        recommendedSide: side,
        recommendedSize,
      });
    }

    // Sort by expected profit descending (the real metric that matters)
    edges.sort((a, b) => b.expectedProfit - a.expectedProfit);
    return edges;
  }

  private kellyFraction(edge: number, price: number): number {
    // Kelly criterion: f* = (bp - q) / b
    if (price <= 0.01 || price >= 0.99) return 0;

    const b = (1 - price) / price;
    const p = Math.min(0.95, Math.max(0.05, price + edge));
    const q = 1 - p;

    const fullKelly = (b * p - q) / b;
    // Cap at 25% of bankroll even at full Kelly, then apply multiplier
    return Math.max(0, Math.min(0.25, fullKelly) * this.config.kellyMultiplier);
  }

  private scoreConfidence(
    hoursOut: number,
    modelSpread: number,
    volume: number,
    absEdge: number
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    let score = 0;

    // Closer forecasts are more reliable
    if (hoursOut < 12) score += 3;
    else if (hoursOut < 24) score += 2;
    else if (hoursOut < 48) score += 1;

    // Lower model spread = more certain forecast
    if (modelSpread < 2.5) score += 2;
    else if (modelSpread < 4) score += 1;

    // Higher volume = more liquid market, prices are more efficient
    // (so a remaining edge is more meaningful)
    if (volume > 100000) score += 2;
    else if (volume > 50000) score += 1;

    // Larger absolute edge = stronger signal
    if (absEdge > 0.15) score += 2;
    else if (absEdge > 0.08) score += 1;

    if (score >= 7) return 'HIGH';
    if (score >= 4) return 'MEDIUM';
    return 'LOW';
  }

  filterActionable(edges: WeatherEdge[]): WeatherEdge[] {
    return edges.filter(e => {
      if (e.confidence === 'LOW') return false;
      if (e.recommendedSize < 10) return false;
      if (e.expectedProfit < this.config.minExpectedProfit) return false;
      return true;
    });
  }
}

export default WeatherEdgeCalculator;
