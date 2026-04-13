// Sneakers Trading Bot: Main orchestrator for momentum-based 2% scalping

import MomentumDetector from './services/momentum-detector';
import CryptoComPerpetualTrader from './services/crypto-com-perpetual-trader';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface BotConfig {
  target_profit_pct: number; // 2%
  trades_per_day: number; // 10
  risk_per_trade: number; // $500
  leverage: number; // 4x
  symbols: string[]; // BTC_USDT, ETH_USDT
  check_interval: number; // 5 seconds
}

class SneakersBot {
  private momentum: MomentumDetector;
  private trader: CryptoComPerpetualTrader;
  private config: BotConfig;
  private activeTrades: Map<string, { symbol: string; entryPrice: number; entryTime: number }> =
    new Map();
  private dailyStats = { trades: 0, wins: 0, losses: 0, totalPnL: 0 };

  constructor() {
    this.config = {
      target_profit_pct: 2,
      trades_per_day: 10,
      risk_per_trade: 500, // $500 per trade on $5k
      leverage: 4,
      symbols: ['BTC_USDT', 'ETH_USDT'],
      check_interval: 5000, // Check every 5 seconds
    };

    this.momentum = new MomentumDetector();
    this.trader = new CryptoComPerpetualTrader(
      process.env.CRYPTO_COM_API_KEY!,
      process.env.CRYPTO_COM_API_SECRET!
    );
  }

  // Main trading loop
  async start(): Promise<void> {
    console.log('🤖 Sneakers Bot Starting...');
    console.log(`📊 Target: ${this.config.target_profit_pct}% x ${this.config.trades_per_day} trades/day`);
    console.log(`💰 Risk per trade: $${this.config.risk_per_trade}`);
    console.log(`🔧 Leverage: ${this.config.leverage}x`);

    // Connect to Binance momentum detector
    await this.momentum.connect();
    console.log('✅ Connected to Binance WebSocket');

    // Start monitoring active positions
    this.startPositionMonitoring();

    // Start trading loop
    this.startTradingLoop();

    // Log stats every minute
    this.startStatsReporting();
  }

  // Trading loop: check momentum and place trades
  private startTradingLoop(): void {
    setInterval(() => {
      this.checkAndTrade();
    }, this.config.check_interval);
  }

  // Check momentum and place trades if signal detected
  private async checkAndTrade(): Promise<void> {
    // Check each symbol for momentum
    for (const symbol of this.config.symbols) {
      const momentum = this.momentum.getMomentum(symbol);

      if (!momentum) continue; // No signal
      if (this.activeTrades.size >= 3) continue; // Max 3 concurrent trades

      // Strength threshold (must be confident)
      if (momentum.strength < 0.6) continue;

      console.log(
        `\n🚀 SIGNAL DETECTED: ${symbol} ${momentum.direction} (${(momentum.strength * 100).toFixed(0)}% confidence)`
      );

      // Place trade
      const side = momentum.direction === 'LONG' ? 'BUY' : 'SELL';
      const order = await this.trader.placeLeverageTrade(symbol, side as 'BUY' | 'SELL', this.config.leverage, this.config.risk_per_trade);

      if (order) {
        this.activeTrades.set(order.order_id, {
          symbol: symbol,
          entryPrice: order.price,
          entryTime: order.created_at,
        });

        this.dailyStats.trades++;
      }
    }
  }

  // Monitor active positions and close on target or loss
  private startPositionMonitoring(): void {
    setInterval(async () => {
      for (const [orderId, trade] of Array.from(this.activeTrades.entries())) {
        const price = this.momentum.getLatestPrice(trade.symbol);

        if (!price) continue;

        // Calculate unrealized P&L
        const unrealizedPct = ((price - trade.entryPrice) / trade.entryPrice) * 100;

        // Exit on target (2%)
        if (unrealizedPct >= this.config.target_profit_pct) {
          console.log(`\n✅ TARGET HIT on ${trade.symbol}! P&L: ${unrealizedPct.toFixed(2)}%`);
          // TODO: Close position
          this.activeTrades.delete(orderId);
          this.dailyStats.wins++;
          this.dailyStats.totalPnL += unrealizedPct;
        }

        // Exit on large loss (no hardstop, but log)
        if (unrealizedPct <= -5) {
          console.log(
            `\n⚠️ LARGE LOSS on ${trade.symbol}: ${unrealizedPct.toFixed(2)}% - holding...`
          );
        }
      }
    }, 2000); // Check every 2 seconds for tighter monitoring
  }

  // Periodic stats reporting
  private startStatsReporting(): void {
    setInterval(() => {
      const stats = this.trader.getStats();
      console.log(`\n📈 STATS | Trades: ${stats.total_trades} | Win Rate: ${(stats.win_rate).toFixed(1)}% | Avg P&L: ${stats.avg_pnl_pct}% | Active: ${stats.active_positions}`);
      console.log(
        `💵 Today: ${this.dailyStats.trades} trades | ${this.dailyStats.wins} wins | ${(this.dailyStats.totalPnL).toFixed(2)}% total P&L`
      );
    }, 60000); // Every 60 seconds
  }

  // Graceful shutdown
  stop(): void {
    console.log('\n🛑 Shutting down bot...');
    this.momentum.disconnect();
    process.exit(0);
  }
}

// Main entry point
const bot = new SneakersBot();
bot.start();

// Graceful shutdown on SIGINT
process.on('SIGINT', () => bot.stop());
