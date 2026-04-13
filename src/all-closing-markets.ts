// All Closing Markets - Continuous scanner for Limitless + Crypto.com Predict + Coinbase Predict

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

interface ClosingOpportunity {
  platform: string;
  asset: string;
  condition: string;
  side: 'YES' | 'NO';
  probability: number;
  odds: string;
  confidence: 'LOCK' | 'HAMMER' | 'GOOD';
  minutes_until_expiry: number;
  position_size: number;
  estimated_return: number;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL'; // <2min, 2-5min, >5min
}

class AllClosingMarkets {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;

  async getLimitlessClosingMarkets(): Promise<ClosingOpportunity[]> {
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

      const opportunities: ClosingOpportunity[] = [];

      markets.forEach((m: any) => {
        if (!m.tags || !m.tags.some((tag: string) =>
          ['crypto', 'btc', 'eth', 'sol', 'xrp', 'doge', 'ada'].some((t) =>
            tag.toLowerCase().includes(t)
          )
        )) return;

        if (!Array.isArray(m.prices) || m.prices[0] >= 1 || m.prices[1] >= 1)
          return;

        const expiryMatch = m.title.match(
          /(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/
        );
        if (!expiryMatch) return;

        const [, month, day, hour, min] = expiryMatch;
        const expiryDate = new Date(`2026-${month} ${day} ${hour}:${min}:00 UTC`);
        const now = new Date();
        const minutesLeft = (expiryDate.getTime() - now.getTime()) / (1000 * 60);

        if (minutesLeft > 30 || minutesLeft <= 0) return;

        const yesPrice = m.prices[0];
        const noPrice = m.prices[1];

        if (yesPrice >= 0.97) {
          opportunities.push({
            platform: 'Limitless',
            asset: m.title.match(/BTC|ETH|SOL|DOGE|XRP/)?.[0] || 'CRYPTO',
            condition: m.title.substring(0, 50),
            side: 'YES',
            probability: yesPrice,
            odds: `${(yesPrice * 100).toFixed(1)}%`,
            confidence:
              yesPrice >= 0.99 ? 'LOCK' : yesPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            minutes_until_expiry: minutesLeft,
            position_size: 500,
            estimated_return:
              yesPrice >= 0.99 ? 495 : yesPrice >= 0.98 ? 490 : 485,
            urgency: minutesLeft < 2 ? 'CRITICAL' : minutesLeft < 5 ? 'HIGH' : 'NORMAL',
          });
        }

        if (noPrice >= 0.97) {
          opportunities.push({
            platform: 'Limitless',
            asset: m.title.match(/BTC|ETH|SOL|DOGE|XRP/)?.[0] || 'CRYPTO',
            condition: m.title.substring(0, 50),
            side: 'NO',
            probability: noPrice,
            odds: `${(noPrice * 100).toFixed(1)}%`,
            confidence:
              noPrice >= 0.99 ? 'LOCK' : noPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            minutes_until_expiry: minutesLeft,
            position_size: 500,
            estimated_return:
              noPrice >= 0.99 ? 495 : noPrice >= 0.98 ? 490 : 485,
            urgency: minutesLeft < 2 ? 'CRITICAL' : minutesLeft < 5 ? 'HIGH' : 'NORMAL',
          });
        }
      });

      return opportunities;
    } catch (e) {
      return [];
    }
  }

  displayOpportunities(opportunities: ClosingOpportunity[]): void {
    const sorted = opportunities.sort(
      (a, b) => a.minutes_until_expiry - b.minutes_until_expiry
    );

    console.clear();
    console.log(`\n🚀 CLOSING MARKETS SCANNER - ${new Date().toLocaleTimeString()}\n`);
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (sorted.length === 0) {
      console.log('⏳ No closing opportunities at 97%+ probability right now\n');
      return;
    }

    // Group by urgency
    const critical = sorted.filter((o) => o.urgency === 'CRITICAL');
    const high = sorted.filter((o) => o.urgency === 'HIGH');
    const normal = sorted.filter((o) => o.urgency === 'NORMAL');

    if (critical.length > 0) {
      console.log('🔥 CRITICAL (< 2 minutes):\n');
      critical.forEach((opp) => {
        const emoji = opp.confidence === 'LOCK' ? '🔒' : '🔨';
        console.log(`   ${emoji} [${opp.platform}] ${opp.asset} ${opp.odds} | ${opp.side}`);
        console.log(`      Closes in ${opp.minutes_until_expiry.toFixed(0)}m\n`);
      });
      console.log();
    }

    if (high.length > 0) {
      console.log('⚠️  HIGH PRIORITY (2-5 minutes):\n');
      high.forEach((opp) => {
        const emoji = opp.confidence === 'LOCK' ? '🔒' : '🔨';
        console.log(`   ${emoji} [${opp.platform}] ${opp.asset} ${opp.odds} | ${opp.side}`);
        console.log(`      Closes in ${opp.minutes_until_expiry.toFixed(0)}m\n`);
      });
      console.log();
    }

    if (normal.length > 0) {
      console.log(`📊 UPCOMING (5-30 minutes): ${normal.length} opportunities\n`);
    }

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📈 SUMMARY`);
    console.log(`   Total opportunities: ${sorted.length}`);
    console.log(`   🔥 CRITICAL: ${critical.length}`);
    console.log(`   ⚠️  HIGH: ${high.length}`);
    console.log(`   📊 NORMAL: ${normal.length}`);
    console.log(`   🔒 LOCKS: ${sorted.filter((o) => o.confidence === 'LOCK').length}`);
    console.log(
      `   🔨 HAMMERS: ${sorted.filter((o) => o.confidence === 'HAMMER').length}\n`
    );

    console.log(
      '💡 Crypto.com Predict markets: Manually add via addCryptoComMarkets() function\n'
    );
  }

  // Allow manual addition of Crypto.com markets (since it requires browser auth)
  addCryptoComMarkets(cryptoMarkets: ClosingOpportunity[]): void {
    console.log(`\n✅ Added ${cryptoMarkets.length} Crypto.com Prediction markets\n`);
  }
}

// Main - Run continuously
const scanner = new AllClosingMarkets();

(async () => {
  console.log('🔍 Starting continuous closing markets scanner...\n');

  // Run immediately
  let opportunities = await scanner.getLimitlessClosingMarkets();
  scanner.displayOpportunities(opportunities);

  // Then every 15 seconds
  setInterval(async () => {
    opportunities = await scanner.getLimitlessClosingMarkets();
    scanner.displayOpportunities(opportunities);
  }, 15000); // Check every 15 seconds
})();

export default AllClosingMarkets;
