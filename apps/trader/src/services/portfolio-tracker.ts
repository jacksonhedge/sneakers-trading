// Portfolio Tracker: Monitors positions, P&L, and risk limits

import { Pool } from 'pg';

interface Position {
  id: string;
  platform: string;
  market_id: string;
  side: string;
  outcome: string;
  size: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

interface PortfolioSnapshot {
  platform: string;
  cash_balance: number;
  total_positions_value: number;
  total_value: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  total_pnl: number;
  total_pnl_pct: number;
  max_drawdown: number;
  drawdown_pct: number;
  num_open_positions: number;
}

interface DailyLimit {
  platform: string;
  date: string;
  max_daily_loss: number;
  max_daily_gain: number;
  max_position_size: number;
  max_open_positions: number;
  max_trades_per_day: number;
  realized_pnl: number;
  realized_loss: number;
  num_trades: number;
  num_positions: number;
  trading_allowed: boolean;
}

class PortfolioTracker {
  private pool: Pool;
  private positions: Map<string, Position> = new Map();
  private dailyPnL: number = 0;
  private totalPnL: number = 0;
  private maxDrawdown: number = 0;
  private dayStartBalance: number = 0;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  // Get all open positions for a platform
  async getPositions(platform: string): Promise<Position[]> {
    const query = `
      SELECT * FROM positions
      WHERE platform = $1
      ORDER BY opened_at DESC
    `;
    const result = await this.pool.query(query, [platform]);
    return result.rows;
  }

  // Calculate unrealized P&L for a position
  calculateUnrealizedPnL(position: Position): { pnl: number; pnl_pct: number } {
    const pnl = position.side === 'long'
      ? (position.current_price - position.avg_entry_price) * position.size
      : (position.avg_entry_price - position.current_price) * position.size;

    const pnl_pct = (pnl / (position.avg_entry_price * position.size)) * 100;

    return { pnl, pnl_pct };
  }

  // Update position with current price
  async updatePosition(positionId: string, currentPrice: number): Promise<void> {
    const query = `
      SELECT * FROM positions WHERE id = $1
    `;
    const result = await this.pool.query(query, [positionId]);
    const position = result.rows[0];

    const { pnl, pnl_pct } = this.calculateUnrealizedPnL({
      ...position,
      current_price: currentPrice,
    });

    const updateQuery = `
      UPDATE positions
      SET current_price = $1, unrealized_pnl = $2, unrealized_pnl_pct = $3, last_updated = NOW()
      WHERE id = $4
    `;
    await this.pool.query(updateQuery, [currentPrice, pnl, pnl_pct, positionId]);
  }

  // Create a trade (entry)
  async createTrade(
    platform: string,
    marketId: string,
    side: string,
    outcome: string,
    size: number,
    entryPrice: number
  ): Promise<string> {
    const query = `
      INSERT INTO trades (platform, market_id, side, outcome, size, entry_price, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'open')
      RETURNING id
    `;
    const result = await this.pool.query(query, [
      platform,
      marketId,
      side,
      outcome,
      size,
      entryPrice,
    ]);
    return result.rows[0].id;
  }

  // Close a trade
  async closeTrade(tradeId: string, exitPrice: number): Promise<{ pnl: number; pnl_pct: number }> {
    const query = `
      SELECT * FROM trades WHERE id = $1
    `;
    const result = await this.pool.query(query, [tradeId]);
    const trade = result.rows[0];

    const pnl = trade.side === 'buy'
      ? (exitPrice - trade.entry_price) * trade.size
      : (trade.entry_price - exitPrice) * trade.size;

    const pnl_pct = (pnl / (trade.entry_price * trade.size)) * 100;

    const updateQuery = `
      UPDATE trades
      SET status = 'closed', exit_price = $1, pnl = $2, pnl_pct = $3, closed_at = NOW()
      WHERE id = $4
    `;
    await this.pool.query(updateQuery, [exitPrice, pnl, pnl_pct, tradeId]);

    this.dailyPnL += pnl;
    this.totalPnL += pnl;

    return { pnl, pnl_pct };
  }

  // Get portfolio snapshot
  async getPortfolioSnapshot(platform: string): Promise<PortfolioSnapshot> {
    const positions = await this.getPositions(platform);

    let totalPositionsValue = 0;
    let totalUnrealizedPnL = 0;

    positions.forEach((pos) => {
      totalPositionsValue += pos.current_price * pos.size;
      totalUnrealizedPnL += pos.unrealized_pnl || 0;
    });

    const cashBalance = await this.getCashBalance(platform);
    const totalValue = cashBalance + totalPositionsValue;

    const snapshot: PortfolioSnapshot = {
      platform,
      cash_balance: cashBalance,
      total_positions_value: totalPositionsValue,
      total_value: totalValue,
      daily_pnl: this.dailyPnL,
      daily_pnl_pct: (this.dailyPnL / this.dayStartBalance) * 100,
      total_pnl: this.totalPnL,
      total_pnl_pct: (this.totalPnL / this.dayStartBalance) * 100,
      max_drawdown: this.maxDrawdown,
      drawdown_pct: (this.maxDrawdown / this.dayStartBalance) * 100,
      num_open_positions: positions.length,
    };

    // Store snapshot in DB
    await this.saveSnapshot(snapshot);

    return snapshot;
  }

  // Save snapshot to database
  private async saveSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
    const query = `
      INSERT INTO portfolio_snapshots
      (platform, cash_balance, total_positions_value, total_value, daily_pnl,
       daily_pnl_pct, total_pnl, total_pnl_pct, max_drawdown, drawdown_pct, num_open_positions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    await this.pool.query(query, [
      snapshot.platform,
      snapshot.cash_balance,
      snapshot.total_positions_value,
      snapshot.total_value,
      snapshot.daily_pnl,
      snapshot.daily_pnl_pct,
      snapshot.total_pnl,
      snapshot.total_pnl_pct,
      snapshot.max_drawdown,
      snapshot.drawdown_pct,
      snapshot.num_open_positions,
    ]);
  }

  // Get daily limits for a platform
  async getDailyLimits(platform: string): Promise<DailyLimit> {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT * FROM daily_limits WHERE platform = $1 AND date = $2
    `;
    const result = await this.pool.query(query, [platform, today]);

    if (result.rows.length === 0) {
      // Create default limits if not exists
      return await this.createDefaultLimits(platform, today);
    }

    return result.rows[0];
  }

  // Create default daily limits
  private async createDefaultLimits(platform: string, date: string): Promise<DailyLimit> {
    const limits: DailyLimit = {
      platform,
      date,
      max_daily_loss: -5000, // Stop at -$5k loss
      max_daily_gain: 50000,
      max_position_size: 5000, // $5k per bet
      max_open_positions: 10,
      max_trades_per_day: 100,
      realized_pnl: 0,
      realized_loss: 0,
      num_trades: 0,
      num_positions: 0,
      trading_allowed: true,
    };

    const query = `
      INSERT INTO daily_limits
      (platform, date, max_daily_loss, max_daily_gain, max_position_size,
       max_open_positions, max_trades_per_day)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const result = await this.pool.query(query, [
      platform,
      date,
      limits.max_daily_loss,
      limits.max_daily_gain,
      limits.max_position_size,
      limits.max_open_positions,
      limits.max_trades_per_day,
    ]);

    return result.rows[0];
  }

  // Check if trading is allowed (within limits)
  async canTrade(
    platform: string,
    proposedSize: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getDailyLimits(platform);

    if (!limits.trading_allowed) {
      return { allowed: false, reason: 'Trading disabled for today' };
    }

    if (proposedSize > limits.max_position_size) {
      return { allowed: false, reason: `Position size exceeds limit of $${limits.max_position_size}` };
    }

    if (limits.num_positions >= limits.max_open_positions) {
      return { allowed: false, reason: `Max open positions (${limits.max_open_positions}) reached` };
    }

    if (limits.num_trades >= limits.max_trades_per_day) {
      return { allowed: false, reason: `Max trades per day (${limits.max_trades_per_day}) reached` };
    }

    if (limits.realized_loss <= limits.max_daily_loss) {
      return { allowed: false, reason: `Daily loss limit ($${limits.max_daily_loss}) reached` };
    }

    return { allowed: true };
  }

  // Get cash balance from API (Alpaca, Polymarket, etc)
  private async getCashBalance(platform: string): Promise<number> {
    if (platform === 'alpaca') {
      // Implement Alpaca API call
      const response = await fetch(`${process.env.ALPACA_BASE_URL}/v2/account`, {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
        },
      });
      const data = await response.json() as any;
      return parseFloat(data.cash);
    }
    // Other platforms would have similar logic
    return 0;
  }

  // Reset daily metrics at midnight
  async resetDailyMetrics(): Promise<void> {
    this.dailyPnL = 0;
    this.maxDrawdown = 0;
  }

  // Cleanup
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default PortfolioTracker;
