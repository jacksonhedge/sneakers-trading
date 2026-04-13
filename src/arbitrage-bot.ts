// Arbitrage Bot: Execute cross-platform prediction market arbitrage + near-expiration plays

import PredictionMarketAggregator from './services/prediction-market-aggregator';
import PortfolioTracker from './services/portfolio-tracker';
import dotenv from 'dotenv';

dotenv.config({ path: '../../apps/trader/.env' });

interface ExecutedTrade {
  id: string;
  type: 'ARBITRAGE' | 'NEAR_EXPIRATION';
  buy_platform: string;
  sell_platform: string;
  asset: string;
  outcome: string;
  buy_price: number;
  sell_price: number;
  position_size: number; // How many shares to buy/sell
  roi_pct: number;
  cost: number; // Total cost (position_size * buy_price)
  status: 'OPEN' | 'CLOSED';
  entry_time: number;
  exit_time?: number;
  actual_pnl: number;
}

class ArbitrageBot {
  private aggregator: PredictionMarketAggregator;
  private portfolio: PortfolioTracker;
  private bankroll: number = 5000; // $5k
  private position_size: number = 500; // $500 per trade
  private executedTrades: Map<string, ExecutedTrade> = new Map();
  private dailyStats = { trades: 0, arbs: 0, near_exp: 0, total_pnl: 0 };

  constructor() {
    this.aggregator = new PredictionMarketAggregator();
    this.portfolio = new PortfolioTracker(process.env.POSTGRES_URL!);
  }

  // Main trading loop
  async start(): Promise<void> {
    console.log('🤖 Arbitrage Bot Starting...');
    console.log(`💰 Bankroll: $${this.bankroll}`);
    console.log(`📊 Position size per trade: $${this.position_size}`);
    console.log(`\n📡 Data Sources (Read-Only):`);
    console.log(`   • Polymarket (price gauge)`);
    console.log(`🎯 Execution Platforms:`);
    console.log(`   • Kalshi (primary)`);
    console.log(`   • Limitless (secondary)`);
    console.log(`\n🔄 Strategy: Monitor Polymarket prices → Execute spreads on Kalshi/Limitless`);

    // Continuous scanning loop
    this.startScanningLoop();

    // Stats reporting
    this.startStatsReporting();
  }

  // Main scanning loop
  private startScanningLoop(): void {
    setInterval(async () => {
      try {
        console.log('\n🔍 Scanning all markets...');

        // Aggregate markets from all platforms
        await this.aggregator.aggregateMarkets();

        // Detect arbitrage opportunities
        const arbs = this.aggregator.detectArbitrage();
        const nearExp = this.aggregator.detectNearExpirationPlays();

        console.log(`Found ${arbs.length} arbitrage + ${nearExp.length} near-expiration opportunities`);

        // Execute top opportunities
        if (arbs.length > 0) {
          await this.executeArbitrage(arbs.slice(0, 3)); // Top 3 arbs
        }

        if (nearExp.length > 0) {
          await this.executeNearExpiration(nearExp.slice(0, 3)); // Top 3 near-exp
        }

        // Log status
        this.logStatus();
      } catch (error) {
        console.error('Scan error:', error);
      }
    }, 10000); // Scan every 10 seconds
  }

  // Execute arbitrage trades
  private async executeArbitrage(opportunities: any[]): Promise<void> {
    for (const arb of opportunities) {
      // Check if we have enough capital
      const requiredCapital = this.position_size * 2; // Buy on one platform, sell on another
      if (requiredCapital > this.bankroll * 0.3) {
        console.log(`⚠️ Skipping ${arb.asset} - not enough capital`);
        continue;
      }

      console.log(`\n🎯 ARBITRAGE: ${arb.asset} ${arb.outcome}`);
      console.log(`  Buy ${arb.buy_side} on ${arb.buy_platform} @ ${arb.buy_price.toFixed(4)}`);
      console.log(`  Sell ${arb.sell_side} on ${arb.sell_platform} @ ${arb.sell_price.toFixed(4)}`);
      console.log(`  ROI: ${arb.roi_pct.toFixed(2)}% | Urgency: ${arb.urgency}`);

      // Place buy order on buy_platform
      const buyOrderId = await this.placeBuyOrder(
        arb.buy_platform,
        arb.market_id,
        arb.buy_side,
        this.position_size / arb.buy_price // Quantity
      );

      if (!buyOrderId) {
        console.log(`❌ Failed to place buy order on ${arb.buy_platform}`);
        continue;
      }

      // Place sell order on sell_platform
      const sellOrderId = await this.placeSellOrder(
        arb.sell_platform,
        arb.market_id,
        arb.sell_side,
        this.position_size / arb.sell_price
      );

      if (!sellOrderId) {
        console.log(`❌ Failed to place sell order on ${arb.sell_platform}`);
        continue;
      }

      // Track execution
      const tradeId = `arb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.executedTrades.set(tradeId, {
        id: tradeId,
        type: 'ARBITRAGE',
        buy_platform: arb.buy_platform,
        sell_platform: arb.sell_platform,
        asset: arb.asset,
        outcome: arb.outcome,
        buy_price: arb.buy_price,
        sell_price: arb.sell_price,
        position_size: this.position_size / arb.buy_price,
        roi_pct: arb.roi_pct,
        cost: this.position_size,
        status: 'OPEN',
        entry_time: Date.now(),
        actual_pnl: 0,
      });

      console.log(`✅ EXECUTED - Orders placed, waiting for settlement...`);
      this.dailyStats.arbs++;
      this.dailyStats.trades++;
    }
  }

  // Execute near-expiration value plays
  private async executeNearExpiration(plays: any[]): Promise<void> {
    for (const play of plays) {
      // Check capital
      if (this.position_size > this.bankroll * 0.2) {
        console.log(`⚠️ Skipping ${play.asset} - not enough capital`);
        continue;
      }

      console.log(`\n💎 NEAR-EXPIRATION VALUE: ${play.asset} ${play.outcome}`);
      console.log(`  Platform: ${play.platform}`);
      console.log(
        `  Price: ${play.price.toFixed(4)} (Fair: ${play.fair_value.toFixed(4)}, Discount: ${play.discount_pct.toFixed(1)}%)`
      );
      console.log(`  Expires in: ${(play.time_to_expiry / 60).toFixed(1)} min`);
      console.log(`  Guaranteed ROI if correct: ${play.guaranteed_roi_pct.toFixed(1)}%`);

      // Buy undervalued outcome
      const quantity = this.position_size / play.price;
      const orderId = await this.placeBuyOrder(
        play.platform,
        play.market_id,
        play.price < 0.5 ? 'YES' : 'NO', // If price is low, buy that side
        quantity
      );

      if (orderId) {
        const tradeId = `near_exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.executedTrades.set(tradeId, {
          id: tradeId,
          type: 'NEAR_EXPIRATION',
          buy_platform: play.platform,
          sell_platform: play.platform,
          asset: play.asset,
          outcome: play.outcome,
          buy_price: play.price,
          sell_price: play.fair_value,
          position_size: quantity,
          roi_pct: play.discount_pct,
          cost: this.position_size,
          status: 'OPEN',
          entry_time: Date.now(),
          actual_pnl: 0,
        });

        console.log(`✅ BUY ORDER PLACED - Holding until expiry...`);
        this.dailyStats.near_exp++;
        this.dailyStats.trades++;
      }
    }
  }

  // Placeholder for actual order placement (would connect to exchange APIs)
  private async placeBuyOrder(
    platform: string,
    marketId: string,
    side: string,
    quantity: number
  ): Promise<string | null> {
    // TODO: Implement actual API calls to each platform
    console.log(`[${platform}] BUY ${quantity.toFixed(4)} ${side} shares of ${marketId}`);
    return `order_${Date.now()}`;
  }

  private async placeSellOrder(
    platform: string,
    marketId: string,
    side: string,
    quantity: number
  ): Promise<string | null> {
    console.log(`[${platform}] SELL ${quantity.toFixed(4)} ${side} shares of ${marketId}`);
    return `order_${Date.now()}`;
  }

  // Status logging
  private logStatus(): void {
    const stats = this.aggregator.getStats();
    console.log(`\n📊 MARKET STATUS`);
    console.log(`  Total markets: ${stats.total_markets}`);
    console.log(`  Kalshi: ${stats.by_platform.kalshi} | Polymarket: ${stats.by_platform.polymarket} | Limitless: ${stats.by_platform.limitless}`);
    console.log(`  Arbitrage opportunities: ${stats.arbitrage_opportunities}`);
    console.log(`  Avg ROI: ${stats.avg_roi_pct}% | Max ROI: ${stats.max_roi_pct}%`);
    console.log(`  High urgency (< 5 min): ${stats.high_urgency}`);
  }

  // Stats reporting
  private startStatsReporting(): void {
    setInterval(() => {
      console.log(`\n💰 SESSION STATS`);
      console.log(`  Trades executed: ${this.dailyStats.trades} (${this.dailyStats.arbs} arbs, ${this.dailyStats.near_exp} near-exp)`);
      console.log(`  Total P&L: ${this.dailyStats.total_pnl.toFixed(2)}%`);
      console.log(`  Open positions: ${Array.from(this.executedTrades.values()).filter((t) => t.status === 'OPEN').length}`);
    }, 60000); // Every minute
  }

  // Graceful shutdown
  async stop(): Promise<void> {
    console.log('\n🛑 Shutting down bot...');
    await this.portfolio.close();
    process.exit(0);
  }
}

// Main entry
const bot = new ArbitrageBot();
bot.start();

process.on('SIGINT', () => bot.stop());
