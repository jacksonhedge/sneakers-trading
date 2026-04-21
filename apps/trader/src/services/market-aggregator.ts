// Market Aggregator: Unified view of all short-expiry markets across platforms

import PriceFeedService from './price-feed';
import CryptoComMarketsService from './crypto-com-markets';
import RobinhoodMarketsService from './robinhood-markets';
import PortfolioTracker from './portfolio-tracker';

interface AggregatedMarket {
  platform: string;
  market_id: string;
  asset: string;
  outcome: string;
  bid: number;
  ask: number;
  implied_prob: number;
  expiry_seconds: number;
  expires_at: Date;
}

interface CrossPlatformArb {
  id: string;
  asset: string;
  outcome: string;
  buy_platform: string;
  buy_price: number;
  sell_platform: string;
  sell_price: number;
  spread_pct: number;
  roi_pct: number; // After 0.5% fees per trade
  expiry_seconds: number;
  urgency: 'low' | 'medium' | 'high'; // Based on time to expiry
  confidence: number; // 0-1, based on liquidity
  detected_at: Date;
  executed: boolean;
}

interface BestOdds {
  asset: string;
  outcome: string;
  best_platform: string;
  ask_price: number;
  implied_prob: number;
  expiry_seconds: number;
  alternatives: Array<{ platform: string; ask: number }>;
}

class MarketAggregator {
  private priceFeed: PriceFeedService;
  private cryptoCom: CryptoComMarketsService;
  private robinhood: RobinhoodMarketsService;
  private portfolio: PortfolioTracker;
  private allMarkets: AggregatedMarket[] = [];
  private opportunities: Map<string, CrossPlatformArb> = new Map();
  private executedArbs: Set<string> = new Set();

  constructor(
    priceFeed: PriceFeedService,
    cryptoCom: CryptoComMarketsService,
    robinhood: RobinhoodMarketsService,
    portfolio: PortfolioTracker
  ) {
    this.priceFeed = priceFeed;
    this.cryptoCom = cryptoCom;
    this.robinhood = robinhood;
    this.portfolio = portfolio;
  }

  // Aggregate all markets from all platforms
  async aggregateMarkets(): Promise<AggregatedMarket[]> {
    const [cryptoComMarkets, robinhoodMarkets] = await Promise.all([
      this.cryptoCom.fetchMarketsForAssets(['BTC', 'ETH']),
      this.robinhood.fetchBTCMarkets(),
    ]);

    const aggregated: AggregatedMarket[] = [];

    // Add Crypto.com markets
    cryptoComMarkets.forEach((m) => {
      aggregated.push({
        platform: 'crypto.com',
        market_id: m.market_id,
        asset: m.asset,
        outcome: m.outcome,
        bid: m.bid_price,
        ask: m.ask_price,
        implied_prob: m.implied_probability,
        expiry_seconds: m.expiry_time,
        expires_at: m.expires_at,
      });
    });

    // Add Robinhood markets
    robinhoodMarkets.forEach((m) => {
      aggregated.push({
        platform: 'robinhood',
        market_id: m.market_id,
        asset: m.asset,
        outcome: m.outcome,
        bid: m.bid_price,
        ask: m.ask_price,
        implied_prob: m.implied_probability,
        expiry_seconds: m.expiry_time,
        expires_at: m.expires_at,
      });
    });

    this.allMarkets = aggregated;
    return aggregated;
  }

  // Detect cross-platform arbitrage opportunities
  async detectArbitrage(): Promise<CrossPlatformArb[]> {
    const markets = this.allMarkets;
    const opportunities: CrossPlatformArb[] = [];

    // Group by outcome
    const grouped = new Map<string, AggregatedMarket[]>();
    markets.forEach((m) => {
      const key = `${m.asset}-${m.outcome}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(m);
    });

    // Find spreads within each outcome
    grouped.forEach((marketList, key) => {
      if (marketList.length < 2) return;

      // Find cheapest ask (best to buy)
      const bestBuy = marketList.reduce((a, b) => (a.ask < b.ask ? a : b));

      // Find best bid (best to sell)
      const bestSell = marketList.reduce((a, b) => (a.bid > b.bid ? a : b));

      if (bestBuy.platform !== bestSell.platform && bestBuy.ask < bestSell.bid) {
        const spreadPct = ((bestSell.bid - bestBuy.ask) / bestBuy.ask) * 100;
        const roiPct = spreadPct - 1.0; // -1% for fees (0.5% per side)

        if (roiPct > 0.5) {
          // Only flag if ROI > 0.5% after fees
          const arbKey = `${key}-${bestBuy.platform}-${bestSell.platform}`;

          if (!this.executedArbs.has(arbKey)) {
            const arb: CrossPlatformArb = {
              id: arbKey,
              asset: bestBuy.asset,
              outcome: bestBuy.outcome,
              buy_platform: bestBuy.platform,
              buy_price: bestBuy.ask,
              sell_platform: bestSell.platform,
              sell_price: bestSell.bid,
              spread_pct: spreadPct,
              roi_pct: roiPct,
              expiry_seconds: Math.min(bestBuy.expiry_seconds, bestSell.expiry_seconds),
              urgency: this.calculateUrgency(
                Math.min(bestBuy.expiry_seconds, bestSell.expiry_seconds)
              ),
              confidence: this.calculateConfidence(marketList),
              detected_at: new Date(),
              executed: false,
            };

            opportunities.push(arb);
            this.opportunities.set(arbKey, arb);
          }
        }
      }
    });

    return opportunities.sort((a, b) => b.roi_pct - a.roi_pct);
  }

  // Find best odds (lowest ask) for each outcome
  getBestOdds(): BestOdds[] {
    const grouped = new Map<string, AggregatedMarket[]>();
    this.allMarkets.forEach((m) => {
      const key = `${m.asset}-${m.outcome}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(m);
    });

    const bestOdds: BestOdds[] = [];

    grouped.forEach((marketList, key) => {
      const best = marketList.reduce((a, b) => (a.ask < b.ask ? a : b));

      bestOdds.push({
        asset: best.asset,
        outcome: best.outcome,
        best_platform: best.platform,
        ask_price: best.ask,
        implied_prob: best.implied_prob,
        expiry_seconds: best.expiry_seconds,
        alternatives: marketList
          .filter((m) => m.platform !== best.platform)
          .map((m) => ({ platform: m.platform, ask: m.ask })),
      });
    });

    return bestOdds.sort((a, b) => a.ask_price - b.ask_price);
  }

  // Get top opportunities ranked by ROI
  getTopOpportunities(limit: number = 10): CrossPlatformArb[] {
    return Array.from(this.opportunities.values())
      .filter((opp) => !opp.executed)
      .sort((a, b) => b.roi_pct - a.roi_pct)
      .slice(0, limit);
  }

  // Mark opportunity as executed
  markAsExecuted(arbKey: string): void {
    this.executedArbs.add(arbKey);
    const opp = this.opportunities.get(arbKey);
    if (opp) opp.executed = true;
  }

  // Calculate urgency based on time to expiry
  private calculateUrgency(expirySeconds: number): 'low' | 'medium' | 'high' {
    if (expirySeconds < 5 * 60) return 'high'; // < 5 min
    if (expirySeconds < 15 * 60) return 'medium'; // < 15 min
    return 'low';
  }

  // Calculate confidence based on market diversity
  private calculateConfidence(markets: AggregatedMarket[]): number {
    if (markets.length < 2) return 0.3;
    if (markets.length >= 3) return 0.9;
    return 0.6;
  }

  // Filter opportunities by minimum ROI
  filterByMinROI(opportunities: CrossPlatformArb[], minROI: number = 1.0): CrossPlatformArb[] {
    return opportunities.filter((opp) => opp.roi_pct >= minROI);
  }

  // Filter by time to expiry (avoid super tight expirations)
  filterByTimeToExpiry(
    opportunities: CrossPlatformArb[],
    minSeconds: number = 30
  ): CrossPlatformArb[] {
    return opportunities.filter((opp) => opp.expiry_seconds >= minSeconds);
  }

  // Get aggregated market statistics
  getStats() {
    return {
      total_markets: this.allMarkets.length,
      by_platform: {
        crypto_com: this.allMarkets.filter((m) => m.platform === 'crypto.com').length,
        robinhood: this.allMarkets.filter((m) => m.platform === 'robinhood').length,
      },
      by_asset: {
        BTC: this.allMarkets.filter((m) => m.asset === 'BTC').length,
        ETH: this.allMarkets.filter((m) => m.asset === 'ETH').length,
      },
      total_opportunities: this.opportunities.size,
      executed: this.executedArbs.size,
      avg_roi_pct: (
        Array.from(this.opportunities.values()).reduce((sum, opp) => sum + opp.roi_pct, 0) /
          this.opportunities.size || 0
      ).toFixed(2),
      max_roi_pct: Math.max(
        0,
        ...Array.from(this.opportunities.values()).map((opp) => opp.roi_pct)
      ).toFixed(2),
    };
  }

  // Start continuous scanning
  async startScanning(intervalMs: number = 10000): Promise<void> {
    console.log('🔍 Market aggregator scanning started...');
    setInterval(async () => {
      try {
        await this.aggregateMarkets();
        const arbs = await this.detectArbitrage();

        if (arbs.length > 0) {
          console.log(`\n🎯 Found ${arbs.length} arbitrage opportunities`);
          arbs.slice(0, 3).forEach((arb) => {
            console.log(`  ${arb.asset} ${arb.outcome}`);
            console.log(`    Buy on ${arb.buy_platform} @ ${arb.buy_price.toFixed(4)}`);
            console.log(`    Sell on ${arb.sell_platform} @ ${arb.sell_price.toFixed(4)}`);
            console.log(`    ROI: ${arb.roi_pct.toFixed(2)}% | Urgency: ${arb.urgency}`);
          });
        }
      } catch (error) {
        console.error('Aggregation error:', error);
      }
    }, intervalMs);
  }
}

export default MarketAggregator;
