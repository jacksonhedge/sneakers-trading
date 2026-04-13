// Market Data Logger - Comprehensive logging of all market data and prices

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig({ path: '../../apps/trader/.env' });

interface MarketSnapshot {
  timestamp: number;
  market_id: string;
  title: string;
  asset: string;
  yes_price: number;
  no_price: number;
  volume: string;
  minutes_until_expiry: number;
  seconds_until_expiry: number;
  momentum?: {
    // Track price momentum if we see same market multiple times
    yes_price_change?: number;
    no_price_change?: number;
    price_momentum?: 'bullish' | 'bearish' | 'flat';
    time_delta_ms?: number;
  };
  status: string;
  tags?: string[];
}

class MarketDataLogger {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;
  private logDir: string;
  private priceHistoryPath: string;
  private snapshotsPath: string;
  private marketPriceCache: Map<string, { price: number; timestamp: number }> = new Map();

  constructor() {
    this.logDir = path.join(__dirname, '../../logs/market-data');
    this.priceHistoryPath = path.join(this.logDir, 'price-history.jsonl');
    this.snapshotsPath = path.join(this.logDir, 'market-snapshots.jsonl');
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  async captureAllMarkets(): Promise<void> {
    try {
      const response = await fetch(`${this.limitlessUrl}/markets/active`, {
        headers: {
          'X-API-Key': this.limitlessKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return;

      const data = (await response.json()) as any;
      const markets = data.data || [];
      const now = Date.now();

      // Log all markets we see
      markets.forEach((m: any) => {
        const snapshot: MarketSnapshot = {
          timestamp: now,
          market_id: String(m.id),
          title: m.title || '',
          asset: this.extractAsset(m.title),
          yes_price: m.prices?.[0] || 0,
          no_price: m.prices?.[1] || 0,
          volume: m.volume || '0',
          minutes_until_expiry: this.getMinutesUntilExpiry(m.title),
          seconds_until_expiry: this.getSecondsUntilExpiry(m.title),
          status: m.status || 'UNKNOWN',
          tags: m.tags || [],
        };

        // Add momentum if we've seen this market before
        const cacheKey = `${m.id}-yes`;
        if (this.marketPriceCache.has(cacheKey)) {
          const cached = this.marketPriceCache.get(cacheKey)!;
          const timeDelta = now - cached.timestamp;
          const priceChange = snapshot.yes_price - cached.price;
          const momentum =
            priceChange > 0.01 ? 'bullish' : priceChange < -0.01 ? 'bearish' : 'flat';

          snapshot.momentum = {
            yes_price_change: parseFloat(priceChange.toFixed(4)),
            price_momentum: momentum,
            time_delta_ms: timeDelta,
          };
        }

        // Update cache
        this.marketPriceCache.set(cacheKey, { price: snapshot.yes_price, timestamp: now });

        // Log snapshot
        this.logSnapshot(snapshot);

        // Log price history
        this.logPriceHistory(snapshot);
      });
    } catch (e) {
      console.error('Error capturing markets:', (e as Error).message);
    }
  }

  private logSnapshot(snapshot: MarketSnapshot): void {
    try {
      const line = JSON.stringify(snapshot) + '\n';
      fs.appendFileSync(this.snapshotsPath, line);
    } catch (e) {
      console.error('Error logging snapshot:', (e as Error).message);
    }
  }

  private logPriceHistory(snapshot: MarketSnapshot): void {
    try {
      const priceRecord = {
        timestamp: snapshot.timestamp,
        market_id: snapshot.market_id,
        title: snapshot.title,
        asset: snapshot.asset,
        yes_price: snapshot.yes_price,
        no_price: snapshot.no_price,
        time_to_expiry_seconds: snapshot.seconds_until_expiry,
      };
      const line = JSON.stringify(priceRecord) + '\n';
      fs.appendFileSync(this.priceHistoryPath, line);
    } catch (e) {
      console.error('Error logging price history:', (e as Error).message);
    }
  }

  private extractAsset(title: string): string {
    const lower = title.toLowerCase();
    if (lower.includes('btc')) return 'BTC';
    if (lower.includes('eth')) return 'ETH';
    if (lower.includes('sol')) return 'SOL';
    if (lower.includes('xrp')) return 'XRP';
    if (lower.includes('doge')) return 'DOGE';
    return 'CRYPTO';
  }

  private getMinutesUntilExpiry(title: string): number {
    const match = title.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/);
    if (!match) return -1;

    const [, month, day, hour, min] = match;
    const expiryDate = new Date(`2026-${month} ${day} ${hour}:${min}:00 UTC`);
    const now = new Date();
    const secondsLeft = (expiryDate.getTime() - now.getTime()) / 1000;
    return Math.floor(secondsLeft / 60);
  }

  private getSecondsUntilExpiry(title: string): number {
    const match = title.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/);
    if (!match) return -1;

    const [, month, day, hour, min] = match;
    const expiryDate = new Date(`2026-${month} ${day} ${hour}:${min}:00 UTC`);
    const now = new Date();
    return Math.floor((expiryDate.getTime() - now.getTime()) / 1000);
  }

  getLogPaths(): { prices: string; snapshots: string } {
    return {
      prices: this.priceHistoryPath,
      snapshots: this.snapshotsPath,
    };
  }
}

// Run continuously
const logger = new MarketDataLogger();

(async () => {
  console.log('📊 Market Data Logger started');
  console.log(`   Logging to: ${logger.getLogPaths().prices}\n`);

  // Capture immediately
  await logger.captureAllMarkets();

  // Then every 5 seconds
  setInterval(async () => {
    await logger.captureAllMarkets();
  }, 5000);
})();

export default MarketDataLogger;
