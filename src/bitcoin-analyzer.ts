// Bitcoin 5-Minute Pattern Analyzer - 1 Year Historical Data
// Supports: CSV import, Binance data, or simulated data

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HourAnalysis {
  hour: number;
  count: number;
  avgVolatility: number;
  avgVolumeUp: number;
  avgVolumeDown: number;
  surges: number;
  surgeFrequency: number;
  avgSurgeSize: number;
  bullishWins: number;
  bullishRate: number;
}

class BitcoinAnalyzer {
  private dataCache: Candle[] = [];
  private cacheFile = path.join(__dirname, '../../data', 'btc-1year-cache.json');

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    const dataDir = path.dirname(this.cacheFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  // Load from CSV file (user can download from exchanges)
  loadFromCSV(filePath: string): Candle[] {
    console.log(`📂 Loading CSV from: ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header

    const candles: Candle[] = lines
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(',');
        return {
          timestamp: parseInt(parts[0]),
          open: parseFloat(parts[1]),
          high: parseFloat(parts[2]),
          low: parseFloat(parts[3]),
          close: parseFloat(parts[4]),
          volume: parseFloat(parts[5]),
        };
      });

    console.log(`✅ Loaded ${candles.length} candles from CSV\n`);
    fs.writeFileSync(this.cacheFile, JSON.stringify(candles, null, 2));

    return candles;
  }

  // Generate realistic synthetic data for testing/demo
  generateSyntheticData(): Candle[] {
    console.log('🎲 Generating 1 year of realistic Bitcoin 5-minute data...\n');

    const candles: Candle[] = [];
    let currentPrice = 50000; // Start price
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    for (let timestamp = oneYearAgo; timestamp < now; timestamp += 5 * 60 * 1000) {
      const date = new Date(timestamp);
      const hour = date.getUTCHours();

      // Higher volatility during certain hours (realistic Bitcoin patterns)
      let volatilityFactor = 0.3; // 0.3% base volatility per 5 min

      // Peak hours: 1-4 AM UTC (US market open), 8-11 AM UTC (Europe), 12-2 PM UTC (Asian)
      if ((hour >= 1 && hour <= 4) || (hour >= 8 && hour <= 11)) {
        volatilityFactor = 0.6; // 60% more volatile
      } else if (hour >= 12 && hour <= 14) {
        volatilityFactor = 0.5; // 50% more volatile
      }

      // Random walk with bias
      const randomMove = (Math.random() - 0.45) * volatilityFactor;
      const open = currentPrice;
      const close = open * (1 + randomMove);

      // High/low around open/close with some noise
      const high = Math.max(open, close) * (1 + Math.random() * 0.2);
      const low = Math.min(open, close) * (1 - Math.random() * 0.2);

      // Volume varies by hour
      let baseVolume = 1000000;
      if ((hour >= 1 && hour <= 4) || (hour >= 8 && hour <= 11)) {
        baseVolume = 1500000; // 50% more volume during peak
      }
      const volume = baseVolume * (0.5 + Math.random());

      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      });

      currentPrice = close;
    }

    console.log(`✅ Generated ${candles.length} synthetic candles\n`);
    fs.writeFileSync(this.cacheFile, JSON.stringify(candles, null, 2));

    return candles;
  }

  async analyzeByHour(): Promise<HourAnalysis[]> {
    const hourly: Map<number, Candle[]> = new Map();

    this.dataCache.forEach((candle) => {
      const date = new Date(candle.timestamp);
      const hour = date.getUTCHours();

      if (!hourly.has(hour)) {
        hourly.set(hour, []);
      }
      hourly.get(hour)!.push(candle);
    });

    const analysis: HourAnalysis[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const candles = hourly.get(hour) || [];

      if (candles.length === 0) continue;

      let totalVolatility = 0;
      let surgeCount = 0;
      let bullishCount = 0;
      let totalVolume = 0;
      let totalVolumeUp = 0;
      let totalVolumeDown = 0;
      let surgeSizes: number[] = [];

      candles.forEach((c) => {
        const volatility = ((c.high - c.low) / c.close) * 100;
        totalVolatility += volatility;

        const move = Math.abs((c.close - c.open) / c.open) * 100;
        if (move >= 1) {
          surgeCount++;
          surgeSizes.push(move);
        }

        if (c.close > c.open) {
          bullishCount++;
          totalVolumeUp += c.volume;
        } else {
          totalVolumeDown += c.volume;
        }

        totalVolume += c.volume;
      });

      const avgSurgeSize =
        surgeSizes.length > 0
          ? surgeSizes.reduce((a, b) => a + b, 0) / surgeSizes.length
          : 0;

      analysis.push({
        hour,
        count: candles.length,
        avgVolatility: totalVolatility / candles.length,
        avgVolumeUp: totalVolumeUp / candles.length,
        avgVolumeDown: totalVolumeDown / candles.length,
        surges: surgeCount,
        surgeFrequency: (surgeCount / candles.length) * 100,
        avgSurgeSize,
        bullishWins: bullishCount,
        bullishRate: (bullishCount / candles.length) * 100,
      });
    }

    return analysis.sort((a, b) => b.surgeFrequency - a.surgeFrequency);
  }

  displayHourlyAnalysis(analysis: HourAnalysis[]): void {
    console.log('\n📊 BITCOIN 5-MINUTE PATTERNS BY HOUR (UTC)\n');
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(
      'Hour | Volatility | Surge Freq | Avg Surge | Bullish % | Volume-Up | Volume-Down | Total Surges\n'
    );
    console.log(
      '─────┼────────────┼────────────┼───────────┼───────────┼───────────┼─────────────┼──────────────\n'
    );

    analysis.forEach((a) => {
      const hour = String(a.hour).padStart(2, '0');
      const vol = a.avgVolatility.toFixed(2).padStart(6);
      const surge = a.surgeFrequency.toFixed(1).padStart(6);
      const avgSurge = a.avgSurgeSize.toFixed(2).padStart(6);
      const bullish = a.bullishRate.toFixed(1).padStart(7);
      const volUp = (a.avgVolumeUp / 1000000).toFixed(1).padStart(9);
      const volDown = (a.avgVolumeDown / 1000000).toFixed(1).padStart(9);

      console.log(
        ` ${hour}  |   ${vol}%   |    ${surge}%    |   ${avgSurge}%   |   ${bullish}%   |   ${volUp}M  |     ${volDown}M    |     ${a.surges}`
      );
    });

    console.log(
      '\n═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    // Highlight peak hours
    const topHours = analysis.slice(0, 5);
    console.log('🔥 TOP 5 SURGE HOURS (Best for prediction markets):\n');
    topHours.forEach((h, idx) => {
      const timeUTC = `${String(h.hour).padStart(2, '0')}:00 UTC`;
      const etHour = String((h.hour - 4 + 24) % 24).padStart(2, '0');
      const ptHour = String((h.hour - 7 + 24) % 24).padStart(2, '0');

      console.log(
        `${idx + 1}. ${timeUTC} (${etHour}:00 ET / ${ptHour}:00 PT) - ${h.surgeFrequency.toFixed(1)}% surge frequency`
      );
      console.log(
        `   └─ ${h.surges} surges in ${h.count} candles | Avg move: ${h.avgSurgeSize.toFixed(2)}% | Bullish: ${h.bullishRate.toFixed(1)}%\n`
      );
    });

    console.log('\n💡 INTERPRETATION FOR PREDICTION MARKETS:\n');
    console.log('• Hours with 15%+ surge frequency = Best for 95%+ probability trades');
    console.log('• Higher avg surge size = Bigger moves = More extreme probabilities');
    console.log('• Bullish rate tells you directional bias (useful for YES/NO bets)');
    console.log(
      '• Volume spikes = Increased volatility window (perfect for hunting 99% markets)\n'
    );

    // Save analysis
    const analysisPath = path.join(__dirname, '../../data', 'btc-analysis.json');
    fs.writeFileSync(
      analysisPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          dataPoints: this.dataCache.length,
          hourlyAnalysis: analysis,
        },
        null,
        2
      )
    );

    console.log(`✅ Full analysis saved to: ${analysisPath}`);
    console.log(`📋 Use this data to time your hunter to peak volatility hours!\n`);
  }

  async run(useCSV?: string): Promise<void> {
    console.log('🎯 Bitcoin 5-Minute Pattern Analyzer\n');
    console.log('📅 Period: 1 Year Historical\n');

    if (useCSV && fs.existsSync(useCSV)) {
      this.dataCache = this.loadFromCSV(useCSV);
    } else if (fs.existsSync(this.cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        if (Array.isArray(cached) && cached.length > 0) {
          console.log('📦 Loading cached data...\n');
          this.dataCache = cached;
        } else {
          throw new Error('Cache empty');
        }
      } catch (e) {
        console.log('⚡ Generating fresh synthetic data...\n');
        this.dataCache = this.generateSyntheticData();
      }
    } else {
      this.dataCache = this.generateSyntheticData();
    }

    if (this.dataCache.length === 0) {
      console.error('❌ No data available');
      console.error('To use real data:');
      console.error('1. Download CSV from Binance (BTCUSDT, 5m interval, 1 year)');
      console.error('2. Run: node dist/core/src/bitcoin-analyzer.js <path-to-csv>');
      return;
    }

    const hourAnalysis = await this.analyzeByHour();
    this.displayHourlyAnalysis(hourAnalysis);
  }
}

// Run
const analyzer = new BitcoinAnalyzer();
const csvArg = process.argv[2];
analyzer.run(csvArg).catch(console.error);

export default BitcoinAnalyzer;
