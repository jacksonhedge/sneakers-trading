// Prediction Market Aggregator: Find arbitrage + near-expiration value plays

import fetch from 'node-fetch';

interface PredictionMarket {
  platform: string;
  market_id: string;
  asset: string;
  outcome: string;
  yes_price: number;
  no_price: number;
  yes_liquidity: number;
  no_liquidity: number;
  time_to_expiry_seconds: number;
  expires_at: Date;
  volume_24h: number;
}

interface ArbOpportunity {
  id: string;
  asset: string;
  outcome: string;
  buy_platform: string;
  buy_price: number;
  buy_side: 'YES' | 'NO';
  sell_platform: string;
  sell_price: number;
  sell_side: 'YES' | 'NO';
  spread_pct: number;
  roi_pct: number; // After 1% fees
  time_to_expiry: number;
  buy_liquidity: number;
  sell_liquidity: number;
  confidence: number; // 0-1, based on liquidity
  urgency: 'LOW' | 'MEDIUM' | 'HIGH'; // Based on time to expiry
}

interface NearExpirationPlay {
  platform: string;
  market_id: string;
  asset: string;
  outcome: string;
  price: number;
  fair_value: number; // Should be closer to 0.5 near expiry
  discount_pct: number;
  time_to_expiry: number;
  liquidity: number;
  guaranteed_roi_pct: number; // If market resolves YES and we bought YES
}

class PredictionMarketAggregator {
  private kalshiUrl = 'https://api.kalshi.com/v2';
  private polymarketUrl = 'https://api.polymarket.com';
  private limitlessUrl = 'https://api.limitless.exchange/v1';
  private allMarkets: PredictionMarket[] = [];
  private opportunities: Map<string, ArbOpportunity> = new Map();
  private nearExpirationPlays: Map<string, NearExpirationPlay> = new Map();

  // Fetch all markets from Kalshi
  async fetchKalshiMarkets(): Promise<PredictionMarket[]> {
    try {
      const response = await fetch(`${this.kalshiUrl}/markets?asset=crypto&limit=500`, {
        headers: {
          'Authorization': `Bearer ${process.env.KALSHI_API_KEY}`,
        },
      });

      if (!response.ok) return [];

      const data = await response.json() as any;
      const markets = data.markets || [];

      return markets
        .filter((m: any) => {
          const expiryTime = m.expiry_date ? new Date(m.expiry_date).getTime() - Date.now() : 0;
          return expiryTime > 0 && expiryTime < 60 * 60 * 1000; // < 1 hour
        })
        .map((m: any) => ({
          platform: 'kalshi',
          market_id: m.id,
          asset: m.asset || 'CRYPTO',
          outcome: m.question,
          yes_price: parseFloat(m.yes_price || 0.5),
          no_price: 1 - parseFloat(m.yes_price || 0.5),
          yes_liquidity: parseFloat(m.yes_liquidity || 0),
          no_liquidity: parseFloat(m.no_liquidity || 0),
          time_to_expiry_seconds: Math.floor(
            (new Date(m.expiry_date).getTime() - Date.now()) / 1000
          ),
          expires_at: new Date(m.expiry_date),
          volume_24h: parseFloat(m.volume_24h || 0),
        }));
    } catch (error) {
      console.error('Kalshi fetch error:', error);
      return [];
    }
  }

  // Fetch all markets from Polymarket (public data API - no auth needed)
  async fetchPolymarketMarkets(): Promise<PredictionMarket[]> {
    try {
      // Polymarket public API - no authentication required
      const response = await fetch(
        `${this.polymarketUrl}/markets?tag=crypto&limit=1000&active=true&sort_by=volume`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.log(`Polymarket API returned ${response.status}`);
        return [];
      }

      const data = await response.json() as any;
      const markets = data.markets || data || [];

      return (Array.isArray(markets) ? markets : [])
        .filter((m: any) => {
          const expiryTime = m.expiry_date ? new Date(m.expiry_date).getTime() - Date.now() : 0;
          return expiryTime > 0 && expiryTime < 60 * 60 * 1000; // < 1 hour
        })
        .map((m: any) => {
          // Polymarket returns bid/ask spreads
          const bid = parseFloat(m.bid || m.best_bid || 0.5);
          const ask = parseFloat(m.ask || m.best_ask || 0.5);
          const midPrice = (bid + ask) / 2;

          return {
            platform: 'polymarket',
            market_id: m.id || m.market_id,
            asset: m.asset || m.tag || 'CRYPTO',
            outcome: m.question || m.title || 'Unknown',
            yes_price: midPrice,
            no_price: 1 - midPrice,
            yes_liquidity: parseFloat(m.yes_liquidity || m.liquidity || 0),
            no_liquidity: parseFloat(m.no_liquidity || m.liquidity || 0),
            time_to_expiry_seconds: m.expiry_date
              ? Math.floor((new Date(m.expiry_date).getTime() - Date.now()) / 1000)
              : 3600,
            expires_at: m.expiry_date ? new Date(m.expiry_date) : new Date(Date.now() + 3600000),
            volume_24h: parseFloat(m.volume_24h || m.volume || 0),
          };
        });
    } catch (error) {
      console.error('Polymarket fetch error:', error);
      return [];
    }
  }

  // Fetch all markets from Limitless
  async fetchLimitlessMarkets(): Promise<PredictionMarket[]> {
    try {
      const response = await fetch(`${this.limitlessUrl}/markets?category=crypto&sort=volume_desc`, {
        headers: {
          'Authorization': `Bearer ${process.env.LIMITLESS_API_KEY}`,
        },
      });

      if (!response.ok) return [];

      const data = await response.json() as any;
      const markets = data.markets || [];

      return markets
        .filter((m: any) => {
          const expiryTime = m.expiry_date ? new Date(m.expiry_date).getTime() - Date.now() : 0;
          return expiryTime > 0 && expiryTime < 60 * 60 * 1000;
        })
        .map((m: any) => ({
          platform: 'limitless',
          market_id: m.id,
          asset: m.asset || 'CRYPTO',
          outcome: m.question,
          yes_price: parseFloat(m.price || 0.5),
          no_price: 1 - parseFloat(m.price || 0.5),
          yes_liquidity: parseFloat(m.liquidity || 0),
          no_liquidity: parseFloat(m.liquidity || 0),
          time_to_expiry_seconds: Math.floor(
            (new Date(m.expiry_date).getTime() - Date.now()) / 1000
          ),
          expires_at: new Date(m.expiry_date),
          volume_24h: parseFloat(m.volume_24h || 0),
        }));
    } catch (error) {
      console.error('Limitless fetch error:', error);
      return [];
    }
  }

  // Aggregate all markets
  async aggregateMarkets(): Promise<PredictionMarket[]> {
    const [kalshi, polymarket, limitless] = await Promise.all([
      this.fetchKalshiMarkets(),
      this.fetchPolymarketMarkets(),
      this.fetchLimitlessMarkets(),
    ]);

    this.allMarkets = [...kalshi, ...polymarket, ...limitless];
    return this.allMarkets;
  }

  // Detect arbitrage opportunities
  detectArbitrage(): ArbOpportunity[] {
    const opportunities: ArbOpportunity[] = [];
    const grouped = new Map<string, PredictionMarket[]>();

    // Group by outcome
    this.allMarkets.forEach((m) => {
      const key = `${m.asset}-${m.outcome}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(m);
    });

    // Find spreads
    grouped.forEach((markets, key) => {
      if (markets.length < 2) return;

      // Try YES arbitrage (buy cheap YES, sell expensive YES)
      const minYesPrice = Math.min(...markets.map((m) => m.yes_price));
      const maxYesPrice = Math.max(...markets.map((m) => m.yes_price));

      if (minYesPrice < maxYesPrice) {
        const buyMarket = markets.find((m) => m.yes_price === minYesPrice)!;
        const sellMarket = markets.find((m) => m.yes_price === maxYesPrice)!;
        const spreadPct = ((maxYesPrice - minYesPrice) / minYesPrice) * 100;
        const roiPct = spreadPct - 1.0; // -1% for fees

        if (roiPct > 0.5) {
          const arbKey = `${key}-yes-${buyMarket.platform}-${sellMarket.platform}`;
          if (!this.opportunities.has(arbKey)) {
            opportunities.push({
              id: arbKey,
              asset: buyMarket.asset,
              outcome: buyMarket.outcome,
              buy_platform: buyMarket.platform,
              buy_price: minYesPrice,
              buy_side: 'YES',
              sell_platform: sellMarket.platform,
              sell_price: maxYesPrice,
              sell_side: 'YES',
              spread_pct: spreadPct,
              roi_pct: roiPct,
              time_to_expiry: Math.min(
                buyMarket.time_to_expiry_seconds,
                sellMarket.time_to_expiry_seconds
              ),
              buy_liquidity: buyMarket.yes_liquidity,
              sell_liquidity: sellMarket.yes_liquidity,
              confidence: Math.min(
                buyMarket.yes_liquidity,
                sellMarket.yes_liquidity
              ) > 100 ? 0.9 : 0.5,
              urgency:
                Math.min(
                  buyMarket.time_to_expiry_seconds,
                  sellMarket.time_to_expiry_seconds
                ) < 5 * 60
                  ? 'HIGH'
                  : 'MEDIUM',
            });
          }
        }
      }

      // Try NO arbitrage
      const minNoPrice = Math.min(...markets.map((m) => m.no_price));
      const maxNoPrice = Math.max(...markets.map((m) => m.no_price));

      if (minNoPrice < maxNoPrice) {
        const buyMarket = markets.find((m) => m.no_price === minNoPrice)!;
        const sellMarket = markets.find((m) => m.no_price === maxNoPrice)!;
        const spreadPct = ((maxNoPrice - minNoPrice) / minNoPrice) * 100;
        const roiPct = spreadPct - 1.0;

        if (roiPct > 0.5) {
          const arbKey = `${key}-no-${buyMarket.platform}-${sellMarket.platform}`;
          if (!this.opportunities.has(arbKey)) {
            opportunities.push({
              id: arbKey,
              asset: buyMarket.asset,
              outcome: buyMarket.outcome,
              buy_platform: buyMarket.platform,
              buy_price: minNoPrice,
              buy_side: 'NO',
              sell_platform: sellMarket.platform,
              sell_price: maxNoPrice,
              sell_side: 'NO',
              spread_pct: spreadPct,
              roi_pct: roiPct,
              time_to_expiry: Math.min(
                buyMarket.time_to_expiry_seconds,
                sellMarket.time_to_expiry_seconds
              ),
              buy_liquidity: buyMarket.no_liquidity,
              sell_liquidity: sellMarket.no_liquidity,
              confidence: Math.min(
                buyMarket.no_liquidity,
                sellMarket.no_liquidity
              ) > 100 ? 0.9 : 0.5,
              urgency:
                Math.min(
                  buyMarket.time_to_expiry_seconds,
                  sellMarket.time_to_expiry_seconds
                ) < 5 * 60
                  ? 'HIGH'
                  : 'MEDIUM',
            });
          }
        }
      }
    });

    return opportunities.sort((a, b) => b.roi_pct - a.roi_pct);
  }

  // Detect near-expiration value plays (market trading below fair value)
  detectNearExpirationPlays(): NearExpirationPlay[] {
    const plays: NearExpirationPlay[] = [];

    this.allMarkets.forEach((m) => {
      if (m.time_to_expiry_seconds > 5 * 60) return; // Only < 5 min

      // Fair value near expiry should approach 0 or 1 (binary outcomes)
      // If YES is trading at 0.30 but has 80% volume on YES side, it's underpriced
      const yesVolume = m.volume_24h * m.yes_price;
      const noVolume = m.volume_24h * (1 - m.yes_price);
      const volumeRatio = yesVolume / (noVolume + 1);

      // If YES has much more volume, it's likely going YES -> buy cheap YES
      if (volumeRatio > 2 && m.yes_price < 0.4) {
        plays.push({
          platform: m.platform,
          market_id: m.market_id,
          asset: m.asset,
          outcome: m.outcome,
          price: m.yes_price,
          fair_value: 0.6, // Estimate based on volume
          discount_pct: ((0.6 - m.yes_price) / 0.6) * 100,
          time_to_expiry: m.time_to_expiry_seconds,
          liquidity: m.yes_liquidity,
          guaranteed_roi_pct: ((1.0 - m.yes_price) / m.yes_price) * 100, // If it goes to 1
        });
      }

      // NO side
      if (volumeRatio < 0.5 && m.no_price < 0.4) {
        plays.push({
          platform: m.platform,
          market_id: m.market_id,
          asset: m.asset,
          outcome: m.outcome,
          price: m.no_price,
          fair_value: 0.6,
          discount_pct: ((0.6 - m.no_price) / 0.6) * 100,
          time_to_expiry: m.time_to_expiry_seconds,
          liquidity: m.no_liquidity,
          guaranteed_roi_pct: ((1.0 - m.no_price) / m.no_price) * 100,
        });
      }
    });

    return plays.sort((a, b) => b.guaranteed_roi_pct - a.guaranteed_roi_pct);
  }

  // Get top opportunities
  getTopOpportunities(limit: number = 10): ArbOpportunity[] {
    return Array.from(this.opportunities.values())
      .sort((a, b) => b.roi_pct - a.roi_pct)
      .slice(0, limit);
  }

  // Get stats
  getStats() {
    const arbs = Array.from(this.opportunities.values());
    return {
      total_markets: this.allMarkets.length,
      by_platform: {
        kalshi: this.allMarkets.filter((m) => m.platform === 'kalshi').length,
        polymarket: this.allMarkets.filter((m) => m.platform === 'polymarket').length,
        limitless: this.allMarkets.filter((m) => m.platform === 'limitless').length,
      },
      arbitrage_opportunities: arbs.length,
      avg_roi_pct: (arbs.reduce((sum, a) => sum + a.roi_pct, 0) / arbs.length || 0).toFixed(2),
      max_roi_pct: Math.max(0, ...arbs.map((a) => a.roi_pct)).toFixed(2),
      high_urgency: arbs.filter((a) => a.urgency === 'HIGH').length,
    };
  }
}

export default PredictionMarketAggregator;
