// Crypto.com Markets Aggregator: Fetch short-expiry prediction markets

import fetch from 'node-fetch';
import crypto from 'crypto';

interface CryptoComMarket {
  market_id: string;
  asset: string;
  outcome: string;
  bid_price: number;
  ask_price: number;
  implied_probability: number;
  expiry_time: number; // seconds until expiry
  expires_at: Date;
}

class CryptoComMarketsService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = 'https://api.crypto.com/v1';
  private markets: Map<string, CryptoComMarket> = new Map();

  constructor(apiKey: string, apiSecret?: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret || '';
  }

  // Generate signature for authenticated requests
  private generateSignature(method: string, path: string, body: string = ''): string {
    const timestamp = Date.now();
    const sigPayload = `${method}${path}${body}${timestamp}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(sigPayload)
      .digest('hex');
    return signature;
  }

  // Fetch all markets for an asset (e.g., BTC)
  async fetchMarkets(asset: string = 'BTC'): Promise<CryptoComMarket[]> {
    try {
      // Crypto.com Exchange API endpoint for markets
      const path = `/markets?asset=${asset}`;
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Crypto.com API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json() as any;

      // Parse markets and filter for short-expiry only
      const markets = data.markets || [];
      return markets
        .filter((m: any) => {
          const expiryTime = m.expires_at ? new Date(m.expires_at).getTime() - Date.now() : 0;
          return expiryTime > 0 && expiryTime < 60 * 60 * 1000; // < 1 hour
        })
        .map((m: any) => ({
          market_id: m.id,
          asset: asset,
          outcome: m.outcome,
          bid_price: parseFloat(m.bid),
          ask_price: parseFloat(m.ask),
          implied_probability: this.calculateImpliedProbability(m),
          expiry_time: Math.floor((new Date(m.expires_at).getTime() - Date.now()) / 1000),
          expires_at: new Date(m.expires_at),
        }));
    } catch (error) {
      console.error('Crypto.com fetch error:', error);
      return [];
    }
  }

  // Calculate implied probability from bid/ask spread
  private calculateImpliedProbability(market: any): number {
    if (market.bid && market.ask) {
      const midPrice = (parseFloat(market.bid) + parseFloat(market.ask)) / 2;
      return Math.max(0, Math.min(1, midPrice)); // Clamp 0-1
    }
    return 0.5; // Default 50%
  }

  // Get markets for multiple assets
  async fetchMarketsForAssets(assets: string[] = ['BTC', 'ETH']): Promise<CryptoComMarket[]> {
    const allMarkets: CryptoComMarket[] = [];

    for (const asset of assets) {
      const markets = await this.fetchMarkets(asset);
      allMarkets.push(...markets);
    }

    return allMarkets;
  }

  // Filter markets by time to expiry
  filterByExpiry(
    markets: CryptoComMarket[],
    minSeconds: number = 60,
    maxSeconds: number = 3600
  ): CryptoComMarket[] {
    return markets.filter((m) => m.expiry_time >= minSeconds && m.expiry_time <= maxSeconds);
  }

  // Get bid-ask spread as percentage
  calculateSpread(market: CryptoComMarket): number {
    const spread = market.ask_price - market.bid_price;
    const midPrice = (market.bid_price + market.ask_price) / 2;
    return (spread / midPrice) * 100;
  }

  // Group markets by outcome (for arbitrage detection)
  groupByOutcome(
    markets: CryptoComMarket[]
  ): Map<string, CryptoComMarket[]> {
    const grouped = new Map<string, CryptoComMarket[]>();

    markets.forEach((market) => {
      const key = `${market.asset}-${market.outcome}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(market);
    });

    return grouped;
  }

  // Detect best odds (highest implied probability / lowest odds) for outcome
  findBestOdds(
    markets: CryptoComMarket[],
    asset: string,
    outcome: string
  ): CryptoComMarket | null {
    const matching = markets.filter((m) => m.asset === asset && m.outcome === outcome);

    if (matching.length === 0) return null;

    // Best odds = lowest ask price (cheapest to buy Yes)
    return matching.reduce((best, current) =>
      current.ask_price < best.ask_price ? current : best
    );
  }

  // Detect internal arbitrage (within Crypto.com, multiple outcomes)
  detectInternalArbitrage(
    markets: CryptoComMarket[]
  ): Array<{ outcome_a: string; outcome_b: string; arb_pct: number; markets: CryptoComMarket[] }> {
    const opportunities: Array<any> = [];
    const grouped = this.groupByOutcome(markets);

    // For binary outcomes (Yes/No), check if probabilities add up to > 1 (arbitrage)
    grouped.forEach((marketList, key) => {
      if (marketList.length >= 2) {
        const probs = marketList.map((m) => m.implied_probability);
        const sumProbs = probs.reduce((a, b) => a + b, 0);

        if (sumProbs > 1.0) {
          opportunities.push({
            outcome_a: marketList[0].outcome,
            outcome_b: marketList[1].outcome,
            arb_pct: ((sumProbs - 1.0) * 100).toFixed(2),
            markets: marketList,
            expiry_time: marketList[0].expiry_time,
          });
        }
      }
    });

    return opportunities;
  }

  // Get real-time market snapshot for display
  getMarketSnapshot(markets: CryptoComMarket[], asset: string) {
    const assetMarkets = markets.filter((m) => m.asset === asset);
    return {
      asset,
      total_markets: assetMarkets.length,
      avg_expiry_seconds: Math.round(
        assetMarkets.reduce((sum, m) => sum + m.expiry_time, 0) / assetMarkets.length || 0
      ),
      markets: assetMarkets.map((m) => ({
        outcome: m.outcome,
        bid: m.bid_price.toFixed(4),
        ask: m.ask_price.toFixed(4),
        spread_pct: this.calculateSpread(m).toFixed(2),
        implied_prob: (m.implied_probability * 100).toFixed(1),
        expires_in_seconds: m.expiry_time,
      })),
    };
  }
}

export default CryptoComMarketsService;
