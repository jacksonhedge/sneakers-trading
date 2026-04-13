// Limitless Market Viewer: Fetch and display all crypto markets with YES/NO pricing and bid/ask data

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

interface LimitlessMarket {
  slug: string;
  title: string;
  description: string;
  prices: number[]; // [YES_price, NO_price]
  liquidity?: number;
  volume?: number;
  openInterest?: number;
  expirationDate?: string;
  expirationTimestamp?: number;
  categories?: string[];
  tradeType?: string;
  bidAsk?: {
    yesBid?: number;
    yesAsk?: number;
    noBid?: number;
    noAsk?: number;
    spread?: number;
  };
}

class LimitlessMarketViewer {
  private apiKey = process.env.LIMITLESS_API_KEY;
  private baseUrl = 'https://api.limitless.exchange';
  private markets: LimitlessMarket[] = [];

  // Fetch all active crypto markets
  async fetchAllMarkets(): Promise<LimitlessMarket[]> {
    try {
      console.log('📡 Fetching Limitless crypto markets...\n');

      const response = await fetch(`${this.baseUrl}/markets/active`, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log('⚠️ Failed to fetch markets');
        return [];
      }

      const data = await response.json() as any;
      const markets = Array.isArray(data.data) ? data.data : data.data || [];

      if (markets.length > 0) {
        console.log(`✅ Connected to Limitless API`);
        console.log(`Found ${markets.length} total markets\n`);

        // Filter for crypto markets
        const cryptoMarkets = markets.filter((m: any) =>
          m.tags && m.tags.some((tag: string) =>
            tag.toLowerCase().includes('crypto') ||
            tag.toLowerCase().includes('btc') ||
            tag.toLowerCase().includes('eth') ||
            tag.toLowerCase().includes('sol') ||
            tag.toLowerCase().includes('xrp') ||
            tag.toLowerCase().includes('doge')
          )
        );

        console.log(`Found ${cryptoMarkets.length} crypto markets\n`);
        this.markets = this.parseMarkets(cryptoMarkets);
        return this.markets;
      }

      console.log('⚠️ No markets found');
      return [];
    } catch (error) {
      console.error('Market fetch error:', error);
      return [];
    }
  }

  // Parse market data
  private parseMarkets(rawMarkets: any[]): LimitlessMarket[] {
    return rawMarkets
      .map((m: any) => {
        const yesPrice = Array.isArray(m.prices) ? m.prices[0] : m.yes_price || 0.5;
        const noPrice = Array.isArray(m.prices) ? m.prices[1] : m.no_price || 0.5;

        // Calculate bid/ask spread (if available)
        const bidAsk = this.calculateBidAsk(m, yesPrice, noPrice);

        return {
          slug: m.slug || m.id || 'unknown',
          title: m.title || m.question || 'Unknown',
          description: m.description || '',
          prices: [yesPrice, noPrice],
          liquidity: parseFloat(String(m.liquidity || 0)),
          volume: parseFloat(String(m.volume || 0)),
          openInterest: parseFloat(String(m.open_interest || 0)),
          expirationDate: m.expiration_date || m.expirationDate,
          expirationTimestamp: m.expiration_timestamp || m.expirationTimestamp,
          categories: m.categories || [],
          tradeType: m.trade_type || m.tradeType,
          bidAsk,
        };
      })
      .filter((m) => m.prices[0] > 0 && m.prices[0] < 1); // Valid prices
  }

  // Calculate bid/ask from prices
  private calculateBidAsk(market: any, yesPrice: number, noPrice: number) {
    // If market has bid/ask data
    if (market.bid || market.ask) {
      const yesBid = market.yes_bid || yesPrice - 0.01;
      const yesAsk = market.yes_ask || yesPrice + 0.01;
      const noBid = market.no_bid || noPrice - 0.01;
      const noAsk = market.no_ask || noPrice + 0.01;

      const spread = yesAsk - yesBid;
      const spreadPct = (spread / ((yesBid + yesAsk) / 2)) * 100;

      return {
        yesBid: Math.max(0, yesBid),
        yesAsk,
        noBid: Math.max(0, noBid),
        noAsk,
        spread: spreadPct,
      };
    }

    // Estimate bid/ask from liquidity
    const estimatedSpreadPct = market.liquidity > 10000 ? 0.2 : 0.5;
    const yesSpread = yesPrice * (estimatedSpreadPct / 100);
    const noSpread = noPrice * (estimatedSpreadPct / 100);

    return {
      yesBid: Math.max(0, yesPrice - yesSpread),
      yesAsk: yesPrice + yesSpread,
      noBid: Math.max(0, noPrice - noSpread),
      noAsk: noPrice + noSpread,
      spread: estimatedSpreadPct,
    };
  }

  // Display markets in table format
  displayMarkets(): void {
    if (this.markets.length === 0) {
      console.log('No markets found');
      return;
    }

    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('LIMITLESS CRYPTO MARKETS - YES/NO PRICING & BID/ASK SPREADS');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');

    // Group by expiration
    const byExpiry = new Map<string, LimitlessMarket[]>();
    this.markets.forEach((m) => {
      const expiry = m.expirationDate ? new Date(m.expirationDate).toLocaleDateString() : 'No expiry';
      if (!byExpiry.has(expiry)) {
        byExpiry.set(expiry, []);
      }
      byExpiry.get(expiry)!.push(m);
    });

    // Display by expiration
    Array.from(byExpiry.entries())
      .sort((a, b) => {
        const aDate = new Date(a[0]).getTime();
        const bDate = new Date(b[0]).getTime();
        return aDate - bDate;
      })
      .forEach(([expiry, markets]) => {
        console.log(`\n⏰ EXPIRING: ${expiry} (${markets.length} markets)\n`);

        markets.forEach((m, idx) => {
          const [yesPrice, noPrice] = m.prices;
          const ba = m.bidAsk;
          const spread = ba?.spread?.toFixed(2) || 'N/A';
          const volume = (m.volume || 0).toLocaleString();
          const liquidity = (m.liquidity || 0).toLocaleString();

          console.log(`${idx + 1}. ${m.title}`);
          console.log(`   Slug: ${m.slug}`);
          console.log(
            `   Prices: YES=${yesPrice.toFixed(4)} | NO=${noPrice.toFixed(4)} | Sum=${(yesPrice + noPrice).toFixed(4)}`
          );
          console.log(
            `   Bid/Ask (YES): ${ba?.yesBid?.toFixed(4)} / ${ba?.yesAsk?.toFixed(4)} | Spread: ${spread}%`
          );
          console.log(
            `   Bid/Ask (NO):  ${ba?.noBid?.toFixed(4)} / ${ba?.noAsk?.toFixed(4)}`
          );
          console.log(`   Volume: $${volume} | Liquidity: $${liquidity}`);
          console.log(`   Type: ${m.tradeType || 'N/A'}\n`);
        });
      });

    // Summary stats
    this.displaySummary();
  }

  // Display summary statistics
  private displaySummary(): void {
    console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('SUMMARY STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');

    const totalVolume = this.markets.reduce((sum, m) => {
      const vol = typeof m.volume === 'number' ? m.volume : parseFloat(String(m.volume)) || 0;
      return sum + vol;
    }, 0);
    const totalLiquidity = this.markets.reduce((sum, m) => {
      const liq = typeof m.liquidity === 'number' ? m.liquidity : parseFloat(String(m.liquidity)) || 0;
      return sum + liq;
    }, 0);
    const avgSpread = this.markets.reduce((sum, m) => sum + (m.bidAsk?.spread || 0), 0) / this.markets.length;

    const spreads = this.markets.map((m) => m.bidAsk?.spread || 0);
    const minSpread = Math.min(...spreads);
    const maxSpread = Math.max(...spreads);

    // YES/NO pricing analysis
    const yesPrices = this.markets.map((m) => m.prices[0]);
    const noPrices = this.markets.map((m) => m.prices[1]);
    const avgYes = yesPrices.reduce((a, b) => a + b, 0) / yesPrices.length;
    const avgNo = noPrices.reduce((a, b) => a + b, 0) / noPrices.length;

    // Mispricing (deviation from 1.0)
    const mispricings = this.markets.map((m) => Math.abs((m.prices[0] + m.prices[1]) - 1.0));
    const avgMispricing = mispricings.reduce((a, b) => a + b, 0) / mispricings.length;
    const maxMispricing = Math.max(...mispricings);

    console.log(`Total Markets: ${this.markets.length}`);
    console.log(`Total Volume: $${totalVolume.toLocaleString()}`);
    console.log(`Total Liquidity: $${totalLiquidity.toLocaleString()}\n`);

    console.log(`YES/NO Pricing:`);
    console.log(`  Avg YES price: $${avgYes.toFixed(4)}`);
    console.log(`  Avg NO price: $${avgNo.toFixed(4)}`);
    console.log(`  Avg Sum (should be ~1.0): ${(avgYes + avgNo).toFixed(4)}\n`);

    console.log(`Bid/Ask Spreads:`);
    console.log(`  Average: ${avgSpread.toFixed(3)}%`);
    console.log(`  Min: ${minSpread.toFixed(3)}%`);
    console.log(`  Max: ${maxSpread.toFixed(3)}%\n`);

    console.log(`Mispricing (YES + NO deviation from $1.00):`);
    console.log(`  Average mispricing: ${(avgMispricing * 100).toFixed(3)}%`);
    console.log(`  Max mispricing: ${(maxMispricing * 100).toFixed(3)}%`);
    console.log(`  Markets with arb (>0.5% away from $1.00): ${mispricings.filter((m) => m > 0.005).length}\n`);

    // Identify best opportunities
    const bestSpread = this.markets.reduce((best, m) =>
      (m.bidAsk?.spread || 0) < (best.bidAsk?.spread || 999) ? m : best
    );
    const bestLiquidity = this.markets.reduce((best, m) =>
      (m.liquidity || 0) > (best.liquidity || 0) ? m : best
    );
    const worstMispricing = this.markets.reduce(
      (worst, m, idx) =>
        Math.abs((m.prices[0] + m.prices[1]) - 1.0) > Math.abs((worst.prices[0] + worst.prices[1]) - 1.0)
          ? m
          : worst,
      this.markets[0]
    );

    console.log(`Top Opportunities:`);
    console.log(`  Tightest spread: "${bestSpread.title}" (${bestSpread.bidAsk?.spread?.toFixed(2)}%)`);
    console.log(`  Most liquid: "${bestLiquidity.title}" ($${(bestLiquidity.liquidity || 0).toLocaleString()})`);
    console.log(
      `  Worst mispricing: "${worstMispricing.title}" (${(Math.abs((worstMispricing.prices[0] + worstMispricing.prices[1]) - 1.0) * 100).toFixed(2)}% arb)\n`
    );
  }
}

// Main
const viewer = new LimitlessMarketViewer();
viewer.fetchAllMarkets().then(() => {
  viewer.displayMarkets();
});
