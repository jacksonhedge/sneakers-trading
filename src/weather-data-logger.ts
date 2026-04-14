// Weather Data Logger
// Continuously scrapes Polymarket weather prices, timestamps everything,
// fetches actual temperatures after resolution, and feeds calibration data
// back into the ensemble model.
//
// The data flywheel:
//   1. Scrape prices every 30s → weather_price_ticks (high-frequency)
//   2. Log ensemble forecasts → weather_forecasts (per scan cycle)
//   3. After market resolves → fetch actual temp from NOAA
//   4. Score: who was right — market or our model?
//   5. Update ensemble weights per city/source
//   6. Adjust bias correction for next day's predictions
//
// Run alongside weather-arbitrage.ts: npm run weather-logger

import { config as dotenvConfig } from 'dotenv';
import PolymarketWeatherScanner, { PolymarketWeatherMarket } from './services/polymarket-weather-scanner.js';
import NOAAWeatherService, { WEATHER_LOCATIONS, fahrenheitToCelsius } from './services/noaa-weather-service.js';
import WeatherEnsemble from './services/weather-ensemble.js';
import { db, insertPriceTickBatch, insertWeatherResolution } from './db.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

const PRICE_SCRAPE_INTERVAL = 30_000;   // 30 seconds
const RESOLUTION_CHECK_INTERVAL = 300_000; // 5 minutes
const STATS_INTERVAL = 600_000;          // 10 minutes

class WeatherDataLogger {
  private scanner: PolymarketWeatherScanner;
  private noaa: NOAAWeatherService;
  private ensemble: WeatherEnsemble;
  private tickCount = 0;
  private marketCache: PolymarketWeatherMarket[] = [];
  private lastMarketFetch = 0;
  private marketRefreshInterval = 120_000; // Refetch market list every 2 min
  private logPath: string;

  constructor() {
    this.scanner = new PolymarketWeatherScanner();
    this.noaa = new NOAAWeatherService();
    this.ensemble = new WeatherEnsemble();
    this.logPath = path.join(__dirname, '../logs', `weather-ticks-${new Date().toISOString().split('T')[0]}.jsonl`);
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  }

  async run(): Promise<void> {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         WEATHER DATA LOGGER — Price Tick Collector           ║');
    console.log('║   Scraping prices → Resolving outcomes → Calibrating model   ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Initial market fetch
    await this.refreshMarkets();

    // Price scraping loop
    setInterval(() => this.scrapePrices(), PRICE_SCRAPE_INTERVAL);

    // Resolution checking loop (checks if yesterday's markets resolved)
    setInterval(() => this.checkResolutions(), RESOLUTION_CHECK_INTERVAL);

    // Stats display
    setInterval(() => this.displayStats(), STATS_INTERVAL);

    // Kick off immediately
    await this.scrapePrices();
    await this.checkResolutions();

    console.log(`\n📡 Scraping prices every ${PRICE_SCRAPE_INTERVAL / 1000}s`);
    console.log(`🔍 Checking resolutions every ${RESOLUTION_CHECK_INTERVAL / 1000}s`);
    console.log(`📊 Stats every ${STATS_INTERVAL / 1000}s\n`);
  }

  private async refreshMarkets(): Promise<void> {
    if (Date.now() - this.lastMarketFetch < this.marketRefreshInterval && this.marketCache.length > 0) {
      return;
    }
    try {
      this.marketCache = await this.scanner.scanWeatherMarkets();
      this.lastMarketFetch = Date.now();
      console.log(`[Markets] Refreshed: ${this.marketCache.length} active temperature markets`);
    } catch (e) {
      console.error(`[Markets] Refresh failed: ${(e as Error).message}`);
    }
  }

  private async scrapePrices(): Promise<void> {
    await this.refreshMarkets();

    const now = Date.now();
    const ticks: any[] = [];

    for (const market of this.marketCache) {
      const endTime = market.endDate.getTime();
      const hoursToExpiry = Math.max(0, (endTime - now) / (1000 * 60 * 60));

      for (const outcome of market.outcomes) {
        if (outcome.yesPrice <= 0) continue;

        ticks.push({
          location: market.location,
          target_date: market.targetDate,
          outcome_label: outcome.label,
          temperature_c: outcome.temperatureC,
          yes_price: outcome.yesPrice,
          forecast_prob: null,  // Filled by arbitrage bot when running alongside
          edge: null,
          hours_to_expiry: hoursToExpiry,
          condition_id: outcome.conditionId,
          observed_at: now,
        });
      }
    }

    if (ticks.length > 0) {
      try {
        insertPriceTickBatch(ticks);
        this.tickCount += ticks.length;

        // Also append to JSONL for easy analysis
        for (const t of ticks) {
          fs.appendFileSync(this.logPath, JSON.stringify({
            ts: new Date(now).toISOString(),
            loc: t.location,
            date: t.target_date,
            temp: t.temperature_c,
            price: t.yes_price,
            hrsOut: Math.round(t.hours_to_expiry * 10) / 10,
          }) + '\n');
        }
      } catch (e) {
        console.error(`[Ticks] Write failed: ${(e as Error).message}`);
      }
    }

    // Compact status line
    const cities = new Set(ticks.map(t => t.location));
    process.stdout.write(`\r[${new Date().toLocaleTimeString()}] ${ticks.length} ticks across ${cities.size} cities | Total: ${this.tickCount}    `);
  }

  // Check if yesterday's (or earlier) markets have resolved
  private async checkResolutions(): Promise<void> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Find dates we have price ticks for but no resolutions yet
    const unresolvedDates = db.prepare(`
      SELECT DISTINCT location, target_date
      FROM weather_price_ticks
      WHERE target_date <= ?
        AND NOT EXISTS (
          SELECT 1 FROM weather_resolutions wr
          WHERE wr.location = weather_price_ticks.location
            AND wr.target_date = weather_price_ticks.target_date
        )
      ORDER BY target_date DESC
      LIMIT 20
    `).all(yesterday.toISOString().split('T')[0]) as { location: string; target_date: string }[];

    if (unresolvedDates.length === 0) return;

    console.log(`\n[Resolution] Checking ${unresolvedDates.length} unresolved city-dates...`);

    for (const { location, target_date } of unresolvedDates) {
      await this.resolveMarket(location, target_date);
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }
  }

  private async resolveMarket(location: string, targetDate: string): Promise<void> {
    try {
      // Fetch actual temperature from NOAA/Open-Meteo historical data
      const weatherLoc = WEATHER_LOCATIONS.find(l => l.name === location);
      if (!weatherLoc) return;

      const actualHighF = await this.fetchActualTemperature(weatherLoc, targetDate);
      if (actualHighF === null) return;

      const actualHighC = Math.round(fahrenheitToCelsius(actualHighF));

      console.log(`[Resolution] ${location} ${targetDate}: Actual high = ${actualHighC}°C (${actualHighF}°F)`);

      // Get the last price tick for each outcome on this market
      const lastTicks = db.prepare(`
        SELECT outcome_label, temperature_c, yes_price, forecast_prob, condition_id,
               MAX(observed_at) as last_seen
        FROM weather_price_ticks
        WHERE location = ? AND target_date = ?
        GROUP BY outcome_label
      `).all(location, targetDate) as any[];

      let marketCorrect = 0;
      let modelCorrect = 0;
      let totalOutcomes = 0;

      for (const tick of lastTicks) {
        const tempC = tick.temperature_c;
        const isWinner = tempC === actualHighC;

        // For "or below" / "or higher" outcomes
        const label = tick.outcome_label as string;
        let resolved_yes: boolean;
        if (label.includes('or below')) {
          resolved_yes = actualHighC <= tempC;
        } else if (label.includes('or higher')) {
          resolved_yes = actualHighC >= tempC;
        } else {
          resolved_yes = actualHighC === tempC;
        }

        const finalPrice = tick.yes_price;
        const forecastProb = tick.forecast_prob;

        const marketWasRight = (finalPrice > 0.5 && resolved_yes) || (finalPrice <= 0.5 && !resolved_yes);
        const modelWasRight = forecastProb !== null ?
          ((forecastProb > 0.5 && resolved_yes) || (forecastProb <= 0.5 && !resolved_yes)) : null;

        // Hypothetical PnL: if we bought at forecast_prob edge
        let profitIfTraded = 0;
        if (forecastProb !== null) {
          const edge = forecastProb - finalPrice;
          if (edge > 0.05) {
            // We would have bought YES
            profitIfTraded = resolved_yes ? (1 - finalPrice) * 100 : -finalPrice * 100;
          } else if (edge < -0.05) {
            // We would have sold (bought NO)
            profitIfTraded = !resolved_yes ? finalPrice * 100 : -(1 - finalPrice) * 100;
          }
        }

        try {
          insertWeatherResolution.run({
            location,
            target_date: targetDate,
            actual_high_c: actualHighC,
            actual_high_f: actualHighF,
            outcome_label: tick.outcome_label,
            temperature_c: tempC,
            final_market_price: finalPrice,
            our_forecast_prob: forecastProb,
            resolved_yes: resolved_yes ? 1 : 0,
            market_was_right: marketWasRight ? 1 : 0,
            model_was_right: modelWasRight !== null ? (modelWasRight ? 1 : 0) : null,
            profit_if_traded: profitIfTraded,
            resolved_at: Date.now(),
          });
        } catch { /* duplicate, skip */ }

        if (marketWasRight) marketCorrect++;
        if (modelWasRight) modelCorrect++;
        totalOutcomes++;
      }

      // Update ensemble calibration
      this.ensemble.recordActual(location, targetDate, actualHighF, actualHighF - 15);

      console.log(`  → ${totalOutcomes} outcomes resolved | Market accuracy: ${marketCorrect}/${totalOutcomes} | Model accuracy: ${modelCorrect}/${totalOutcomes}`);

    } catch (e) {
      console.error(`[Resolution] Failed for ${location} ${targetDate}: ${(e as Error).message}`);
    }
  }

  // Fetch actual observed temperature (historical) from Open-Meteo archive
  private async fetchActualTemperature(location: { lat: number; lon: number; name: string }, date: string): Promise<number | null> {
    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${location.lat}&longitude=${location.lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=auto`;

      const resp = await fetch(url);
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const maxTemp = data.daily?.temperature_2m_max?.[0];
      return maxTemp ?? null;
    } catch {
      return null;
    }
  }

  private displayStats(): void {
    console.log('\n');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    WEATHER DATA STATS                       │');
    console.log('├─────────────────────────────────────────────────────────────┤');

    // Total ticks
    const tickStats = db.prepare(`
      SELECT COUNT(*) as total,
             COUNT(DISTINCT location) as cities,
             COUNT(DISTINCT target_date) as dates,
             MIN(observed_at) as first_tick,
             MAX(observed_at) as last_tick
      FROM weather_price_ticks
    `).get() as any;

    console.log(`│ Price ticks:  ${tickStats.total.toLocaleString().padStart(8)} across ${tickStats.cities} cities, ${tickStats.dates} dates`);

    // Resolution stats
    const resStats = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(resolved_yes) as winners,
             SUM(market_was_right) as market_right,
             SUM(model_was_right) as model_right,
             SUM(profit_if_traded) as total_pnl,
             COUNT(DISTINCT location || target_date) as resolved_days
      FROM weather_resolutions
    `).get() as any;

    if (resStats.total > 0) {
      const marketPct = ((resStats.market_right / resStats.total) * 100).toFixed(1);
      const modelPct = resStats.model_right !== null ?
        ((resStats.model_right / resStats.total) * 100).toFixed(1) : 'N/A';
      const pnl = resStats.total_pnl?.toFixed(2) || '0.00';

      console.log(`│ Resolutions:  ${String(resStats.total).padStart(8)} outcomes across ${resStats.resolved_days} city-days`);
      console.log(`│ Market accuracy:  ${marketPct}%`);
      console.log(`│ Model accuracy:   ${modelPct}%`);
      console.log(`│ Hypothetical PnL: $${pnl}`);
    } else {
      console.log('│ Resolutions:  None yet (need data from completed markets)');
    }

    // Forecast calibration per city
    const calibration = db.prepare(`
      SELECT location,
             COUNT(*) as n,
             ROUND(AVG(forecast_error_f), 2) as bias,
             ROUND(AVG(ABS(forecast_error_f)), 2) as mae,
             ROUND(SQRT(AVG(forecast_error_f * forecast_error_f)), 2) as rmse
      FROM weather_forecasts
      WHERE forecast_error_f IS NOT NULL
      GROUP BY location
      ORDER BY n DESC
    `).all() as any[];

    if (calibration.length > 0) {
      console.log('│                                                             │');
      console.log('│ Forecast Calibration by City:                               │');
      console.log('│   City          N    Bias    MAE    RMSE                     │');
      for (const row of calibration) {
        const city = row.location.padEnd(14);
        const n = String(row.n).padStart(4);
        const bias = (row.bias > 0 ? '+' : '') + row.bias.toFixed(1) + '°F';
        console.log(`│   ${city} ${n}  ${bias.padStart(7)}  ${row.mae.toFixed(1).padStart(5)}  ${row.rmse.toFixed(1).padStart(5)}                     │`);
      }
    }

    // Price movement patterns
    const pricePatterns = db.prepare(`
      SELECT location, target_date, outcome_label,
             MIN(yes_price) as min_price,
             MAX(yes_price) as max_price,
             MAX(yes_price) - MIN(yes_price) as price_range,
             COUNT(*) as n_ticks
      FROM weather_price_ticks
      WHERE observed_at > ?
      GROUP BY location, target_date, outcome_label
      HAVING price_range > 0.05
      ORDER BY price_range DESC
      LIMIT 5
    `).all(Date.now() - 24 * 60 * 60 * 1000) as any[];

    if (pricePatterns.length > 0) {
      console.log('│                                                             │');
      console.log('│ Biggest 24h price moves:                                    │');
      for (const p of pricePatterns) {
        const move = `${(p.min_price * 100).toFixed(0)}% → ${(p.max_price * 100).toFixed(0)}%`;
        console.log(`│   ${p.location} ${p.outcome_label}: ${move} (${p.n_ticks} ticks)       │`);
      }
    }

    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('');
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

const logger = new WeatherDataLogger();
logger.run().catch(console.error);
