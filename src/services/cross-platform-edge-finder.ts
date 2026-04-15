// Cross-Platform Edge Finder
// Core value engine: compares our weather ensemble's probability distribution against
// market prices on both Kalshi and Polymarket to find mispriced outcomes.
// Also detects cross-platform arbitrage where the same outcome is priced differently.

import { TemperatureForecast, buildTemperatureDistribution, WEATHER_LOCATIONS } from './noaa-weather-service.js';
import { KalshiWeatherMarket, KalshiOutcome } from './kalshi-weather-scanner.js';
import { PolymarketWeatherMarket, PolymarketOutcome } from './polymarket-weather-scanner.js';

export interface CrossPlatformEdge {
  id: string;
  platform: 'kalshi' | 'polymarket';
  location: string;
  targetDate: string;
  outcomeLabel: string;
  tokenId: string;           // YES token ID (for Polymarket CLOB execution)
  conditionId: string;       // Market condition ID
  tempRangeLowF: number;
  tempRangeHighF: number;

  // Our model
  forecastMeanF: number;
  forecastSpreadF: number;
  modelProbability: number;

  // Market pricing
  marketPrice: number;   // implied probability from market
  marketBid: number;     // best bid (kalshi) or price (poly)
  marketAsk: number;     // best ask (kalshi) or 1-price (poly)

  // Edge
  edge: number;          // modelProbability - marketPrice
  edgePct: number;       // edge / marketPrice * 100
  direction: 'BUY_YES' | 'BUY_NO';

  // Sizing
  kellyFraction: number;
  recommendedSize: number;   // dollars
  expectedProfit: number;    // edge * size

  // Metadata
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  hoursUntilResolution: number;
  volume: number;

  // Data source signals that inform this edge
  supportingSignals: string[];
}

export interface ArbitrageOpportunity {
  location: string;
  targetDate: string;
  description: string;

  // Same outcome priced differently across platforms
  kalshiPrice: number;
  polymarketPrice: number;
  priceDifference: number;   // absolute

  // Our model's view
  modelProbability: number;

  // Trade: buy cheap, sell expensive
  buyPlatform: 'kalshi' | 'polymarket';
  sellPlatform: 'kalshi' | 'polymarket';
  profitPerDollar: number;   // guaranteed profit if arb

  // Is this a true arbitrage (riskless) or just a pricing discrepancy?
  isRisklessArb: boolean;    // true if sum of complements < 1 on either platform
}

export interface EdgeSummary {
  totalEdges: number;
  kalshiEdges: number;
  polymarketEdges: number;
  arbitrageOpps: number;
  bestEdge: CrossPlatformEdge | null;
  totalExpectedProfit: number;
  topLocations: Array<{ location: string; edgeCount: number; expectedProfit: number }>;
}

interface EdgeFinderConfig {
  bankroll: number;           // default 5000
  kellyMultiplier: number;    // default 0.5 (half-Kelly)
  minEdge: number;            // default 0.06 (6 cents)
  maxPositionSize: number;    // default 500
  minExpectedProfit: number;  // default 2
}

const DEFAULT_CONFIG: EdgeFinderConfig = {
  bankroll: 5000,
  kellyMultiplier: 0.5,
  minEdge: 0.06,
  maxPositionSize: 500,
  minExpectedProfit: 2,
};

// Minimum price difference (in cents) to flag cross-platform discrepancy
const MIN_CROSS_PLATFORM_DIFF = 0.05;

class CrossPlatformEdgeFinder {
  private config: EdgeFinderConfig;

  constructor(config: Partial<EdgeFinderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Primary edge-finding: compares forecast vs Kalshi + Polymarket for a single
  // location/date combination represented by the given TemperatureForecast.
  // ---------------------------------------------------------------------------
  findEdges(
    forecast: TemperatureForecast,
    kalshiMarkets: KalshiWeatherMarket[],
    polymarketMarkets: PolymarketWeatherMarket[],
    signals: string[] = [],
  ): CrossPlatformEdge[] {
    const edges: CrossPlatformEdge[] = [];

    const location = forecast.location.name;
    const targetDate = forecast.targetDate;
    const forecastMeanF = forecast.pointForecastHighF;
    const forecastSpreadF = forecast.modelSpreadF;
    const hoursOut = forecast.hoursUntilTarget;

    // --- Kalshi ---
    const relevantKalshi = kalshiMarkets.filter(
      m => m.location === location && m.targetDate === targetDate && m.active,
    );

    for (const market of relevantKalshi) {
      const buckets = market.outcomes.map(o => ({
        label: o.label,
        lowF: o.tempLowF,
        highF: o.tempHighF,
      }));

      const distribution = buildTemperatureDistribution(forecastMeanF, forecastSpreadF, buckets);

      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        const modelProbability = distribution[i].probability;
        const marketPrice = outcome.yesMid;

        // Skip illiquid / boundary prices
        if (marketPrice <= 0.01 || marketPrice >= 0.99) continue;

        const edge = modelProbability - marketPrice;
        const absEdge = Math.abs(edge);
        if (absEdge < this.config.minEdge) continue;

        const direction: 'BUY_YES' | 'BUY_NO' = edge > 0 ? 'BUY_YES' : 'BUY_NO';

        // For Kelly: from the perspective of the side we're buying
        const entryPrice = direction === 'BUY_YES' ? outcome.yesAsk : outcome.noBid ?? (1 - outcome.yesBid);
        const effectivePrice = direction === 'BUY_YES' ? marketPrice : 1 - marketPrice;
        const effectiveProb = direction === 'BUY_YES' ? modelProbability : 1 - modelProbability;

        const kelly = this.kellyFraction(effectiveProb, effectivePrice);
        const recommendedSize = Math.min(
          this.config.maxPositionSize,
          Math.round(kelly * this.config.bankroll * 100) / 100,
        );

        if (recommendedSize < 5) continue;

        const expectedProfit = absEdge * recommendedSize;
        if (expectedProfit < this.config.minExpectedProfit) continue;

        const confidence = this.scoreConfidence(hoursOut, forecastSpreadF, market.totalVolume, absEdge);
        const edgePct = (edge / marketPrice) * 100;

        const id = `kalshi:${market.eventTicker}:${outcome.ticker}`;

        edges.push({
          id,
          platform: 'kalshi',
          location,
          targetDate,
          outcomeLabel: outcome.label,
          tokenId: outcome.ticker,
          conditionId: market.eventTicker,
          tempRangeLowF: outcome.tempLowF,
          tempRangeHighF: outcome.tempHighF,
          forecastMeanF,
          forecastSpreadF,
          modelProbability,
          marketPrice,
          marketBid: outcome.yesBid,
          marketAsk: outcome.yesAsk,
          edge,
          edgePct: Math.round(edgePct * 100) / 100,
          direction,
          kellyFraction: Math.round(kelly * 10000) / 10000,
          recommendedSize,
          expectedProfit: Math.round(expectedProfit * 100) / 100,
          confidence,
          hoursUntilResolution: hoursOut,
          volume: outcome.volume,
          supportingSignals: [...signals],
        });
      }
    }

    // --- Polymarket ---
    const relevantPoly = polymarketMarkets.filter(
      m => m.location === location && m.targetDate === targetDate && m.active,
    );

    for (const market of relevantPoly) {
      const buckets = market.outcomes.map(o => ({
        label: o.label,
        lowF: o.rangeLowF,
        highF: o.rangeHighF,
      }));

      const distribution = buildTemperatureDistribution(forecastMeanF, forecastSpreadF, buckets);

      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        const modelProbability = distribution[i].probability;
        const marketPrice = outcome.price; // yesPrice

        if (marketPrice <= 0.01 || marketPrice >= 0.99) continue;

        const edge = modelProbability - marketPrice;
        const absEdge = Math.abs(edge);
        if (absEdge < this.config.minEdge) continue;

        const direction: 'BUY_YES' | 'BUY_NO' = edge > 0 ? 'BUY_YES' : 'BUY_NO';

        const effectivePrice = direction === 'BUY_YES' ? marketPrice : 1 - marketPrice;
        const effectiveProb = direction === 'BUY_YES' ? modelProbability : 1 - modelProbability;

        const kelly = this.kellyFraction(effectiveProb, effectivePrice);
        const recommendedSize = Math.min(
          this.config.maxPositionSize,
          Math.round(kelly * this.config.bankroll * 100) / 100,
        );

        if (recommendedSize < 5) continue;

        const expectedProfit = absEdge * recommendedSize;
        if (expectedProfit < this.config.minExpectedProfit) continue;

        const confidence = this.scoreConfidence(hoursOut, forecastSpreadF, market.volume, absEdge);
        const edgePct = (edge / marketPrice) * 100;

        // Polymarket is binary: bid = price, ask = 1 - noPrice ≈ price (CLOB nuance simplified)
        const id = `polymarket:${outcome.conditionId}:${outcome.label}`;

        edges.push({
          id,
          platform: 'polymarket',
          location,
          targetDate,
          outcomeLabel: outcome.label,
          tokenId: outcome.tokenId,
          conditionId: outcome.conditionId,
          tempRangeLowF: outcome.rangeLowF,
          tempRangeHighF: outcome.rangeHighF,
          forecastMeanF,
          forecastSpreadF,
          modelProbability,
          marketPrice,
          marketBid: marketPrice,
          marketAsk: 1 - outcome.noPrice,
          edge,
          edgePct: Math.round(edgePct * 100) / 100,
          direction,
          kellyFraction: Math.round(kelly * 10000) / 10000,
          recommendedSize,
          expectedProfit: Math.round(expectedProfit * 100) / 100,
          confidence,
          hoursUntilResolution: hoursOut,
          volume: market.volume,
          supportingSignals: [...signals],
        });
      }
    }

    // Sort by expected profit descending
    edges.sort((a, b) => b.expectedProfit - a.expectedProfit);
    return edges;
  }

  // ---------------------------------------------------------------------------
  // Arbitrage detection: match markets across platforms by location + targetDate,
  // then compare prices for equivalent temperature ranges.
  // Also checks for within-platform Kalshi bracket sum anomalies.
  // ---------------------------------------------------------------------------
  findArbitrage(
    kalshiMarkets: KalshiWeatherMarket[],
    polymarketMarkets: PolymarketWeatherMarket[],
  ): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    // Group Kalshi markets by location+date
    const kalshiByKey = new Map<string, KalshiWeatherMarket>();
    for (const m of kalshiMarkets) {
      if (!m.active) continue;
      kalshiByKey.set(`${m.location}::${m.targetDate}`, m);
    }

    // Group Polymarket markets by location+date
    const polyByKey = new Map<string, PolymarketWeatherMarket[]>();
    for (const m of polymarketMarkets) {
      if (!m.active) continue;
      const key = `${m.location}::${m.targetDate}`;
      if (!polyByKey.has(key)) polyByKey.set(key, []);
      polyByKey.get(key)!.push(m);
    }

    // --- Cross-platform comparison ---
    for (const [key, kalshiMarket] of kalshiByKey) {
      const polyMarkets = polyByKey.get(key);
      if (!polyMarkets || polyMarkets.length === 0) continue;

      const [location, targetDate] = key.split('::');

      for (const polyMarket of polyMarkets) {
        // Try to match each Kalshi bracket to a Polymarket outcome by temperature range
        for (const ko of kalshiMarket.outcomes) {
          for (const po of polyMarket.outcomes) {
            // Consider it a match if ranges overlap significantly
            const overlapLow = Math.max(ko.tempLowF, po.rangeLowF);
            const overlapHigh = Math.min(ko.tempHighF, po.rangeHighF);
            const koWidth = ko.tempHighF - ko.tempLowF;
            const poWidth = po.rangeHighF - po.rangeLowF;
            const overlapWidth = Math.max(0, overlapHigh - overlapLow);

            // Require ≥ 80% overlap relative to the smaller bracket
            const minWidth = Math.min(koWidth, poWidth);
            if (minWidth <= 0 || overlapWidth / minWidth < 0.8) continue;

            const kalshiPrice = ko.yesMid;
            const polyPrice = po.price; // yesPrice
            const priceDiff = Math.abs(kalshiPrice - polyPrice);

            if (priceDiff < MIN_CROSS_PLATFORM_DIFF) continue;

            const buyPlatform: 'kalshi' | 'polymarket' = kalshiPrice < polyPrice ? 'kalshi' : 'polymarket';
            const sellPlatform: 'kalshi' | 'polymarket' = buyPlatform === 'kalshi' ? 'polymarket' : 'kalshi';

            // Riskless arb: if buying YES on cheap platform + NO on expensive platform costs < $1
            // YES on cheap + NO on expensive = buyPrice + (1 - sellPrice)
            const cheapPrice = buyPlatform === 'kalshi' ? kalshiPrice : polyPrice;
            const expensivePrice = sellPlatform === 'kalshi' ? kalshiPrice : polyPrice;
            const combinedCost = cheapPrice + (1 - expensivePrice);
            const isRisklessArb = combinedCost < 1.0;
            const profitPerDollar = isRisklessArb ? (1 - combinedCost) : priceDiff;

            opportunities.push({
              location,
              targetDate,
              description: `${ko.label} (Kalshi ${(kalshiPrice * 100).toFixed(1)}¢ vs Poly ${(polyPrice * 100).toFixed(1)}¢)`,
              kalshiPrice,
              polymarketPrice: polyPrice,
              priceDifference: Math.round(priceDiff * 10000) / 10000,
              modelProbability: 0, // filled in by caller if needed; no forecast required for pure arb
              buyPlatform,
              sellPlatform,
              profitPerDollar: Math.round(profitPerDollar * 10000) / 10000,
              isRisklessArb,
            });
          }
        }

        // --- Within-platform Kalshi bracket sum check ---
        // If all bracket prices sum to significantly != 1.0, something is mispriced.
        const bracketSum = kalshiMarket.outcomes.reduce((sum, o) => sum + o.yesMid, 0);
        const deviation = Math.abs(bracketSum - 1.0);
        if (deviation > 0.08) {
          // Find the most over/under-priced bracket relative to fair share
          const n = kalshiMarket.outcomes.length;
          const fairShare = 1.0 / n;
          let worstOutcome: KalshiOutcome | null = null;
          let worstDeviation = 0;
          for (const o of kalshiMarket.outcomes) {
            const d = Math.abs(o.yesMid - fairShare);
            if (d > worstDeviation) {
              worstDeviation = d;
              worstOutcome = o;
            }
          }

          if (worstOutcome) {
            // Represent as a within-Kalshi "arb" (both platforms are kalshi)
            opportunities.push({
              location,
              targetDate,
              description: `Kalshi bracket sum anomaly: sum=${bracketSum.toFixed(3)} (expected 1.0), worst=${worstOutcome.label}`,
              kalshiPrice: bracketSum,
              polymarketPrice: 1.0,
              priceDifference: Math.round(deviation * 10000) / 10000,
              modelProbability: 0,
              buyPlatform: 'kalshi',
              sellPlatform: 'kalshi',
              profitPerDollar: Math.round(deviation * 10000) / 10000,
              isRisklessArb: bracketSum < 1.0, // if sum < 1 you can buy all brackets for < $1 payout
            });
          }
        }
      }
    }

    // Sort by profitPerDollar descending, riskless first
    opportunities.sort((a, b) => {
      if (a.isRisklessArb !== b.isRisklessArb) return a.isRisklessArb ? -1 : 1;
      return b.profitPerDollar - a.profitPerDollar;
    });

    return opportunities;
  }

  // ---------------------------------------------------------------------------
  // Top-level: run findEdges for all location/date combinations in the forecast
  // map, then run findArbitrage, and return an EdgeSummary.
  // ---------------------------------------------------------------------------
  findAllEdges(
    forecastMap: Map<string, TemperatureForecast>,
    kalshiMarkets: KalshiWeatherMarket[],
    polymarketMarkets: PolymarketWeatherMarket[],
    signalsMap?: Map<string, string[]>,
  ): { edges: CrossPlatformEdge[]; arbitrage: ArbitrageOpportunity[]; summary: EdgeSummary } {
    const allEdges: CrossPlatformEdge[] = [];

    for (const [key, forecast] of forecastMap) {
      const signals = signalsMap?.get(key) ?? [];
      const edges = this.findEdges(forecast, kalshiMarkets, polymarketMarkets, signals);
      allEdges.push(...edges);
    }

    // Sort all edges by expected profit
    allEdges.sort((a, b) => b.expectedProfit - a.expectedProfit);

    const arbitrage = this.findArbitrage(kalshiMarkets, polymarketMarkets);

    // Build summary
    const kalshiEdges = allEdges.filter(e => e.platform === 'kalshi').length;
    const polymarketEdges = allEdges.filter(e => e.platform === 'polymarket').length;
    const totalExpectedProfit = allEdges.reduce((sum, e) => sum + e.expectedProfit, 0);

    // Aggregate by location
    const locationMap = new Map<string, { edgeCount: number; expectedProfit: number }>();
    for (const e of allEdges) {
      const existing = locationMap.get(e.location) ?? { edgeCount: 0, expectedProfit: 0 };
      locationMap.set(e.location, {
        edgeCount: existing.edgeCount + 1,
        expectedProfit: existing.expectedProfit + e.expectedProfit,
      });
    }

    const topLocations = Array.from(locationMap.entries())
      .map(([location, stats]) => ({ location, ...stats }))
      .sort((a, b) => b.expectedProfit - a.expectedProfit)
      .slice(0, 5);

    const summary: EdgeSummary = {
      totalEdges: allEdges.length,
      kalshiEdges,
      polymarketEdges,
      arbitrageOpps: arbitrage.length,
      bestEdge: allEdges[0] ?? null,
      totalExpectedProfit: Math.round(totalExpectedProfit * 100) / 100,
      topLocations,
    };

    return { edges: allEdges, arbitrage, summary };
  }

  // ---------------------------------------------------------------------------
  // Confidence scoring — mirrors the heuristic from weather-edge-calculator.ts
  // but uses the thresholds specified in the product brief.
  // ---------------------------------------------------------------------------
  scoreConfidence(
    hoursOut: number,
    modelSpread: number,
    volume: number,
    edge: number,
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    // HIGH: all four criteria met
    if (hoursOut < 12 && modelSpread < 2.5 && volume > 50_000 && edge > 0.10) return 'HIGH';

    // MEDIUM: time and spread and edge thresholds
    if (hoursOut < 24 && modelSpread < 4 && edge > 0.06) return 'MEDIUM';

    return 'LOW';
  }

  // ---------------------------------------------------------------------------
  // Kelly criterion: f* = (bp - q) / b, capped at 25% of bankroll then scaled
  // by kellyMultiplier (default 0.5 for half-Kelly).
  // p = model probability of winning, price = cost per contract (implied prob).
  // ---------------------------------------------------------------------------
  private kellyFraction(modelProb: number, price: number): number {
    if (price <= 0.01 || price >= 0.99) return 0;

    const b = (1 - price) / price;   // net odds
    const p = Math.min(0.95, Math.max(0.05, modelProb));
    const q = 1 - p;

    const fullKelly = (b * p - q) / b;
    // Cap at 25% of bankroll, then apply fractional multiplier
    return Math.max(0, Math.min(0.25, fullKelly) * this.config.kellyMultiplier);
  }
}

export { CrossPlatformEdgeFinder };
export default CrossPlatformEdgeFinder;
