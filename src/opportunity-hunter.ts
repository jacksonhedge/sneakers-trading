// Opportunity Hunter - Find markets at 97%+ in their last few minutes and auto-execute

import fetch from 'node-fetch';
import { config as dotenvConfig } from 'dotenv';
import LimitlessExecutor from './limitless-executor.js';
import MarketDataLogger from './market-data-logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

interface HammerOpportunity {
  platform: string;
  asset: string;
  strike?: string;
  condition: string;
  side: 'YES' | 'NO';
  probability: number;
  odds: string;
  confidence: 'LOCK' | 'HAMMER' | 'GOOD';
  minutes_until_expiry: number;
  seconds_until_expiry: number;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL';
  position_size: number;
  estimated_return: number;
  market_id?: string;
}

interface ExecutedTrade {
  timestamp: string;
  market_id: string;
  asset: string;
  side: 'YES' | 'NO';
  probability: number;
  position_size: number;
  estimated_return: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

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

class OpportunityHunter {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;
  private opportunities: HammerOpportunity[] = [];
  private executor: LimitlessExecutor;
  private executedMarkets: Set<string> = new Set();
  private tradeLog: ExecutedTrade[] = [];
  private marketOutcomes: MarketOutcome[] = [];
  private initialBalance: number = 500; // Starting capital - TEST RUN
  private logPath: string;
  private outcomesPath: string;
  private autoExecute: boolean = true; // Enable auto-execution of CRITICAL opportunities

  constructor(autoExecute: boolean = true) {
    this.executor = new LimitlessExecutor();
    this.autoExecute = autoExecute;
    this.logPath = path.join(__dirname, '../logs', `trades-${new Date().toISOString().split('T')[0]}.json`);
    this.outcomesPath = path.join(__dirname, '../logs', 'market-outcomes.json');
    this.ensureLogDir();
    this.loadTradeLog();
    this.loadMarketOutcomes();
  }

  private ensureLogDir(): void {
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private loadTradeLog(): void {
    try {
      if (fs.existsSync(this.logPath)) {
        const data = fs.readFileSync(this.logPath, 'utf-8');
        this.tradeLog = JSON.parse(data);
        this.tradeLog.forEach((trade) => {
          this.executedMarkets.add(trade.market_id);
        });
      }
    } catch (e) {
      this.tradeLog = [];
    }
  }

  private saveTradeLog(): void {
    try {
      fs.writeFileSync(this.logPath, JSON.stringify(this.tradeLog, null, 2));
    } catch (e) {
      console.error('Failed to save trade log:', (e as Error).message);
    }
  }

  private loadMarketOutcomes(): void {
    try {
      if (fs.existsSync(this.outcomesPath)) {
        const data = fs.readFileSync(this.outcomesPath, 'utf-8');
        this.marketOutcomes = JSON.parse(data);
      }
    } catch (e) {
      this.marketOutcomes = [];
    }
  }

  private saveMarketOutcomes(): void {
    try {
      fs.writeFileSync(this.outcomesPath, JSON.stringify(this.marketOutcomes, null, 2));
    } catch (e) {
      console.error('Failed to save market outcomes:', (e as Error).message);
    }
  }

  private trackOpportunity(opp: HammerOpportunity): void {
    // Don't track duplicates
    if (this.marketOutcomes.some((o) => o.market_id === opp.market_id)) return;

    const outcome: MarketOutcome = {
      market_id: opp.market_id || '',
      predicted_probability: opp.probability,
      predicted_side: opp.side,
      expiry_time: Date.now() + (opp.seconds_until_expiry * 1000),
      asset: opp.asset,
    };
    this.marketOutcomes.push(outcome);
    this.saveMarketOutcomes();
  }

  async checkResolvedMarkets(): Promise<void> {
    const now = Date.now();
    const unresolved = this.marketOutcomes.filter((o) => o.result === undefined);

    for (const outcome of unresolved) {
      // Only check markets that should have expired
      if (outcome.expiry_time > now) continue;

      try {
        // Try to find this market in active list - if it's not there, it expired
        const response = await fetch(`${this.limitlessUrl}/markets/active`, {
          headers: {
            'X-API-Key': this.limitlessKey,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) continue;

        const data = (await response.json()) as any;
        const markets = data.data || [];

        // If market is not in active list, it's resolved (but we can't determine outcome from API)
        const stillActive = markets.some((m: any) => m.id === parseInt(outcome.market_id));

        if (!stillActive) {
          // Market has expired - mark as checked but outcome TBD
          outcome.checked_time = now;
          this.saveMarketOutcomes();
        }
      } catch (e) {
        // Silently continue on API errors
      }
    }
  }

  async executeOpportunity(opp: HammerOpportunity): Promise<void> {
    if (!this.autoExecute) return;
    if (!opp.market_id) return;
    if (this.executedMarkets.has(opp.market_id)) return; // Already executed

    try {
      const result = await this.executor.executeGrassMarket(
        opp.market_id,
        opp.side,
        opp.probability,
        opp.position_size
      );

      const trade: ExecutedTrade = {
        timestamp: new Date().toISOString(),
        market_id: opp.market_id,
        asset: opp.asset,
        side: opp.side,
        probability: opp.probability,
        position_size: opp.position_size,
        estimated_return: opp.estimated_return,
        status: result.success ? 'SUCCESS' : 'FAILED',
        error: result.error,
      };

      this.tradeLog.push(trade);
      this.executedMarkets.add(opp.market_id);
      this.saveTradeLog();

      console.log(`\n✅ RECORDED: ${opp.asset} ${opp.side} @ ${opp.odds}`);
    } catch (e) {
      console.error(`Failed to execute ${opp.market_id}:`, (e as Error).message);
    }
  }

  async huntLimitlessOpportunities(): Promise<HammerOpportunity[]> {
    try {
      const response = await fetch(`${this.limitlessUrl}/markets/active`, {
        headers: {
          'X-API-Key': this.limitlessKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const markets = data.data || [];

      const opportunities: HammerOpportunity[] = [];

      markets.forEach((m: any) => {
        // Only crypto markets
        if (
          !m.tags ||
          !m.tags.some((tag: string) =>
            ['crypto', 'btc', 'eth', 'sol', 'xrp', 'doge', 'ada'].some((t) =>
              tag.toLowerCase().includes(t)
            )
          )
        )
          return;

        if (!Array.isArray(m.prices) || m.prices[0] >= 1 || m.prices[1] >= 1)
          return;

        // Parse expiry
        const expiryMatch = m.title.match(
          /(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/
        );
        if (!expiryMatch) return;

        const [, month, day, hour, min] = expiryMatch;
        const expiryDate = new Date(`2026-${month} ${day} ${hour}:${min}:00 UTC`);
        const now = new Date();
        const secondsLeft = (expiryDate.getTime() - now.getTime()) / 1000;
        const minutesLeft = secondsLeft / 60;

        // Only markets expiring within 10 minutes (the hunting window)
        if (minutesLeft > 10 || minutesLeft <= 0) return;

        const yesPrice = m.prices[0];
        const noPrice = m.prices[1];

        // Extract asset
        const titleLower = m.title.toLowerCase();
        let asset = 'CRYPTO';
        if (titleLower.includes('btc')) asset = 'BTC';
        else if (titleLower.includes('eth')) asset = 'ETH';
        else if (titleLower.includes('sol')) asset = 'SOL';

        // Determine urgency
        let urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' = 'NORMAL';
        if (minutesLeft < 2) urgency = 'CRITICAL';
        else if (minutesLeft < 5) urgency = 'HIGH';

        // Find 97%+ opportunities
        if (yesPrice >= 0.97) {
          opportunities.push({
            platform: 'Limitless',
            asset,
            condition: m.title.substring(0, 50),
            side: 'YES',
            probability: yesPrice,
            odds: `${(yesPrice * 100).toFixed(1)}%`,
            confidence:
              yesPrice >= 0.99 ? 'LOCK' : yesPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            minutes_until_expiry: minutesLeft,
            seconds_until_expiry: secondsLeft,
            urgency,
            position_size: 500,
            estimated_return:
              yesPrice >= 0.99 ? 495 : yesPrice >= 0.98 ? 490 : 485,
            market_id: m.id,
          });
        }

        if (noPrice >= 0.97) {
          opportunities.push({
            platform: 'Limitless',
            asset,
            condition: m.title.substring(0, 50),
            side: 'NO',
            probability: noPrice,
            odds: `${(noPrice * 100).toFixed(1)}%`,
            confidence:
              noPrice >= 0.99 ? 'LOCK' : noPrice >= 0.98 ? 'HAMMER' : 'GOOD',
            minutes_until_expiry: minutesLeft,
            seconds_until_expiry: secondsLeft,
            urgency,
            position_size: 500,
            estimated_return:
              noPrice >= 0.99 ? 495 : noPrice >= 0.98 ? 490 : 485,
            market_id: m.id,
          });
        }
      });

      // Track all opportunities for outcome analysis
      opportunities.forEach((opp) => this.trackOpportunity(opp));

      return opportunities.sort(
        (a, b) => a.seconds_until_expiry - b.seconds_until_expiry
      );
    } catch (e) {
      return [];
    }
  }

  async executeAndDisplay(opportunities: HammerOpportunity[]): Promise<void> {
    // Auto-execute CRITICAL opportunities
    if (this.autoExecute) {
      const critical = opportunities.filter((o) => o.urgency === 'CRITICAL');
      for (const opp of critical) {
        if (!this.executedMarkets.has(opp.market_id || '')) {
          await this.executeOpportunity(opp);
        }
      }
    }

    this.displayOpportunities(opportunities);
  }

  displayOpportunities(opportunities: HammerOpportunity[]): void {
    const critical = opportunities.filter((o) => o.urgency === 'CRITICAL');
    const high = opportunities.filter((o) => o.urgency === 'HIGH');
    const normal = opportunities.filter((o) => o.urgency === 'NORMAL');

    console.clear();
    console.log(`\n🎯 OPPORTUNITY HUNTER - ${new Date().toLocaleTimeString()}\n`);
    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );

    if (opportunities.length === 0) {
      console.log('⏳ No opportunities at 97%+ in last 10 minutes right now\n');
      console.log('💡 Waiting for markets to close in and hit extreme probabilities...\n');
      return;
    }

    // CRITICAL - HAMMER THESE NOW
    if (critical.length > 0) {
      console.log('🚨 CRITICAL - HAMMER THESE NOW (<2 min):\n');
      critical.forEach((opp) => {
        const badge =
          opp.confidence === 'LOCK'
            ? '🔒'
            : opp.confidence === 'HAMMER'
              ? '🔨'
              : '✅';
        console.log(`   ${badge} [${opp.platform}] ${opp.asset} ${opp.odds} ${opp.side}`);
        console.log(`      Closes in ${Math.floor(opp.seconds_until_expiry)}s | $${opp.estimated_return} profit`);
        console.log(
          `      EXECUTE: npx ts-node -e "import Executor from './limitless-executor'; const e = new Executor(); e.executeGrassMarket('${opp.market_id}', '${opp.side}', ${opp.probability}, 500)"\n`
        );
      });
    }

    // HIGH - PREPARE TO EXECUTE
    if (high.length > 0) {
      console.log(`⚠️  HIGH PRIORITY (2-5 min): ${high.length} markets\n`);
      high.forEach((opp) => {
        const badge =
          opp.confidence === 'LOCK'
            ? '🔒'
            : opp.confidence === 'HAMMER'
              ? '🔨'
              : '✅';
        console.log(`   ${badge} ${opp.asset} ${opp.odds} | ${Math.floor(opp.minutes_until_expiry)}m left\n`);
      });
    }

    // NORMAL - MONITOR
    if (normal.length > 0) {
      console.log(`📊 NORMAL (5-10 min): ${normal.length} markets - monitoring\n`);
    }

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📈 SUMMARY`);
    console.log(`   Total opportunities: ${opportunities.length}`);
    console.log(`   🔒 LOCKS (99%+): ${opportunities.filter((o) => o.confidence === 'LOCK').length}`);
    console.log(`   🔨 HAMMERS (98-99%): ${opportunities.filter((o) => o.confidence === 'HAMMER').length}`);
    console.log(`   ✅ GOOD (97-98%): ${opportunities.filter((o) => o.confidence === 'GOOD').length}`);
    console.log(`   Total capital opportunity: $${opportunities.length * 500}`);
    console.log(`   Max potential profit: $${opportunities.reduce((sum, o) => sum + o.estimated_return, 0)}\n`);

    if (critical.length > 0 && !this.autoExecute) {
      console.log('⏱️  ⏱️  ⏱️  CRITICAL MARKETS DETECTED - ACT NOW! ⏱️  ⏱️  ⏱️\n');
    }

    // Show daily stats
    this.displayDailyStats();
  }

  displayDailyStats(): void {
    const totalCapitalDeployed = this.tradeLog
      .filter((t) => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.position_size, 0);
    const totalProfitPotential = this.tradeLog
      .filter((t) => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.estimated_return, 0);
    const successfulTrades = this.tradeLog.filter((t) => t.status === 'SUCCESS').length;
    const failedTrades = this.tradeLog.filter((t) => t.status === 'FAILED').length;

    const remainingBalance = this.initialBalance - totalCapitalDeployed;
    const avgProfitPerTrade = successfulTrades > 0 ? totalProfitPotential / successfulTrades : 0;

    console.log(
      '═══════════════════════════════════════════════════════════════════════════════════════════════════════\n'
    );
    console.log(`📊 TODAY'S PERFORMANCE`);
    console.log(`   Trades executed: ${successfulTrades}/${successfulTrades + failedTrades}`);
    console.log(`   Capital deployed: $${totalCapitalDeployed}/$${this.initialBalance}`);
    console.log(`   Remaining capital: $${remainingBalance}`);
    console.log(`   Total profit potential: $${totalProfitPotential}`);
    console.log(`   Avg profit per trade: $${avgProfitPerTrade.toFixed(2)}`);
    console.log(
      `   Target: 15+ trades/day | Current: ${successfulTrades} ${successfulTrades >= 15 ? '✅' : '⏳'}\n`
    );
  }
}

// Main - Run continuously every 10 seconds
const autoExecute = process.env.AUTO_EXECUTE !== 'false';
const hunter = new OpportunityHunter(autoExecute);

(async () => {
  console.log(
    `🎯 Starting Opportunity Hunter - Looking for 97%+ markets in last 10 minutes...`
  );
  console.log(
    `${autoExecute ? '🚀 AUTO-EXECUTION ENABLED' : '👀 OBSERVATION MODE (no auto-execution)'}\n`
  );

  // Run immediately
  let opportunities = await hunter.huntLimitlessOpportunities();
  await hunter.executeAndDisplay(opportunities);

  // Then every 10 seconds
  setInterval(async () => {
    opportunities = await hunter.huntLimitlessOpportunities();
    await hunter.executeAndDisplay(opportunities);
  }, 10000); // Check every 10 seconds for faster response

  // Check for resolved markets every 30 seconds
  setInterval(async () => {
    await hunter.checkResolvedMarkets();
  }, 30000);
})();

export default OpportunityHunter;
