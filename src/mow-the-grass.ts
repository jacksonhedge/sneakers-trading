// Mow the Grass - Find extreme odds (97-99%) and hammer them

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface GrassOpportunity {
  title: string;
  expires_in: number; // seconds
  side: 'YES' | 'NO';
  probability: number; // 0.97-0.99+
  odds: string; // Display format
  confidence: 'LOCK' | 'HAMMER' | 'GOOD';
  position_size: number; // $500 recommended
  estimated_return: number;
}

class MowTheGrass {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;

  async findGrassMarkets(): Promise<GrassOpportunity[]> {
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

      const opportunities: GrassOpportunity[] = [];

      markets.forEach((m: any) => {
        // Only crypto markets with valid prices
        if (
          !m.tags ||
          !m.tags.some((tag: string) =>
            ['crypto', 'btc', 'eth', 'sol', 'xrp', 'doge', 'ada'].some((t) =>
              tag.toLowerCase().includes(t)
            )
          )
        )
          return;

        if (!Array.isArray(m.prices) || m.prices[0] >= 1 || m.prices[1] >= 1) return;

        const yesPrice = m.prices[0];
        const noPrice = m.prices[1];
        const expiresIn = 3600; // ~1 hour for most markets

        // Find extreme odds (97%+)
        if (yesPrice >= 0.97) {
          opportunities.push({
            title: m.title,
            expires_in: expiresIn,
            side: 'YES',
            probability: yesPrice,
            odds: `${(yesPrice * 100).toFixed(1)}%`,
            confidence: yesPrice >= 0.99 ? 'LOCK' : yesPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            position_size: 500,
            estimated_return: yesPrice >= 0.99 ? 495 : yesPrice >= 0.98 ? 490 : 485,
          });
        }

        if (noPrice >= 0.97) {
          opportunities.push({
            title: m.title,
            expires_in: expiresIn,
            side: 'NO',
            probability: noPrice,
            odds: `${(noPrice * 100).toFixed(1)}%`,
            confidence: noPrice >= 0.99 ? 'LOCK' : noPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            position_size: 500,
            estimated_return: noPrice >= 0.99 ? 495 : noPrice >= 0.98 ? 490 : 485,
          });
        }
      });

      return opportunities.sort((a, b) => b.probability - a.probability);
    } catch (e) {
      console.error('Error fetching markets:', (e as Error).message);
      return [];
    }
  }

  groupByExpiration(opportunities: GrassOpportunity[]): Map<string, GrassOpportunity[]> {
    const groups = new Map<string, GrassOpportunity[]>();

    const intervals = [
      { label: '0-5 min', min: 0, max: 300 },
      { label: '5-15 min', min: 300, max: 900 },
      { label: '15-30 min', min: 900, max: 1800 },
      { label: '30-60 min', min: 1800, max: 3600 },
      { label: '1h+ ', min: 3600, max: Infinity },
    ];

    intervals.forEach((interval) => {
      const matched = opportunities.filter(
        (o) => o.expires_in >= interval.min && o.expires_in < interval.max
      );
      if (matched.length > 0) {
        groups.set(interval.label, matched);
      }
    });

    return groups;
  }

  displayGrassMarkets(groupedByTime: Map<string, GrassOpportunity[]>): void {
    console.log('\n🔪 MOW THE GRASS - EXTREME ODDS (97%+)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    let totalOpportunities = 0;
    let totalLocks = 0;
    let totalHammers = 0;

    groupedByTime.forEach((opportunities, timeLabel) => {
      if (opportunities.length === 0) return;

      console.log(`⏰ ${timeLabel.toUpperCase()} (${opportunities.length} markets)\n`);

      opportunities.forEach((opp, idx) => {
        const badge =
          opp.confidence === 'LOCK'
            ? '🔒'
            : opp.confidence === 'HAMMER'
              ? '🔨'
              : '✅';

        console.log(
          `${idx + 1}. ${opp.title.substring(0, 70)}`
        );
        console.log(
          `   ${badge} BET ${opp.side} @ ${opp.odds} | Pos: $${opp.position_size} | Return: ~$${opp.estimated_return}`
        );
        console.log(
          `   Expires: ${Math.floor(opp.expires_in / 60)}m | Confidence: ${opp.confidence}\n`
        );

        totalOpportunities++;
        if (opp.confidence === 'LOCK') totalLocks++;
        if (opp.confidence === 'HAMMER') totalHammers++;
      });
    });

    if (totalOpportunities === 0) {
      console.log('❌ No grass to mow (no 97%+ markets found)\n');
    } else {
      console.log(
        '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
      );
      console.log(`📊 SUMMARY`);
      console.log(`   Total opportunities: ${totalOpportunities}`);
      console.log(`   🔒 LOCKS (99%+): ${totalLocks}`);
      console.log(`   🔨 HAMMERS (98-99%): ${totalHammers}`);
      console.log(`   ✅ GOOD (97-98%): ${totalOpportunities - totalLocks - totalHammers}`);
      console.log(
        `   Total capital (all): $${totalOpportunities * 500} | Max profit: ~$${totalOpportunities * 45}\n`
      );
    }
  }
}

// Main
const mower = new MowTheGrass();

mower.findGrassMarkets().then((opportunities) => {
  const groupedByTime = mower.groupByExpiration(opportunities);
  mower.displayGrassMarkets(groupedByTime);
});

export default MowTheGrass;
