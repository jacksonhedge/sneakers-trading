// Momentum Detector: Real-time BTC/ETH price acceleration from Binance

import WebSocket from 'ws';

interface PriceTick {
  symbol: string;
  timestamp: number;
  price: number;
  volume: number;
  bid: number;
  ask: number;
  spread_pct: number;
}

interface MomentumSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  strength: number; // 0-1, confidence score
  price_change_pct: number;
  volume_score: number; // 0-1
  bid_ask_ratio: number; // ask/bid, >1 = buying pressure
  timestamp: number;
}

class MomentumDetector {
  private ws: WebSocket | null = null;
  private priceHistory: Map<string, PriceTick[]> = new Map();
  private windowSize = 20; // Last 20 ticks (~1 minute at 3/sec)
  private minVolume = 100; // Min volume threshold
  private minSpreadPct = 0.01; // Min spread to consider liquid

  constructor() {
    this.priceHistory.set('BTCUSDT', []);
    this.priceHistory.set('ETHUSDT', []);
  }

  // Connect to Binance WebSocket (1s klines for momentum)
  async connect(): Promise<void> {
    return new Promise((resolve) => {
      // Use 1-second klines for rapid momentum detection
      const streams = 'btcusdt@kline_1s/ethusdt@kline_1s';
      this.ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

      this.ws.on('open', () => {
        console.log('✅ Binance momentum detector connected');
        resolve();
      });

      this.ws.on('message', (data: string) => {
        this.handleMessage(JSON.parse(data));
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      this.ws.on('close', () => {
        console.log('⚠️ Binance connection closed, reconnecting...');
        setTimeout(() => this.connect(), 5000);
      });
    });
  }

  // Parse incoming kline data
  private handleMessage(data: any): void {
    const stream = data.stream;
    const kline = data.data.k;

    const symbol = stream.includes('btcusdt') ? 'BTCUSDT' : 'ETHUSDT';

    const tick: PriceTick = {
      symbol,
      timestamp: kline.t,
      price: parseFloat(kline.c), // close price
      volume: parseFloat(kline.v),
      bid: parseFloat(kline.c) * 0.9999, // Approximate bid (slight discount)
      ask: parseFloat(kline.c) * 1.0001, // Approximate ask (slight premium)
      spread_pct: (parseFloat(kline.c) * 0.0002) / parseFloat(kline.c) * 100,
    };

    // Maintain rolling window
    const history = this.priceHistory.get(symbol) || [];
    history.push(tick);
    if (history.length > this.windowSize) {
      history.shift();
    }
    this.priceHistory.set(symbol, history);

    // Detect momentum every 5 ticks (5 seconds)
    if (history.length % 5 === 0) {
      const signal = this.detectMomentum(symbol);
      if (signal) {
        this.logSignal(signal);
      }
    }
  }

  // Detect momentum based on price acceleration + volume
  private detectMomentum(symbol: string): MomentumSignal | null {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 5) return null;

    // Check if liquid (skip if spread too wide)
    const latest = history[history.length - 1];
    if (latest.spread_pct > 0.05) {
      console.log(`⚠️ ${symbol} spread too wide (${latest.spread_pct.toFixed(4)}%), skipping`);
      return null;
    }

    // Calculate momentum: compare last 5 ticks vs previous 5
    const recent = history.slice(-5);
    const previous = history.slice(-10, -5);

    if (previous.length < 5) return null;

    const recentAvg = recent.reduce((sum, t) => sum + t.price, 0) / 5;
    const prevAvg = previous.reduce((sum, t) => sum + t.price, 0) / 5;
    const priceChange = ((recentAvg - prevAvg) / prevAvg) * 100;

    // Calculate volume momentum
    const recentVol = recent.reduce((sum, t) => sum + t.volume, 0);
    const prevVol = previous.reduce((sum, t) => sum + t.volume, 0);
    const volumeScore = Math.min(1, (recentVol / (prevVol + 1)) * 0.5); // Cap at 1

    // Calculate bid-ask momentum
    const bidAskRatio = latest.ask / latest.bid;

    // Strength = normalized momentum
    let strength = Math.abs(priceChange) / 0.5; // 0.5% = high confidence
    strength = Math.min(1, strength);

    // Only signal if momentum > 0.3% and volume is positive
    if (Math.abs(priceChange) < 0.15 || volumeScore < 0.3) {
      return null;
    }

    const signal: MomentumSignal = {
      symbol,
      direction: priceChange > 0 ? 'LONG' : 'SHORT',
      strength,
      price_change_pct: priceChange,
      volume_score: volumeScore,
      bid_ask_ratio: bidAskRatio,
      timestamp: latest.timestamp,
    };

    return signal;
  }

  // Log and return signal
  private logSignal(signal: MomentumSignal): void {
    const emoji = signal.direction === 'LONG' ? '📈' : '📉';
    console.log(
      `${emoji} ${signal.symbol} ${signal.direction} | ` +
        `${signal.price_change_pct.toFixed(3)}% | ` +
        `Strength: ${(signal.strength * 100).toFixed(0)}% | ` +
        `Volume: ${(signal.volume_score * 100).toFixed(0)}%`
    );
  }

  // Get current momentum for a symbol
  getMomentum(symbol: string): MomentumSignal | null {
    return this.detectMomentum(symbol);
  }

  // Get price history for analysis
  getPriceHistory(symbol: string): PriceTick[] {
    return this.priceHistory.get(symbol) || [];
  }

  // Get latest price
  getLatestPrice(symbol: string): number | null {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length === 0) return null;
    return history[history.length - 1].price;
  }

  // Disconnect
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default MomentumDetector;
