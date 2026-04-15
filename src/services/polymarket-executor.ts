// Polymarket Trade Executor
// Executes weather market trades on Polymarket CLOB based on edges from our ensemble model.
// Uses Kelly criterion sizing with a dedicated bankroll.

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { ClobClient, Side, OrderType, AssetType } from '@polymarket/clob-client';
import type { ApiKeyCreds, UserOrder, OpenOrder, Trade } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/clob-client';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { CrossPlatformEdge } from './cross-platform-edge-finder.js';
import { insertTrade } from '../db.js';
import EmailNotifier from './email-notifier.js';

// Lazy credential loading (ES module hoisting workaround)
const getPolymarketConfig = () => ({
  apiKey: process.env.POLYMARKET_API_KEY || '',
  apiSecret: process.env.POLYMARKET_API_SECRET || '',
  apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE || '',
  address: process.env.POLYMARKET_ADDRESS || '',
  privateKey: process.env.POLYMARKET_PRIVATE_KEY || '',
});

export interface ExecutionResult {
  edge: CrossPlatformEdge;
  orderType: 'LIMIT' | 'MARKET';
  tokenId: string;
  side: Side;
  price: number;
  size: number;      // shares
  costUsdc: number;  // USDC spent
  orderId: string;
  status: 'PLACED' | 'FILLED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  error?: string;
  timestamp: number;
}

export interface ExecutorConfig {
  bankroll: number;           // dedicated bankroll for Polymarket ($250)
  maxPositionPct: number;     // max % of bankroll per trade (default 15%)
  maxPositionUsdc: number;    // absolute cap per trade
  minEdge: number;            // minimum edge to trade (cents)
  minConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  dryRun: boolean;            // if true, don't actually send orders
  maxOpenOrders: number;      // max concurrent open orders
  limitPriceSlippage: number; // how much worse than model price we'll accept (cents)
  resolutionFeePct: number;   // Polymarket fee on winnings (2%)
}

// Tracks a live position we hold
export interface Position {
  tokenId: string;
  location: string;
  targetDate: string;
  outcomeLabel: string;
  direction: 'BUY_YES' | 'BUY_NO';
  shares: number;
  avgCost: number;           // avg price per share
  totalCost: number;         // total USDC spent
  currentPrice: number;      // latest market price
  modelProb: number;         // our current model probability
  edge: number;              // current edge (can go negative)
  orderId: string;
  placedAt: number;
  status: 'OPEN' | 'SOLD' | 'RESOLVED_WIN' | 'RESOLVED_LOSS';
  pnl: number;               // realized P&L (after fees)
}

const DEFAULT_CONFIG: ExecutorConfig = {
  bankroll: 250,
  maxPositionPct: 0.15,
  maxPositionUsdc: 40,
  minEdge: 0.06,
  minConfidence: 'MEDIUM',
  dryRun: false,
  maxOpenOrders: 10,
  limitPriceSlippage: 0.02,
  resolutionFeePct: 0.02,
};

class PolymarketExecutor {
  private client: ClobClient | null = null;
  private config: ExecutorConfig;
  private executedTokens: Set<string> = new Set();
  private totalDeployed = 0;
  private emailNotifier: EmailNotifier;
  private positions: Map<string, Position> = new Map();  // tokenId -> Position

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emailNotifier = new EmailNotifier();
    this.emailNotifier.initialize();
  }

  // Initialize the CLOB client with credentials
  async initialize(): Promise<boolean> {
    const cfg = getPolymarketConfig();

    if (!cfg.privateKey || !cfg.apiKey || !cfg.apiSecret) {
      console.error('[EXECUTOR] Missing Polymarket credentials in .env');
      return false;
    }

    try {
      const account = privateKeyToAccount(cfg.privateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(),
      });

      const creds: ApiKeyCreds = {
        key: cfg.apiKey,
        secret: cfg.apiSecret,
        passphrase: cfg.apiPassphrase,
      };

      this.client = new ClobClient(
        'https://clob.polymarket.com',
        137,                          // Polygon
        walletClient,
        creds,
        SignatureType.POLY_PROXY,     // 1 = Polymarket proxy wallet
        cfg.address,                  // funder address
      );

      // Verify connection
      const ok = await this.client.getOk();
      console.log(`[EXECUTOR] Connected to Polymarket CLOB: ${JSON.stringify(ok)}`);

      return true;
    } catch (e) {
      console.error(`[EXECUTOR] Init failed: ${(e as Error).message}`);
      return false;
    }
  }

  // Check USDC balance on Polymarket
  async getBalance(): Promise<number> {
    if (!this.client) throw new Error('Executor not initialized');

    const result = await this.client.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });

    // Balance is in raw units (6 decimals for USDC)
    return parseInt(result.balance) / 1e6;
  }

  // Get current open orders
  async getOpenOrders(): Promise<OpenOrder[]> {
    if (!this.client) throw new Error('Executor not initialized');
    return this.client.getOpenOrders();
  }

  // Get recent trades
  async getRecentTrades(): Promise<Trade[]> {
    if (!this.client) throw new Error('Executor not initialized');
    return this.client.getTrades();
  }

  // Execute a batch of edges: filter, size, and place orders
  async executeEdges(edges: CrossPlatformEdge[]): Promise<ExecutionResult[]> {
    if (!this.client) {
      const ok = await this.initialize();
      if (!ok) return [];
    }

    const results: ExecutionResult[] = [];

    // Filter to Polymarket edges only, with liquidity awareness
    const polyEdges = edges
      .filter(e => e.platform === 'polymarket')
      .filter(e => Math.abs(e.edge) >= this.config.minEdge)
      .filter(e => this.meetsConfidence(e.confidence))
      .filter(e => !this.executedTokens.has(e.id))
      .filter(e => e.volume > 100)  // Skip markets with < $100 total volume
      .sort((a, b) => {
        // Prefer edges with higher volume (liquidity-weighted)
        const aScore = a.expectedProfit * Math.min(1, a.volume / 10000);
        const bScore = b.expectedProfit * Math.min(1, b.volume / 10000);
        return bScore - aScore;
      });

    if (polyEdges.length === 0) {
      console.log('[EXECUTOR] No actionable Polymarket edges');
      return results;
    }

    // Check how much capital we can deploy
    const remainingBankroll = this.config.bankroll - this.totalDeployed;
    if (remainingBankroll < 5) {
      console.log(`[EXECUTOR] Bankroll exhausted ($${this.totalDeployed.toFixed(2)} deployed of $${this.config.bankroll})`);
      return results;
    }

    // Check open order count
    const openOrders = await this.getOpenOrders();
    const openCount = openOrders.length;
    if (openCount >= this.config.maxOpenOrders) {
      console.log(`[EXECUTOR] Max open orders reached (${openCount}/${this.config.maxOpenOrders})`);
      return results;
    }

    const slotsAvailable = this.config.maxOpenOrders - openCount;

    console.log(`\n[EXECUTOR] Processing ${polyEdges.length} edges | Remaining bankroll: $${remainingBankroll.toFixed(2)} | Open slots: ${slotsAvailable}`);

    for (const edge of polyEdges.slice(0, slotsAvailable)) {
      const result = await this.executeSingleEdge(edge, remainingBankroll - this.totalDeployed);
      results.push(result);

      if (result.status === 'PLACED' || result.status === 'FILLED') {
        this.totalDeployed += result.costUsdc;
        this.executedTokens.add(edge.id);
      }

      // Rate limit between orders
      await new Promise(r => setTimeout(r, 500));
    }

    // Send email notification for placed trades
    if (results.some(r => r.status === 'PLACED' || r.status === 'FILLED')) {
      await this.emailNotifier.sendTradeAlert(results);
    }

    return results;
  }

  private async executeSingleEdge(
    edge: CrossPlatformEdge,
    remainingBankroll: number,
  ): Promise<ExecutionResult> {
    const now = Date.now();

    // Get the YES token ID directly from the edge
    const tokenId = edge.tokenId;
    if (!tokenId) {
      return {
        edge, orderType: 'LIMIT', tokenId: '', side: Side.BUY,
        price: 0, size: 0, costUsdc: 0, orderId: '',
        status: 'SKIPPED', error: 'No token ID available', timestamp: now,
      };
    }

    // Determine trade parameters
    // On Polymarket, both YES and NO are BUY operations on different tokens.
    // BUY_YES = buy YES token. BUY_NO = buy YES token on the complement (NO) side.
    // Since we only have the YES tokenId, for BUY_NO we buy the NO token at (1 - yesPrice).
    // But the CLOB only accepts BUY/SELL on a specific tokenId.
    // Simplest: for BUY_NO, we still BUY but at the complement price.
    // Actually: BUY_NO = BUY the NO token. We need to use the NO token ID.
    // Since Polymarket weather markets are binary, each sub-market has a YES and NO token.
    // The clobTokenIds[0] = YES, clobTokenIds[1] = NO.
    // For now, focus on BUY_YES trades which work, and skip BUY_NO until we have NO token IDs.
    if (edge.direction === 'BUY_NO') {
      // Skip BUY_NO for now — requires NO token ID which scanner doesn't yet provide
      return {
        edge, orderType: 'LIMIT', tokenId, side: Side.BUY,
        price: 0, size: 0, costUsdc: 0, orderId: '',
        status: 'SKIPPED', error: 'BUY_NO requires NO token (not yet supported)', timestamp: now,
      };
    }

    const side = Side.BUY;

    // Check liquidity and verify live price before trading
    let maxImpactUsdc = Infinity;
    try {
      const book = await this.client!.getOrderBook(tokenId);
      const asks = book.asks || [];
      const bids = book.bids || [];
      const totalAskDepth = asks.reduce((s, a) => s + parseFloat(a.size) * parseFloat(a.price), 0);

      if (totalAskDepth < 50) {
        console.log(`          SKIP: Low ask liquidity ($${totalAskDepth.toFixed(0)}) for ${edge.outcomeLabel} @ ${edge.location}`);
        return {
          edge, orderType: 'LIMIT', tokenId, side, price: 0, size: 0, costUsdc: 0,
          orderId: '', status: 'SKIPPED', error: `Low liquidity: $${totalAskDepth.toFixed(0)} ask depth`, timestamp: now,
        };
      }

      maxImpactUsdc = totalAskDepth * 0.3;
      if (maxImpactUsdc < 5) {
        return {
          edge, orderType: 'LIMIT', tokenId, side, price: 0, size: 0, costUsdc: 0,
          orderId: '', status: 'SKIPPED', error: 'Would exceed 30% of book depth', timestamp: now,
        };
      }

      // Pre-trade price verification: use live orderbook mid price, not stale Gamma price
      const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : edge.marketPrice;
      const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : edge.marketPrice;
      const liveMidPrice = (bestAsk + bestBid) / 2;

      // Recalculate edge with live price (account for 2% resolution fee on winnings)
      const effectiveModelProb = edge.modelProbability;
      const expectedPayoff = effectiveModelProb * (1 - this.config.resolutionFeePct); // fee on $1 payout
      const liveEdge = expectedPayoff - liveMidPrice;

      if (liveEdge < this.config.minEdge) {
        console.log(`          SKIP: Live edge ${(liveEdge * 100).toFixed(1)}c < min ${(this.config.minEdge * 100).toFixed(0)}c (stale: ${(edge.edge * 100).toFixed(1)}c, live mid: ${(liveMidPrice * 100).toFixed(1)}%)`);
        return {
          edge, orderType: 'LIMIT', tokenId, side, price: 0, size: 0, costUsdc: 0,
          orderId: '', status: 'SKIPPED', error: `Live edge gone: ${(liveEdge * 100).toFixed(1)}c (was ${(edge.edge * 100).toFixed(1)}c)`, timestamp: now,
        };
      }
    } catch {
      // If orderbook fetch fails, proceed cautiously with smaller size
    }

    // We think YES is underpriced. Buy at market price + small improvement
    let price = Math.min(
      edge.marketPrice + this.config.limitPriceSlippage,
      edge.modelProbability - 0.01,
    );

    // Round price to valid tick size (0.001 for most weather markets)
    price = Math.round(price * 1000) / 1000;
    price = Math.max(0.001, Math.min(0.999, price));

    // Size: Kelly-based from edge finder, but capped by our smaller bankroll
    const maxFromBankroll = Math.min(
      remainingBankroll * this.config.maxPositionPct,
      this.config.maxPositionUsdc,
    );

    const costPerShare = price;
    const maxShares = Math.floor(maxFromBankroll / costPerShare);
    const shares = Math.max(1, Math.min(maxShares, Math.floor(edge.recommendedSize / costPerShare)));
    const costUsdc = shares * costPerShare;

    if (costUsdc < 1) {
      return {
        edge, orderType: 'LIMIT', tokenId, side, price, size: shares, costUsdc,
        orderId: '', status: 'SKIPPED', error: 'Position too small', timestamp: now,
      };
    }

    console.log(`[EXECUTOR] ${edge.direction} ${edge.outcomeLabel} @ ${edge.location} ${edge.targetDate}`);
    console.log(`          Model: ${(edge.modelProbability * 100).toFixed(1)}% | Market: ${(edge.marketPrice * 100).toFixed(1)}% | Edge: ${(edge.edge * 100).toFixed(1)}c`);
    console.log(`          ${side} ${shares} shares @ $${price.toFixed(2)} = $${costUsdc.toFixed(2)}`);

    if (this.config.dryRun) {
      console.log(`          [DRY RUN] Order not sent`);
      this.logTrade(edge, 'SIMULATED', '', costUsdc);
      return {
        edge, orderType: 'LIMIT', tokenId, side, price, size: shares, costUsdc,
        orderId: 'DRY_RUN', status: 'PLACED', timestamp: now,
      };
    }

    try {
      const userOrder: UserOrder = {
        tokenID: tokenId,
        price,
        size: shares,
        side,
      };

      const result = await this.client!.createAndPostOrder(userOrder, undefined, OrderType.GTC);

      // Parse response — CLOB returns { orderID, status, success, errorMsg, ... }
      const orderId = result?.orderID || result?.orderID || result?.id || 'unknown';
      const isError = result?.error || result?.errorMsg || !result?.success;
      const status = isError ? 'FAILED' : (result?.status === 'matched' ? 'FILLED' : 'PLACED');

      if (isError) {
        const errMsg = result?.error || result?.errorMsg || 'Unknown error';
        console.error(`          REJECTED: ${errMsg}`);
        return {
          edge, orderType: 'LIMIT', tokenId, side, price, size: shares, costUsdc,
          orderId, status: 'FAILED' as const, error: errMsg, timestamp: now,
        };
      }

      console.log(`          Order ${orderId}: ${status}`);

      // Track position for monitoring and selling
      this.trackPosition(edge, tokenId, price, shares, costUsdc, orderId);

      this.logTrade(edge, status === 'FILLED' ? 'FILLED' : 'PENDING', orderId, costUsdc);

      return {
        edge, orderType: 'LIMIT', tokenId, side, price, size: shares, costUsdc,
        orderId, status, timestamp: now,
      };
    } catch (e) {
      const error = (e as Error).message;
      console.error(`          FAILED: ${error}`);
      this.logTrade(edge, 'FAILED', '', costUsdc);
      return {
        edge, orderType: 'LIMIT', tokenId, side, price, size: shares, costUsdc,
        orderId: '', status: 'FAILED', error, timestamp: now,
      };
    }
  }

  private meetsConfidence(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): boolean {
    const levels = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return levels[confidence] >= levels[this.config.minConfidence];
  }

  private logTrade(edge: CrossPlatformEdge, status: string, orderId: string, costUsdc: number): void {
    try {
      insertTrade.run({
        market_id: edge.id,
        platform: 'Polymarket',
        asset: `TEMP-${edge.location}`,
        side: edge.direction,
        probability: edge.modelProbability,
        position_size: costUsdc,
        estimated_return: costUsdc * Math.abs(edge.edge),
        status,
        executed_at: Date.now(),
      });
    } catch { /* non-critical */ }
  }

  // Cancel all open orders
  async cancelAll(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.cancelAll();
      console.log('[EXECUTOR] All orders cancelled');
    } catch (e) {
      console.error(`[EXECUTOR] Cancel failed: ${(e as Error).message}`);
    }
  }

  // Get position in a specific token
  async getPosition(tokenId: string): Promise<number> {
    if (!this.client) return 0;
    const result = await this.client.getBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: tokenId,
    });
    return parseInt(result.balance) / 1e6;
  }

  getStats(): { totalDeployed: number; tradesExecuted: number; bankrollRemaining: number } {
    return {
      totalDeployed: this.totalDeployed,
      tradesExecuted: this.executedTokens.size,
      bankrollRemaining: this.config.bankroll - this.totalDeployed,
    };
  }

  // Track a new position after a trade is placed
  private trackPosition(edge: CrossPlatformEdge, tokenId: string, price: number, shares: number, costUsdc: number, orderId: string): void {
    const existing = this.positions.get(tokenId);
    if (existing && existing.status === 'OPEN') {
      // Average into existing position
      const totalShares = existing.shares + shares;
      existing.avgCost = (existing.totalCost + costUsdc) / totalShares;
      existing.shares = totalShares;
      existing.totalCost += costUsdc;
      existing.modelProb = edge.modelProbability;
      existing.edge = edge.edge;
    } else {
      this.positions.set(tokenId, {
        tokenId,
        location: edge.location,
        targetDate: edge.targetDate,
        outcomeLabel: edge.outcomeLabel,
        direction: edge.direction,
        shares,
        avgCost: price,
        totalCost: costUsdc,
        currentPrice: edge.marketPrice,
        modelProb: edge.modelProbability,
        edge: edge.edge,
        orderId,
        placedAt: Date.now(),
        status: 'OPEN',
        pnl: 0,
      });
    }
  }

  // Sell a position — exit shares on the CLOB
  async sellPosition(tokenId: string, reason: string): Promise<ExecutionResult | null> {
    if (!this.client) return null;

    const pos = this.positions.get(tokenId);
    if (!pos || pos.status !== 'OPEN' || pos.shares <= 0) {
      console.log(`[EXECUTOR] No open position for token ${tokenId.slice(0, 10)}...`);
      return null;
    }

    // Check actual on-chain balance to confirm we hold shares
    const actualShares = await this.getPosition(tokenId);
    if (actualShares <= 0) {
      console.log(`[EXECUTOR] No on-chain shares for ${pos.outcomeLabel} @ ${pos.location}`);
      pos.status = 'SOLD';
      pos.pnl = -pos.totalCost; // lost everything
      return null;
    }

    // Get live orderbook to find best bid
    try {
      const book = await this.client.getOrderBook(tokenId);
      const bids = book.bids || [];
      if (bids.length === 0) {
        console.log(`[EXECUTOR] No bids for ${pos.outcomeLabel} @ ${pos.location} — can't sell`);
        return null;
      }

      const bestBid = parseFloat(bids[0].price);
      const bidDepth = bids.reduce((s, b) => s + parseFloat(b.size), 0);
      const sharesToSell = Math.min(pos.shares, Math.floor(bidDepth * 0.3)); // don't sell more than 30% of bid depth

      if (sharesToSell <= 0) {
        console.log(`[EXECUTOR] Bid depth too thin to sell ${pos.outcomeLabel}`);
        return null;
      }

      // Sell at slightly below best bid to ensure fill
      const sellPrice = Math.max(0.001, Math.round((bestBid - 0.001) * 1000) / 1000);
      const proceeds = sharesToSell * sellPrice;
      const pnl = proceeds - (sharesToSell * pos.avgCost);

      console.log(`[EXECUTOR] SELL ${pos.outcomeLabel} @ ${pos.location} | ${sharesToSell} shares @ $${sellPrice.toFixed(3)} | P&L: $${pnl.toFixed(2)} | Reason: ${reason}`);

      if (this.config.dryRun) {
        console.log(`          [DRY RUN] Sell not sent`);
        pos.status = 'SOLD';
        pos.pnl = pnl;
        this.totalDeployed -= sharesToSell * pos.avgCost;
        return null;
      }

      const userOrder: UserOrder = {
        tokenID: tokenId,
        price: sellPrice,
        size: sharesToSell,
        side: Side.SELL,
      };

      const result = await this.client.createAndPostOrder(userOrder, undefined, OrderType.GTC);
      const orderId = result?.orderID || result?.id || 'unknown';
      const isError = result?.error || result?.errorMsg || !result?.success;

      if (isError) {
        console.error(`          SELL REJECTED: ${result?.error || result?.errorMsg}`);
        return null;
      }

      console.log(`          Sell order ${orderId}: placed`);

      // Update position
      if (sharesToSell >= pos.shares) {
        pos.status = 'SOLD';
        pos.shares = 0;
      } else {
        pos.shares -= sharesToSell;
        pos.totalCost -= sharesToSell * pos.avgCost;
      }
      pos.pnl += pnl;
      this.totalDeployed -= sharesToSell * pos.avgCost;

      this.logTrade(
        { ...({} as CrossPlatformEdge), id: tokenId, platform: 'polymarket', location: pos.location, targetDate: pos.targetDate, outcomeLabel: pos.outcomeLabel, direction: pos.direction, modelProbability: pos.modelProb, marketPrice: pos.currentPrice, edge: pos.edge } as CrossPlatformEdge,
        'SOLD', orderId, proceeds,
      );

      return {
        edge: { location: pos.location, targetDate: pos.targetDate, outcomeLabel: pos.outcomeLabel, direction: pos.direction, modelProbability: pos.modelProb, marketPrice: pos.currentPrice, edge: pos.edge } as CrossPlatformEdge,
        orderType: 'LIMIT', tokenId, side: Side.SELL,
        price: sellPrice, size: sharesToSell, costUsdc: proceeds,
        orderId, status: 'PLACED', timestamp: Date.now(),
      };
    } catch (e) {
      console.error(`[EXECUTOR] Sell failed: ${(e as Error).message}`);
      return null;
    }
  }

  // Monitor all open positions — sell if edge flips negative or model changes mind
  async monitorPositions(currentEdges: CrossPlatformEdge[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const edgeMap = new Map<string, CrossPlatformEdge>();
    for (const e of currentEdges) {
      edgeMap.set(e.tokenId, e);
    }

    for (const [tokenId, pos] of this.positions) {
      if (pos.status !== 'OPEN') continue;

      // Update current price from edges if available
      const currentEdge = edgeMap.get(tokenId);
      if (currentEdge) {
        pos.currentPrice = currentEdge.marketPrice;
        pos.modelProb = currentEdge.modelProbability;
        pos.edge = currentEdge.edge;
      }

      // Check live orderbook price
      try {
        const book = await this.client!.getOrderBook(tokenId);
        const bids = book.bids || [];
        const asks = book.asks || [];
        if (bids.length > 0 && asks.length > 0) {
          pos.currentPrice = (parseFloat(bids[0].price) + parseFloat(asks[0].price)) / 2;
        }
      } catch { /* non-critical */ }

      // Decision logic: should we sell?
      const unrealizedPnl = (pos.currentPrice - pos.avgCost) * pos.shares;
      const unrealizedPct = (pos.currentPrice - pos.avgCost) / pos.avgCost;

      // Sell if: edge flipped negative (model now disagrees)
      if (currentEdge && currentEdge.edge < -0.03) {
        const result = await this.sellPosition(tokenId, `Edge flipped negative: ${(currentEdge.edge * 100).toFixed(1)}c`);
        if (result) results.push(result);
        continue;
      }

      // Sell if: profitable and close to resolution (lock in gains)
      const hoursLeft = currentEdge?.hoursUntilResolution ?? ((new Date(pos.targetDate + 'T23:59:59Z').getTime() - Date.now()) / 3600000);
      if (hoursLeft < 2 && unrealizedPct > 0.15) {
        const result = await this.sellPosition(tokenId, `Lock profit: +${(unrealizedPct * 100).toFixed(0)}% with ${hoursLeft.toFixed(1)}h left`);
        if (result) results.push(result);
        continue;
      }

      // Sell if: losing badly and model confidence dropped
      if (unrealizedPct < -0.5 && pos.modelProb < pos.avgCost) {
        const result = await this.sellPosition(tokenId, `Stop loss: model prob ${(pos.modelProb * 100).toFixed(0)}% < cost basis ${(pos.avgCost * 100).toFixed(0)}%`);
        if (result) results.push(result);
        continue;
      }

      await new Promise(r => setTimeout(r, 300)); // rate limit
    }

    return results;
  }

  // Check order fills — update positions for confirmed fills, cancel stale orders
  async checkFills(): Promise<{ filled: number; cancelled: number }> {
    if (!this.client) return { filled: 0, cancelled: 0 };

    let filled = 0;
    let cancelled = 0;

    try {
      const openOrders = await this.getOpenOrders();
      const now = Date.now();

      for (const order of openOrders) {
        const orderAge = now - new Date(order.created_at || 0).getTime();

        // Cancel orders older than 30 minutes that haven't filled
        if (orderAge > 30 * 60 * 1000) {
          try {
            await this.client.cancelOrder({ orderID: order.id });
            cancelled++;
            console.log(`[EXECUTOR] Cancelled stale order ${order.id} (${(orderAge / 60000).toFixed(0)}m old)`);
          } catch { /* non-critical */ }
        }
      }

      // Check recent trades for fills on our positions
      const trades = await this.getRecentTrades();
      for (const trade of trades) {
        const pos = this.positions.get(trade.asset_id);
        if (pos && pos.status === 'OPEN') {
          // Trade confirms our position is live
          filled++;
        }
      }
    } catch (e) {
      console.error(`[EXECUTOR] Fill check failed: ${(e as Error).message}`);
    }

    return { filled, cancelled };
  }

  // Get all tracked positions
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  // Get open positions only
  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
  }

  // Get realized P&L across all closed positions
  getRealizedPnl(): number {
    return Array.from(this.positions.values())
      .filter(p => p.status !== 'OPEN')
      .reduce((sum, p) => sum + p.pnl, 0);
  }
}

export { PolymarketExecutor };
export default PolymarketExecutor;
