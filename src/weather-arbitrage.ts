// Weather Arbitrage Bot
// Compares NOAA/Open-Meteo forecasts against Polymarket weather markets to find mispriced outcomes

import { config as dotenvConfig } from 'dotenv';
import NOAAWeatherService, { WEATHER_LOCATIONS, TemperatureForecast, buildTemperatureDistribution } from './services/noaa-weather-service.js';
import XweatherService from './services/xweather-service.js';
import PolymarketWeatherScanner, { PolymarketWeatherMarket } from './services/polymarket-weather-scanner.js';
import WeatherEdgeCalculator, { WeatherEdge } from './services/weather-edge-calculator.js';
import WeatherEnsemble from './services/weather-ensemble.js';
import { MarketMover } from './services/weather-conditions-service.js';
import { UpstreamAlert } from './services/upstream-wind-detector.js';
import { insertSnapshot, insertTrade, insertPriceTickBatch } from './db.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

const AUTO_EXECUTE = process.env.WEATHER_AUTO_EXECUTE === 'true';
const SCAN_INTERVAL = 60_000;      // 1 minute
const FORECAST_REFRESH = 300_000;  // 5 minutes
const MIN_EDGE_PCT = parseFloat(process.env.WEATHER_MIN_EDGE || '8');
const MAX_POSITION = parseFloat(process.env.WEATHER_MAX_POSITION || '500');
const BANKROLL = parseFloat(process.env.WEATHER_BANKROLL || '5000');

class WeatherArbitrageBot {
  private noaa: NOAAWeatherService;
  private xweather: XweatherService;
  private ensemble: WeatherEnsemble;
  private scanner: PolymarketWeatherScanner;
  private edgeCalc: WeatherEdgeCalculator;
  private executedMarkets: Set<string> = new Set();
  private forecastCache: Map<string, { forecast: TemperatureForecast; fetchedAt: number }> = new Map();
  private logPath: string;
  private scanCount = 0;
  private edgesFound = 0;
  private tradesExecuted = 0;
  private latestMovers: Map<string, MarketMover[]> = new Map(); // location:date -> movers
  private latestUpstreamAlerts: UpstreamAlert[] = [];

  constructor() {
    this.noaa = new NOAAWeatherService();
    this.xweather = new XweatherService();
    this.ensemble = new WeatherEnsemble();
    this.scanner = new PolymarketWeatherScanner();
    this.edgeCalc = new WeatherEdgeCalculator({
      minAbsoluteEdge: MIN_EDGE_PCT / 100,  // Convert from % to decimal
      maxPositionSize: MAX_POSITION,
      kellyMultiplier: 0.5,
      bankroll: BANKROLL,
    });
    this.logPath = path.join(__dirname, '../logs', `weather-edges-${new Date().toISOString().split('T')[0]}.jsonl`);
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  async run(): Promise<void> {
    this.printBanner();

    // Initial scan
    await this.scan();

    // Continuous scanning
    setInterval(() => this.scan(), SCAN_INTERVAL);

    console.log(`\n⏰ Scanning every ${SCAN_INTERVAL / 1000}s | Forecasts refresh every ${FORECAST_REFRESH / 1000}s`);
    console.log(`   Auto-execute: ${AUTO_EXECUTE ? 'ON' : 'OFF (observation mode)'}`);
    console.log(`   Min edge: ${MIN_EDGE_PCT}% | Max position: $${MAX_POSITION} | Bankroll: $${BANKROLL}\n`);
  }

  private printBanner(): void {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          WEATHER ARBITRAGE BOT - Forecast vs Market          ║');
    console.log('║   NOAA/NWS + Open-Meteo + Xweather → Polymarket Edges       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  async scan(): Promise<void> {
    this.scanCount++;
    const scanStart = Date.now();

    try {
      // Step 1: Discover active Polymarket weather markets
      console.log(`\n── Scan #${this.scanCount} ─────────────────────────────────────`);
      console.log('[1/4] Scanning Polymarket for weather markets...');

      const markets = await this.scanner.scanWeatherMarkets();
      console.log(`      Found ${markets.length} weather markets`);

      if (markets.length === 0) {
        console.log('      No active weather markets found. Waiting...');
        return;
      }

      // Step 2: Fetch forecasts for relevant locations
      console.log('[2/4] Fetching weather forecasts...');
      const forecasts = await this.fetchForecasts(markets);
      console.log(`      Got forecasts for ${forecasts.size} locations`);

      // Step 3: Calculate edges
      console.log('[3/4] Calculating edges...');
      const allEdges: WeatherEdge[] = [];

      for (const market of markets) {
        const forecastKey = `${market.location}:${market.targetDate}`;
        const cached = this.forecastCache.get(forecastKey);
        if (!cached) continue;

        const edges = this.edgeCalc.calculateEdges(cached.forecast, market);
        allEdges.push(...edges);
      }

      const actionableEdges = this.edgeCalc.filterActionable(allEdges);
      this.edgesFound += actionableEdges.length;

      // Log ALL price ticks with forecast probabilities for every outcome
      this.logPriceTicks(markets, allEdges);

      // Step 4: Display and optionally execute
      console.log('[4/4] Results:');
      this.displayEdges(allEdges, actionableEdges);

      if (actionableEdges.length > 0) {
        this.logEdges(actionableEdges);

        // Log to SQLite
        for (const edge of actionableEdges) {
          try {
            insertSnapshot.run({
              market_id: edge.market.conditionId,
              platform: 'Polymarket',
              category: 'weather',
              asset: `TEMP-${edge.market.location}`,
              title: edge.market.question,
              yes_price: edge.marketPrice,
              no_price: 1 - edge.marketPrice,
              probability: edge.forecastProbability,
              side: edge.recommendedSide,
              volume: edge.market.volume,
              liquidity: edge.market.liquidity,
              spread: Math.abs(edge.edge),
              seconds_to_expiry: edge.hoursUntilResolution * 3600,
              expiry_time: edge.market.endDate.getTime(),
              observed_at: Date.now(),
            });
          } catch { /* non-critical */ }
        }

        if (AUTO_EXECUTE) {
          await this.executeEdges(actionableEdges);
        }
      }

      const elapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
      console.log(`\n      Scan complete in ${elapsed}s | Total edges found: ${this.edgesFound} | Trades: ${this.tradesExecuted}`);

    } catch (e) {
      console.error(`[SCAN ERROR] ${(e as Error).message}`);
    }
  }

  private async fetchForecasts(markets: PolymarketWeatherMarket[]): Promise<Map<string, TemperatureForecast>> {
    const needed = new Set<string>();
    for (const m of markets) {
      needed.add(`${m.location}:${m.targetDate}`);
    }

    const results = new Map<string, TemperatureForecast>();

    for (const key of needed) {
      // Check cache
      const cached = this.forecastCache.get(key);
      if (cached && Date.now() - cached.fetchedAt < FORECAST_REFRESH) {
        results.set(key, cached.forecast);
        continue;
      }

      const [locationName, targetDate] = key.split(':');
      const location = WEATHER_LOCATIONS.find(l => l.name === locationName);
      if (!location) continue;

      // Fetch from all sources and blend via conditions-aware ensemble
      const [noaaForecast, xwForecast] = await Promise.all([
        this.noaa.fetchBestForecast(location, targetDate),
        this.xweather.fetchForecast(location, targetDate),
      ]);

      const { forecast, movers, upstreamAlerts, conditionsAdjustmentF } = await this.ensemble.buildConditionsAwareForecast(
        noaaForecast, xwForecast, location, targetDate
      );

      if (forecast) {
        this.forecastCache.set(key, { forecast, fetchedAt: Date.now() });
        results.set(key, forecast);

        // Store movers and upstream alerts for display
        if (movers.length > 0) {
          this.latestMovers.set(key, movers);
        }
        if (upstreamAlerts.length > 0) {
          this.latestUpstreamAlerts.push(...upstreamAlerts);
        }

        // Record for calibration
        this.ensemble.recordForecast(locationName, targetDate, forecast.pointForecastHighF, forecast.pointForecastLowF, forecast.modelSpreadF, forecast.hoursUntilTarget);

        const sources = [noaaForecast ? 'NOAA' : null, xwForecast ? 'Xweather' : null, 'Clim'].filter(Boolean).join('+');
        const bias = this.ensemble.getCalibrationStats(locationName);
        const biasStr = bias ? ` bias:${bias.meanError > 0 ? '+' : ''}${bias.meanError}°F` : '';
        const condAdj = conditionsAdjustmentF !== 0 ? ` cond:${conditionsAdjustmentF > 0 ? '+' : ''}${conditionsAdjustmentF}°F` : '';
        console.log(`      ${locationName} ${targetDate}: High ${forecast.pointForecastHighF}°F ± ${forecast.modelSpreadF.toFixed(1)}°F (${forecast.hoursUntilTarget.toFixed(0)}h out) [${sources}]${biasStr}${condAdj}`);
      }

      // Rate limit API calls
      await new Promise(r => setTimeout(r, 300));
    }

    return results;
  }

  private displayEdges(allEdges: WeatherEdge[], actionable: WeatherEdge[]): void {
    if (allEdges.length === 0) {
      console.log('      No edges detected');
      return;
    }

    console.log(`\n      📊 All edges: ${allEdges.length} | Actionable: ${actionable.length}`);

    // Show top edges
    const toShow = allEdges.slice(0, 10);
    console.log('');
    console.log('      ┌──────────────┬───────────┬──────────┬──────────┬──────────┬────────┬─────────┬────────┐');
    console.log('      │ Location     │ Date      │ Outcome  │ Forecast │ Market   │ Edge   │ E[Prof] │ Action │');
    console.log('      ├──────────────┼───────────┼──────────┼──────────┼──────────┼────────┼─────────┼────────┤');

    for (const e of toShow) {
      const loc = e.market.location.padEnd(12);
      const date = e.market.targetDate.slice(5);
      const outcome = e.outcome.label.slice(0, 8).padEnd(8);
      const fProb = (e.forecastProbability * 100).toFixed(1).padStart(6) + '%';
      const mPrice = (e.marketPrice * 100).toFixed(1).padStart(6) + '%';
      const absEdge = (e.edge > 0 ? '+' : '') + (e.edge * 100).toFixed(1) + '¢';
      const eProfit = '$' + e.expectedProfit.toFixed(0);
      const action = e.confidence === 'HIGH' ? '🔥 ' + e.recommendedSide :
                     e.confidence === 'MEDIUM' ? '📈 ' + e.recommendedSide :
                     '   ' + e.recommendedSide;

      console.log(`      │ ${loc} │ ${date}    │ ${outcome} │ ${fProb} │ ${mPrice} │ ${absEdge.padStart(6)} │ ${eProfit.padStart(7)} │ ${action.padEnd(6)} │`);
    }

    console.log('      └──────────────┴───────────┴──────────┴──────────┴──────────┴────────┴─────────┴────────┘');

    if (actionable.length > 0) {
      console.log('\n      🎯 ACTIONABLE EDGES:');
      for (const e of actionable) {
        console.log(`         ${e.recommendedSide} ${e.outcome.label} in ${e.market.location} (${e.market.targetDate})`);
        console.log(`         Forecast: ${(e.forecastProbability * 100).toFixed(1)}% vs Market: ${(e.marketPrice * 100).toFixed(1)}% | Edge: ${(e.edge * 100).toFixed(1)} cents`);
        console.log(`         Size: $${e.recommendedSize.toFixed(0)} | E[Profit]: $${e.expectedProfit.toFixed(2)} | Confidence: ${e.confidence} | Kelly: ${(e.kellyFraction * 100).toFixed(1)}%`);
        console.log('');
      }
    }

    // Display upcoming market movers and upstream alerts
    this.displayMarketMovers();
    this.displayUpstreamAlerts();
  }

  private displayMarketMovers(): void {
    if (this.latestMovers.size === 0) return;

    const now = new Date();
    const currentHour = now.getHours();

    // Collect upcoming movers across all cities
    const upcoming: (MarketMover & { key: string })[] = [];
    for (const [key, movers] of this.latestMovers) {
      for (const m of movers) {
        if (m.triggerHour >= currentHour - 1) {
          upcoming.push({ ...m, key });
        }
      }
    }

    if (upcoming.length === 0) return;

    // Sort by trigger hour
    upcoming.sort((a, b) => a.triggerHour - b.triggerHour);

    console.log('\n      ⏱️  MARKET MOVE TIMELINE:');
    console.log('      ┌──────┬──────────────┬──────────────────┬───────────┬────────────────────────────────────────┐');
    console.log('      │ Time │ City         │ Event            │ Direction │ Impact                                 │');
    console.log('      ├──────┼──────────────┼──────────────────┼───────────┼────────────────────────────────────────┤');

    const shown = new Set<string>();
    for (const m of upcoming.slice(0, 12)) {
      const dedupKey = `${m.location}:${m.triggerHour}:${m.type}`;
      if (shown.has(dedupKey)) continue;
      shown.add(dedupKey);

      const time = `${String(m.triggerHour).padStart(2, '0')}:00`;
      const isNow = m.triggerHour === currentHour;
      const isPast = m.triggerHour < currentHour;
      const marker = isNow ? '→' : isPast ? '✓' : ' ';
      const city = m.location.padEnd(12);
      const type = m.type.replace(/_/g, ' ').padEnd(16);
      const dir = m.impactDirection.padEnd(9);
      const impact = m.impactMagnitudeF > 0
        ? `${m.impactDirection === 'WARMER' ? '+' : m.impactDirection === 'COOLER' ? '-' : '±'}${m.impactMagnitudeF.toFixed(1)}°F (${(m.confidence * 100).toFixed(0)}%)`
        : `(${(m.confidence * 100).toFixed(0)}% conf)`;

      console.log(`      │${marker}${time} │ ${city} │ ${type} │ ${dir} │ ${impact.padEnd(38)} │`);
    }

    console.log('      └──────┴──────────────┴──────────────────┴───────────┴────────────────────────────────────────┘');
  }

  private displayUpstreamAlerts(): void {
    if (this.latestUpstreamAlerts.length === 0) return;

    console.log('\n      🌊 UPSTREAM WIND ALERTS — Weather heading toward target cities:');

    // Deduplicate and show top alerts
    const seen = new Set<string>();
    let count = 0;
    for (const a of this.latestUpstreamAlerts) {
      const key = `${a.targetCity}:${a.sentinelName}:${a.impactDirection}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (count >= 6) break;

      const arrivalStr = a.estimatedArrivalHours < 1
        ? `${Math.round(a.estimatedArrivalHours * 60)}min`
        : `${a.estimatedArrivalHours.toFixed(1)}h`;
      const dir = a.impactDirection === 'WARMER' ? '🔴' :
                  a.impactDirection === 'COOLER' ? '🔵' :
                  a.impactDirection === 'CLEARING' ? '☀️' : '🌧️';

      console.log(`         ${dir} ${a.targetCity}: ${a.sentinelName} → ` +
        `${a.impactDirection} ${a.impactMagnitudeF > 0 ? `${a.impactMagnitudeF}°F` : ''} ` +
        `arriving in ${arrivalStr} (${(a.confidence * 100).toFixed(0)}% conf)`);
      console.log(`           ${a.description}`);
      count++;
    }

    // Clear for next scan
    this.latestUpstreamAlerts = [];
  }

  private async executeEdges(edges: WeatherEdge[]): Promise<void> {
    for (const edge of edges) {
      const marketKey = `${edge.market.conditionId}:${edge.outcome.label}`;
      if (this.executedMarkets.has(marketKey)) {
        console.log(`      ⏭️  Already traded ${edge.outcome.label} in ${edge.market.location}`);
        continue;
      }

      console.log(`      🚀 EXECUTING: ${edge.recommendedSide} $${edge.recommendedSize} on ${edge.outcome.label} in ${edge.market.location}`);

      // TODO: Integrate with Polymarket CLOB API for actual execution
      // For now, log the trade intent
      try {
        insertTrade.run({
          market_id: edge.market.conditionId,
          platform: 'Polymarket',
          asset: `TEMP-${edge.market.location}`,
          side: edge.recommendedSide,
          probability: edge.forecastProbability,
          position_size: edge.recommendedSize,
          estimated_return: edge.recommendedSize * Math.abs(edge.edge),
          status: AUTO_EXECUTE ? 'PENDING' : 'SIMULATED',
          executed_at: Date.now(),
        });
      } catch { /* non-critical */ }

      this.executedMarkets.add(marketKey);
      this.tradesExecuted++;
    }
  }

  // Log every price observation with our forecast probability for calibration
  private logPriceTicks(markets: PolymarketWeatherMarket[], edges: WeatherEdge[]): void {
    const now = Date.now();
    const edgeMap = new Map<string, WeatherEdge>();
    for (const e of edges) {
      edgeMap.set(`${e.market.location}:${e.market.targetDate}:${e.outcome.label}`, e);
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
          forecast_prob: edge?.forecastProbability ?? null,
          edge: edge?.edge ?? null,
          hours_to_expiry: hoursToExpiry,
          condition_id: outcome.conditionId,
          observed_at: now,
        });
      }
    }

    if (ticks.length > 0) {
      try {
        insertPriceTickBatch(ticks);
      } catch { /* non-critical */ }
    }
  }

  private logEdges(edges: WeatherEdge[]): void {
    try {
      for (const e of edges) {
        const entry = {
          timestamp: new Date().toISOString(),
          location: e.market.location,
          targetDate: e.market.targetDate,
          outcome: e.outcome.label,
          forecastProb: e.forecastProbability,
          marketPrice: e.marketPrice,
          edge: e.edge,
          edgePct: e.edgePct,
          expectedProfit: e.expectedProfit,
          confidence: e.confidence,
          side: e.recommendedSide,
          size: e.recommendedSize,
          kelly: e.kellyFraction,
          hoursOut: e.hoursUntilResolution,
        };
        fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
      }
    } catch { /* non-critical */ }
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

const bot = new WeatherArbitrageBot();
bot.run().catch(console.error);
