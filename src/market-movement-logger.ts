// Market Movement Logger
// Continuous background process: captures tick-by-tick price data from Kalshi and
// Polymarket weather markets, plus indicator signals, into SQLite for historical
// analysis and backtesting.

import { config as dotenvConfig } from 'dotenv';
import NOAAWeatherService, { WEATHER_LOCATIONS, TemperatureForecast, buildTemperatureDistribution } from './services/noaa-weather-service.js';
import PolymarketWeatherScanner from './services/polymarket-weather-scanner.js';
import KalshiWeatherScanner from './services/kalshi-weather-scanner.js';
import WeatherEnsemble from './services/weather-ensemble.js';
import CrossPlatformEdgeFinder from './services/cross-platform-edge-finder.js';
import FAAStatusService from './services/faa-status-service.js';
import ConvectionService from './services/convection-service.js';
import OceanBuoyService from './services/ocean-buoy-service.js';
import RadiosondeService from './services/radiosonde-service.js';
import {
  db, insertPriceTickBatch, insertKalshiTickBatch, insertCrossPlatformBatch,
  insertEdgeHistoryBatch, insertIndicatorBatch
} from './db.js';

dotenvConfig();

// ─── Configuration ──────────────────────────────────────────────────────────

const SCAN_INTERVAL      = 60_000;   // 1 min — market price ticks
const INDICATOR_INTERVAL = 300_000;  // 5 min — external indicator signals
const BANKROLL           = parseFloat(process.env.WEATHER_BANKROLL || '5000');

// ─── Class ───────────────────────────────────────────────────────────────────

class MarketMovementLogger {
  private noaa:             NOAAWeatherService;
  private polymarketScanner: PolymarketWeatherScanner;
  private kalshiScanner:    KalshiWeatherScanner;
  private weatherEnsemble:  WeatherEnsemble;
  private edgeFinder:       CrossPlatformEdgeFinder;
  private faaService:       FAAStatusService;
  private convectionService: ConvectionService;
  private buoyService:      OceanBuoyService;
  private radiosondeService: RadiosondeService;

  // Forecast cache: key = "location:date"
  private forecastCache: Map<string, { forecast: TemperatureForecast; fetchedAt: number }> = new Map();
  private readonly FORECAST_TTL = 300_000; // 5 min

  // Stats
  private cycleCount        = 0;
  private polyTicksTotal    = 0;
  private kalshiTicksTotal  = 0;
  private crossPlatformTotal = 0;
  private edgesTotal        = 0;
  private lastIndicatorRun  = 0;

  constructor() {
    this.noaa              = new NOAAWeatherService();
    this.polymarketScanner = new PolymarketWeatherScanner();
    this.kalshiScanner     = new KalshiWeatherScanner();
    this.weatherEnsemble   = new WeatherEnsemble();
    this.edgeFinder        = new CrossPlatformEdgeFinder({ bankroll: BANKROLL });
    this.faaService        = new FAAStatusService();
    this.convectionService = new ConvectionService();
    this.buoyService       = new OceanBuoyService();
    this.radiosondeService = new RadiosondeService();
  }

  // ─── Public entry point ───────────────────────────────────────────────────

  run(): void {
    this.printBanner();

    // Run immediately, then on interval
    this.cycle().catch(e => console.error('[CYCLE ERROR]', e.message));
    setInterval(() => {
      this.cycle().catch(e => console.error('[CYCLE ERROR]', e.message));
    }, SCAN_INTERVAL);

    console.log(`Scanning every ${SCAN_INTERVAL / 1000}s | Indicators every ${INDICATOR_INTERVAL / 1000}s | Bankroll: $${BANKROLL}\n`);
  }

  // ─── Main cycle ───────────────────────────────────────────────────────────

  private async cycle(): Promise<void> {
    this.cycleCount++;
    const cycleStart = Date.now();
    const now        = cycleStart;

    console.log(`\n── Cycle #${this.cycleCount} ${new Date(now).toISOString()} ─────────────────────`);

    // ── Step 1: Scan both platforms ─────────────────────────────────────────
    console.log('[1/7] Scanning Polymarket + Kalshi weather markets...');
    const [polymarkets, kalshiMarkets] = await Promise.all([
      this.polymarketScanner.scanWeatherMarkets().catch(e => {
        console.error('     Polymarket scan failed:', e.message);
        return [] as Awaited<ReturnType<typeof this.polymarketScanner.scanWeatherMarkets>>;
      }),
      this.kalshiScanner.scanWeatherMarkets().catch(e => {
        console.error('     Kalshi scan failed:', e.message);
        return [] as Awaited<ReturnType<typeof this.kalshiScanner.scanWeatherMarkets>>;
      }),
    ]);
    console.log(`     Polymarket: ${polymarkets.length} markets | Kalshi: ${kalshiMarkets.length} markets`);

    // ── Step 2: Build ensemble forecasts for unique location+date combos ────
    console.log('[2/7] Building ensemble forecasts...');
    const forecastMap = await this.buildForecastMap(polymarkets, kalshiMarkets);
    console.log(`     Forecasts ready: ${forecastMap.size}`);

    // ── Step 3: Log Polymarket price ticks ───────────────────────────────────
    console.log('[3/7] Logging Polymarket price ticks...');
    const polyTicks = this.buildPolyTicks(polymarkets, forecastMap, now);
    if (polyTicks.length > 0) {
      try { insertPriceTickBatch(polyTicks); } catch { /* non-critical */ }
    }
    this.polyTicksTotal += polyTicks.length;
    console.log(`     Logged ${polyTicks.length} Polymarket ticks`);

    // ── Step 4: Log Kalshi price ticks ───────────────────────────────────────
    console.log('[4/7] Logging Kalshi price ticks...');
    const kalshiTicks = this.buildKalshiTicks(kalshiMarkets, forecastMap, now);
    if (kalshiTicks.length > 0) {
      try { insertKalshiTickBatch(kalshiTicks); } catch { /* non-critical */ }
    }
    this.kalshiTicksTotal += kalshiTicks.length;
    console.log(`     Logged ${kalshiTicks.length} Kalshi ticks`);

    // ── Step 5: Cross-platform comparison ────────────────────────────────────
    console.log('[5/7] Running cross-platform comparison...');
    const crossSnaps = this.buildCrossPlatformSnapshots(polymarkets, kalshiMarkets, forecastMap, now);
    if (crossSnaps.length > 0) {
      try { insertCrossPlatformBatch(crossSnaps); } catch { /* non-critical */ }
    }
    this.crossPlatformTotal += crossSnaps.length;
    console.log(`     Cross-platform overlaps: ${crossSnaps.length}`);

    // ── Step 6: Log edges ────────────────────────────────────────────────────
    console.log('[6/7] Finding and logging edges...');
    const edgeRows = this.buildEdgeRows(forecastMap, kalshiMarkets, polymarkets, now);
    if (edgeRows.length > 0) {
      try { insertEdgeHistoryBatch(edgeRows); } catch { /* non-critical */ }
    }
    this.edgesTotal += edgeRows.length;
    console.log(`     Edges logged: ${edgeRows.length}`);

    // ── Step 7: Indicator signals (every 5 minutes) ──────────────────────────
    const shouldRunIndicators = now - this.lastIndicatorRun >= INDICATOR_INTERVAL;
    if (shouldRunIndicators) {
      console.log('[7/7] Fetching indicator signals...');
      await this.logIndicatorSignals(now);
      this.lastIndicatorRun = now;
    } else {
      const nextIndicatorSec = Math.ceil((INDICATOR_INTERVAL - (now - this.lastIndicatorRun)) / 1000);
      console.log(`[7/7] Indicators skipped (next in ${nextIndicatorSec}s)`);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
    this.printStats(polyTicks.length, kalshiTicks.length, crossSnaps.length, edgeRows.length, elapsed);
  }

  // ─── Step 2: Forecast map builder ────────────────────────────────────────

  private async buildForecastMap(
    polymarkets: Awaited<ReturnType<typeof this.polymarketScanner.scanWeatherMarkets>>,
    kalshiMarkets: Awaited<ReturnType<typeof this.kalshiScanner.scanWeatherMarkets>>,
  ): Promise<Map<string, TemperatureForecast>> {
    // Collect unique location+date combos across both platforms
    const needed = new Set<string>();
    for (const m of polymarkets)   needed.add(`${m.location}:${m.targetDate}`);
    for (const m of kalshiMarkets) needed.add(`${m.location}:${m.targetDate}`);

    const forecastMap = new Map<string, TemperatureForecast>();

    for (const key of needed) {
      // Return cached forecast if still fresh
      const cached = this.forecastCache.get(key);
      if (cached && Date.now() - cached.fetchedAt < this.FORECAST_TTL) {
        forecastMap.set(key, cached.forecast);
        continue;
      }

      const [locationName, targetDate] = key.split(':');
      const location = WEATHER_LOCATIONS.find(l => l.name === locationName);
      if (!location) continue;

      try {
        // Fetch NOAA and pass to the conditions-aware ensemble
        const noaaForecast = await this.noaa.fetchBestForecast(location, targetDate).catch(() => null);

        const { forecast } = await this.weatherEnsemble.buildConditionsAwareForecast(
          noaaForecast,
          null, // xweather not wired here; ensemble handles graceful null
          location,
          targetDate,
        );

        if (forecast) {
          this.forecastCache.set(key, { forecast, fetchedAt: Date.now() });
          forecastMap.set(key, forecast);
          console.log(`     ${locationName} ${targetDate}: High ${forecast.pointForecastHighF}°F ± ${forecast.modelSpreadF.toFixed(1)}°F (${forecast.hoursUntilTarget.toFixed(0)}h)`);
        }
      } catch (e) {
        console.error(`     Forecast failed for ${key}: ${(e as Error).message}`);
      }

      // Rate-limit to avoid hammering NWS
      await new Promise(r => setTimeout(r, 300));
    }

    return forecastMap;
  }

  // ─── Step 3: Polymarket tick builder ─────────────────────────────────────

  private buildPolyTicks(
    polymarkets: Awaited<ReturnType<typeof this.polymarketScanner.scanWeatherMarkets>>,
    forecastMap: Map<string, TemperatureForecast>,
    now: number,
  ): any[] {
    const ticks: any[] = [];

    for (const market of polymarkets) {
      const forecastKey = `${market.location}:${market.targetDate}`;
      const forecast    = forecastMap.get(forecastKey);

      const hoursToExpiry = Math.max(
        0,
        (market.endDate.getTime() - now) / (1000 * 60 * 60),
      );

      // Build probability distribution for this market's outcomes using our forecast
      let distribution: { probability: number }[] | null = null;
      if (forecast) {
        const buckets = market.outcomes.map(o => ({
          label: o.label,
          lowF:  o.rangeLowF,
          highF: o.rangeHighF,
        }));
        distribution = buildTemperatureDistribution(
          forecast.pointForecastHighF,
          forecast.modelSpreadF,
          buckets,
        );
      }

      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        if (outcome.yesPrice <= 0) continue;

        const forecastProb = distribution ? distribution[i].probability : null;
        const edge         = forecastProb !== null ? forecastProb - outcome.yesPrice : null;

        ticks.push({
          location:       market.location,
          target_date:    market.targetDate,
          outcome_label:  outcome.label,
          temperature_c:  outcome.temperatureC,
          yes_price:      outcome.yesPrice,
          forecast_prob:  forecastProb,
          edge,
          hours_to_expiry: hoursToExpiry,
          condition_id:   outcome.conditionId,
          observed_at:    now,
        });
      }
    }

    return ticks;
  }

  // ─── Step 4: Kalshi tick builder ──────────────────────────────────────────

  private buildKalshiTicks(
    kalshiMarkets: Awaited<ReturnType<typeof this.kalshiScanner.scanWeatherMarkets>>,
    forecastMap: Map<string, TemperatureForecast>,
    now: number,
  ): any[] {
    const ticks: any[] = [];

    for (const market of kalshiMarkets) {
      const forecastKey = `${market.location}:${market.targetDate}`;
      const forecast    = forecastMap.get(forecastKey);

      const hoursToExpiry = Math.max(
        0,
        (market.endDate.getTime() - now) / (1000 * 60 * 60),
      );

      // Build distribution for this market's bracket outcomes
      let distribution: { probability: number }[] | null = null;
      if (forecast) {
        const buckets = market.outcomes.map(o => ({
          label: o.label,
          lowF:  o.tempLowF,
          highF: o.tempHighF,
        }));
        distribution = buildTemperatureDistribution(
          forecast.pointForecastHighF,
          forecast.modelSpreadF,
          buckets,
        );
      }

      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        if (outcome.yesMid <= 0) continue;

        const forecastProb = distribution ? distribution[i].probability : null;
        const edge         = forecastProb !== null ? forecastProb - outcome.yesMid : null;

        ticks.push({
          event_ticker:   market.eventTicker,
          series_ticker:  market.seriesTicker,
          location:       market.location,
          target_date:    market.targetDate,
          outcome_ticker: outcome.ticker,
          outcome_label:  outcome.label,
          temp_low_f:     outcome.tempLowF,
          temp_high_f:    outcome.tempHighF,
          yes_bid:        outcome.yesBid,
          yes_ask:        outcome.yesAsk,
          yes_mid:        outcome.yesMid,
          last_price:     outcome.lastPrice,
          volume:         outcome.volume,
          forecast_prob:  forecastProb,
          edge,
          hours_to_expiry: hoursToExpiry,
          observed_at:    now,
        });
      }
    }

    return ticks;
  }

  // ─── Step 5: Cross-platform snapshot builder ──────────────────────────────

  private buildCrossPlatformSnapshots(
    polymarkets: Awaited<ReturnType<typeof this.polymarketScanner.scanWeatherMarkets>>,
    kalshiMarkets: Awaited<ReturnType<typeof this.kalshiScanner.scanWeatherMarkets>>,
    forecastMap: Map<string, TemperatureForecast>,
    now: number,
  ): any[] {
    const snapshots: any[] = [];

    // Index Polymarket markets by location::date
    const polyByKey = new Map<string, typeof polymarkets>();
    for (const m of polymarkets) {
      const key = `${m.location}::${m.targetDate}`;
      if (!polyByKey.has(key)) polyByKey.set(key, []);
      polyByKey.get(key)!.push(m);
    }

    for (const kalshiMarket of kalshiMarkets) {
      const key        = `${kalshiMarket.location}::${kalshiMarket.targetDate}`;
      const polyGroup  = polyByKey.get(key);
      if (!polyGroup || polyGroup.length === 0) continue;

      const forecastKey = `${kalshiMarket.location}:${kalshiMarket.targetDate}`;
      const forecast    = forecastMap.get(forecastKey);

      for (const polyMarket of polyGroup) {
        for (const ko of kalshiMarket.outcomes) {
          for (const po of polyMarket.outcomes) {
            // Match brackets that overlap by >= 80% of the smaller bracket's width
            const overlapLow  = Math.max(ko.tempLowF, po.rangeLowF);
            const overlapHigh = Math.min(ko.tempHighF, po.rangeHighF);
            const koWidth     = ko.tempHighF  - ko.tempLowF;
            const poWidth     = po.rangeHighF - po.rangeLowF;
            const minWidth    = Math.min(koWidth, poWidth);
            if (minWidth <= 0) continue;
            const overlapWidth = Math.max(0, overlapHigh - overlapLow);
            if (overlapWidth / minWidth < 0.8) continue;

            const kalshiPrice    = ko.yesMid;
            const polyPrice      = po.yesPrice;
            const priceDiff      = Math.abs(kalshiPrice - polyPrice);
            const tempMidF       = (Math.max(ko.tempLowF, po.rangeLowF) + Math.min(ko.tempHighF, po.rangeHighF)) / 2;
            const tempBucket     = `${Math.round(overlapLow)}-${Math.round(overlapHigh)}°F`;

            // Our model probability for the overlapping bucket
            let ourModelProb: number | null = null;
            if (forecast) {
              const dist = buildTemperatureDistribution(
                forecast.pointForecastHighF,
                forecast.modelSpreadF,
                [{ label: tempBucket, lowF: overlapLow, highF: overlapHigh }],
              );
              ourModelProb = dist[0].probability;
            }

            const polyEdge   = ourModelProb !== null ? ourModelProb - polyPrice   : null;
            const kalshiEdge = ourModelProb !== null ? ourModelProb - kalshiPrice : null;

            snapshots.push({
              location:        kalshiMarket.location,
              target_date:     kalshiMarket.targetDate,
              temp_bucket:     tempBucket,
              temp_mid_f:      tempMidF,
              polymarket_price: polyPrice,
              kalshi_price:    kalshiPrice,
              price_diff:      priceDiff,
              our_model_prob:  ourModelProb,
              poly_edge:       polyEdge,
              kalshi_edge:     kalshiEdge,
              observed_at:     now,
            });
          }
        }
      }
    }

    return snapshots;
  }

  // ─── Step 6: Edge row builder ─────────────────────────────────────────────

  private buildEdgeRows(
    forecastMap: Map<string, TemperatureForecast>,
    kalshiMarkets: Awaited<ReturnType<typeof this.kalshiScanner.scanWeatherMarkets>>,
    polymarkets: Awaited<ReturnType<typeof this.polymarketScanner.scanWeatherMarkets>>,
    now: number,
  ): any[] {
    const rows: any[] = [];

    try {
      const { edges } = this.edgeFinder.findAllEdges(forecastMap, kalshiMarkets, polymarkets);

      for (const e of edges) {
        rows.push({
          platform:           e.platform,
          location:           e.location,
          target_date:        e.targetDate,
          outcome_label:      e.outcomeLabel,
          temp_range_low_f:   e.tempRangeLowF,
          temp_range_high_f:  e.tempRangeHighF,
          model_prob:         e.modelProbability,
          market_price:       e.marketPrice,
          edge:               e.edge,
          direction:          e.direction,
          recommended_size:   e.recommendedSize,
          expected_profit:    e.expectedProfit,
          confidence:         e.confidence,
          hours_to_resolution: e.hoursUntilResolution,
          supporting_signals: JSON.stringify(e.supportingSignals),
          observed_at:        now,
        });
      }
    } catch (e) {
      console.error('     Edge finder error:', (e as Error).message);
    }

    return rows;
  }

  // ─── Step 7: Indicator signals ────────────────────────────────────────────

  private async logIndicatorSignals(now: number): Promise<void> {
    const signals: any[] = [];

    // Run all indicator fetches in parallel; failures are non-fatal
    const [faaResults, convectionResults, buoyResults, radiosondeResults] = await Promise.all([
      this.faaService.getAllSignals().catch(() => [] as any[]),
      this.convectionService.getAllSignals().catch(() => [] as any[]),
      this.buoyService.getAllSignals().catch(() => [] as any[]),
      this.radiosondeService.getAllSignals().catch(() => [] as any[]),
    ]);

    // FAA signals
    for (const faaSignal of (faaResults ?? [])) {
      if (!faaSignal) continue;
      signals.push({
        location:           faaSignal.city,
        signal_type:        'faa',
        signal_value:       JSON.stringify(faaSignal),
        weather_implication: faaSignal.weatherType ?? null,
        temp_adjust_f:      faaSignal.estimatedTempImpactF ?? 0,
        observed_at:        now,
      });
    }

    // Convection / CAPE signals
    for (const signal of (convectionResults ?? [])) {
      if (!signal) continue;
      signals.push({
        location:           signal.city,
        signal_type:        'cape',
        signal_value:       JSON.stringify(signal),
        weather_implication: signal.convectionRisk,
        temp_adjust_f:      signal.temperatureAdjustF ?? 0,
        observed_at:        now,
      });
    }

    // Buoy signals
    for (const signal of (buoyResults ?? [])) {
      if (!signal) continue;
      signals.push({
        location:           signal.city,
        signal_type:        'buoy',
        signal_value:       JSON.stringify(signal),
        weather_implication: signal.pressureAlert,
        temp_adjust_f:      0,
        observed_at:        now,
      });
    }

    // Radiosonde signals
    for (const signal of (radiosondeResults ?? [])) {
      if (!signal) continue;
      signals.push({
        location:           signal.city,
        signal_type:        'radiosonde',
        signal_value:       JSON.stringify(signal),
        weather_implication: signal.instabilityRisk,
        temp_adjust_f:      signal.temperatureAdjustF ?? 0,
        observed_at:        now,
      });
    }

    if (signals.length > 0) {
      try { insertIndicatorBatch(signals); } catch { /* non-critical */ }
    }

    console.log(`     Indicator signals logged: ${signals.length}`);
  }

  // ─── Stats & banner ───────────────────────────────────────────────────────

  private printStats(
    polyTicks:    number,
    kalshiTicks:  number,
    crossOverlaps: number,
    edges:        number,
    elapsedSec:   string,
  ): void {
    // Query row counts from each table
    const counts = {
      poly:   this.queryCount('weather_price_ticks'),
      kalshi: this.queryCount('kalshi_price_ticks'),
      cross:  this.queryCount('cross_platform_snapshots'),
      edges:  this.queryCount('edge_history'),
      signals: this.queryCount('indicator_signals'),
    };

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log(`│  Cycle #${String(this.cycleCount).padEnd(4)} complete in ${elapsedSec}s`);
    console.log(`│  This cycle  → Poly ticks: ${polyTicks}  Kalshi ticks: ${kalshiTicks}  Cross: ${crossOverlaps}  Edges: ${edges}`);
    console.log(`│  Running totals → Poly: ${this.polyTicksTotal}  Kalshi: ${this.kalshiTicksTotal}  Cross: ${this.crossPlatformTotal}  Edges: ${this.edgesTotal}`);
    console.log(`│  DB rows → weather_price_ticks: ${counts.poly}  kalshi_price_ticks: ${counts.kalshi}`);
    console.log(`│            cross_platform_snapshots: ${counts.cross}  edge_history: ${counts.edges}  indicator_signals: ${counts.signals}`);
    console.log('└─────────────────────────────────────────────────────────────────┘');
  }

  private queryCount(table: string): number {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      return row.n;
    } catch {
      return -1;
    }
  }

  private printBanner(): void {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║          MARKET MOVEMENT LOGGER — Tick-by-Tick Capture          ║');
    console.log('║   Kalshi + Polymarket weather markets → SQLite for backtesting   ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const logger = new MarketMovementLogger();
logger.run();

export default MarketMovementLogger;
