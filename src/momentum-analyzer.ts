// Momentum Analyzer - Correlate price momentum near expiry with market outcomes

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PricePoint {
  timestamp: number;
  market_id: string;
  title: string;
  asset: string;
  yes_price: number;
  no_price: number;
  time_to_expiry_seconds: number;
}

interface MarketOutcome {
  market_id: string;
  predicted_probability: number;
  predicted_side: 'YES' | 'NO';
  actual_outcome?: 'YES' | 'NO';
  result?: 'WIN' | 'LOSS';
  expiry_time: number;
  checked_time?: number;
  asset: string;
}

interface MomentumAnalysis {
  market_id: string;
  asset: string;
  predicted: 'YES' | 'NO';
  predicted_prob: number;
  actual_outcome?: 'YES' | 'NO';
  result?: 'WIN' | 'LOSS';

  // Momentum metrics in final minute
  price_at_1m: number;
  price_at_30s: number;
  price_at_10s: number;
  final_price: number;

  final_minute_momentum: 'strong_bullish' | 'bullish' | 'flat' | 'bearish' | 'strong_bearish' | 'insufficient_data';
  price_volatility_final_minute: number;

  // Did momentum contradict the high probability?
  momentum_aligned_with_prediction: boolean;
  gaps: string[];
}

class MomentumAnalyzer {
  private priceHistoryPath = path.join(__dirname, '../../logs/market-data/price-history.jsonl');
  private outcomesPath = path.join(__dirname, '../../logs', 'market-outcomes.json');

  private loadPriceHistory(): PricePoint[] {
    const prices: PricePoint[] = [];
    try {
      if (fs.existsSync(this.priceHistoryPath)) {
        const data = fs.readFileSync(this.priceHistoryPath, 'utf-8');
        const lines = data.split('\n').filter((l) => l.trim());
        lines.forEach((line) => {
          try {
            prices.push(JSON.parse(line));
          } catch (e) {
            // Skip malformed lines
          }
        });
      }
    } catch (e) {
      console.error('Error loading price history:', (e as Error).message);
    }
    return prices;
  }

  private loadOutcomes(): MarketOutcome[] {
    try {
      if (fs.existsSync(this.outcomesPath)) {
        const data = fs.readFileSync(this.outcomesPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error loading outcomes:', (e as Error).message);
    }
    return [];
  }

  analyzeMarketMomentum(
    marketId: string,
    prices: PricePoint[],
    outcome: MarketOutcome
  ): MomentumAnalysis {
    // Get all prices for this market, sorted by timestamp
    const marketPrices = prices
      .filter((p) => p.market_id === marketId)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Get prices at key intervals before expiry
    const expiryTime = outcome.expiry_time;
    const oneMinBefore = expiryTime - 60 * 1000;
    const thirtySecBefore = expiryTime - 30 * 1000;
    const tenSecBefore = expiryTime - 10 * 1000;

    const getPriceAtTime = (targetTime: number): number => {
      // Find closest price within 5 seconds
      const closest = marketPrices
        .filter((p) => Math.abs(p.timestamp - targetTime) < 5000)
        .sort((a, b) => Math.abs(a.timestamp - targetTime) - Math.abs(b.timestamp - targetTime))[0];

      return closest ? closest.yes_price : -1;
    };

    const price1m = getPriceAtTime(oneMinBefore);
    const price30s = getPriceAtTime(thirtySecBefore);
    const price10s = getPriceAtTime(tenSecBefore);
    const priceAtExpiry = marketPrices.length > 0 ? marketPrices[marketPrices.length - 1].yes_price : -1;

    // Calculate momentum
    let momentum: MomentumAnalysis['final_minute_momentum'] = 'insufficient_data';
    let volatility = 0;
    const gaps: string[] = [];

    if (price1m > 0 && priceAtExpiry > 0) {
      const change = priceAtExpiry - price1m;
      const changePercent = (change / price1m) * 100;
      volatility = Math.abs(changePercent);

      if (changePercent > 5) momentum = 'strong_bullish';
      else if (changePercent > 1) momentum = 'bullish';
      else if (changePercent > -1) momentum = 'flat';
      else if (changePercent > -5) momentum = 'bearish';
      else momentum = 'strong_bearish';

      // Check for gaps
      if (price1m > 0 && price30s > 0) {
        const gap1m30s = Math.abs(price1m - price30s);
        if (gap1m30s > 0.1) gaps.push(`1m→30s gap: ${gap1m30s.toFixed(3)}`);
      }
      if (price30s > 0 && price10s > 0) {
        const gap30s10s = Math.abs(price30s - price10s);
        if (gap30s10s > 0.1) gaps.push(`30s→10s gap: ${gap30s10s.toFixed(3)}`);
      }
      if (price10s > 0 && priceAtExpiry > 0) {
        const gapFinal = Math.abs(price10s - priceAtExpiry);
        if (gapFinal > 0.1) gaps.push(`10s→expiry gap: ${gapFinal.toFixed(3)}`);
      }
    }

    // Check if momentum aligned with prediction
    const alignedWithPrediction =
      (outcome.predicted_side === 'YES' && (momentum === 'bullish' || momentum === 'strong_bullish')) ||
      (outcome.predicted_side === 'NO' && (momentum === 'bearish' || momentum === 'strong_bearish')) ||
      momentum === 'flat';

    return {
      market_id: marketId,
      asset: outcome.asset,
      predicted: outcome.predicted_side,
      predicted_prob: outcome.predicted_probability,
      actual_outcome: outcome.actual_outcome,
      result: outcome.result,
      price_at_1m: price1m,
      price_at_30s: price30s,
      price_at_10s: price10s,
      final_price: priceAtExpiry,
      final_minute_momentum: momentum,
      price_volatility_final_minute: volatility,
      momentum_aligned_with_prediction: alignedWithPrediction,
      gaps,
    };
  }

  displayAnalysis(): void {
    const prices = this.loadPriceHistory();
    const outcomes = this.loadOutcomes();
    const resolved = outcomes.filter((o) => o.result !== undefined);

    console.log('\n🎯 MOMENTUM vs OUTCOME ANALYSIS\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (resolved.length === 0) {
      console.log('⏳ No resolved markets yet to analyze\n');
      return;
    }

    const analyses = resolved.map((o) => this.analyzeMarketMomentum(o.market_id, prices, o));

    // Group by result
    const wins = analyses.filter((a) => a.result === 'WIN');
    const losses = analyses.filter((a) => a.result === 'LOSS');

    // Show patterns
    console.log('🟢 WINNING MARKETS:\n');
    wins.forEach((a) => {
      const prob = (a.predicted_prob * 100).toFixed(1);
      const momentum = a.final_minute_momentum.toUpperCase();
      const aligned = a.momentum_aligned_with_prediction ? '✅' : '⚠️ ';
      console.log(
        `   ${a.market_id} | ${a.asset} ${a.predicted} @ ${prob}% → ${a.actual_outcome} | Momentum: ${momentum} ${aligned}`
      );
      if (a.gaps.length > 0) {
        a.gaps.forEach((g) => console.log(`      └─ ${g}`));
      }
    });

    if (losses.length > 0) {
      console.log('\n🔴 LOSING MARKETS:\n');
      losses.forEach((a) => {
        const prob = (a.predicted_prob * 100).toFixed(1);
        const momentum = a.final_minute_momentum.toUpperCase();
        const aligned = a.momentum_aligned_with_prediction ? '✅' : '⚠️ ';
        console.log(
          `   ${a.market_id} | ${a.asset} ${a.predicted} @ ${prob}% → ${a.actual_outcome} | Momentum: ${momentum} ${aligned}`
        );
        if (a.gaps.length > 0) {
          a.gaps.forEach((g) => console.log(`      └─ ${g}`));
        }
      });
    }

    // Summary
    console.log(
      '\n═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log('💡 GAPS ANALYSIS:\n');

    const allGaps = analyses.flatMap((a) => a.gaps);
    if (allGaps.length === 0) {
      console.log('   No significant price gaps detected\n');
    } else {
      console.log(`   Found ${allGaps.length} significant gaps in markets:\n`);
      allGaps.forEach((g) => console.log(`   • ${g}`));
      console.log('');
    }

    // Momentum alignment stats
    const alignedWins = wins.filter((w) => w.momentum_aligned_with_prediction).length;
    const misalignedWins = wins.filter((w) => !w.momentum_aligned_with_prediction).length;
    const alignedLosses = losses.filter((l) => l.momentum_aligned_with_prediction).length;
    const misalignedLosses = losses.filter((l) => !l.momentum_aligned_with_prediction).length;

    console.log('📊 MOMENTUM ALIGNMENT IMPACT:\n');
    console.log(`   Wins with aligned momentum: ${alignedWins}/${wins.length}`);
    console.log(`   Wins with opposed momentum: ${misalignedWins}/${wins.length}`);
    if (losses.length > 0) {
      console.log(`   Losses with aligned momentum: ${alignedLosses}/${losses.length}`);
      console.log(`   Losses with opposed momentum: ${misalignedLosses}/${losses.length}`);
    }
    console.log('\n');
  }
}

// Run
const analyzer = new MomentumAnalyzer();
analyzer.displayAnalysis();

export default MomentumAnalyzer;
