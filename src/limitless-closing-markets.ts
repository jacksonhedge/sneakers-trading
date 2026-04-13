// Limitless Closing Markets - Find markets expiring in next 10 minutes at 97-98%+

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface ClosingMarket {
  market_id: string;
  title: string;
  side: 'YES' | 'NO';
  probability: number;
  odds: string;
  confidence: 'LOCK' | 'HAMMER' | 'GOOD';
  seconds_until_expiry: number;
  minutes_until_expiry: number;
  position_size: number;
  estimated_return: number;
}

class LimitlessClosingMarkets {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;

  async findClosingMarkets(): Promise<ClosingMarket[]> {
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

      const closingMarkets: ClosingMarket[] = [];

      markets.forEach((m: any) => {
        // Only crypto markets
        if (
          !m.tags ||
          !m.tags.some((tag: string) =>
            ['crypto', 'btc', 'eth', 'sol', 'xrp', 'doge', 'ada'].some((t) =>
              tag.toLowerCase().includes(t)
            )
          )
        )
          return;

        if (!Array.isArray(m.prices) || m.prices[0] >= 1 || m.prices[1] >= 1)
          return;

        // Parse expiry from title (format: "...on Apr 13, 10:00 UTC?")
        const expiryMatch = m.title.match(
          /(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/
        );
        if (!expiryMatch) return;

        const [, month, day, hour, min] = expiryMatch;
        const expiryDate = new Date(`2026-${month} ${day} ${hour}:${min}:00 UTC`);
        const now = new Date();
        const secondsLeft = (expiryDate.getTime() - now.getTime()) / 1000;
        const minutesLeft = secondsLeft / 60;

        // Only markets expiring within 10 minutes
        if (minutesLeft > 10 || minutesLeft <= 0) return;

        const yesPrice = m.prices[0];
        const noPrice = m.prices[1];

        // Find extreme odds (97%+)
        if (yesPrice >= 0.97) {
          closingMarkets.push({
            market_id: m.id,
            title: m.title,
            side: 'YES',
            probability: yesPrice,
            odds: `${(yesPrice * 100).toFixed(1)}%`,
            confidence:
              yesPrice >= 0.99 ? 'LOCK' : yesPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            seconds_until_expiry: secondsLeft,
            minutes_until_expiry: minutesLeft,
            position_size: 500,
            estimated_return:
              yesPrice >= 0.99 ? 495 : yesPrice >= 0.98 ? 490 : 485,
          });
        }

        if (noPrice >= 0.97) {
          closingMarkets.push({
            market_id: m.id,
            title: m.title,
            side: 'NO',
            probability: noPrice,
            odds: `${(noPrice * 100).toFixed(1)}%`,
            confidence:
              noPrice >= 0.99 ? 'LOCK' : noPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            seconds_until_expiry: secondsLeft,
            minutes_until_expiry: minutesLeft,
            position_size: 500,
            estimated_return:
              noPrice >= 0.99 ? 495 : noPrice >= 0.98 ? 490 : 485,
          });
        }
      });

      return closingMarkets.sort((a, b) => a.seconds_until_expiry - b.seconds_until_expiry);
    } catch (e) {
      console.error('Error fetching closing markets:', (e as Error).message);
      return [];
    }
  }

  displayClosingMarkets(markets: ClosingMarket[]): void {
    console.log('\n⏰ LIMITLESS - CLOSING MARKETS (< 10 min, 97%+)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (markets.length === 0) {
      console.log('❌ No closing markets at 97%+ probability\n');
      console.log('💡 These appear in the final 10 minutes of markets as outcomes settle\n');
      return;
    }

    markets.forEach((market, idx) => {
      const badge =
        market.confidence === 'LOCK'
          ? '🔒'
          : market.confidence === 'HAMMER'
            ? '🔨'
            : '✅';

      console.log(
        `${idx + 1}. ${market.title.substring(0, 70)}`
      );
      console.log(
        `   ${badge} BET ${market.side} @ ${market.odds} | Pos: $${market.position_size} | Return: ~$${market.estimated_return}`
      );
      console.log(
        `   ⚠️  CLOSING IN ${market.minutes_until_expiry.toFixed(1)}m (${Math.floor(market.seconds_until_expiry)}s) | Confidence: ${market.confidence}`
      );
      console.log(`   ID: ${market.market_id}\n`);
    });

    const locks = markets.filter((m) => m.confidence === 'LOCK').length;
    const hammers = markets.filter((m) => m.confidence === 'HAMMER').length;
    const goods = markets.filter((m) => m.confidence === 'GOOD').length;

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 SUMMARY`);
    console.log(`   Total closing opportunities: ${markets.length}`);
    console.log(`   🔒 LOCKS (99%+): ${locks}`);
    console.log(`   🔨 HAMMERS (98-99%): ${hammers}`);
    console.log(`   ✅ GOOD (97-98%): ${goods}`);
    console.log(
      `   Max capital (all): $${markets.length * 500} | Max profit: ~$${markets.length * 45}\n`
    );
  }
}

// Main - Run continuously to catch closing markets
const scanner = new LimitlessClosingMarkets();

(async () => {
  console.log('🔍 Scanning Limitless for closing markets (97%+, <10 min)...\n');

  // Run once
  const closingMarkets = await scanner.findClosingMarkets();
  scanner.displayClosingMarkets(closingMarkets);

  // Optional: Run every 30 seconds to catch new closing markets
  console.log('💡 Set up continuous scanning? (Uncomment the interval below)\n');

  /*
  setInterval(async () => {
    const markets = await scanner.findClosingMarkets();
    if (markets.length > 0) {
      console.clear();
      console.log('🔄 REFRESH: ' + new Date().toLocaleTimeString());
      scanner.displayClosingMarkets(markets);
    }
  }, 30000); // Check every 30 seconds
  */
})();

export default LimitlessClosingMarkets;
