// Outcome Analyzer - Tracks market resolutions and calculates hit rates

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

interface ProbabilityBandAnalysis {
  probability_range: string;
  total_markets: number;
  resolved_markets: number;
  wins: number;
  losses: number;
  win_rate: number;
  expected_rate: number;
  calibration_error: number;
  markets: MarketOutcome[];
}

class OutcomeAnalyzer {
  private outcomesPath = path.join(__dirname, '../../logs', 'market-outcomes.json');
  private outcomes: MarketOutcome[] = [];

  constructor() {
    this.loadOutcomes();
  }

  private loadOutcomes(): void {
    try {
      if (fs.existsSync(this.outcomesPath)) {
        const data = fs.readFileSync(this.outcomesPath, 'utf-8');
        this.outcomes = JSON.parse(data);
      }
    } catch (e) {
      this.outcomes = [];
    }
  }

  analyzeProbabilityBands(): ProbabilityBandAnalysis[] {
    const bands = [
      { min: 0.99, max: 1.0, label: '99-100% (LOCKS)' },
      { min: 0.98, max: 0.99, label: '98-99% (HAMMERS)' },
      { min: 0.97, max: 0.98, label: '97-98% (GOOD)' },
      { min: 0.95, max: 0.97, label: '95-97%' },
    ];

    return bands.map((band) => {
      const bandMarkets = this.outcomes.filter(
        (o) => o.predicted_probability >= band.min && o.predicted_probability < band.max
      );

      const resolved = bandMarkets.filter((o) => o.result !== undefined);
      const wins = resolved.filter((o) => o.result === 'WIN').length;
      const losses = resolved.filter((o) => o.result === 'LOSS').length;
      const winRate = resolved.length > 0 ? (wins / resolved.length) * 100 : 0;
      const expectedRate = (band.min + band.max) / 2 * 100;
      const calibrationError = Math.abs(winRate - expectedRate);

      return {
        probability_range: band.label,
        total_markets: bandMarkets.length,
        resolved_markets: resolved.length,
        wins,
        losses,
        win_rate: parseFloat(winRate.toFixed(1)),
        expected_rate: parseFloat(expectedRate.toFixed(1)),
        calibration_error: parseFloat(calibrationError.toFixed(1)),
        markets: resolved,
      };
    });
  }

  displayAnalysis(): void {
    const analysis = this.analyzeProbabilityBands();

    console.log('\n📊 MARKET OUTCOME ANALYSIS BY PROBABILITY BAND\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(
      'Probability | Total | Resolved | Wins | Losses | Win Rate | Expected | Calibration Error\n'
    );
    console.log(
      '─────────────┼───────┼──────────┼──────┼────────┼──────────┼──────────┼───────────────────\n'
    );

    analysis.forEach((band) => {
      const prob = band.probability_range.padEnd(11);
      const total = String(band.total_markets).padStart(5);
      const resolved = String(band.resolved_markets).padStart(8);
      const wins = String(band.wins).padStart(4);
      const losses = String(band.losses).padStart(6);
      const rate = `${band.win_rate.toFixed(1)}%`.padStart(8);
      const expected = `${band.expected_rate.toFixed(1)}%`.padStart(8);
      const error = `${band.calibration_error.toFixed(1)}%`.padStart(17);

      console.log(
        ` ${prob} | ${total} | ${resolved} | ${wins} | ${losses} | ${rate} | ${expected} | ${error}`
      );
    });

    console.log(
      '\n═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    // Show interpretation
    console.log('💡 INTERPRETATION:\n');
    console.log(
      '• Win Rate = Actual percentage of markets that resolved in your favor (after resolution)\n'
    );
    console.log('• Expected = Theoretical win rate based on predicted probability\n');
    console.log(
      '• Calibration Error = Difference between actual and expected (lower is better - means predictions are accurate)\n'
    );

    // Summary
    const totalResolved = analysis.reduce((sum, b) => sum + b.resolved_markets, 0);
    const totalWins = analysis.reduce((sum, b) => sum + b.wins, 0);
    const totalLosses = analysis.reduce((sum, b) => sum + b.losses, 0);
    const overallRate = totalResolved > 0 ? ((totalWins / totalResolved) * 100).toFixed(1) : '0.0';

    console.log(`📈 OVERALL STATS: ${totalWins} Wins / ${totalLosses} Losses = ${overallRate}% win rate\n`);

    // Show unresolved markets
    const unresolved = this.outcomes.filter((o) => o.result === undefined);
    if (unresolved.length > 0) {
      console.log(
        `⏳ Waiting for resolution: ${unresolved.length} markets (will update when they expire)\n`
      );
    }
  }
}

// Run
const analyzer = new OutcomeAnalyzer();
analyzer.displayAnalysis();

export default OutcomeAnalyzer;
