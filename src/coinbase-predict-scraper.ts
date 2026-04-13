// Coinbase Predict Web Scraper - Extract markets from UI

import fetch from 'node-fetch';

interface PredictMarket {
  title: string;
  condition: string;
  expiry: string;
  hours_until_expiry: number;
  yes_price: number;
  no_price: number;
  probability: number;
  odds: string;
  confidence: 'LOCK' | 'HAMMER' | 'GOOD';
  position_size: number;
  estimated_return: number;
}

class CoinbasePredictScraper {
  // Coinbase Predict appears to load data via API calls - let's intercept those
  private predictUrl = 'https://www.coinbase.com/api';

  async fetchPredictMarkets(): Promise<PredictMarket[]> {
    try {
      // Try the possible API endpoints Coinbase uses internally
      const endpoints = [
        'https://www.coinbase.com/api/v4/markets',
        'https://www.coinbase.com/api/v2/prediction/markets',
        'https://www.coinbase.com/api/prediction/markets',
        'https://www.coinbase.com/api/v1/prediction/markets',
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = (await response.json()) as any;
            console.log(`✅ Found markets at ${endpoint}`);
            return this.parseMarkets(data);
          }
        } catch {
          // Try next endpoint
        }
      }

      console.log('⚠️  Could not find Predict API endpoint via fetch');
      return [];
    } catch (e) {
      console.error('Error fetching Predict markets:', (e as Error).message);
      return [];
    }
  }

  private parseMarkets(data: any): PredictMarket[] {
    const markets: PredictMarket[] = [];

    // Handle various possible response formats
    const marketList = data.data || data.markets || data.results || data || [];
    const items = Array.isArray(marketList) ? marketList : [marketList];

    items.forEach((m: any) => {
      try {
        // Parse expiry
        const expiryStr = m.expire_date || m.expires_at || m.end_date || '';
        const expiryDate = new Date(expiryStr);

        if (isNaN(expiryDate.getTime())) return;

        const now = new Date();
        const hoursLeft = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Skip if not expiring within 24h
        if (hoursLeft <= 0 || hoursLeft > 24) return;

        // Extract probabilities
        const yesPrice = m.yes_price || m.yes || 0;
        const noPrice = m.no_price || m.no || 0;

        // Check for extreme probabilities (97%+)
        if (yesPrice >= 0.97) {
          markets.push({
            title: m.title || m.name || 'Unknown',
            condition: m.title || 'Unknown',
            expiry: expiryDate.toISOString(),
            hours_until_expiry: hoursLeft,
            yes_price: yesPrice,
            no_price: noPrice,
            probability: yesPrice,
            odds: `${(yesPrice * 100).toFixed(1)}%`,
            confidence:
              yesPrice >= 0.99 ? 'LOCK' : yesPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            position_size: 500,
            estimated_return:
              yesPrice >= 0.99 ? 495 : yesPrice >= 0.98 ? 490 : 485,
          });
        }

        if (noPrice >= 0.97) {
          markets.push({
            title: m.title || m.name || 'Unknown',
            condition: m.title || 'Unknown',
            expiry: expiryDate.toISOString(),
            hours_until_expiry: hoursLeft,
            yes_price: yesPrice,
            no_price: noPrice,
            probability: noPrice,
            odds: `${(noPrice * 100).toFixed(1)}%`,
            confidence:
              noPrice >= 0.99 ? 'LOCK' : noPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            position_size: 500,
            estimated_return:
              noPrice >= 0.99 ? 495 : noPrice >= 0.98 ? 490 : 485,
          });
        }
      } catch {
        // Skip malformed entries
      }
    });

    return markets.sort((a, b) => a.hours_until_expiry - b.hours_until_expiry);
  }

  displayMarkets(markets: PredictMarket[]): void {
    console.log('\n🌙 COINBASE PREDICT - EARLY MORNING MARKETS\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (markets.length === 0) {
      console.log('❌ No extreme probability markets found in next 24h\n');
      console.log(
        '💡 Try one of these to find markets manually:\n'
      );
      console.log('   1. Open https://www.coinbase.com/predict\n');
      console.log('   2. Check Network tab (DevTools) for API calls\n');
      console.log(
        '   3. Share the actual endpoint URL and we can integrate it\n'
      );
      return;
    }

    const earlyMarkets = markets.filter((m) => m.hours_until_expiry < 6);

    if (earlyMarkets.length === 0) {
      console.log('❌ No markets expiring in next 6 hours\n');
      console.log('📊 Markets expiring next 24h:\n');
      markets.forEach((m) => {
        console.log(
          `${m.title.substring(0, 60)} | ${m.odds} | ${m.hours_until_expiry.toFixed(1)}h`
        );
      });
      return;
    }

    earlyMarkets.forEach((market, idx) => {
      const badge =
        market.confidence === 'LOCK'
          ? '🔒'
          : market.confidence === 'HAMMER'
            ? '🔨'
            : '✅';

      console.log(`${idx + 1}. ${market.title.substring(0, 70)}`);
      console.log(
        `   ${badge} @ ${market.odds} | Pos: $${market.position_size} | Return: ~$${market.estimated_return}`
      );
      console.log(`   Expires in ${market.hours_until_expiry.toFixed(2)}h\n`);
    });

    const locks = earlyMarkets.filter((m) => m.confidence === 'LOCK').length;
    const hammers = earlyMarkets.filter((m) => m.confidence === 'HAMMER').length;
    const goods = earlyMarkets.filter((m) => m.confidence === 'GOOD').length;

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 SUMMARY (Early morning < 6h)`);
    console.log(`   Total opportunities: ${earlyMarkets.length}`);
    console.log(`   🔒 LOCKS (99%+): ${locks}`);
    console.log(`   🔨 HAMMERS (98-99%): ${hammers}`);
    console.log(`   ✅ GOOD (97-98%): ${goods}\n`);
  }
}

// Main
const scraper = new CoinbasePredictScraper();

(async () => {
  console.log('🔍 Scanning Coinbase Predict for early morning markets...\n');

  const markets = await scraper.fetchPredictMarkets();
  scraper.displayMarkets(markets);
})();

export default CoinbasePredictScraper;
