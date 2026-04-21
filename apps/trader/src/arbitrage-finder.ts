// Arbitrage Finder - Compare Sportsbooks vs Prediction Markets

// Convert American odds to probability
function americanOddsToProbability(odds: number): number {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  } else {
    return 100 / (odds + 100);
  }
}

interface ArbitrageSpread {
  asset: string;
  condition: string;
  buy_platform: string;
  buy_side: 'YES' | 'NO';
  buy_price: number;
  sell_platform: string;
  sell_side: 'YES' | 'NO';
  sell_price: number;
  spread_pct: number;
  roi_after_fees: number;
  profit_on_500: number;
}

const fanDuelData = [
  // Bitcoin
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
  // Ethereum
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
];

// Limitless prices (from your markets)
const limitlessData = [
  {
    asset: 'BTC',
    condition: 'Above $70906.28',
    yes_price: 0.4,
    no_price: 0.6,
  },
  {
    asset: 'ETH',
    condition: 'Above $2190.48',
    yes_price: 0.39,
    no_price: 0.61,
  },
];

// Parse FanDuel odds
const fanDuelParsed = fanDuelData.map((m) => ({
  platform: m.platform,
  asset: m.asset,
  condition: m.condition,
  yes_odds: m.yes_odds,
  no_odds: m.no_odds,
  yes_probability: americanOddsToProbability(m.yes_odds),
  no_probability: americanOddsToProbability(m.no_odds),
  expires: m.expires,
}));

console.log('🎯 SPORTSBOOK vs PREDICTION MARKET ARBITRAGE\n');
console.log(
  '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
);

const spreads: ArbitrageSpread[] = [];

fanDuelParsed.forEach((fdMarket) => {
  // Find matching Limitless market by asset
  const limitlessMatch = limitlessData.find(
    (lm) => lm.asset === fdMarket.asset
  );

  if (!limitlessMatch) return;

  // Check YES arbitrage
  const yesSpread = Math.abs(fdMarket.yes_probability - limitlessMatch.yes_price);
  const yesSpreadPct = (yesSpread / Math.max(fdMarket.yes_probability, limitlessMatch.yes_price)) * 100;

  if (yesSpread > 0.05) {
    // > 5% difference
    const buyPlatform = fdMarket.yes_probability < limitlessMatch.yes_price ? 'fanduel' : 'limitless';
    const sellPlatform = buyPlatform === 'fanduel' ? 'limitless' : 'fanduel';
    const buyPrice = Math.min(fdMarket.yes_probability, limitlessMatch.yes_price);
    const sellPrice = Math.max(fdMarket.yes_probability, limitlessMatch.yes_price);

    const FEES = 0.005; // 0.5% per side
    const positionSize = 500;
    const shares = positionSize / buyPrice;
    const grossProfit = shares * (sellPrice - buyPrice);
    const netProfit = grossProfit - positionSize * FEES * 2; // Two trades

    spreads.push({
      asset: fdMarket.asset,
      condition: fdMarket.condition,
      buy_platform: buyPlatform,
      buy_side: 'YES',
      buy_price: buyPrice,
      sell_platform: sellPlatform,
      sell_side: 'YES',
      sell_price: sellPrice,
      spread_pct: yesSpreadPct,
      roi_after_fees: (netProfit / positionSize) * 100,
      profit_on_500: netProfit,
    });
  }

  // Check NO arbitrage
  const noSpread = Math.abs(fdMarket.no_probability - limitlessMatch.no_price);
  const noSpreadPct = (noSpread / Math.max(fdMarket.no_probability, limitlessMatch.no_price)) * 100;

  if (noSpread > 0.05) {
    const buyPlatform = fdMarket.no_probability < limitlessMatch.no_price ? 'fanduel' : 'limitless';
    const sellPlatform = buyPlatform === 'fanduel' ? 'limitless' : 'fanduel';
    const buyPrice = Math.min(fdMarket.no_probability, limitlessMatch.no_price);
    const sellPrice = Math.max(fdMarket.no_probability, limitlessMatch.no_price);

    const FEES = 0.005;
    const positionSize = 500;
    const shares = positionSize / buyPrice;
    const grossProfit = shares * (sellPrice - buyPrice);
    const netProfit = grossProfit - positionSize * FEES * 2;

    spreads.push({
      asset: fdMarket.asset,
      condition: fdMarket.condition,
      buy_platform: buyPlatform,
      buy_side: 'NO',
      buy_price: buyPrice,
      sell_platform: sellPlatform,
      sell_side: 'NO',
      sell_price: sellPrice,
      spread_pct: noSpreadPct,
      roi_after_fees: (netProfit / positionSize) * 100,
      profit_on_500: netProfit,
    });
  }
});

if (spreads.length === 0) {
  console.log('📊 No significant arbitrage found (>5% spread needed to overcome fees)\n');
  console.log(
    '💡 Note: Sportsbooks have 13-14% vig, so pricing is intentionally wide vs prediction markets\n'
  );
} else {
  spreads.sort((a, b) => b.roi_after_fees - a.roi_after_fees);

  spreads.forEach((spread, idx) => {
    console.log(`${idx + 1}. ${spread.asset} - ${spread.condition}`);
    console.log(
      `   Buy ${spread.buy_side} on ${spread.buy_platform.toUpperCase()} @ ${spread.buy_price.toFixed(4)}`
    );
    console.log(
      `   Sell ${spread.sell_side} on ${spread.sell_platform.toUpperCase()} @ ${spread.sell_price.toFixed(4)}`
    );
    console.log(`   Spread: ${spread.spread_pct.toFixed(2)}% | ROI: ${spread.roi_after_fees.toFixed(2)}%`);
    console.log(`   Profit on $500: $${spread.profit_on_500.toFixed(2)}\n`);
  });
}

// Show price comparison
console.log(
  '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
);
console.log('💰 PRICE COMPARISON\n');

fanDuelParsed.forEach((fd) => {
  const limitlessMatch = limitlessData.find((lm) => lm.asset === fd.asset);
  if (!limitlessMatch) return;

  console.log(`${fd.asset} - ${fd.condition}`);
  console.log(
    `   FanDuel  │ YES: ${(fd.yes_probability * 100).toFixed(1)}% | NO: ${(fd.no_probability * 100).toFixed(1)}%`
  );
  console.log(
    `   Limitless│ YES: ${(limitlessMatch.yes_price * 100).toFixed(1)}% | NO: ${(limitlessMatch.no_price * 100).toFixed(1)}%`
  );
  console.log(
    `   Diff     │ YES: ${((fd.yes_probability - limitlessMatch.yes_price) * 100).toFixed(1)}% | NO: ${((fd.no_probability - limitlessMatch.no_price) * 100).toFixed(1)}%\n`
  );
});
