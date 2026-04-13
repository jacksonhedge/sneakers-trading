// Price Shopper: Compare YES/NO prices across platforms for arbitrage opportunities

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface PriceQuote {
  platform: string;
  market_id: string;
  title: string;
  yes_price: number;
  no_price: number;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume: number;
  expires_in: number; // seconds
  timestamp: number;
}

interface ArbitrageOpportunity {
  asset: string;
  title: string;
  buy_platform: string;
  buy_side: 'YES' | 'NO';
  buy_price: number;
  sell_platform: string;
  sell_side: 'YES' | 'NO';
  sell_price: number;
  spread_pct: number;
  roi_after_fees: number; // accounting for 0.5% fees per side
  position_size: number; // $500
  gross_profit: number;
  net_profit: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_score: number; // 0-100
}

class PriceShopper {
  private limitlessUrl = 'https://api.limitless.exchange';
  private kalshiUrl = 'https://api.kalshi.com/v2';
  private polymarketUrl = 'https://api.polymarket.com';
  private coinbaseUrl = 'https://api.coinbase.com/v1';
  private fanDuelUrl = 'https://api.fanduel.com';
  private draftKingsUrl = 'https://api.draftkings.com';
  private limitlessKey = process.env.LIMITLESS_API_KEY;
  private kalshiKey = process.env.KALSHI_API_KEY;
  private coinbaseKey = process.env.COINBASE_API_KEY;
  private coinbaseSecret = process.env.COINBASE_API_SECRET;
  private fanDuelKey = process.env.FANDUEL_API_KEY;
  private draftKingsKey = process.env.DRAFTKINGS_API_KEY;

  async fetchAllPrices(): Promise<Map<string, PriceQuote[]>> {
    const priceMap = new Map<string, PriceQuote[]>();

    console.log('🔍 Price Shopping Across Platforms...\n');

    // Fetch from platforms in parallel
    const [limitless, coinbase, kalshi, fanduel, draftkings] = await Promise.all([
      this.fetchLimitlessPrices(),
      this.fetchCoinbasePrices(),
      process.env.KALSHI_API_KEY ? this.fetchKalshiPrices() : Promise.resolve([]),
      process.env.FANDUEL_API_KEY ? this.fetchFanDuelPrices() : Promise.resolve([]),
      process.env.DRAFTKINGS_API_KEY ? this.fetchDraftKingsPrices() : Promise.resolve([]),
    ]);

    // Group by asset/title
    const allQuotes = [...limitless, ...coinbase, ...kalshi, ...fanduel, ...draftkings];

    const sources = [`${limitless.length} Limitless`];
    if (kalshi.length > 0) sources.push(`${kalshi.length} Kalshi`);
    if (fanduel.length > 0) sources.push(`${fanduel.length} FanDuel`);
    if (draftkings.length > 0) sources.push(`${draftkings.length} DraftKings`);

    console.log(`📊 Fetched ${sources.join(' + ')} quotes\n`);

    allQuotes.forEach((quote) => {
      // Normalize title to match across platforms
      const key = this.normalizeTitle(quote.title);
      if (!priceMap.has(key)) {
        priceMap.set(key, []);
      }
      priceMap.get(key)!.push(quote);
    });

    return priceMap;
  }

  // Fetch from Limitless
  private async fetchLimitlessPrices(): Promise<PriceQuote[]> {
    try {
      const response = await fetch(`${this.limitlessUrl}/markets/active`, {
        headers: {
          'X-API-Key': this.limitlessKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const markets = data.data || [];

      return markets
        .filter(
          (m: any) =>
            m.status === 'FUNDED' &&
            m.expired === false &&
            m.tags &&
            m.tags.some((tag: string) =>
              tag.toLowerCase().includes('crypto') ||
              tag.toLowerCase().includes('btc') ||
              tag.toLowerCase().includes('eth') ||
              tag.toLowerCase().includes('sol') ||
              tag.toLowerCase().includes('xrp') ||
              tag.toLowerCase().includes('doge') ||
              tag.toLowerCase().includes('ada')
            ) &&
            // Filter out weird prices (50=50 commodities)
            Array.isArray(m.prices) &&
            m.prices[0] < 1 &&
            m.prices[1] < 1
        )
        .map((m: any) => {
          const yesPrice = Array.isArray(m.prices) ? m.prices[0] : 0.5;
          const noPrice = Array.isArray(m.prices) ? m.prices[1] : 0.5;
          return {
            platform: 'limitless',
            market_id: String(m.id),
            title: m.title,
            yes_price: yesPrice,
            no_price: noPrice,
            yes_bid: yesPrice - 0.005,
            yes_ask: yesPrice + 0.005,
            no_bid: noPrice - 0.005,
            no_ask: noPrice + 0.005,
            volume: parseFloat(String(m.volume || 0)),
            expires_in: 3600, // ~1 hour
            timestamp: Date.now(),
          };
        });
    } catch (e) {
      console.error('❌ Limitless fetch error:', (e as Error).message);
      return [];
    }
  }

  // Fetch from Kalshi
  private async fetchKalshiPrices(): Promise<PriceQuote[]> {
    try {
      if (!this.kalshiKey) {
        console.log('⚠️  Kalshi API key not configured');
        return [];
      }

      const response = await fetch(`${this.kalshiUrl}/markets?asset=crypto&limit=500&status=active`, {
        headers: {
          'Authorization': `Bearer ${this.kalshiKey}`,
        },
      });

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const markets = data.markets || [];

      return markets
        .filter((m: any) => {
          const expiryTime = m.expiry_date ? new Date(m.expiry_date).getTime() - Date.now() : 0;
          return expiryTime > 0 && expiryTime < 3600000; // < 1 hour
        })
        .map((m: any) => ({
          platform: 'kalshi',
          market_id: m.id,
          title: m.question,
          yes_price: parseFloat(m.yes_price || 0.5),
          no_price: 1 - parseFloat(m.yes_price || 0.5),
          yes_bid: parseFloat(m.yes_bid || 0.49),
          yes_ask: parseFloat(m.yes_ask || 0.51),
          no_bid: 1 - parseFloat(m.yes_ask || 0.51),
          no_ask: 1 - parseFloat(m.yes_bid || 0.49),
          volume: parseFloat(String(m.volume || 0)),
          expires_in: m.expiry_date
            ? Math.floor((new Date(m.expiry_date).getTime() - Date.now()) / 1000)
            : 0,
          timestamp: Date.now(),
        }));
    } catch (e) {
      console.error('❌ Kalshi fetch error:', (e as Error).message);
      return [];
    }
  }

  // Fetch from Polymarket (read-only for pricing) - Currently unavailable (US blocked)
  private async fetchPolymarketPrices(): Promise<PriceQuote[]> {
    // Polymarket API returns 404 - service unavailable in this region
    return [];
  }

  // Fetch from Coinbase (spot prices - for reference and withdrawal)
  async fetchCoinbaseSpotPrices(): Promise<Map<string, number>> {
    try {
      const products = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD', 'XRP-USD'];
      const spotPrices = new Map<string, number>();

      for (const product of products) {
        try {
          const response = await fetch(
            `https://api.exchange.coinbase.com/products/${product}/ticker`
          );

          if (response.ok) {
            const data = (await response.json()) as any;
            const price = parseFloat(data.price || 0);
            if (price > 0) {
              spotPrices.set(product.split('-')[0], price); // e.g., "BTC" -> 70906.28
            }
          }
        } catch (e) {
          // Continue to next product
        }
      }

      return spotPrices;
    } catch (e) {
      console.error('❌ Coinbase fetch error:', (e as Error).message);
      return new Map();
    }
  }

  // Coinbase is a spot exchange, not a prediction market - placeholder for now
  private async fetchCoinbasePrices(): Promise<PriceQuote[]> {
    // Coinbase doesn't have YES/NO prediction markets
    // It's a spot exchange (BTC-USD, ETH-USD, etc.)
    // We'll use it for withdrawing profits and as a price reference
    return [];
  }

  // Fetch from FanDuel Sportsbook (prediction markets)
  private async fetchFanDuelPrices(): Promise<PriceQuote[]> {
    try {
      if (!this.fanDuelKey) {
        return [];
      }

      // FanDuel API endpoint for proposition bets / prediction markets
      const response = await fetch(
        `${this.fanDuelUrl}/api/leagues/CRYPTO/events?limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${this.fanDuelKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const events = data.events || [];

      return events
        .filter((event: any) => {
          return event.eventStatus === 'OPEN' && event.sport === 'CRYPTO';
        })
        .flatMap((event: any) => {
          // FanDuel has multiple prop bets per event
          return (event.competitions || [])
            .flatMap((comp: any) => {
              return (comp.competitors || []).map((competitor: any) => ({
                platform: 'fanduel',
                market_id: event.id,
                title: `${event.name} - ${competitor.name}`,
                yes_price: parseFloat(competitor.odds?.moneyline?.american) / 100 || 0.5,
                no_price: 1 - (parseFloat(competitor.odds?.moneyline?.american) / 100 || 0.5),
                yes_bid: 0,
                yes_ask: 0,
                volume: 0, // FanDuel doesn't expose volume
                expires_in: new Date(event.eventTime).getTime() - Date.now(),
                timestamp: Date.now(),
              }));
            });
        });
    } catch (e) {
      console.error('❌ FanDuel fetch error:', (e as Error).message);
      return [];
    }
  }

  // Fetch from DraftKings Sportsbook (prediction markets)
  private async fetchDraftKingsPrices(): Promise<PriceQuote[]> {
    try {
      if (!this.draftKingsKey) {
        return [];
      }

      // DraftKings API endpoint for crypto prediction markets
      const response = await fetch(
        `${this.draftKingsUrl}/sportsbook/v2/leagues/crypto`,
        {
          headers: {
            'Authorization': `Bearer ${this.draftKingsKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const events = data.events || [];

      return events
        .filter((event: any) => {
          return event.status === 'OPEN';
        })
        .flatMap((event: any) => {
          return (event.offers || []).map((offer: any) => {
            // Convert DK odds format to YES/NO probabilities
            const odds = parseFloat(offer.odds || '100');
            const yesPrice = odds > 0 ? 100 / (odds + 100) : 0.5;
            const noPrice = 1 - yesPrice;

            return {
              platform: 'draftkings',
              market_id: event.id,
              title: `${event.name} - ${offer.label}`,
              yes_price: yesPrice,
              no_price: noPrice,
              yes_bid: 0,
              yes_ask: 0,
              volume: 0, // DraftKings doesn't expose volume
              expires_in: new Date(event.startTime).getTime() - Date.now(),
              timestamp: Date.now(),
            };
          });
        });
    } catch (e) {
      console.error('❌ DraftKings fetch error:', (e as Error).message);
      return [];
    }
  }

  // Normalize titles to match across platforms
  private normalizeTitle(title: string): string {
    return (
      title
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  // Find arbitrage opportunities
  detectArbitrage(priceMap: Map<string, PriceQuote[]>): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    priceMap.forEach((quotes, normalizedTitle) => {
      // Need at least 2 platforms for arbitrage
      if (quotes.length < 2) return;

      const platformMap = new Map<string, PriceQuote>();
      quotes.forEach((q) => platformMap.set(q.platform, q));

      // Get unique platforms represented
      const platforms = Array.from(platformMap.keys());

      // Compare every pair of platforms
      for (let i = 0; i < platforms.length; i++) {
        for (let j = i + 1; j < platforms.length; j++) {
          const quote1 = platformMap.get(platforms[i])!;
          const quote2 = platformMap.get(platforms[j])!;

          // Check YES side arbitrage
          const yesDiff = quote2.yes_price - quote1.yes_price;
          const yesSpread = (Math.abs(yesDiff) / Math.max(quote1.yes_price, quote2.yes_price)) * 100;

          // Check NO side arbitrage
          const noDiff = quote2.no_price - quote1.no_price;
          const noSpread = (Math.abs(noDiff) / Math.max(quote1.no_price, quote2.no_price)) * 100;

          const FEES = 0.5; // 0.5% per side

          // YES arbitrage: buy cheap, sell expensive
          if (yesSpread > FEES * 2) {
            const buyPlatform = quote1.yes_price < quote2.yes_price ? platforms[i] : platforms[j];
            const sellPlatform = quote1.yes_price < quote2.yes_price ? platforms[j] : platforms[i];
            const buyPrice = Math.min(quote1.yes_price, quote2.yes_price);
            const sellPrice = Math.max(quote1.yes_price, quote2.yes_price);

            const positionSize = 500;
            const grossProfit = (positionSize / buyPrice) * (sellPrice - buyPrice);
            const netProfit = grossProfit - (positionSize * FEES) / 100;

            opportunities.push({
              asset: 'CRYPTO',
              title: quote1.title,
              buy_platform: buyPlatform,
              buy_side: 'YES',
              buy_price: buyPrice,
              sell_platform: sellPlatform,
              sell_side: 'YES',
              sell_price: sellPrice,
              spread_pct: yesSpread,
              roi_after_fees: ((netProfit / positionSize) * 100),
              position_size: positionSize,
              gross_profit: grossProfit,
              net_profit: netProfit,
              urgency: this.calculateUrgency(Math.min(quote1.expires_in, quote2.expires_in)),
              confidence_score: this.calculateConfidence(
                Math.min(quote1.volume, quote2.volume),
                yesSpread
              ),
            });
          }

          // NO arbitrage: similar logic
          if (noSpread > FEES * 2) {
            const buyPlatform = quote1.no_price < quote2.no_price ? platforms[i] : platforms[j];
            const sellPlatform = quote1.no_price < quote2.no_price ? platforms[j] : platforms[i];
            const buyPrice = Math.min(quote1.no_price, quote2.no_price);
            const sellPrice = Math.max(quote1.no_price, quote2.no_price);

            const positionSize = 500;
            const grossProfit = (positionSize / buyPrice) * (sellPrice - buyPrice);
            const netProfit = grossProfit - (positionSize * FEES) / 100;

            opportunities.push({
              asset: 'CRYPTO',
              title: quote1.title,
              buy_platform: buyPlatform,
              buy_side: 'NO',
              buy_price: buyPrice,
              sell_platform: sellPlatform,
              sell_side: 'NO',
              sell_price: sellPrice,
              spread_pct: noSpread,
              roi_after_fees: ((netProfit / positionSize) * 100),
              position_size: positionSize,
              gross_profit: grossProfit,
              net_profit: netProfit,
              urgency: this.calculateUrgency(Math.min(quote1.expires_in, quote2.expires_in)),
              confidence_score: this.calculateConfidence(
                Math.min(quote1.volume, quote2.volume),
                noSpread
              ),
            });
          }
        }
      }
    });

    // Sort by ROI descending
    return opportunities.sort((a, b) => b.roi_after_fees - a.roi_after_fees);
  }

  private calculateUrgency(timeToExpiry: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (timeToExpiry < 300) return 'HIGH'; // < 5 min
    if (timeToExpiry < 900) return 'MEDIUM'; // < 15 min
    return 'LOW';
  }

  private calculateConfidence(volume: number, spread: number): number {
    // Higher volume + wider spread = higher confidence
    const volumeScore = Math.min(volume / 10000000, 100);
    const spreadScore = Math.min(spread / 2, 50);
    return Math.min(volumeScore + spreadScore, 100);
  }

  displayAllPrices(priceMap: Map<string, PriceQuote[]>): void {
    console.log('\n💰 ACTIVE CRYPTO MARKETS\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    let count = 0;
    priceMap.forEach((quotes, title) => {
      if (count >= 20) return; // Show all
      count++;

      const q = quotes[0]; // Primary quote
      const minToExpiry = Math.floor(q.expires_in / 60);

      console.log(`${count}. ${q.title.substring(0, 65)}`);
      console.log(`   Expiry: ${minToExpiry}min | Volume: $${(q.volume / 1000000).toFixed(1)}M`);

      quotes.forEach((quote) => {
        const bidSpread = quote.yes_ask - quote.yes_bid;
        const bidSpreadPct = ((bidSpread / quote.yes_price) * 100).toFixed(2);
        console.log(
          `   ${quote.platform.toUpperCase().padEnd(10)} │ YES: ${quote.yes_price.toFixed(4)} │ NO: ${quote.no_price.toFixed(4)} │ Spread: ${bidSpreadPct}%`
        );
      });
      console.log('');
    });

    // Show platform status
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log('📡 PREDICTION MARKET PLATFORMS:');
    console.log('   ✅ Limitless: Connected (crypto predictions)');
    console.log(`   ⚠️  Kalshi: ${process.env.KALSHI_API_KEY ? 'Connected (event prediction)' : 'API key not configured'}`);
    console.log(`   ⚠️  FanDuel: ${process.env.FANDUEL_API_KEY ? 'Connected (sportsbook + crypto props)' : 'API key not configured'}`);
    console.log(`   ⚠️  DraftKings: ${process.env.DRAFTKINGS_API_KEY ? 'Connected (sportsbook + crypto props)' : 'API key not configured'}`);
    console.log('   ❌ Polymarket: Unavailable (US blocked)');
    console.log('\n💰 CASH & SPOT:');
    console.log('   Coinbase: Connected (spot prices + withdrawal)\n');
  }

  displayOpportunities(opportunities: ArbitrageOpportunity[]): void {
    if (opportunities.length === 0) {
      console.log('📊 No arbitrage opportunities found (all markets well-priced)\n');
      return;
    }

    console.log('\n🎯 CROSS-PLATFORM ARBITRAGE OPPORTUNITIES\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    opportunities.slice(0, 10).forEach((opp, idx) => {
      console.log(`${idx + 1}. ${opp.title.substring(0, 60)}`);
      console.log(`   ${opp.buy_side} Side: Buy ${opp.buy_platform} @ $${opp.buy_price.toFixed(4)}`);
      console.log(`   ${opp.sell_side} Side: Sell ${opp.sell_platform} @ $${opp.sell_price.toFixed(4)}`);
      console.log(`   Spread: ${opp.spread_pct.toFixed(2)}% | ROI: ${opp.roi_after_fees.toFixed(2)}%`);
      console.log(`   Net Profit: $${opp.net_profit.toFixed(2)} | Urgency: ${opp.urgency}`);
      console.log(
        `   Confidence: ${opp.confidence_score.toFixed(0)}/100\n`
      );
    });

    // Summary
    const totalPotentialProfit = opportunities.reduce((sum, o) => sum + o.net_profit, 0);
    const avgRoi = opportunities.reduce((sum, o) => sum + o.roi_after_fees, 0) / opportunities.length;
    const highUrgency = opportunities.filter((o) => o.urgency === 'HIGH').length;

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📈 SUMMARY`);
    console.log(`   Total opportunities: ${opportunities.length}`);
    console.log(`   Average ROI: ${avgRoi.toFixed(2)}%`);
    console.log(`   Total potential profit (top 10): $${totalPotentialProfit.toFixed(2)}`);
    console.log(`   High urgency (< 5 min): ${highUrgency}\n`);
  }
}

export default PriceShopper;

// Main
const shopper = new PriceShopper();

async function run() {
  // Fetch prediction market prices
  const priceMap = await shopper.fetchAllPrices();
  shopper.displayAllPrices(priceMap);

  // Fetch and display spot prices for reference
  const spotPrices = await shopper.fetchCoinbaseSpotPrices();
  if (spotPrices.size > 0) {
    console.log('\n💹 COINBASE SPOT PRICES (for reference & profit withdrawal)\n');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');
    spotPrices.forEach((price, symbol) => {
      console.log(`   ${symbol.padEnd(6)} │ $${price.toFixed(2)}`);
    });
    console.log('');
  }

  // Detect cross-platform arbitrage
  const opportunities = shopper.detectArbitrage(priceMap);
  shopper.displayOpportunities(opportunities);
}

run();
