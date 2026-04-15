// Sneakers Weather Trading Engine
// Continuous background engine that scans markets, finds edges, executes trades,
// and broadcasts state to the dashboard via callbacks.

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import NOAAWeatherService, { WEATHER_LOCATIONS, TemperatureForecast } from './noaa-weather-service.js';
import XweatherService from './xweather-service.js';
import WeatherEnsemble from './weather-ensemble.js';
import PolymarketWeatherScanner, { PolymarketWeatherMarket } from './polymarket-weather-scanner.js';
import CrossPlatformEdgeFinder, { CrossPlatformEdge, ArbitrageOpportunity } from './cross-platform-edge-finder.js';
import PolymarketExecutor, { ExecutionResult } from './polymarket-executor.js';
import EmailNotifier from './email-notifier.js';
import ResolutionEdgeService, { ResolutionEdge } from './resolution-edge-service.js';
import BucketArbitrageService, { BucketArbitrageOpportunity } from './bucket-arbitrage-service.js';
import { insertEdgeHistoryBatch, insertPriceTickBatch } from '../db.js';

export interface EngineState {
  status: 'IDLE' | 'SCANNING' | 'FORECASTING' | 'FINDING_EDGES' | 'EXECUTING' | 'ERROR';
  lastScan: number;
  scanCount: number;
  markets: PolymarketWeatherMarket[];
  edges: CrossPlatformEdge[];
  arbitrage: ArbitrageOpportunity[];
  resolutionEdges: ResolutionEdge[];
  bucketArbitrage: BucketArbitrageOpportunity[];
  trades: TradeRecord[];
  balance: number;
  deployed: number;
  bankrollRemaining: number;
  tradesExecuted: number;
  totalPnl: number;
  forecasts: Map<string, { location: string; date: string; highF: number; spreadF: number }>;
  errors: string[];
}

export interface TradeRecord {
  timestamp: number;
  status: string;
  direction: string;
  outcome: string;
  location: string;
  targetDate: string;
  modelProb: number;
  marketPrice: number;
  edge: number;
  price: number;
  shares: number;
  costUsdc: number;
  orderId: string;
  error?: string;
}

export interface EngineConfig {
  bankroll: number;
  maxPositionUsdc: number;
  minEdge: number;
  scanIntervalMs: number;
  autoExecute: boolean;
}

const DEFAULT_CONFIG: EngineConfig = {
  bankroll: parseFloat(process.env.WEATHER_BANKROLL || '250'),
  maxPositionUsdc: 40,
  minEdge: 0.08,
  scanIntervalMs: 60_000,
  autoExecute: process.env.WEATHER_AUTO_EXECUTE === 'true',
};

type StateCallback = (state: EngineState) => void;

class SneakersEngine {
  private config: EngineConfig;
  private noaa: NOAAWeatherService;
  private xweather: XweatherService;
  private ensemble: WeatherEnsemble;
  private scanner: PolymarketWeatherScanner;
  private edgeFinder: CrossPlatformEdgeFinder;
  private executor: PolymarketExecutor;
  private notifier: EmailNotifier;
  private resolutionEdge: ResolutionEdgeService;
  private bucketArb: BucketArbitrageService;

  private state: EngineState;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: StateCallback[] = [];
  private forecastCache: Map<string, { forecast: TemperatureForecast; fetchedAt: number }> = new Map();

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.noaa = new NOAAWeatherService();
    this.xweather = new XweatherService();
    this.ensemble = new WeatherEnsemble();
    this.scanner = new PolymarketWeatherScanner();
    this.edgeFinder = new CrossPlatformEdgeFinder({
      bankroll: this.config.bankroll,
      minEdge: this.config.minEdge,
      maxPositionSize: this.config.maxPositionUsdc,
    });
    this.executor = new PolymarketExecutor({
      bankroll: this.config.bankroll,
      maxPositionUsdc: this.config.maxPositionUsdc,
      minEdge: this.config.minEdge,
      minConfidence: 'LOW',
      dryRun: !this.config.autoExecute,
    });
    this.notifier = new EmailNotifier();
    this.notifier.initialize();
    this.resolutionEdge = new ResolutionEdgeService();
    this.bucketArb = new BucketArbitrageService();

    this.state = {
      status: 'IDLE',
      lastScan: 0,
      scanCount: 0,
      markets: [],
      edges: [],
      arbitrage: [],
      resolutionEdges: [],
      bucketArbitrage: [],
      trades: [],
      balance: 0,
      deployed: 0,
      bankrollRemaining: this.config.bankroll,
      tradesExecuted: 0,
      totalPnl: 0,
      forecasts: new Map(),
      errors: [],
    };
  }

  // Subscribe to state updates
  onStateChange(cb: StateCallback): void {
    this.listeners.push(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) {
      try { cb(this.state); } catch {}
    }
  }

  getState(): EngineState {
    return this.state;
  }

  // Start the continuous scanning loop
  async start(): Promise<void> {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║         SNEAKERS WEATHER ENGINE — STARTING           ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(`  Bankroll: $${this.config.bankroll} | Max/trade: $${this.config.maxPositionUsdc} | Min edge: ${(this.config.minEdge * 100).toFixed(0)}c`);
    console.log(`  Auto-execute: ${this.config.autoExecute ? 'ON' : 'OFF'} | Scan interval: ${this.config.scanIntervalMs / 1000}s`);
    console.log('');

    // Initialize executor
    const ok = await this.executor.initialize();
    if (ok) {
      this.state.balance = await this.executor.getBalance();
      console.log(`  Polymarket balance: $${this.state.balance.toFixed(2)}`);
    } else {
      console.log('  [WARN] Executor init failed — running in observation mode');
    }

    // Initial scan
    await this.scan();

    // Continuous loop
    this.intervalId = setInterval(() => this.scan(), this.config.scanIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.state.status = 'IDLE';
    this.emit();
    console.log('[ENGINE] Stopped');
  }

  private async scan(): Promise<void> {
    this.state.scanCount++;
    const scanStart = Date.now();

    try {
      // Step 1: Scan markets
      this.state.status = 'SCANNING';
      this.emit();

      const markets = await this.scanner.scanWeatherMarkets();
      this.state.markets = markets;
      console.log(`\n── Scan #${this.state.scanCount} ── ${markets.length} markets found`);

      if (markets.length === 0) {
        this.state.status = 'IDLE';
        this.state.lastScan = Date.now();
        this.emit();
        return;
      }

      // Step 2: Build forecasts
      this.state.status = 'FORECASTING';
      this.emit();

      const forecastMap = new Map<string, TemperatureForecast>();
      const seen = new Set<string>();

      for (const m of markets) {
        const key = `${m.location}:${m.targetDate}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Check cache (5 min TTL)
        const cached = this.forecastCache.get(key);
        if (cached && Date.now() - cached.fetchedAt < 300_000) {
          forecastMap.set(key, cached.forecast);
          continue;
        }

        const loc = WEATHER_LOCATIONS.find(l => l.name === m.location);
        if (!loc) continue;

        try {
          const [noaaF, xwF] = await Promise.all([
            this.noaa.fetchBestForecast(loc, m.targetDate),
            this.xweather.fetchForecast(loc, m.targetDate),
          ]);
          const { forecast } = await this.ensemble.buildConditionsAwareForecast(noaaF, xwF, loc, m.targetDate);
          if (forecast) {
            forecastMap.set(key, forecast);
            this.forecastCache.set(key, { forecast, fetchedAt: Date.now() });
            this.state.forecasts.set(key, {
              location: m.location,
              date: m.targetDate,
              highF: forecast.pointForecastHighF,
              spreadF: forecast.modelSpreadF,
            });
          }
        } catch {}

        await new Promise(r => setTimeout(r, 200));
      }

      console.log(`  Forecasts: ${forecastMap.size} locations`);

      // Step 3: Find edges
      this.state.status = 'FINDING_EDGES';
      this.emit();

      const { edges, arbitrage, summary } = this.edgeFinder.findAllEdges(forecastMap, [], markets);
      const validEdges = edges.filter(e => e.platform === 'polymarket' && e.tokenId);

      this.state.edges = validEdges;
      this.state.arbitrage = arbitrage;

      console.log(`  Edges: ${validEdges.length} | E[Profit]: $${summary.totalExpectedProfit.toFixed(2)}`);

      // Step 3b: Resolution edge detection — check actual station temps vs market prices
      try {
        const resEdges = await this.resolutionEdge.findResolutionEdges(markets);
        this.state.resolutionEdges = resEdges;
        if (resEdges.length > 0) {
          const guaranteed = resEdges.filter(e => e.signal === 'GUARANTEED_YES').length;
          const dead = resEdges.filter(e => e.signal === 'DEAD').length;
          console.log(`  Resolution edges: ${resEdges.length} (${guaranteed} guaranteed, ${dead} dead)`);
        }
      } catch (e) {
        console.error(`  [RESOLUTION] Error: ${(e as Error).message}`);
      }

      // Step 3c: Bucket arbitrage — check if bucket probabilities sum to 100%
      const bucketArbs = this.bucketArb.findArbitrageOpportunities(markets);
      this.state.bucketArbitrage = bucketArbs;

      // Log price ticks to DB
      this.logPriceTicks(markets, edges);

      // Step 4: Execute trades (if auto-execute is on)
      if (this.config.autoExecute && validEdges.length > 0) {
        this.state.status = 'EXECUTING';
        this.emit();

        const results = await this.executor.executeEdges(validEdges.slice(0, 8));
        // Only record actual trades, not skipped
        const realTrades = results.filter(r => r.status !== 'SKIPPED');
        if (realTrades.length > 0) {
          this.recordTrades(realTrades);
        }

        // Auto-switch to dry-run once bankroll is exhausted
        const stats = this.executor.getStats();
        if (stats.bankrollRemaining < 5 && !(this.executor as any).config.dryRun) {
          (this.executor as any).config.dryRun = true;
          console.log('[ENGINE] Bankroll exhausted — switching to paper trading mode');
        }
      }

      // Step 5: Monitor existing positions — sell if edge flips or stop-loss triggers
      const allEdges = edges.filter(e => e.platform === 'polymarket');
      try {
        const sellResults = await this.executor.monitorPositions(allEdges);
        if (sellResults.length > 0) {
          this.recordTrades(sellResults);
          console.log(`  [MONITOR] ${sellResults.length} position(s) sold`);
        }
      } catch {}

      // Step 6: Check fills and cancel stale orders
      try {
        const { filled, cancelled } = await this.executor.checkFills();
        if (filled > 0 || cancelled > 0) {
          console.log(`  [FILLS] ${filled} confirmed, ${cancelled} stale cancelled`);
        }
      } catch {}

      // Sync balance and compute deployed from executor stats
      try {
        this.state.balance = await this.executor.getBalance();
        const stats = this.executor.getStats();
        this.state.deployed = stats.totalDeployed;
        this.state.bankrollRemaining = stats.bankrollRemaining;
        this.state.tradesExecuted = this.state.trades.filter(t => t.status === 'PLACED' || t.status === 'FILLED').length;

        // Check for low balance and alert
        await this.notifier.sendLowBalanceAlert(this.state.balance, stats.totalDeployed, this.config.bankroll);
      } catch {}

      this.state.status = 'IDLE';
      this.state.lastScan = Date.now();
      this.state.errors = this.state.errors.slice(-10); // keep last 10

      const elapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
      console.log(`  Done in ${elapsed}s | Balance: $${this.state.balance.toFixed(2)} | Deployed: $${this.state.deployed.toFixed(2)}`);

      this.emit();

    } catch (e) {
      const err = (e as Error).message;
      this.state.status = 'ERROR';
      this.state.errors.push(`${new Date().toISOString()}: ${err}`);
      this.emit();
      console.error(`[ENGINE ERROR] ${err}`);
    }
  }

  private recordTrades(results: ExecutionResult[]): void {
    for (const r of results) {
      this.state.trades.push({
        timestamp: r.timestamp,
        status: r.status,
        direction: r.edge.direction,
        outcome: r.edge.outcomeLabel,
        location: r.edge.location,
        targetDate: r.edge.targetDate,
        modelProb: r.edge.modelProbability,
        marketPrice: r.edge.marketPrice,
        edge: r.edge.edge,
        price: r.price,
        shares: r.size,
        costUsdc: r.costUsdc,
        orderId: r.orderId,
        error: r.error,
      });
    }
    // Keep last 200 trades in memory
    if (this.state.trades.length > 200) {
      this.state.trades = this.state.trades.slice(-200);
    }
  }

  private logPriceTicks(markets: PolymarketWeatherMarket[], edges: CrossPlatformEdge[]): void {
    const now = Date.now();
    const edgeMap = new Map<string, CrossPlatformEdge>();
    for (const e of edges) {
      edgeMap.set(`${e.location}:${e.targetDate}:${e.outcomeLabel}`, e);
    }

    const ticks: any[] = [];
    for (const market of markets) {
      const endTime = market.endDate.getTime();
      const hoursToExpiry = Math.max(0, (endTime - now) / (1000 * 60 * 60));

      for (const outcome of market.outcomes) {
        if (outcome.yesPrice <= 0) continue;
        const key = `${market.location}:${market.targetDate}:${outcome.label}`;
        const edge = edgeMap.get(key);

        ticks.push({
          location: market.location,
          target_date: market.targetDate,
          outcome_label: outcome.label,
          temperature_c: outcome.temperatureC,
          yes_price: outcome.yesPrice,
          forecast_prob: edge?.modelProbability ?? null,
          edge: edge?.edge ?? null,
          hours_to_expiry: hoursToExpiry,
          condition_id: outcome.conditionId,
          observed_at: now,
        });
      }
    }

    if (ticks.length > 0) {
      try { insertPriceTickBatch(ticks); } catch {}
    }
  }

  // Manual trade trigger from dashboard
  async executeBestEdges(count: number = 5): Promise<ExecutionResult[]> {
    const validEdges = this.state.edges.filter(e => e.platform === 'polymarket' && e.tokenId);
    if (validEdges.length === 0) return [];

    const results = await this.executor.executeEdges(validEdges.slice(0, count));
    this.recordTrades(results);

    const stats = this.executor.getStats();
    this.state.deployed = stats.totalDeployed;
    this.state.bankrollRemaining = stats.bankrollRemaining;
    this.state.tradesExecuted = stats.tradesExecuted;

    try { this.state.balance = await this.executor.getBalance(); } catch {}

    this.emit();
    return results;
  }

  // Toggle auto-execution
  setAutoExecute(enabled: boolean): void {
    this.config.autoExecute = enabled;
    (this.executor as any).config.dryRun = !enabled;
    console.log(`[ENGINE] Auto-execute: ${enabled ? 'ON' : 'OFF'}`);
  }
}

export { SneakersEngine };
export default SneakersEngine;
