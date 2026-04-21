// Robinhood Markets Service: Fetch 1-hour Bitcoin prediction markets

import fetch from 'node-fetch';

interface RobinhoodMarket {
  market_id: string;
  asset: string;
  outcome: string;
  bid_price: number;
  ask_price: number;
  implied_probability: number;
  expiry_time: number; // seconds until expiry
  expires_at: Date;
  volume: number;
}

class RobinhoodMarketsService {
  private apiKey: string;
  private baseUrl = 'https://api.robinhood.com/v1';
  private markets: Map<string, RobinhoodMarket> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Fetch BTC markets from Robinhood (1-hour expiries)
  async fetchBTCMarkets(): Promise<RobinhoodMarket[]> {
    try {
      const response = await fetch(`${this.baseUrl}/markets?asset=BTC&category=prediction`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Robinhood API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as any;
      const markets = data.results || [];

      // Filter for 1-hour expiry markets (most liquid)
      return markets
        .filter((m: any) => {
          const expiryTime = m.expires_at ? new Date(m.expires_at).getTime() - Date.now() : 0;
          // Only return markets expiring in 1-3 hours
          return expiryTime > 0 && expiryTime < 3 * 60 * 60 * 1000;
        })
        .map((m: any) => ({
          market_id: m.id,
          asset: 'BTC',
          outcome: m.outcome, // e.g., "BTC above $100k", "Yes", "No"
          bid_price: parseFloat(m.bid),
          ask_price: parseFloat(m.ask),
          implied_probability: this.calculateImpliedProbability(m),
          expiry_time: Math.floor((new Date(m.expires_at).getTime() - Date.now()) / 1000),
          expires_at: new Date(m.expires_at),
          volume: parseFloat(m.volume || 0),
        }));
    } catch (error) {
      console.error('Robinhood fetch error:', error);
      return [];
    }
  }

  // Calculate implied probability from bid/ask
  private calculateImpliedProbability(market: any): number {
    if (market.bid && market.ask) {
      const midPrice = (parseFloat(market.bid) + parseFloat(market.ask)) / 2;
      return Math.max(0, Math.min(1, midPrice));
    }
    return 0.5;
  }

  // Filter markets by minimum volume (liquidity check)
  filterByVolume(markets: RobinhoodMarket[], minVolume: number = 1000): RobinhoodMarket[] {
    return markets.filter((m) => m.volume >= minVolume);
  }

  // Sort by expiry time (find most urgent markets)
  sortByExpiryTime(markets: RobinhoodMarket[]): RobinhoodMarket[] {
    return [...markets].sort((a, b) => a.expiry_time - b.expiry_time);
  }

  // Get markets sorted by liquidity (highest volume first)
  sortByVolume(markets: RobinhoodMarket[]): RobinhoodMarket[] {
    return [...markets].sort((a, b) => b.volume - a.volume);
  }

  // Calculate bid-ask spread
  calculateSpread(market: RobinhoodMarket): number {
    const spread = market.ask_price - market.bid_price;
    const midPrice = (market.bid_price + market.ask_price) / 2;
    return (spread / midPrice) * 100;
  }

  // Find best odds (lowest ask price for buying Yes/No outcome)
  findBestOdds(markets: RobinhoodMarket[], outcome: string): RobinhoodMarket | null {
    const matching = markets.filter((m) => m.outcome === outcome);

    if (matching.length === 0) return null;

    // Best odds = lowest ask price
    return matching.reduce((best, current) =>
      current.ask_price < best.ask_price ? current : best
    );
  }

  // Get market snapshot for display
  getMarketSnapshot(markets: RobinhoodMarket[]) {
    return {
      total_markets: markets.length,
      total_volume: markets.reduce((sum, m) => sum + m.volume, 0).toFixed(2),
      avg_expiry_minutes: Math.round(
        markets.reduce((sum, m) => sum + m.expiry_time, 0) / markets.length / 60 || 0
      ),
      markets: markets.map((m) => ({
        outcome: m.outcome,
        bid: m.bid_price.toFixed(4),
        ask: m.ask_price.toFixed(4),
        spread_pct: this.calculateSpread(m).toFixed(2),
        implied_prob: (m.implied_probability * 100).toFixed(1),
        expires_in_seconds: m.expiry_time,
        volume: m.volume.toFixed(2),
      })),
    };
  }

  // Detect opportunities with high volume (easier to fill)
  getHighLiquidityOpportunities(
    markets: RobinhoodMarket[],
    minVolume: number = 5000
  ): RobinhoodMarket[] {
    return this.sortByVolume(this.filterByVolume(markets, minVolume));
  }

  // Group markets by outcome
  groupByOutcome(markets: RobinhoodMarket[]): Map<string, RobinhoodMarket[]> {
    const grouped = new Map<string, RobinhoodMarket[]>();

    markets.forEach((market) => {
      if (!grouped.has(market.outcome)) {
        grouped.set(market.outcome, []);
      }
      grouped.get(market.outcome)!.push(market);
    });

    return grouped;
  }

  // Detect internal arbitrage within Robinhood (complementary outcomes)
  detectInternalArbitrage(markets: RobinhoodMarket[]): any[] {
    const opportunities: any[] = [];
    const grouped = this.groupByOutcome(markets);

    // For binary outcomes (Yes/No), check if probabilities sum to > 1
    grouped.forEach((marketList, outcome) => {
      if (marketList.length >= 2) {
        const minAsk = Math.min(...marketList.map((m) => m.ask_price));
        const maxBid = Math.max(...marketList.map((m) => m.bid_price));

        // Arbitrage exists if min ask < max bid (can buy cheap, sell dear)
        if (minAsk < maxBid) {
          opportunities.push({
            outcome,
            buy_at: minAsk.toFixed(4),
            sell_at: maxBid.toFixed(4),
            spread_pct: (((maxBid - minAsk) / minAsk) * 100).toFixed(2),
            expiry_time: marketList[0].expiry_time,
            markets: marketList.length,
          });
        }
      }
    });

    return opportunities;
  }
}

export default RobinhoodMarketsService;
