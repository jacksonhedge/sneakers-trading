// Limitless Trade Executor - Place bets on extreme odds markets

import fetch from 'node-fetch';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '../../apps/trader/.env' });

interface PlaceTradeParams {
  market_id: string;
  side: 'YES' | 'NO';
  position_size: number; // dollars
  limit_price?: number; // optional, default to market price
}

interface TradeResult {
  success: boolean;
  trade_id?: string;
  order_id?: string;
  filled_amount?: number;
  average_price?: number;
  total_cost?: number;
  error?: string;
}

class LimitlessExecutor {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;

  async placeMarketOrder(params: PlaceTradeParams): Promise<TradeResult> {
    try {
      // Use provided limit price or estimate from position size
      // Assume ~0.95 average price for market orders at extreme odds
      const executionPrice = params.limit_price || 0.95;
      const shares = params.position_size / executionPrice;

      // Step 2: Place order (assuming Limitless has a /place-order endpoint)
      const orderResponse = await fetch(`${this.limitlessUrl}/orders/place`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.limitlessKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          market_id: params.market_id,
          side: params.side,
          amount: shares,
          limit_price: executionPrice,
          order_type: 'MARKET',
        }),
      });

      if (!orderResponse.ok) {
        return {
          success: false,
          error: `Order placement failed: ${orderResponse.status}`,
        };
      }

      const orderData = (await orderResponse.json()) as any;

      return {
        success: true,
        trade_id: orderData.data?.trade_id || orderData.data?.id,
        order_id: orderData.data?.order_id,
        filled_amount: shares,
        average_price: executionPrice,
        total_cost: params.position_size,
      };
    } catch (e) {
      return {
        success: false,
        error: `Exception: ${(e as Error).message}`,
      };
    }
  }

  async closePosition(
    market_id: string,
    position_id: string,
    side: 'YES' | 'NO'
  ): Promise<TradeResult> {
    try {
      // Flip the side to exit
      const exitSide = side === 'YES' ? 'NO' : 'YES';

      const response = await fetch(`${this.limitlessUrl}/orders/place`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.limitlessKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          market_id: market_id,
          side: exitSide,
          close_position: position_id,
          order_type: 'MARKET',
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Close failed: ${response.status}`,
        };
      }

      const data = (await response.json()) as any;

      return {
        success: true,
        trade_id: data.data?.trade_id,
        order_id: data.data?.order_id,
      };
    } catch (e) {
      return {
        success: false,
        error: `Exception: ${(e as Error).message}`,
      };
    }
  }

  async executeGrassMarket(
    market_id: string,
    side: 'YES' | 'NO',
    probability: number,
    position_size: number = 500
  ): Promise<TradeResult> {
    console.log(
      `\n🔨 HAMMERING: ${market_id} | Side: ${side} | Prob: ${(probability * 100).toFixed(1)}% | Capital: $${position_size}`
    );

    const result = await this.placeMarketOrder({
      market_id,
      side,
      position_size,
    });

    if (result.success) {
      console.log(
        `✅ EXECUTED: Trade #${result.trade_id} | Filled: ${result.filled_amount?.toFixed(4)} shares @ ${result.average_price?.toFixed(4)}`
      );
      console.log(`   Est. profit if correct: $${((probability - 1) * position_size + position_size).toFixed(2)}`);
    } else {
      console.log(`❌ FAILED: ${result.error}`);
    }

    return result;
  }

  async getPortfolio(): Promise<any> {
    try {
      const response = await fetch(`${this.limitlessUrl}/portfolio`, {
        headers: {
          'X-API-Key': this.limitlessKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return { error: `Failed to fetch portfolio: ${response.status}` };
      }

      return await response.json();
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  async getBalance(): Promise<number> {
    try {
      const portfolio = await this.getPortfolio();
      return portfolio.data?.cash_balance || 0;
    } catch (e) {
      console.error('Error fetching balance:', (e as Error).message);
      return 0;
    }
  }
}

// Example usage
const executor = new LimitlessExecutor();

(async () => {
  // Check balance
  const balance = await executor.getBalance();
  console.log(`\n💰 Current balance: $${balance.toFixed(2)}`);

  // Example: Execute a grass market
  // const result = await executor.executeGrassMarket(
  //   'market_abc123',
  //   'YES',
  //   0.978,
  //   500
  // );

  console.log(
    '\n⚠️  Executor ready. Call executeGrassMarket() to place trades on mow-the-grass opportunities.'
  );
})();

export default LimitlessExecutor;
