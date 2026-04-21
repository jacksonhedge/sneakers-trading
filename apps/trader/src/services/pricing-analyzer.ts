// Pricing Analyzer: Collect and analyze YES/NO pricing across platforms

import fetch from 'node-fetch';

interface MarketPricing {
  platform: string;
  market_id: string;
  asset: string;
  question: string;
  yes_price: number;
  no_price: number;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  spread_pct: number; // (YES - NO) / YES
  sum_prices: number; // YES + NO (should be ~1.0 for arbitrage detection)
  arbitrage_pct: number; // How far from 1.0 (0 = perfect, >0 = arbitrage)
  liquidity: number;
  time_to_expiry: number;
  timestamp: number;
}

interface PricingSnapshot {
  timestamp: number;
  markets: MarketPricing[];
  stats: {
    platform: string;
    total_markets: number;
    avg_spread_pct: number;
    markets_with_arb: number; // sum > 1.0
    avg_arbitrage_pct: number;
  }[];
}

class PricingAnalyzer {
  private polymarketUrl = 'https://api.polymarket.com';
  private kalshiUrl = 'https://api.kalshi.com/v2';
  private limitlessUrl = 'https://api.limitless.exchange';
  private pricingHistory: PricingSnapshot[] = [];
  private maxHistorySize = 1000; // Keep last 1000 snapshots

  // Fetch Polymarket crypto markets with full pricing
  async fetchPolymarketPricing(): Promise<MarketPricing[]> {
    try {
      const response = await fetch(
        `${this.polymarketUrl}/markets?tag=crypto&active=true&limit=1000`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) return [];

      const data = await response.json() as any;
      const markets = Array.isArray(data) ? data : data.markets || [];

      return markets
        .filter((m: any) => {
          const expiryTime = m.expiry_date ? new Date(m.expiry_date).getTime() - Date.now() : 0;
          return expiryTime > 0;
        })
        .map((m: any) => {
          const bid = parseFloat(m.bid || m.best_bid || 0.5);
          const ask = parseFloat(m.ask || m.best_ask || 0.5);
          const yesPrice = (bid + ask) / 2;
          const noPrice = 1 - yesPrice;

          return {
            platform: 'polymarket',
            market_id: m.id || m.market_id,
            asset: m.asset || m.tag || 'CRYPTO',
            question: m.question || m.title || 'Unknown',
            yes_price: yesPrice,
            no_price: noPrice,
            yes_bid: bid,
            yes_ask: ask,
            no_bid: 1 - ask,
            no_ask: 1 - bid,
            spread_pct: ((yesPrice - noPrice) / (yesPrice || 0.5)) * 100,
            sum_prices: yesPrice + noPrice,
            arbitrage_pct: Math.abs((yesPrice + noPrice) - 1.0) * 100,
            liquidity: parseFloat(m.liquidity || 0),
            time_to_expiry: m.expiry_date
              ? Math.floor((new Date(m.expiry_date).getTime() - Date.now()) / 1000)
              : 0,
            timestamp: Date.now(),
          };
        });
    } catch (error) {
      console.error('Polymarket pricing fetch error:', error);
      return [];
    }
  }

  // Fetch Kalshi crypto markets with pricing
  async fetchKalshiPricing(): Promise<MarketPricing[]> {
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
          return expiryTime > 0;
        })
        .map((m: any) => {
          const yesPrice = parseFloat(m.yes_price || 0.5);
          const noPrice = 1 - yesPrice;
          const yesBid = parseFloat(m.yes_bid || yesPrice - 0.01);
          const yesAsk = parseFloat(m.yes_ask || yesPrice + 0.01);

          return {
            platform: 'kalshi',
            market_id: m.id,
            asset: m.asset || 'CRYPTO',
            question: m.question,
            yes_price: yesPrice,
            no_price: noPrice,
            yes_bid: yesBid,
            yes_ask: yesAsk,
            no_bid: 1 - yesAsk,
            no_ask: 1 - yesBid,
            spread_pct: ((yesPrice - noPrice) / (yesPrice || 0.5)) * 100,
            sum_prices: yesPrice + noPrice,
            arbitrage_pct: Math.abs((yesPrice + noPrice) - 1.0) * 100,
            liquidity: parseFloat(m.liquidity || 0),
            time_to_expiry: m.expiry_date
              ? Math.floor((new Date(m.expiry_date).getTime() - Date.now()) / 1000)
              : 0,
            timestamp: Date.now(),
          };
        });
    } catch (error) {
      console.error('Kalshi pricing fetch error:', error);
      return [];
    }
  }

  // Fetch Limitless market pricing
  async fetchLimitlessPricing(): Promise<MarketPricing[]> {
    try {
      // Limitless uses API key in header
      const response = await fetch(
        `${this.limitlessUrl}/markets/active`,
        {
          headers: {
            'X-API-Key': process.env.LIMITLESS_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) return [];

      const data = await response.json() as any;
      const markets = data.data || [];

      return markets
        .filter((m: any) => {
          // Filter for crypto markets and active status
          return m.status === 'FUNDED' && m.expired === false &&
            m.tags && m.tags.some((tag: string) =>
              tag.toLowerCase().includes('crypto') ||
              tag.toLowerCase().includes('btc') ||
              tag.toLowerCase().includes('eth') ||
              tag.toLowerCase().includes('sol')
            );
        })
        .map((m: any) => {
          const yesPrice = Array.isArray(m.prices) ? m.prices[0] : 0.5;
          const noPrice = Array.isArray(m.prices) ? m.prices[1] : 0.5;
          // Estimate bid/ask from tight market prices
          const yesBid = yesPrice - 0.005;
          const yesAsk = yesPrice + 0.005;

          return {
            platform: 'limitless',
            market_id: String(m.id),
            asset: 'CRYPTO',
            question: m.title,
            yes_price: yesPrice,
            no_price: noPrice,
            yes_bid: Math.max(0, yesBid),
            yes_ask: yesAsk,
            no_bid: Math.max(0, noPrice - 0.005),
            no_ask: noPrice + 0.005,
            spread_pct: ((yesPrice - noPrice) / (yesPrice || 0.5)) * 100,
            sum_prices: yesPrice + noPrice,
            arbitrage_pct: Math.abs((yesPrice + noPrice) - 1.0) * 100,
            liquidity: parseFloat(String(m.volume || 0)),
            time_to_expiry: 3600, // Markets expire within ~1 hour
            timestamp: Date.now(),
          };
        });
    } catch (error) {
      console.error('Limitless pricing fetch error:', error);
      return [];
    }
  }

  // Aggregate pricing from all platforms
  async captureSnapshot(): Promise<PricingSnapshot> {
    const [polymarket, kalshi, limitless] = await Promise.all([
      this.fetchPolymarketPricing(),
      this.fetchKalshiPricing(),
      this.fetchLimitlessPricing(),
    ]);

    const allMarkets = [...polymarket, ...kalshi, ...limitless];

    const snapshot: PricingSnapshot = {
      timestamp: Date.now(),
      markets: allMarkets,
      stats: [
        this.calculateStats(polymarket, 'polymarket'),
        this.calculateStats(kalshi, 'kalshi'),
        this.calculateStats(limitless, 'limitless'),
      ],
    };

    // Store in history
    this.pricingHistory.push(snapshot);
    if (this.pricingHistory.length > this.maxHistorySize) {
      this.pricingHistory.shift();
    }

    return snapshot;
  }

  // Calculate stats for a platform
  private calculateStats(
    markets: MarketPricing[],
    platform: string
  ): PricingSnapshot['stats'][0] {
    if (markets.length === 0) {
      return {
        platform,
        total_markets: 0,
        avg_spread_pct: 0,
        markets_with_arb: 0,
        avg_arbitrage_pct: 0,
      };
    }

    const avgSpread = markets.reduce((sum, m) => sum + m.spread_pct, 0) / markets.length;
    const marketsWithArb = markets.filter((m) => m.arbitrage_pct > 0.5).length; // >0.5% away from 1.0
    const avgArb = markets.reduce((sum, m) => sum + m.arbitrage_pct, 0) / markets.length;

    return {
      platform,
      total_markets: markets.length,
      avg_spread_pct: avgSpread,
      markets_with_arb: marketsWithArb,
      avg_arbitrage_pct: avgArb,
    };
  }

  // Analyze YES/NO pricing differences
  analyzeYesNoDifferences(snapshot: PricingSnapshot) {
    console.log('\n📊 YES/NO PRICING ANALYSIS\n');

    snapshot.stats.forEach((stat) => {
      console.log(`🔹 ${stat.platform.toUpperCase()}`);
      console.log(`   Markets: ${stat.total_markets}`);
      console.log(`   Avg YES-NO spread: ${stat.avg_spread_pct.toFixed(2)}%`);
      console.log(
        `   Markets with arbitrage: ${stat.markets_with_arb} (${((stat.markets_with_arb / stat.total_markets) * 100).toFixed(1)}%)`
      );
      console.log(`   Avg arbitrage %: ${stat.avg_arbitrage_pct.toFixed(3)}%\n`);
    });

    // Find markets where YES + NO doesn't equal 1.0 (arbitrage opportunity)
    console.log(`\n🎯 INTERNAL ARBITRAGE (same platform):\n`);
    const arbMarkets = snapshot.markets.filter((m) => m.arbitrage_pct > 0.5);
    arbMarkets.slice(0, 10).forEach((m) => {
      console.log(
        `   ${m.platform.toUpperCase()} | ${m.asset} | YES: ${m.yes_price.toFixed(4)} + NO: ${m.no_price.toFixed(4)} = ${m.sum_prices.toFixed(4)}`
      );
      console.log(`     → Arbitrage: ${m.arbitrage_pct.toFixed(3)}% (buy YES+NO cheaper than $1)\n`);
    });

    // Find cross-platform YES arbitrage
    console.log(`\n🔄 CROSS-PLATFORM YES ARBITRAGE:\n`);
    const yesByQuestion = new Map<string, MarketPricing[]>();

    snapshot.markets.forEach((m) => {
      if (!yesByQuestion.has(m.question)) {
        yesByQuestion.set(m.question, []);
      }
      yesByQuestion.get(m.question)!.push(m);
    });

    let yesArbCount = 0;
    yesByQuestion.forEach((markets, question) => {
      if (markets.length < 2) return;

      const minYes = Math.min(...markets.map((m) => m.yes_price));
      const maxYes = Math.max(...markets.map((m) => m.yes_price));
      const yesSpread = ((maxYes - minYes) / minYes) * 100;

      if (yesSpread > 1) {
        const buyMarket = markets.find((m) => m.yes_price === minYes)!;
        const sellMarket = markets.find((m) => m.yes_price === maxYes)!;

        console.log(
          `   ${question.substring(0, 50)}...`
        );
        console.log(
          `     Buy ${buyMarket.platform} @ ${minYes.toFixed(4)} | Sell ${sellMarket.platform} @ ${maxYes.toFixed(4)}`
        );
        console.log(`     Spread: ${yesSpread.toFixed(2)}% (after 1% fees: ${(yesSpread - 1).toFixed(2)}%)\n`);
        yesArbCount++;
      }
    });

    console.log(`   Total YES arbitrage opportunities: ${yesArbCount}\n`);
  }

  // Export pricing data for analysis
  getPricingData() {
    return {
      snapshots: this.pricingHistory.length,
      latest: this.pricingHistory[this.pricingHistory.length - 1],
      all: this.pricingHistory,
    };
  }

  // Start continuous monitoring
  async startMonitoring(intervalSeconds: number = 30): Promise<void> {
    console.log(`📡 Starting pricing monitor (every ${intervalSeconds}s)...\n`);

    setInterval(async () => {
      const snapshot = await this.captureSnapshot();
      this.analyzeYesNoDifferences(snapshot);
    }, intervalSeconds * 1000);
  }
}

export default PricingAnalyzer;
