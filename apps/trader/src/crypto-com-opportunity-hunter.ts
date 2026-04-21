// Crypto.com Opportunity Hunter - Find prediction markets at 97%+ in their last minutes and auto-execute
// Mirrors opportunity-hunter.ts but targets Crypto.com prediction markets

import fetch from 'node-fetch';
import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

interface HammerOpportunity {
  platform: string;
  asset: string;
  strike: string;
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
  market_id: string;
  contract_id?: string;
}

interface ExecutedTrade {
  timestamp: string;
  market_id: string;
  asset: string;
  strike: string;
  side: 'YES' | 'NO';
  probability: number;
  position_size: number;
  estimated_return: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

interface MarketOutcome {
  market_id: string;
  platform: string;
  predicted_probability: number;
  predicted_side: 'YES' | 'NO';
  actual_outcome?: 'YES' | 'NO';
  result?: 'WIN' | 'LOSS';
  expiry_time: number;
  checked_time?: number;
  asset: string;
  strike: string;
}

class CryptoComOpportunityHunter {
  private eventDurationsUrl =
    'https://web.crypto.com/api/proxy/private/knock-out/predictions/api/v1/event-durations';
  private contractsUrl =
    'https://web.crypto.com/api/proxy/public/knock-out/predictions/public/api/v2/contracts';

  private opportunities: HammerOpportunity[] = [];
  private executedMarkets: Set<string> = new Set();
  private tradeLog: ExecutedTrade[] = [];
  private marketOutcomes: MarketOutcome[] = [];
  private initialBalance: number = 500; // Starting capital
  private logPath: string;
  private outcomesPath: string;
  private autoExecute: boolean;
  private scanCount: number = 0;
  private totalOpportunitiesFound: number = 0;

  // Supported assets on Crypto.com Predict
  private assets = ['BTC', 'ETH', 'LTC', 'BCH', 'DOGE', 'AVAX', 'LINK', 'DOT', 'SHIB'];

  constructor(autoExecute: boolean = false) {
    this.autoExecute = autoExecute;
    this.logPath = path.join(__dirname, '../logs', `crypto-com-trades-${new Date().toISOString().split('T')[0]}.json`);
    this.outcomesPath = path.join(__dirname, '../logs', 'crypto-com-market-outcomes.json');
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
    } catch {
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
    } catch {
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
    if (this.marketOutcomes.some((o) => o.market_id === opp.market_id)) return;

    const outcome: MarketOutcome = {
      market_id: opp.market_id,
      platform: 'Crypto.com',
      predicted_probability: opp.probability,
      predicted_side: opp.side,
      expiry_time: Date.now() + opp.seconds_until_expiry * 1000,
      asset: opp.asset,
      strike: opp.strike,
    };
    this.marketOutcomes.push(outcome);
    this.saveMarketOutcomes();
  }

  // Also write to the shared outcomes file used by the Limitless hunter
  private writeToSharedOutcomes(opp: HammerOpportunity): void {
    const sharedPath = path.join(__dirname, '../logs', 'market-outcomes.json');
    try {
      let shared: MarketOutcome[] = [];
      if (fs.existsSync(sharedPath)) {
        shared = JSON.parse(fs.readFileSync(sharedPath, 'utf-8'));
      }
      if (shared.some((o) => o.market_id === opp.market_id)) return;

      shared.push({
        market_id: opp.market_id,
        platform: 'Crypto.com',
        predicted_probability: opp.probability,
        predicted_side: opp.side,
        expiry_time: Date.now() + opp.seconds_until_expiry * 1000,
        asset: opp.asset,
        strike: opp.strike,
      });
      fs.writeFileSync(sharedPath, JSON.stringify(shared, null, 2));
    } catch {
      // Shared file write is best-effort
    }
  }

  private async fetchEventIds(): Promise<string[]> {
    const allEventIds: string[] = [];

    for (const asset of this.assets) {
      try {
        const response = await fetch(
          `${this.eventDurationsUrl}?event_kind=${asset}`,
          { headers: { 'Content-Type': 'application/json' } }
        );

        if (response.ok) {
          const data = (await response.json()) as any;
          if (data.data && Array.isArray(data.data)) {
            data.data.forEach((event: any) => {
              if (event.event_id) allEventIds.push(event.event_id);
            });
          }
        }
      } catch {
        // Continue to next asset
      }
    }

    return allEventIds;
  }

  async huntOpportunities(): Promise<HammerOpportunity[]> {
    this.scanCount++;
    try {
      // Step 1: Get all active event IDs
      const eventIds = await this.fetchEventIds();
      if (eventIds.length === 0) return [];

      // Step 2: Fetch contracts for all events
      const contractParams = `?event_id=${eventIds.join(',')}`;
      const response = await fetch(`${this.contractsUrl}${contractParams}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const opportunities = this.parseOpportunities(data);

      // Track all opportunities for outcome analysis
      opportunities.forEach((opp) => {
        this.trackOpportunity(opp);
        this.writeToSharedOutcomes(opp);
      });

      this.totalOpportunitiesFound += opportunities.length;
      return opportunities;
    } catch (e) {
      return [];
    }
  }

  private parseOpportunities(data: any): HammerOpportunity[] {
    const opportunities: HammerOpportunity[] = [];
    const contracts = data.data || data.contracts || data || [];
    const items = Array.isArray(contracts) ? contracts : [];

    items.forEach((contract: any) => {
      try {
        const title = contract.label || contract.title || contract.name || '';
        const assetMatch = title.match(/BTC|ETH|LTC|BCH|DOGE|AVAX|LINK|DOT|SHIB|XLM|HBAR/);
        const asset = assetMatch ? assetMatch[0] : 'UNKNOWN';

        // Parse strike price
        const strikeMatch = title.match(/>\s*\$?([\d,]+(?:\.\d{2})?)/);
        const strike = strikeMatch ? strikeMatch[1].replace(/,/g, '') : 'unknown';

        // Parse expiry
        const expiryTime = contract.settlement_time || contract.expiry_time || contract.end_time;
        if (!expiryTime) return;

        const expiryDate = new Date(expiryTime);
        const now = new Date();
        const secondsLeft = (expiryDate.getTime() - now.getTime()) / 1000;
        const minutesLeft = secondsLeft / 60;

        // Only markets expiring within 10 minutes (matching Limitless hunter window)
        if (minutesLeft > 10 || minutesLeft <= 0) return;

        // Parse probabilities
        let yesProb = contract.yes_price || contract.yes_probability || 0;
        let noProb = contract.no_price || contract.no_probability || 0;
        if (yesProb > 1) yesProb = yesProb / 100;
        if (noProb > 1) noProb = noProb / 100;

        // Determine urgency
        let urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' = 'NORMAL';
        if (minutesLeft < 2) urgency = 'CRITICAL';
        else if (minutesLeft < 5) urgency = 'HIGH';

        // Generate a unique market ID from contract data
        const marketId = contract.id?.toString() ||
          contract.contract_id?.toString() ||
          `cdc-${asset}-${strike}-${Math.floor(expiryDate.getTime() / 1000)}`;

        // Find 97%+ opportunities
        if (yesProb >= 0.97) {
          opportunities.push({
            platform: 'Crypto.com',
            asset,
            strike,
            condition: title.substring(0, 60),
            side: 'YES',
            probability: yesProb,
            odds: `${(yesProb * 100).toFixed(1)}%`,
            confidence: yesProb >= 0.99 ? 'LOCK' : yesProb >= 0.98 ? 'HAMMER' : 'GOOD',
            minutes_until_expiry: minutesLeft,
            seconds_until_expiry: secondsLeft,
            urgency,
            position_size: 500,
            estimated_return: yesProb >= 0.99 ? 495 : yesProb >= 0.98 ? 490 : 485,
            market_id: marketId,
            contract_id: contract.id?.toString(),
          });
        }

        if (noProb >= 0.97) {
          opportunities.push({
            platform: 'Crypto.com',
            asset,
            strike,
            condition: title.substring(0, 60),
            side: 'NO',
            probability: noProb,
            odds: `${(noProb * 100).toFixed(1)}%`,
            confidence: noProb >= 0.99 ? 'LOCK' : noProb >= 0.98 ? 'HAMMER' : 'GOOD',
            minutes_until_expiry: minutesLeft,
            seconds_until_expiry: secondsLeft,
            urgency,
            position_size: 500,
            estimated_return: noProb >= 0.99 ? 495 : noProb >= 0.98 ? 490 : 485,
            market_id: marketId,
            contract_id: contract.id?.toString(),
          });
        }
      } catch {
        // Skip malformed entries
      }
    });

    return opportunities.sort((a, b) => a.seconds_until_expiry - b.seconds_until_expiry);
  }

  async executeAndDisplay(opportunities: HammerOpportunity[]): Promise<void> {
    // Auto-execute CRITICAL opportunities (when enabled and API is available)
    if (this.autoExecute) {
      const critical = opportunities.filter((o) => o.urgency === 'CRITICAL');
      for (const opp of critical) {
        if (!this.executedMarkets.has(opp.market_id)) {
          await this.executeOpportunity(opp);
        }
      }
    }

    this.displayOpportunities(opportunities);
  }

  private async executeOpportunity(opp: HammerOpportunity): Promise<void> {
    if (this.executedMarkets.has(opp.market_id)) return;

    // NOTE: Crypto.com Predict does not have a public order placement API.
    // Trades must be placed manually through the web UI at https://crypto.com/predict
    // This logs the opportunity for manual execution.
    const trade: ExecutedTrade = {
      timestamp: new Date().toISOString(),
      market_id: opp.market_id,
      asset: opp.asset,
      strike: opp.strike,
      side: opp.side,
      probability: opp.probability,
      position_size: opp.position_size,
      estimated_return: opp.estimated_return,
      status: 'SUCCESS', // Logged for manual execution
    };

    this.tradeLog.push(trade);
    this.executedMarkets.add(opp.market_id);
    this.saveTradeLog();

    console.log(`\n  LOGGED: ${opp.asset} >$${opp.strike} ${opp.side} @ ${opp.odds} — EXECUTE MANUALLY at crypto.com/predict`);
  }

  displayOpportunities(opportunities: HammerOpportunity[]): void {
    const critical = opportunities.filter((o) => o.urgency === 'CRITICAL');
    const high = opportunities.filter((o) => o.urgency === 'HIGH');
    const normal = opportunities.filter((o) => o.urgency === 'NORMAL');

    console.clear();
    console.log(`\n🎯 CRYPTO.COM OPPORTUNITY HUNTER - ${new Date().toLocaleTimeString()} (scan #${this.scanCount})\n`);
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');

    if (opportunities.length === 0) {
      console.log('  No opportunities at 97%+ in last 10 minutes right now\n');
      console.log('  Scanning assets:', this.assets.join(', '));
      console.log('  Waiting for markets to close in and hit extreme probabilities...\n');
      this.displayDailyStats();
      return;
    }

    // CRITICAL - HAMMER THESE NOW
    if (critical.length > 0) {
      console.log('  CRITICAL - HAMMER THESE NOW (<2 min):\n');
      critical.forEach((opp) => {
        const badge = opp.confidence === 'LOCK' ? 'LOCK' : opp.confidence === 'HAMMER' ? 'HAMMER' : 'GOOD';
        const executed = this.executedMarkets.has(opp.market_id) ? ' [LOGGED]' : '';
        console.log(`   [${badge}] ${opp.asset} >$${opp.strike} ${opp.odds} ${opp.side}${executed}`);
        console.log(`      Closes in ${Math.floor(opp.seconds_until_expiry)}s | $${opp.estimated_return} profit`);
        console.log(`      GO TO: https://crypto.com/predict\n`);
      });
    }

    // HIGH - PREPARE
    if (high.length > 0) {
      console.log(`  HIGH PRIORITY (2-5 min): ${high.length} markets\n`);
      high.forEach((opp) => {
        const badge = opp.confidence === 'LOCK' ? 'LOCK' : opp.confidence === 'HAMMER' ? 'HAMMER' : 'GOOD';
        console.log(`   [${badge}] ${opp.asset} >$${opp.strike} ${opp.odds} ${opp.side} | ${Math.floor(opp.minutes_until_expiry)}m left\n`);
      });
    }

    // NORMAL
    if (normal.length > 0) {
      console.log(`  NORMAL (5-10 min): ${normal.length} markets - monitoring\n`);
      normal.forEach((opp) => {
        console.log(`   ${opp.asset} >$${opp.strike} ${opp.odds} ${opp.side} | ${Math.floor(opp.minutes_until_expiry)}m left`);
      });
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');
    console.log(`  SUMMARY`);
    console.log(`   Total opportunities: ${opportunities.length}`);
    console.log(`   LOCKS (99%+): ${opportunities.filter((o) => o.confidence === 'LOCK').length}`);
    console.log(`   HAMMERS (98-99%): ${opportunities.filter((o) => o.confidence === 'HAMMER').length}`);
    console.log(`   GOOD (97-98%): ${opportunities.filter((o) => o.confidence === 'GOOD').length}`);
    console.log(`   Total capital opportunity: $${opportunities.length * 500}`);
    console.log(`   Max potential profit: $${opportunities.reduce((sum, o) => sum + o.estimated_return, 0)}\n`);

    if (critical.length > 0) {
      console.log('  >>> CRITICAL MARKETS DETECTED - GO TO crypto.com/predict NOW! <<<\n');
    }

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

    // Outcome stats
    const resolved = this.marketOutcomes.filter((o) => o.result !== undefined);
    const wins = resolved.filter((o) => o.result === 'WIN').length;
    const losses = resolved.filter((o) => o.result === 'LOSS').length;
    const winRate = resolved.length > 0 ? ((wins / resolved.length) * 100).toFixed(1) : 'N/A';

    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');
    console.log(`  TODAY'S PERFORMANCE (Crypto.com)`);
    console.log(`   Scans completed: ${this.scanCount}`);
    console.log(`   Total opportunities found: ${this.totalOpportunitiesFound}`);
    console.log(`   Trades logged: ${successfulTrades}/${successfulTrades + failedTrades}`);
    console.log(`   Capital deployed: $${totalCapitalDeployed}/$${this.initialBalance}`);
    console.log(`   Remaining capital: $${remainingBalance}`);
    console.log(`   Total profit potential: $${totalProfitPotential}`);
    console.log(`   Avg profit per trade: $${avgProfitPerTrade.toFixed(2)}`);
    console.log(`   Outcomes tracked: ${this.marketOutcomes.length} (${resolved.length} resolved)`);
    console.log(`   Win rate: ${winRate}% (${wins}W / ${losses}L)`);
    console.log(`   Target: 15+ trades/day | Current: ${successfulTrades} ${successfulTrades >= 15 ? 'ON TARGET' : 'building...'}\n`);
  }

  // Manual outcome logging (mirrors log-outcome.ts pattern)
  logOutcome(marketId: string, outcome: 'YES' | 'NO'): void {
    const market = this.marketOutcomes.find((o) => o.market_id === marketId);
    if (!market) {
      console.log(`Market ${marketId} not found in outcomes`);
      return;
    }

    market.actual_outcome = outcome;
    market.result = market.predicted_side === outcome ? 'WIN' : 'LOSS';
    market.checked_time = Date.now();
    this.saveMarketOutcomes();

    console.log(`Logged outcome for ${marketId}: ${outcome} -> ${market.result}`);
  }
}

// Main - Run continuously every 10 seconds
const autoExecute = process.env.CDC_AUTO_EXECUTE !== 'false';
const hunter = new CryptoComOpportunityHunter(autoExecute);

(async () => {
  console.log(`  Starting Crypto.com Opportunity Hunter - Looking for 97%+ markets in last 10 minutes...`);
  console.log(`${autoExecute ? '  AUTO-LOGGING ENABLED (manual execution at crypto.com/predict)' : '  OBSERVATION MODE'}\n`);

  // Run immediately
  let opportunities = await hunter.huntOpportunities();
  await hunter.executeAndDisplay(opportunities);

  // Then every 10 seconds
  setInterval(async () => {
    opportunities = await hunter.huntOpportunities();
    await hunter.executeAndDisplay(opportunities);
  }, 10000);
})();

export default CryptoComOpportunityHunter;
