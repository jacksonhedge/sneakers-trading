// Sportsbook Scraper - Parse FanDuel & DraftKings prediction odds

interface OddsMarket {
  platform: string;
  asset: string; // BTC, ETH, etc.
  condition: string; // "Above 71000"
  yes_odds: number;
  no_odds: number;
  yes_probability: number;
  no_probability: number;
  expires: string;
}

class SportsbookScraper {
  // Convert American odds to implied probability
  private americanOddsToProbability(odds: number): number {
    if (odds < 0) {
      return Math.abs(odds) / (Math.abs(odds) + 100);
    } else {
      return 100 / (odds + 100);
    }
  }

  // Parse FanDuel or DraftKings odds
  parseOdds(markets: any[]): OddsMarket[] {
    return markets.map((m) => {
      const yesProb = this.americanOddsToProbability(m.yes_odds);
      const noProb = this.americanOddsToProbability(m.no_odds);

      return {
        platform: m.platform,
        asset: m.asset,
        condition: m.condition,
        yes_odds: m.yes_odds,
        no_odds: m.no_odds,
        yes_probability: yesProb,
        no_probability: noProb,
        expires: m.expires,
      };
    });
  }

  // Convert to price shopper format
  convertToPrices(markets: OddsMarket[]): any[] {
    return markets.map((m) => ({
      platform: m.platform,
      market_id: `${m.platform}_${m.asset}_${m.condition.replace(/\s+/g, '_')}`,
      title: `${m.asset} ${m.condition} (${m.expires})`,
      yes_price: m.yes_probability,
      no_price: m.no_probability,
      yes_bid: m.yes_probability - 0.01,
      yes_ask: m.yes_probability + 0.01,
      no_bid: m.no_probability - 0.01,
      no_ask: m.no_probability + 0.01,
      volume: 0,
      expires_in: 3600,
      timestamp: Date.now(),
    }));
  }

  displayComparison(sportsbookMarkets: OddsMarket[], limitlessMarkets: any[]): void {
    console.log('\n🎯 ARBITRAGE OPPORTUNITIES - SPORTSBOOKS vs LIMITLESS\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    sportsbookMarkets.forEach((sbMarket) => {
      const asset = sbMarket.asset.toUpperCase();

      // Find matching Limitless market (rough match by asset)
      // In reality you'd need better matching logic

      const yesSpread = Math.abs(sbMarket.yes_probability - 0.5) * 100; // Simplified
      const noSpread = Math.abs(sbMarket.no_probability - 0.5) * 100;

      console.log(`${asset} - ${sbMarket.condition}`);
      console.log(`   ${sbMarket.platform.toUpperCase()}`);
      console.log(
        `   YES: ${(sbMarket.yes_probability * 100).toFixed(1)}% (${sbMarket.yes_odds > 0 ? '+' : ''}${sbMarket.yes_odds})`
      );
      console.log(
        `   NO:  ${(sbMarket.no_probability * 100).toFixed(1)}% (${sbMarket.no_odds > 0 ? '+' : ''}${sbMarket.no_odds})`
      );
      console.log(
        `   Sum: ${((sbMarket.yes_probability + sbMarket.no_probability) * 100).toFixed(1)}% (vig: ${(((sbMarket.yes_probability + sbMarket.no_probability) * 100) - 100).toFixed(1)}%)\n`
      );
    });
  }
}

// Example: Parse your FanDuel data
const fanDuelData = [
  // Bitcoin 10:00 AM
  {
    platform: 'fanduel',
    asset: 'BTC',
    condition: 'Above 71000',
    yes_odds: -150,
    no_odds: -118,
    expires: 'Apr 13, 10:00 AM ET',
  },
  {
    platform: 'fanduel',
    asset: 'BTC',
    condition: 'Above 71250',
    yes_odds: 100,
    no_odds: -171,
    expires: 'Apr 13, 10:00 AM ET',
  },
  {
    platform: 'fanduel',
    asset: 'BTC',
    condition: 'Above 71500',
    yes_odds: 150,
    no_odds: -271,
    expires: 'Apr 13, 10:00 AM ET',
  },
  // Bitcoin 4:00 PM
  {
    platform: 'fanduel',
    asset: 'BTC',
    condition: 'Above 71000',
    yes_odds: -150,
    no_odds: -118,
    expires: 'Apr 13, 4:00 PM ET',
  },
  {
    platform: 'fanduel',
    asset: 'BTC',
    condition: 'Above 71250',
    yes_odds: -109,
    no_odds: -164,
    expires: 'Apr 13, 4:00 PM ET',
  },
  {
    platform: 'fanduel',
    asset: 'BTC',
    condition: 'Above 71500',
    yes_odds: 132,
    no_odds: -234,
    expires: 'Apr 13, 4:00 PM ET',
  },
  // Ethereum 4:00 PM
  {
    platform: 'fanduel',
    asset: 'ETH',
    condition: 'Above 2150',
    yes_odds: 0, // Not shown, NO +334 means YES locked
    no_odds: 334,
    expires: 'Apr 13, 4:00 PM ET',
  },
  {
    platform: 'fanduel',
    asset: 'ETH',
    condition: 'Above 2175',
    yes_odds: -285,
    no_odds: 156,
    expires: 'Apr 13, 4:00 PM ET',
  },
  {
    platform: 'fanduel',
    asset: 'ETH',
    condition: 'Above 2200',
    yes_odds: -128,
    no_odds: -139,
    expires: 'Apr 13, 4:00 PM ET',
  },
  {
    platform: 'fanduel',
    asset: 'ETH',
    condition: 'Above 2225',
    yes_odds: 170,
    no_odds: -317,
    expires: 'Apr 13, 4:00 PM ET',
  },
  {
    platform: 'fanduel',
    asset: 'ETH',
    condition: 'Above 2250',
    yes_odds: 376,
    no_odds: 0, // Not shown
    expires: 'Apr 13, 4:00 PM ET',
  },
];

const scraper = new SportsbookScraper();
const parsed = scraper.parseOdds(fanDuelData);

console.log('📊 FANDUEL PREDICTION MARKETS\n');
console.log('═══════════════════════════════════════════════════════════════════\n');

parsed.forEach((market) => {
  console.log(`${market.asset} - ${market.condition} (${market.expires})`);
  console.log(
    `   YES: ${(market.yes_probability * 100).toFixed(1)}% (${market.yes_odds > 0 ? '+' : ''}${market.yes_odds}) | NO: ${(market.no_probability * 100).toFixed(1)}% (${market.no_odds > 0 ? '+' : ''}${market.no_odds})`
  );
  console.log(`   Sum: ${((market.yes_probability + market.no_probability) * 100).toFixed(1)}%\n`);
});

export default SportsbookScraper;
