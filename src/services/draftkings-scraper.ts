// DraftKings Predictions Scraper - Parse crypto prediction markets

interface DKMarket {
  title: string;
  condition: string; // "ETH above $2,200"
  yes_odds: number; // American odds (-113, +233, etc.)
  no_odds: number;
  yes_probability: number; // Converted to 0-1
  no_probability: number;
  expires: string;
}

class DraftKingsScraper {
  // Convert American odds to implied probability (0-1)
  private americanOddsToProbability(odds: number): number {
    if (odds < 0) {
      // Negative odds: probability = |odds| / (|odds| + 100)
      return Math.abs(odds) / (Math.abs(odds) + 100);
    } else {
      // Positive odds: probability = 100 / (odds + 100)
      return 100 / (odds + 100);
    }
  }

  // Parse market data from DraftKings Predictions UI
  parseMarkets(marketData: any[]): DKMarket[] {
    return marketData.map((market) => {
      const yesProb = this.americanOddsToProbability(market.yes_odds);
      const noProb = this.americanOddsToProbability(market.no_odds);

      return {
        title: market.title,
        condition: market.condition,
        yes_odds: market.yes_odds,
        no_odds: market.no_odds,
        yes_probability: yesProb,
        no_probability: noProb,
        expires: market.expires,
      };
    });
  }

  // Format for price shopper
  convertToQuotes(markets: DKMarket[]): any[] {
    return markets.map((m) => ({
      platform: 'draftkings',
      market_id: `dk_${m.condition.replace(/\s+/g, '_')}`,
      title: `${m.title} - ${m.condition}`,
      yes_price: m.yes_probability,
      no_price: m.no_probability,
      yes_bid: m.yes_probability - 0.01,
      yes_ask: m.yes_probability + 0.01,
      no_bid: m.no_probability - 0.01,
      no_ask: m.no_probability + 0.01,
      volume: 0, // Not exposed by DK
      expires_in: 3600, // Placeholder
      timestamp: Date.now(),
    }));
  }
}

// Example: Parse the ETH markets you showed
const example = [
  {
    title: 'CME CF Ethereum Real Time Index at 10AM ET on Apr. 13th, 2026',
    condition: 'Above $2,200.00',
    yes_odds: -113,
    no_odds: -150,
    expires: '10:00 AM ET',
  },
  {
    title: 'CME CF Ethereum Real Time Index at 10AM ET on Apr. 13th, 2026',
    condition: 'Above $2,175.00',
    yes_odds: -300,
    no_odds: 163,
    expires: '10:00 AM ET',
  },
  {
    title: 'CME CF Ethereum Real Time Index at 10AM ET on Apr. 13th, 2026',
    condition: 'Above $2,225.00',
    yes_odds: 233,
    no_odds: -426,
    expires: '10:00 AM ET',
  },
];

const scraper = new DraftKingsScraper();
const markets = scraper.parseMarkets(example);

console.log('🎯 DRAFTKINGS PREDICTIONS - CRYPTO MARKETS\n');
console.log('═══════════════════════════════════════════════════════════════════\n');

markets.forEach((m, idx) => {
  console.log(`${idx + 1}. ${m.title}`);
  console.log(`   ${m.condition}`);
  console.log(
    `   YES: ${(m.yes_probability * 100).toFixed(1)}% (${m.yes_odds > 0 ? '+' : ''}${m.yes_odds}) | NO: ${(m.no_probability * 100).toFixed(1)}% (${m.no_odds > 0 ? '+' : ''}${m.no_odds})`
  );
  console.log(`   Sum: ${((m.yes_probability + m.no_probability) * 100).toFixed(1)}%\n`);
});

export default DraftKingsScraper;
