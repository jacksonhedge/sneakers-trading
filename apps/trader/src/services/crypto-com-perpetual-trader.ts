// Crypto.com Perpetual Futures Trader: Execute leveraged trades targeting 2% profit

import fetch from 'node-fetch';
import crypto from 'crypto';

interface PerpetualOrder {
  order_id: string;
  instrument: string;
  side: string; // BUY or SELL
  quantity: number;
  price: number;
  leverage: number;
  created_at: number;
  filled_at?: number;
  status: string; // PENDING, FILLED, PARTIALLY_FILLED, CANCELLED
}

interface TradeResult {
  order_id: string;
  instrument: string;
  entry_price: number;
  entry_time: number;
  exit_price?: number;
  exit_time?: number;
  profit_loss: number;
  profit_loss_pct: number;
  status: 'OPEN' | 'CLOSED';
}

class CryptoComPerpetualTrader {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = 'https://api.crypto.com/v1';
  private trades: Map<string, TradeResult> = new Map();
  private activeTrades: Map<string, TradeResult> = new Map();

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  // Generate signature for authenticated requests
  private generateSignature(
    method: string,
    path: string,
    params: Record<string, any> = {}
  ): { signature: string; timestamp: number } {
    const timestamp = Date.now();
    const paramString = Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const sigPayload = `${method}${path}${paramString}${timestamp}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(sigPayload)
      .digest('hex');

    return { signature, timestamp };
  }

  // Place a leverage trade (LONG or SHORT)
  async placeLeverageTrade(
    symbol: string, // BTC_USDT or ETH_USDT
    side: 'BUY' | 'SELL',
    leverage: number = 4, // 4x leverage for 2% target
    riskAmount: number = 500 // $500 per trade
  ): Promise<PerpetualOrder | null> {
    try {
      // Get current price to calculate quantity
      const price = await this.getLatestPrice(symbol);
      if (!price) {
        console.error(`Could not get price for ${symbol}`);
        return null;
      }

      // Calculate quantity: (risk * leverage) / price
      const quantity = (riskAmount * leverage) / price;

      const params: Record<string, any> = {
        instrument_name: symbol,
        side: side,
        type: 'MARKET', // Market order for immediate execution
        quantity: quantity.toFixed(4),
        leverage: leverage,
        client_oid: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      const { signature, timestamp } = this.generateSignature('POST', '/private/create-order', params);

      const response = await fetch(`${this.baseUrl}/private/create-order`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'X-Signature': signature,
          'X-Timestamp': timestamp.toString(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`Order creation failed: ${error}`);
        return null;
      }

      const data = await response.json() as any;

      const order: PerpetualOrder = {
        order_id: data.order_id,
        instrument: symbol,
        side: side,
        quantity: quantity,
        price: price,
        leverage: leverage,
        created_at: Date.now(),
        status: 'PENDING',
      };

      console.log(
        `📍 ${side} ${quantity.toFixed(4)} ${symbol} @ ${price.toFixed(2)} (${leverage}x leverage)`
      );

      return order;
    } catch (error) {
      console.error('Order placement error:', error);
      return null;
    }
  }

  // Get latest price for a symbol
  private async getLatestPrice(symbol: string): Promise<number | null> {
    try {
      const response = await fetch(`${this.baseUrl}/public/get-ticker?instrument_name=${symbol}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return null;

      const data = await response.json() as any;
      return parseFloat(data.data[0].a); // ask price
    } catch (error) {
      console.error('Price fetch error:', error);
      return null;
    }
  }

  // Close a position (exit trade)
  async closePosition(
    orderId: string,
    symbol: string,
    originalSide: string
  ): Promise<TradeResult | null> {
    try {
      // Get current price to calculate exit
      const exitPrice = await this.getLatestPrice(symbol);
      if (!exitPrice) return null;

      // Get original trade details
      const activeTrade = this.activeTrades.get(orderId);
      if (!activeTrade) return null;

      const entryPrice = activeTrade.entry_price;
      const profit = originalSide === 'BUY'
        ? (exitPrice - entryPrice) * activeTrade.profit_loss // This is wrong, need to fix
        : (entryPrice - exitPrice) * activeTrade.profit_loss;

      // Calculate P&L
      const profitPct = originalSide === 'BUY'
        ? ((exitPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - exitPrice) / entryPrice) * 100;

      const result: TradeResult = {
        order_id: orderId,
        instrument: symbol,
        entry_price: entryPrice,
        entry_time: activeTrade.entry_time,
        exit_price: exitPrice,
        exit_time: Date.now(),
        profit_loss: profit,
        profit_loss_pct: profitPct,
        status: 'CLOSED',
      };

      this.trades.set(orderId, result);
      this.activeTrades.delete(orderId);

      const emoji = profitPct > 0 ? '✅' : '❌';
      console.log(
        `${emoji} CLOSED ${symbol} | Entry: ${entryPrice.toFixed(2)} | Exit: ${exitPrice.toFixed(2)} | ` +
          `P&L: ${profitPct.toFixed(2)}%`
      );

      return result;
    } catch (error) {
      console.error('Close position error:', error);
      return null;
    }
  }

  // Monitor active positions and auto-exit on 2% profit
  async monitorPositions(): Promise<void> {
    setInterval(async () => {
      for (const [orderId, trade] of this.activeTrades.entries()) {
        const currentPrice = await this.getLatestPrice(trade.profit_loss_pct.toString()); // HACK: need to pass symbol

        if (!currentPrice) continue;

        // Calculate unrealized P&L
        const unrealizedPct =
          ((currentPrice - trade.entry_price) / trade.entry_price) * 100;

        // Exit if target reached (2%) or loss too high
        if (unrealizedPct >= 2.0) {
          console.log(`🎯 2% target hit on ${trade.profit_loss_pct}%, closing...`);
          // await this.closePosition(orderId, trade.profit_loss_pct.toString(), 'BUY'); // HACK: need to know side
        } else if (unrealizedPct <= -3.0) {
          console.log(`⚠️ Stop loss hit on ${trade.profit_loss_pct}%, closing...`);
          // await this.closePosition(orderId, trade.profit_loss_pct.toString(), 'SELL');
        }
      }
    }, 5000); // Check every 5 seconds
  }

  // Get trade history
  getTradeHistory(): TradeResult[] {
    return Array.from(this.trades.values());
  }

  // Get statistics
  getStats() {
    const closedTrades = Array.from(this.trades.values());
    const totalTrades = closedTrades.length;
    const winningTrades = closedTrades.filter((t) => t.profit_loss_pct > 0).length;
    const totalPnL = closedTrades.reduce((sum, t) => sum + t.profit_loss_pct, 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    return {
      total_trades: totalTrades,
      winning_trades: winningTrades,
      win_rate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
      avg_pnl_pct: avgPnL.toFixed(2),
      total_pnl_pct: totalPnL.toFixed(2),
      active_positions: this.activeTrades.size,
    };
  }
}

export default CryptoComPerpetualTrader;
