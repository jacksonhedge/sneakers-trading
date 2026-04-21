// Price Feed Service: Aggregates BTC/ETH prices from multiple sources
import fetch from 'node-fetch';
import WebSocket from 'ws';

interface PriceData {
  symbol: string;
  price: number;
  source: string;
  timestamp: Date;
  marketCap?: number;
  volume24h?: number;
}

interface MarketSnapshot {
  market_id: string;
  platform: string;
  asset: string;
  outcome: string;
  bid_price: number;
  ask_price: number;
  implied_probability: number;
  liquidity: number;
  time_to_expiry_seconds: number;
  expires_at: Date;
}

class PriceFeedService {
  private coingeckoUrl = 'https://api.coingecko.com/api/v3';
  private binanceUrl = 'https://api.binance.com/api/v3';
  private priceCache: Map<string, PriceData> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();

  // Fetch BTC/ETH from CoinGecko (free, no auth needed)
  async fetchFromCoinGecko(symbols: string[] = ['bitcoin', 'ethereum']): Promise<PriceData[]> {
    try {
      const ids = symbols.join(',');
      const response = await fetch(
        `${this.coingeckoUrl}/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`
      );

      const data = await response.json() as Record<string, any>;

      return Object.entries(data).map(([symbol, prices]: [string, any]) => ({
        symbol: symbol === 'bitcoin' ? 'BTC' : 'ETH',
        price: prices.usd,
        source: 'coingecko',
        timestamp: new Date(),
        marketCap: prices.usd_market_cap,
        volume24h: prices.usd_24h_vol,
      }));
    } catch (error) {
      console.error('CoinGecko fetch error:', error);
      throw error;
    }
  }

  // Real-time price stream from Binance WebSocket
  async connectBinanceStream(): Promise<void> {
    const symbols = ['btcusdt', 'ethusdt'];

    symbols.forEach((symbol) => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@ticker`);

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);
        const price: PriceData = {
          symbol: symbol === 'btcusdt' ? 'BTC' : 'ETH',
          price: parseFloat(message.c), // current price
          source: 'binance',
          timestamp: new Date(message.E),
          volume24h: parseFloat(message.v),
        };
        this.priceCache.set(price.symbol, price);
        console.log(`[Binance] ${price.symbol}: $${price.price}`);
      });

      ws.on('error', (error) => {
        console.error(`Binance WebSocket error for ${symbol}:`, error);
      });

      this.wsConnections.set(symbol, ws);
    });
  }

  // Fetch Polymarket market data (near-expiry markets)
  async fetchPolymarketMarkets(asset: string = 'BTC'): Promise<MarketSnapshot[]> {
    try {
      // Polymarket API endpoint (requires API key in .env)
      const response = await fetch(`https://api.polymarket.com/markets?asset=${asset}`, {
        headers: {
          'Authorization': `Bearer ${process.env.POLYMARKET_API_KEY}`,
        },
      });

      const markets = await response.json() as any[];

      return markets
        .filter((m) => m.expiry_date && new Date(m.expiry_date).getTime() - Date.now() < 5 * 60 * 1000) // < 5 min
        .map((m) => ({
          market_id: m.id,
          platform: 'polymarket',
          asset: asset,
          outcome: m.outcome,
          bid_price: parseFloat(m.bid),
          ask_price: parseFloat(m.ask),
          implied_probability: parseFloat(m.probability),
          liquidity: parseFloat(m.liquidity),
          time_to_expiry_seconds: Math.floor((new Date(m.expiry_date).getTime() - Date.now()) / 1000),
          expires_at: new Date(m.expiry_date),
        }));
    } catch (error) {
      console.error('Polymarket fetch error:', error);
      return [];
    }
  }

  // Fetch Kalshi markets (15-min expiries)
  async fetchKalshiMarkets(asset: string = 'BTC'): Promise<MarketSnapshot[]> {
    try {
      const response = await fetch(`https://api.kalshi.com/v2/markets?asset=${asset}`, {
        headers: {
          'Authorization': `Bearer ${process.env.KALSHI_API_KEY}`,
        },
      });

      const markets = await response.json() as any[];

      return markets
        .filter((m) => m.expiry_date && new Date(m.expiry_date).getTime() - Date.now() < 15 * 60 * 1000) // < 15 min
        .map((m) => ({
          market_id: m.id,
          platform: 'kalshi',
          asset: asset,
          outcome: m.outcome,
          bid_price: parseFloat(m.bid),
          ask_price: parseFloat(m.ask),
          implied_probability: parseFloat(m.probability),
          liquidity: parseFloat(m.liquidity),
          time_to_expiry_seconds: Math.floor((new Date(m.expiry_date).getTime() - Date.now()) / 1000),
          expires_at: new Date(m.expiry_date),
        }));
    } catch (error) {
      console.error('Kalshi fetch error:', error);
      return [];
    }
  }

  // Detect arbitrage opportunities between markets
  async detectArbOpportunities(): Promise<any[]> {
    const polymarkets = await this.fetchPolymarketMarkets('BTC');
    const kalshiMarkets = await this.fetchKalshiMarkets('BTC');

    const opportunities: any[] = [];

    polymarkets.forEach((poly) => {
      kalshiMarkets.forEach((kalshi) => {
        // Match same outcome
        if (poly.outcome === kalshi.outcome) {
          const polyMidPrice = (poly.bid_price + poly.ask_price) / 2;
          const kalshiMidPrice = (kalshi.bid_price + kalshi.ask_price) / 2;
          const spreadPct = Math.abs((polyMidPrice - kalshiMidPrice) / kalshiMidPrice) * 100;

          // If spread > 2%, potential arbitrage
          if (spreadPct > 2) {
            opportunities.push({
              asset: 'BTC',
              polymarket_id: poly.market_id,
              kalshi_id: kalshi.market_id,
              poly_price: polyMidPrice,
              kalshi_price: kalshiMidPrice,
              spread_pct: spreadPct,
              roi_potential: spreadPct - 0.5, // account for fees
              poly_expires_at: poly.expires_at,
              kalshi_expires_at: kalshi.expires_at,
              detected_at: new Date(),
            });
          }
        }
      });
    });

    return opportunities;
  }

  // Get cached price
  getPrice(symbol: string): PriceData | undefined {
    return this.priceCache.get(symbol);
  }

  // Cleanup WebSocket connections
  closeConnections(): void {
    this.wsConnections.forEach((ws) => ws.close());
    this.wsConnections.clear();
  }
}

export default PriceFeedService;
