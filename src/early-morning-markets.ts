// Early Morning Markets - Find all markets expiring before 3 AM ET

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

interface EarlyMarket {
  platform: string;
  title: string;
  asset: string;
  condition: string;
  expiry_time: string;
  hours_until_expiry: number;
  side: 'YES' | 'NO';
  price: number;
  confidence: string;
}

class EarlyMorningMarkets {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;

  private parseExpiryTime(expiryStr: string): Date | null {
    try {
      // Handle formats like "on Apr 13, 10:00 UTC?" or similar
      const dateMatch = expiryStr.match(
        /(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/i
      );
      if (!dateMatch) return null;

      const [, month, day, hour, min, ampm] = dateMatch;
      let hours = parseInt(hour);

      // Convert to 24-hour format
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
      }

      // Create date in 2026
      const date = new Date(`2026-${month} ${day} ${hours}:${min}:00`);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  private hoursUntilExpiry(expiryDate: Date): number {
    const now = new Date();
    return (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  }

  private isBeforeThreeAM(expiryStr: string): boolean {
    const expiryDate = this.parseExpiryTime(expiryStr);
    if (!expiryDate) return false;

    const hours = expiryDate.getHours();
    return hours < 3; // 0, 1, 2 hours
  }

  async findLimitlessEarlyMarkets(): Promise<EarlyMarket[]> {
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

      const earlyMarkets: EarlyMarket[] = [];

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

        // Parse title to extract asset
        const titleLower = m.title.toLowerCase();
        let asset = 'UNKNOWN';
        if (titleLower.includes('btc') || titleLower.includes('bitcoin'))
          asset = 'BTC';
        else if (titleLower.includes('eth') || titleLower.includes('ethereum'))
          asset = 'ETH';
        else if (titleLower.includes('sol')) asset = 'SOL';
        else if (titleLower.includes('xrp')) asset = 'XRP';
        else if (titleLower.includes('doge')) asset = 'DOGE';

        // Check for early morning expiry
        if (this.isBeforeThreeAM(m.title)) {
          const expiryDate = this.parseExpiryTime(m.title);
          const hoursLeft = expiryDate
            ? this.hoursUntilExpiry(expiryDate)
            : 0;

          const yesPrice = m.prices[0];
          const noPrice = m.prices[1];

          // Add YES side if interesting
          if (yesPrice !== 0.5) {
            earlyMarkets.push({
              platform: 'Limitless',
              title: m.title,
              asset,
              condition: m.title.substring(0, 50),
              expiry_time: m.title,
              hours_until_expiry: hoursLeft,
              side: 'YES',
              price: yesPrice,
              confidence:
                yesPrice >= 0.97 ? 'LOCK/HAMMER' : 'Standard',
            });
          }

          // Add NO side if interesting
          if (noPrice !== 0.5) {
            earlyMarkets.push({
              platform: 'Limitless',
              title: m.title,
              asset,
              condition: m.title.substring(0, 50),
              expiry_time: m.title,
              hours_until_expiry: hoursLeft,
              side: 'NO',
              price: noPrice,
              confidence:
                noPrice >= 0.97 ? 'LOCK/HAMMER' : 'Standard',
            });
          }
        }
      });

      return earlyMarkets.sort((a, b) => a.hours_until_expiry - b.hours_until_expiry);
    } catch (e) {
      console.error('Error fetching Limitless markets:', (e as Error).message);
      return [];
    }
  }

  getSportsbookEarlyMarkets(): EarlyMarket[] {
    // FanDuel data from the earlier scraper
    const fanDuelData = [
      {
        platform: 'FanDuel',
        asset: 'BTC',
        condition: 'Above 71000',
        expiry_time: 'Apr 13, 10:00 AM ET',
        yesPrice: 0.601,
        noPrice: 0.541,
      },
      {
        platform: 'FanDuel',
        asset: 'BTC',
        condition: 'Above 71250',
        expiry_time: 'Apr 13, 10:00 AM ET',
        yesPrice: 0.500,
        noPrice: 0.370,
      },
      {
        platform: 'FanDuel',
        asset: 'BTC',
        condition: 'Above 71500',
        expiry_time: 'Apr 13, 10:00 AM ET',
        yesPrice: 0.600,
        noPrice: 0.273,
      },
      {
        platform: 'FanDuel',
        asset: 'ETH',
        condition: 'Above 2175',
        expiry_time: 'Apr 13, 4:00 PM ET',
        yesPrice: 0.740,
        noPrice: 0.610,
      },
      {
        platform: 'FanDuel',
        asset: 'ETH',
        condition: 'Above 2200',
        expiry_time: 'Apr 13, 4:00 PM ET',
        yesPrice: 0.561,
        noPrice: 0.417,
      },
      {
        platform: 'FanDuel',
        asset: 'ETH',
        condition: 'Above 2225',
        expiry_time: 'Apr 13, 4:00 PM ET',
        yesPrice: 0.631,
        noPrice: 0.760,
      },
    ];

    const earlyMarkets: EarlyMarket[] = [];

    fanDuelData.forEach((m) => {
      // None of these FanDuel markets expire before 3 AM (earliest is 10 AM)
      if (this.isBeforeThreeAM(m.expiry_time)) {
        earlyMarkets.push({
          platform: m.platform,
          title: `${m.asset} ${m.condition}`,
          asset: m.asset,
          condition: m.condition,
          expiry_time: m.expiry_time,
          hours_until_expiry: 0,
          side: 'YES',
          price: m.yesPrice,
          confidence: 'Standard',
        });
      }
    });

    return earlyMarkets;
  }

  displayResults(limitlessEarly: EarlyMarket[], sportsbookEarly: EarlyMarket[]): void {
    const all = [...limitlessEarly, ...sportsbookEarly].sort(
      (a, b) => a.hours_until_expiry - b.hours_until_expiry
    );

    console.log('\n🌙 EARLY MORNING MARKETS (Expiring before 3 AM ET)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (all.length === 0) {
      console.log('❌ No markets expiring before 3 AM currently available\n');
      console.log(
        '💡 Most crypto markets on Limitless expire 10 AM - 4 PM UTC\n'
      );
      console.log('💡 FanDuel/DraftKings markets expire 10 AM - 4 PM ET (much later)\n');
      return;
    }

    all.forEach((market, idx) => {
      const badge = market.confidence === 'LOCK/HAMMER' ? '🔨' : '📊';
      console.log(
        `${idx + 1}. [${market.platform}] ${market.asset} - ${market.condition}`
      );
      console.log(
        `   ${badge} ${market.side} @ ${(market.price * 100).toFixed(1)}% | Expires in ${market.hours_until_expiry.toFixed(1)}h`
      );
      console.log(`   ${market.expiry_time}\n`);
    });

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 SUMMARY`);
    console.log(`   Total early markets: ${all.length}`);
    console.log(
      `   Limitless: ${limitlessEarly.length} | Sportsbooks: ${sportsbookEarly.length}\n`
    );
  }
}

// Main
const finder = new EarlyMorningMarkets();

(async () => {
  const limitlessEarly = await finder.findLimitlessEarlyMarkets();
  const sportsbookEarly = finder.getSportsbookEarlyMarkets();

  finder.displayResults(limitlessEarly, sportsbookEarly);
})();

export default EarlyMorningMarkets;
