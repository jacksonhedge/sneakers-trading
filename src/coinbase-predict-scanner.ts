// Coinbase Predict Scanner - Find markets expiring before 3 AM EDT

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

interface PredictMarket {
  market_id: string;
  title: string;
  condition: string;
  expiry: string;
  hours_until_expiry: number;
  probability: number; // 0-1
  odds: string;
  confidence: 'LOCK' | 'HAMMER' | 'GOOD' | 'Standard';
  position_size: number;
  estimated_return: number;
  yes_price: number;
  no_price: number;
}

class CoinbasePredictScanner {
  private baseUrl = 'https://api.coinbase.com/api/v2/markets';

  async getAllPredictMarkets(): Promise<PredictMarket[]> {
    try {
      // Coinbase Predict API endpoint
      const response = await fetch(`${this.baseUrl}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(`⚠️  Coinbase API error: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as any;
      const markets = data.data || data || [];

      const predictMarkets: PredictMarket[] = [];

      // If it's an array, iterate
      const marketList = Array.isArray(markets) ? markets : markets.markets || [];

      marketList.forEach((m: any) => {
        try {
          // Parse expiry time
          const expiryStr = m.expire_date || m.expires_at || m.end_date || '';
          const expiryDate = new Date(expiryStr);

          if (isNaN(expiryDate.getTime())) return;

          const now = new Date();
          const hoursLeft = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

          // Only include markets expiring within 24 hours
          if (hoursLeft <= 0 || hoursLeft > 24) return;

          // Parse outcomes (yes/no prices)
          const yesPrice = m.yes_price || m.probabilities?.yes || 0;
          const noPrice = m.no_price || m.probabilities?.no || 0;

          if (yesPrice >= 0.97) {
            predictMarkets.push({
              market_id: m.id || m.market_id || 'unknown',
              title: m.title || m.name || 'Unknown',
              condition: m.title || m.name || 'Unknown',
              expiry: expiryDate.toISOString(),
              hours_until_expiry: hoursLeft,
              probability: yesPrice,
              odds: `${(yesPrice * 100).toFixed(1)}%`,
              confidence:
                yesPrice >= 0.99 ? 'LOCK' : yesPrice >= 0.98 ? 'HAMMER' : 'GOOD',
              position_size: 500,
              estimated_return:
                yesPrice >= 0.99 ? 495 : yesPrice >= 0.98 ? 490 : 485,
              yes_price: yesPrice,
              no_price: noPrice,
            });
          }

          if (noPrice >= 0.97) {
            predictMarkets.push({
              market_id: m.id || m.market_id || 'unknown',
              title: m.title || m.name || 'Unknown',
              condition: m.title || m.name || 'Unknown',
              expiry: expiryDate.toISOString(),
              hours_until_expiry: hoursLeft,
              probability: noPrice,
              odds: `${(noPrice * 100).toFixed(1)}%`,
              confidence:
                noPrice >= 0.99 ? 'LOCK' : noPrice >= 0.98 ? 'HAMMER' : 'GOOD',
              position_size: 500,
              estimated_return:
                noPrice >= 0.99 ? 495 : noPrice >= 0.98 ? 490 : 485,
              yes_price: yesPrice,
              no_price: noPrice,
            });
          }
        } catch {
          // Skip malformed markets
        }
      });

      return predictMarkets.sort((a, b) => a.hours_until_expiry - b.hours_until_expiry);
    } catch (e) {
      console.error('Error fetching Coinbase Predict markets:', (e as Error).message);
      return [];
    }
  }

  async getEarlyMorningMarkets(beforeHour: number = 3): Promise<PredictMarket[]> {
    try {
      const allMarkets = await this.getAllPredictMarkets();

      // Filter for markets expiring before specified hour EDT
      return allMarkets.filter((m) => {
        const expiryDate = new Date(m.expiry);
        const expiryHourEDT = expiryDate.getHours() - 4; // UTC to EDT conversion (approximate)
        return expiryHourEDT < beforeHour && expiryHourEDT >= 0;
      });
    } catch (e) {
      console.error('Error filtering early morning markets:', (e as Error).message);
      return [];
    }
  }

  displayEarlyMarkets(markets: PredictMarket[]): void {
    console.log('\n🌙 COINBASE PREDICT - EARLY MORNING MARKETS (< 3 AM EDT)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (markets.length === 0) {
      console.log('❌ No early morning markets found\n');
      return;
    }

    markets.forEach((market, idx) => {
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
      console.log(
        `   Expires in ${market.hours_until_expiry.toFixed(2)}h | Confidence: ${market.confidence}\n`
      );
    });

    const locks = markets.filter((m) => m.confidence === 'LOCK').length;
    const hammers = markets.filter((m) => m.confidence === 'HAMMER').length;
    const goods = markets.filter((m) => m.confidence === 'GOOD').length;

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 SUMMARY`);
    console.log(`   Total opportunities: ${markets.length}`);
    console.log(`   🔒 LOCKS (99%+): ${locks}`);
    console.log(`   🔨 HAMMERS (98-99%): ${hammers}`);
    console.log(`   ✅ GOOD (97-98%): ${goods}`);
    console.log(
      `   Total capital (all): $${markets.length * 500} | Max profit: ~$${markets.length * 45}\n`
    );
  }
}

// Main
const scanner = new CoinbasePredictScanner();

(async () => {
  console.log('🔍 Scanning Coinbase Predict for early morning markets...\n');

  const earlyMarkets = await scanner.getEarlyMorningMarkets(3);
  scanner.displayEarlyMarkets(earlyMarkets);

  // Also show all markets expiring in next 24h
  console.log('\n📊 ALL MARKETS EXPIRING NEXT 24H:\n');
  const allMarkets = await scanner.getAllPredictMarkets();

  if (allMarkets.length === 0) {
    console.log('⚠️  No markets fetched - check API endpoint\n');
  } else {
    allMarkets.forEach((market) => {
      console.log(
        `${market.title.substring(0, 50)} | ${market.odds} | ${market.hours_until_expiry.toFixed(2)}h`
      );
    });
  }
})();

export default CoinbasePredictScanner;
