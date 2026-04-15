// Weather Ensemble Engine
// Blends multiple forecast sources and applies statistical calibration
// Inspired by WMO/NCEP ensemble methodology: weight models by past performance per city
//
// Sources:
//   1. NOAA/NWS (US) + Open-Meteo (international) — physics-based NWP forecasts
//   2. Xweather — commercial high-precision forecasts
//   3. ERA5 climatology — historical baseline (what's "normal" for this city/date)
//   4. Local ARIMA — statistical trend from recent days
//   5. Calibration layer — learned bias correction from past forecast errors
//
// The ensemble output is a calibrated probability distribution that should be
// more accurate than any single source.

import { TemperatureForecast, WeatherLocation, celsiusToFahrenheit, fahrenheitToCelsius } from './noaa-weather-service.js';
import WeatherConditionsService, { DayConditions, MarketMover } from './weather-conditions-service.js';
import UpstreamWindDetector, { UpstreamAlert } from './upstream-wind-detector.js';
import MultiModelService, { EnsembleForecast } from './multi-model-service.js';
import MetarRealtimeService, { TempDivergence } from './metar-realtime-service.js';
import RainViewerService, { PrecipNowcast } from './rainviewer-service.js';
import GoesSatelliteService, { CloudAnalysis } from './goes-satellite-service.js';
import LightningService, { StormStatus } from './lightning-service.js';
import AsosMinuteService, { TempTrajectory } from './asos-minute-service.js';
import { db } from '../db.js';

interface ForecastSource {
  name: string;
  highF: number;
  lowF: number;
  spreadF: number;
  weight: number;  // 0-1, learned from historical accuracy
}

interface CityClimate {
  location: string;
  month: number;
  day: number;
  avgHighF: number;
  avgLowF: number;
  stdDevF: number;  // Historical day-to-day variability
}

interface CalibrationEntry {
  location: string;
  forecastHighF: number;
  actualHighF: number;
  errorF: number;
  hoursOut: number;
  date: string;
}

// Historical average high temperatures by city and month (°F)
// Source: ERA5 climatology / historical weather data
// These serve as the "prior" when forecast data is uncertain
const CITY_CLIMATOLOGY: Record<string, Record<number, { avgHighF: number; avgLowF: number; stdDevF: number }>> = {
  'NYC':         { 1: { avgHighF: 39, avgLowF: 26, stdDevF: 8 }, 2: { avgHighF: 42, avgLowF: 28, stdDevF: 8 }, 3: { avgHighF: 50, avgLowF: 35, stdDevF: 8 }, 4: { avgHighF: 62, avgLowF: 44, stdDevF: 7 }, 5: { avgHighF: 72, avgLowF: 54, stdDevF: 6 }, 6: { avgHighF: 81, avgLowF: 64, stdDevF: 5 }, 7: { avgHighF: 85, avgLowF: 69, stdDevF: 4 }, 8: { avgHighF: 84, avgLowF: 68, stdDevF: 4 }, 9: { avgHighF: 76, avgLowF: 61, stdDevF: 5 }, 10: { avgHighF: 65, avgLowF: 50, stdDevF: 6 }, 11: { avgHighF: 54, avgLowF: 41, stdDevF: 7 }, 12: { avgHighF: 43, avgLowF: 31, stdDevF: 8 } },
  'Chicago':     { 1: { avgHighF: 32, avgLowF: 18, stdDevF: 10 }, 2: { avgHighF: 36, avgLowF: 21, stdDevF: 10 }, 3: { avgHighF: 47, avgLowF: 31, stdDevF: 9 }, 4: { avgHighF: 59, avgLowF: 40, stdDevF: 8 }, 5: { avgHighF: 70, avgLowF: 50, stdDevF: 7 }, 6: { avgHighF: 80, avgLowF: 60, stdDevF: 5 }, 7: { avgHighF: 84, avgLowF: 65, stdDevF: 4 }, 8: { avgHighF: 82, avgLowF: 64, stdDevF: 4 }, 9: { avgHighF: 75, avgLowF: 55, stdDevF: 6 }, 10: { avgHighF: 63, avgLowF: 44, stdDevF: 7 }, 11: { avgHighF: 48, avgLowF: 33, stdDevF: 9 }, 12: { avgHighF: 35, avgLowF: 22, stdDevF: 10 } },
  'LA':          { 1: { avgHighF: 68, avgLowF: 48, stdDevF: 5 }, 2: { avgHighF: 69, avgLowF: 49, stdDevF: 5 }, 3: { avgHighF: 70, avgLowF: 51, stdDevF: 4 }, 4: { avgHighF: 73, avgLowF: 54, stdDevF: 4 }, 5: { avgHighF: 75, avgLowF: 58, stdDevF: 3 }, 6: { avgHighF: 80, avgLowF: 62, stdDevF: 3 }, 7: { avgHighF: 84, avgLowF: 65, stdDevF: 3 }, 8: { avgHighF: 85, avgLowF: 66, stdDevF: 3 }, 9: { avgHighF: 84, avgLowF: 64, stdDevF: 4 }, 10: { avgHighF: 79, avgLowF: 59, stdDevF: 4 }, 11: { avgHighF: 73, avgLowF: 52, stdDevF: 5 }, 12: { avgHighF: 67, avgLowF: 47, stdDevF: 5 } },
  'Miami':       { 1: { avgHighF: 77, avgLowF: 62, stdDevF: 4 }, 2: { avgHighF: 79, avgLowF: 63, stdDevF: 4 }, 3: { avgHighF: 81, avgLowF: 66, stdDevF: 3 }, 4: { avgHighF: 84, avgLowF: 70, stdDevF: 3 }, 5: { avgHighF: 87, avgLowF: 74, stdDevF: 2 }, 6: { avgHighF: 90, avgLowF: 77, stdDevF: 2 }, 7: { avgHighF: 91, avgLowF: 78, stdDevF: 2 }, 8: { avgHighF: 91, avgLowF: 78, stdDevF: 2 }, 9: { avgHighF: 89, avgLowF: 77, stdDevF: 2 }, 10: { avgHighF: 86, avgLowF: 74, stdDevF: 3 }, 11: { avgHighF: 82, avgLowF: 69, stdDevF: 3 }, 12: { avgHighF: 78, avgLowF: 64, stdDevF: 4 } },
  'Denver':      { 1: { avgHighF: 45, avgLowF: 17, stdDevF: 11 }, 2: { avgHighF: 48, avgLowF: 20, stdDevF: 11 }, 3: { avgHighF: 55, avgLowF: 27, stdDevF: 10 }, 4: { avgHighF: 62, avgLowF: 34, stdDevF: 9 }, 5: { avgHighF: 71, avgLowF: 44, stdDevF: 7 }, 6: { avgHighF: 82, avgLowF: 53, stdDevF: 6 }, 7: { avgHighF: 90, avgLowF: 59, stdDevF: 4 }, 8: { avgHighF: 88, avgLowF: 57, stdDevF: 4 }, 9: { avgHighF: 80, avgLowF: 48, stdDevF: 6 }, 10: { avgHighF: 66, avgLowF: 36, stdDevF: 8 }, 11: { avgHighF: 52, avgLowF: 25, stdDevF: 10 }, 12: { avgHighF: 44, avgLowF: 17, stdDevF: 11 } },
  'London':      { 1: { avgHighF: 46, avgLowF: 36, stdDevF: 4 }, 2: { avgHighF: 47, avgLowF: 36, stdDevF: 4 }, 3: { avgHighF: 52, avgLowF: 38, stdDevF: 4 }, 4: { avgHighF: 58, avgLowF: 42, stdDevF: 4 }, 5: { avgHighF: 64, avgLowF: 48, stdDevF: 4 }, 6: { avgHighF: 70, avgLowF: 54, stdDevF: 3 }, 7: { avgHighF: 74, avgLowF: 58, stdDevF: 3 }, 8: { avgHighF: 73, avgLowF: 57, stdDevF: 3 }, 9: { avgHighF: 67, avgLowF: 53, stdDevF: 3 }, 10: { avgHighF: 59, avgLowF: 47, stdDevF: 4 }, 11: { avgHighF: 51, avgLowF: 41, stdDevF: 4 }, 12: { avgHighF: 46, avgLowF: 37, stdDevF: 4 } },
  'Tokyo':       { 1: { avgHighF: 49, avgLowF: 34, stdDevF: 4 }, 2: { avgHighF: 51, avgLowF: 35, stdDevF: 4 }, 3: { avgHighF: 57, avgLowF: 41, stdDevF: 4 }, 4: { avgHighF: 65, avgLowF: 49, stdDevF: 4 }, 5: { avgHighF: 73, avgLowF: 57, stdDevF: 3 }, 6: { avgHighF: 78, avgLowF: 65, stdDevF: 3 }, 7: { avgHighF: 84, avgLowF: 72, stdDevF: 3 }, 8: { avgHighF: 86, avgLowF: 73, stdDevF: 3 }, 9: { avgHighF: 80, avgLowF: 67, stdDevF: 3 }, 10: { avgHighF: 71, avgLowF: 57, stdDevF: 4 }, 11: { avgHighF: 62, avgLowF: 48, stdDevF: 4 }, 12: { avgHighF: 53, avgLowF: 38, stdDevF: 4 } },
  'Seoul':       { 1: { avgHighF: 34, avgLowF: 18, stdDevF: 6 }, 2: { avgHighF: 39, avgLowF: 23, stdDevF: 6 }, 3: { avgHighF: 50, avgLowF: 33, stdDevF: 5 }, 4: { avgHighF: 62, avgLowF: 44, stdDevF: 5 }, 5: { avgHighF: 73, avgLowF: 54, stdDevF: 4 }, 6: { avgHighF: 80, avgLowF: 64, stdDevF: 3 }, 7: { avgHighF: 84, avgLowF: 72, stdDevF: 3 }, 8: { avgHighF: 85, avgLowF: 72, stdDevF: 3 }, 9: { avgHighF: 78, avgLowF: 62, stdDevF: 4 }, 10: { avgHighF: 67, avgLowF: 49, stdDevF: 5 }, 11: { avgHighF: 52, avgLowF: 37, stdDevF: 5 }, 12: { avgHighF: 38, avgLowF: 23, stdDevF: 6 } },
  'Hong Kong':   { 1: { avgHighF: 65, avgLowF: 56, stdDevF: 4 }, 2: { avgHighF: 66, avgLowF: 57, stdDevF: 4 }, 3: { avgHighF: 70, avgLowF: 62, stdDevF: 3 }, 4: { avgHighF: 77, avgLowF: 68, stdDevF: 3 }, 5: { avgHighF: 83, avgLowF: 75, stdDevF: 2 }, 6: { avgHighF: 87, avgLowF: 79, stdDevF: 2 }, 7: { avgHighF: 90, avgLowF: 80, stdDevF: 2 }, 8: { avgHighF: 90, avgLowF: 80, stdDevF: 2 }, 9: { avgHighF: 88, avgLowF: 78, stdDevF: 2 }, 10: { avgHighF: 83, avgLowF: 73, stdDevF: 3 }, 11: { avgHighF: 76, avgLowF: 65, stdDevF: 3 }, 12: { avgHighF: 68, avgLowF: 58, stdDevF: 4 } },
  'Shanghai':    { 1: { avgHighF: 46, avgLowF: 34, stdDevF: 5 }, 2: { avgHighF: 49, avgLowF: 36, stdDevF: 5 }, 3: { avgHighF: 56, avgLowF: 42, stdDevF: 5 }, 4: { avgHighF: 66, avgLowF: 51, stdDevF: 4 }, 5: { avgHighF: 76, avgLowF: 60, stdDevF: 4 }, 6: { avgHighF: 82, avgLowF: 69, stdDevF: 3 }, 7: { avgHighF: 90, avgLowF: 77, stdDevF: 3 }, 8: { avgHighF: 90, avgLowF: 77, stdDevF: 3 }, 9: { avgHighF: 83, avgLowF: 70, stdDevF: 3 }, 10: { avgHighF: 73, avgLowF: 59, stdDevF: 4 }, 11: { avgHighF: 62, avgLowF: 48, stdDevF: 5 }, 12: { avgHighF: 50, avgLowF: 37, stdDevF: 5 } },
  'Mexico City': { 1: { avgHighF: 72, avgLowF: 43, stdDevF: 3 }, 2: { avgHighF: 75, avgLowF: 45, stdDevF: 3 }, 3: { avgHighF: 79, avgLowF: 49, stdDevF: 3 }, 4: { avgHighF: 79, avgLowF: 52, stdDevF: 3 }, 5: { avgHighF: 79, avgLowF: 54, stdDevF: 3 }, 6: { avgHighF: 76, avgLowF: 55, stdDevF: 2 }, 7: { avgHighF: 74, avgLowF: 54, stdDevF: 2 }, 8: { avgHighF: 75, avgLowF: 54, stdDevF: 2 }, 9: { avgHighF: 73, avgLowF: 54, stdDevF: 2 }, 10: { avgHighF: 73, avgLowF: 51, stdDevF: 3 }, 11: { avgHighF: 72, avgLowF: 47, stdDevF: 3 }, 12: { avgHighF: 71, avgLowF: 44, stdDevF: 3 } },
  'Milan':       { 1: { avgHighF: 41, avgLowF: 30, stdDevF: 5 }, 2: { avgHighF: 47, avgLowF: 33, stdDevF: 5 }, 3: { avgHighF: 56, avgLowF: 39, stdDevF: 5 }, 4: { avgHighF: 64, avgLowF: 47, stdDevF: 4 }, 5: { avgHighF: 73, avgLowF: 55, stdDevF: 4 }, 6: { avgHighF: 81, avgLowF: 63, stdDevF: 3 }, 7: { avgHighF: 86, avgLowF: 67, stdDevF: 3 }, 8: { avgHighF: 84, avgLowF: 66, stdDevF: 3 }, 9: { avgHighF: 76, avgLowF: 59, stdDevF: 4 }, 10: { avgHighF: 64, avgLowF: 50, stdDevF: 4 }, 11: { avgHighF: 52, avgLowF: 40, stdDevF: 5 }, 12: { avgHighF: 42, avgLowF: 32, stdDevF: 5 } },
  'Beijing':     { 1: { avgHighF: 35, avgLowF: 14, stdDevF: 6 }, 2: { avgHighF: 41, avgLowF: 20, stdDevF: 6 }, 3: { avgHighF: 54, avgLowF: 33, stdDevF: 6 }, 4: { avgHighF: 68, avgLowF: 46, stdDevF: 5 }, 5: { avgHighF: 80, avgLowF: 57, stdDevF: 5 }, 6: { avgHighF: 88, avgLowF: 66, stdDevF: 4 }, 7: { avgHighF: 89, avgLowF: 72, stdDevF: 3 }, 8: { avgHighF: 87, avgLowF: 70, stdDevF: 3 }, 9: { avgHighF: 80, avgLowF: 59, stdDevF: 4 }, 10: { avgHighF: 66, avgLowF: 46, stdDevF: 5 }, 11: { avgHighF: 50, avgLowF: 31, stdDevF: 6 }, 12: { avgHighF: 37, avgLowF: 18, stdDevF: 6 } },
  'Wellington':  { 1: { avgHighF: 68, avgLowF: 56, stdDevF: 3 }, 2: { avgHighF: 68, avgLowF: 56, stdDevF: 3 }, 3: { avgHighF: 65, avgLowF: 54, stdDevF: 3 }, 4: { avgHighF: 61, avgLowF: 50, stdDevF: 3 }, 5: { avgHighF: 56, avgLowF: 46, stdDevF: 3 }, 6: { avgHighF: 52, avgLowF: 42, stdDevF: 3 }, 7: { avgHighF: 51, avgLowF: 41, stdDevF: 3 }, 8: { avgHighF: 52, avgLowF: 41, stdDevF: 3 }, 9: { avgHighF: 54, avgLowF: 44, stdDevF: 3 }, 10: { avgHighF: 58, avgLowF: 47, stdDevF: 3 }, 11: { avgHighF: 62, avgLowF: 50, stdDevF: 3 }, 12: { avgHighF: 66, avgLowF: 54, stdDevF: 3 } },
};

class WeatherEnsemble {
  // Source weights — initialized equal, updated by calibration
  private sourceWeights: Map<string, Map<string, number>> = new Map(); // city -> (source -> weight)
  private calibrationBias: Map<string, number> = new Map(); // city -> average forecast error in °F
  private conditionsService = new WeatherConditionsService();
  private upstreamDetector = new UpstreamWindDetector();
  private multiModel = new MultiModelService();
  private metar = new MetarRealtimeService();
  private rainViewer = new RainViewerService();
  private satellite = new GoesSatelliteService();
  private lightning = new LightningService();
  private asosMinute = new AsosMinuteService();
  // Cache of market movers per location:date
  private moversCache: Map<string, { movers: MarketMover[]; conditions: DayConditions; upstreamAlerts: UpstreamAlert[]; fetchedAt: number }> = new Map();
  private moversCacheTTL = 10 * 60 * 1000; // 10 minutes
  // Enhanced data caches
  private multiModelCache: Map<string, { data: EnsembleForecast; fetchedAt: number }> = new Map();
  private groundTruthCache: Map<string, { divergence: TempDivergence | null; trajectory: TempTrajectory | null; fetchedAt: number }> = new Map();
  private hazardCache: Map<string, { precip: PrecipNowcast; clouds: CloudAnalysis; storm: StormStatus; fetchedAt: number }> = new Map();
  private enhancedCacheTTL = 5 * 60 * 1000;

  // Get climatological baseline for a city/date (the "what's normal" prior)
  getClimatology(location: string, date: string): CityClimate | null {
    const city = CITY_CLIMATOLOGY[location];
    if (!city) return null;

    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const climate = city[month];
    if (!climate) return null;

    return {
      location,
      month,
      day,
      avgHighF: climate.avgHighF,
      avgLowF: climate.avgLowF,
      stdDevF: climate.stdDevF,
    };
  }

  // Simple ARIMA-like trend from recent forecast errors
  // Uses last N days of weather_forecasts table to detect systematic bias
  getRecentBias(location: string): number {
    try {
      const rows = db.prepare(`
        SELECT forecast_error_f FROM weather_forecasts
        WHERE location = ? AND forecast_error_f IS NOT NULL
        ORDER BY observed_at DESC LIMIT 14
      `).all(location) as { forecast_error_f: number }[];

      if (rows.length < 3) return 0;

      // Exponentially weighted average of recent errors (more weight on recent)
      let weightedSum = 0;
      let weightTotal = 0;
      for (let i = 0; i < rows.length; i++) {
        const w = Math.exp(-i * 0.2); // Decay factor
        weightedSum += rows[i].forecast_error_f * w;
        weightTotal += w;
      }

      return weightedSum / weightTotal;
    } catch {
      return 0;
    }
  }

  // Blend multiple forecast sources into a single ensemble forecast
  blend(
    sources: ForecastSource[],
    location: string,
    targetDate: string,
    hoursOut: number
  ): { highF: number; lowF: number; spreadF: number; sourceCount: number } {
    if (sources.length === 0) {
      // Fallback to climatology
      const climate = this.getClimatology(location, targetDate);
      if (!climate) return { highF: 70, lowF: 50, spreadF: 10, sourceCount: 0 };
      return { highF: climate.avgHighF, lowF: climate.avgLowF, spreadF: climate.stdDevF, sourceCount: 0 };
    }

    // Normalize weights
    const totalWeight = sources.reduce((s, src) => s + src.weight, 0);

    // Weighted average of point forecasts
    let blendedHigh = 0;
    let blendedLow = 0;
    let maxSpread = 0;

    for (const src of sources) {
      const w = src.weight / totalWeight;
      blendedHigh += src.highF * w;
      blendedLow += src.lowF * w;
      maxSpread = Math.max(maxSpread, src.spreadF);
    }

    // Apply bias correction from historical errors
    const bias = this.getRecentBias(location);
    blendedHigh -= bias; // If we've been forecasting 2°F too high, correct down

    // Inter-model spread: disagreement between sources adds uncertainty
    if (sources.length >= 2) {
      const highValues = sources.map(s => s.highF);
      const modelSpread = Math.max(...highValues) - Math.min(...highValues);
      // Add inter-model disagreement to uncertainty (scaled down)
      maxSpread = Math.max(maxSpread, modelSpread * 0.5);
    }

    // Climatological anchoring: if forecast is far from climatology, widen uncertainty
    const climate = this.getClimatology(location, targetDate);
    if (climate) {
      const anomaly = Math.abs(blendedHigh - climate.avgHighF);
      if (anomaly > climate.stdDevF * 2) {
        // Forecast is >2 sigma from normal — extreme event, widen spread
        maxSpread = Math.max(maxSpread, anomaly * 0.3);
      }
    }

    return {
      highF: Math.round(blendedHigh * 10) / 10,
      lowF: Math.round(blendedLow * 10) / 10,
      spreadF: Math.round(maxSpread * 10) / 10,
      sourceCount: sources.length,
    };
  }

  // Build ensemble forecast from available sources
  buildEnsembleForecast(
    noaaForecast: TemperatureForecast | null,
    xweatherForecast: TemperatureForecast | null,
    location: WeatherLocation,
    targetDate: string
  ): TemperatureForecast | null {
    const sources: ForecastSource[] = [];

    if (noaaForecast) {
      sources.push({
        name: 'NOAA',
        highF: noaaForecast.pointForecastHighF,
        lowF: noaaForecast.pointForecastLowF,
        spreadF: noaaForecast.modelSpreadF,
        weight: this.getWeight(location.name, 'NOAA'),
      });
    }

    if (xweatherForecast) {
      sources.push({
        name: 'Xweather',
        highF: xweatherForecast.pointForecastHighF,
        lowF: xweatherForecast.pointForecastLowF,
        spreadF: xweatherForecast.modelSpreadF,
        weight: this.getWeight(location.name, 'Xweather'),
      });
    }

    // Add climatology as a weak prior (helps prevent wild forecasts)
    const climate = this.getClimatology(location.name, targetDate);
    if (climate) {
      sources.push({
        name: 'Climatology',
        highF: climate.avgHighF,
        lowF: climate.avgLowF,
        spreadF: climate.stdDevF,
        weight: this.getWeight(location.name, 'Climatology'),
      });
    }

    if (sources.length === 0) return null;

    const hoursOut = noaaForecast?.hoursUntilTarget ?? xweatherForecast?.hoursUntilTarget ?? 24;
    const blended = this.blend(sources, location.name, targetDate, hoursOut);

    const sourceNames = sources.map(s => s.name).join('+');

    return {
      location,
      targetDate,
      forecastTime: new Date(),
      hoursUntilTarget: hoursOut,
      pointForecastHighF: blended.highF,
      pointForecastLowF: blended.lowF,
      modelSpreadF: blended.spreadF,
      temperatureDistribution: [],
    };
  }

  // Get weight for a source in a city (defaults to equal weighting)
  private getWeight(city: string, source: string): number {
    // Climatology gets lower weight — it's a prior, not a forecast
    if (source === 'Climatology') return 0.15;

    const cityWeights = this.sourceWeights.get(city);
    if (cityWeights) {
      return cityWeights.get(source) ?? 1.0;
    }
    return 1.0; // Equal weight by default until calibrated
  }

  // Update source weights based on observed accuracy
  // Call this after resolution with actual temperatures
  updateWeights(city: string, source: string, forecastHighF: number, actualHighF: number): void {
    const error = Math.abs(forecastHighF - actualHighF);

    // Convert error to a score (lower error = higher weight)
    // Use exponential decay: weight = e^(-error/scale)
    const scale = 3.0; // 3°F error gives weight ~0.37, 1°F gives ~0.72
    const newWeight = Math.exp(-error / scale);

    if (!this.sourceWeights.has(city)) {
      this.sourceWeights.set(city, new Map());
    }

    const cityWeights = this.sourceWeights.get(city)!;
    const oldWeight = cityWeights.get(source) ?? 1.0;

    // Exponential moving average of weights (slow adaptation)
    const alpha = 0.1;
    cityWeights.set(source, oldWeight * (1 - alpha) + newWeight * alpha);
  }

  // Record a forecast for later calibration
  recordForecast(location: string, targetDate: string, highF: number, lowF: number, spreadF: number, hoursOut: number): void {
    try {
      db.prepare(`
        INSERT INTO weather_forecasts (location, target_date, forecast_high_f, forecast_low_f, model_spread_f, hours_until_target, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(location, targetDate, highF, lowF, spreadF, hoursOut, Date.now());
    } catch { /* non-critical, may already exist */ }
  }

  // Record actual outcome and update calibration
  recordActual(location: string, targetDate: string, actualHighF: number, actualLowF: number): void {
    try {
      const rows = db.prepare(`
        SELECT forecast_high_f FROM weather_forecasts
        WHERE location = ? AND target_date = ? AND actual_high_f IS NULL
      `).all(location, targetDate) as { forecast_high_f: number }[];

      if (rows.length > 0) {
        const forecastHigh = rows[0].forecast_high_f;
        const error = forecastHigh - actualHighF;

        db.prepare(`
          UPDATE weather_forecasts
          SET actual_high_f = ?, actual_low_f = ?, forecast_error_f = ?
          WHERE location = ? AND target_date = ? AND actual_high_f IS NULL
        `).run(actualHighF, actualLowF, error, location, targetDate);
      }
    } catch { /* non-critical */ }
  }

  // Fetch hourly wind + cloud conditions, detect market movers, and check upstream stations
  async getMarketMovers(location: WeatherLocation, targetDate: string): Promise<{
    movers: MarketMover[];
    upstreamAlerts: UpstreamAlert[];
    conditions: DayConditions | null;
    adjustmentF: number;
    adjustmentReason: string;
  }> {
    const key = `${location.name}:${targetDate}`;
    const cached = this.moversCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.moversCacheTTL) {
      const adj = this.conditionsService.adjustForecast(0, cached.conditions, cached.movers);
      return {
        movers: cached.movers,
        upstreamAlerts: cached.upstreamAlerts,
        conditions: cached.conditions,
        adjustmentF: adj.adjustmentF,
        adjustmentReason: adj.reason,
      };
    }

    // Fetch local conditions and upstream sentinel data in parallel
    const [conditions, upstreamAlerts] = await Promise.all([
      this.conditionsService.fetchHourlyConditions(location, targetDate),
      this.upstreamDetector.detectUpstreamChanges(location, targetDate),
    ]);

    if (!conditions) {
      return { movers: [], upstreamAlerts: upstreamAlerts || [], conditions: null, adjustmentF: 0, adjustmentReason: 'No conditions data' };
    }

    const movers = this.conditionsService.detectMarketMovers(conditions);

    // Convert upstream alerts into additional market movers
    for (const alert of upstreamAlerts) {
      const arrivalTime = new Date(alert.estimatedArrivalTime);
      const arrivalHour = arrivalTime.getHours();

      movers.push({
        location: alert.targetCity,
        targetDate: alert.targetDate,
        type: alert.impactDirection === 'WETTER' ? 'PRECIP_RISK' :
              alert.impactDirection === 'CLEARING' ? 'CLOUD_CLEARING' :
              alert.impactDirection === 'WARMER' ? 'TEMP_OVERSHOOT' : 'TEMP_UNDERSHOOT',
        triggerHour: arrivalHour,
        triggerTimeISO: alert.estimatedArrivalTime,
        impactDirection: alert.impactDirection === 'WETTER' ? 'COOLER' :
                         alert.impactDirection === 'CLEARING' ? 'WARMER' :
                         alert.impactDirection,
        impactMagnitudeF: alert.impactMagnitudeF,
        confidence: alert.confidence,
        description: `[UPSTREAM] ${alert.description}`,
      });
    }

    // Re-sort movers by trigger hour
    movers.sort((a, b) => a.triggerHour - b.triggerHour);

    this.moversCache.set(key, { movers, conditions, upstreamAlerts, fetchedAt: Date.now() });

    const adj = this.conditionsService.adjustForecast(0, conditions, movers);
    return {
      movers,
      upstreamAlerts,
      conditions,
      adjustmentF: adj.adjustmentF,
      adjustmentReason: adj.reason,
    };
  }

  // Enhanced ensemble that factors in wind/cloud conditions + upstream sentinel data
  // + multi-model agreement, METAR ground truth, satellite clouds, radar, storms
  async buildConditionsAwareForecast(
    noaaForecast: TemperatureForecast | null,
    xweatherForecast: TemperatureForecast | null,
    location: WeatherLocation,
    targetDate: string
  ): Promise<{
    forecast: TemperatureForecast | null;
    movers: MarketMover[];
    upstreamAlerts: UpstreamAlert[];
    conditions: DayConditions | null;
    conditionsAdjustmentF: number;
    multiModel: EnsembleForecast | null;
    groundTruth: { divergence: TempDivergence | null; trajectory: TempTrajectory | null } | null;
    hazards: { precip: PrecipNowcast; clouds: CloudAnalysis; storm: StormStatus } | null;
  }> {
    // Start with base ensemble forecast
    const baseForecast = this.buildEnsembleForecast(noaaForecast, xweatherForecast, location, targetDate);
    if (!baseForecast) {
      return { forecast: null, movers: [], upstreamAlerts: [], conditions: null, conditionsAdjustmentF: 0, multiModel: null, groundTruth: null, hazards: null };
    }

    // Fetch all data sources in parallel
    const [moverResult, multiModel, hazards] = await Promise.all([
      this.getMarketMovers(location, targetDate),
      this.getMultiModelData(location, targetDate).catch(() => null),
      this.getWeatherHazards(location).catch(() => null),
    ]);

    const { movers, upstreamAlerts, conditions, adjustmentF } = moverResult;

    // Integrate multi-model data into forecast
    if (multiModel && multiModel.models.length >= 2) {
      // Blend multi-model best estimate with our forecast (60% ours, 40% multi-model)
      const mmWeight = 0.4;
      baseForecast.pointForecastHighF = baseForecast.pointForecastHighF * (1 - mmWeight)
        + multiModel.bestEstimateHighF * mmWeight;

      // Use multi-model spread to inform uncertainty
      if (multiModel.ensembleSpreadF > baseForecast.modelSpreadF) {
        baseForecast.modelSpreadF = (baseForecast.modelSpreadF + multiModel.ensembleSpreadF) / 2;
      }

      // If models disagree (WEAK agreement), widen uncertainty further
      if (multiModel.modelAgreement === 'WEAK') {
        baseForecast.modelSpreadF = Math.max(baseForecast.modelSpreadF, baseForecast.modelSpreadF * 1.3);
      }
    }

    if (conditions && movers.length > 0) {
      // Apply conditions adjustment to forecast
      const adjusted = this.conditionsService.adjustForecast(
        baseForecast.pointForecastHighF, conditions, movers
      );

      baseForecast.pointForecastHighF = adjusted.adjustedHighF;

      // Increase uncertainty if conditions are volatile (many movers)
      if (movers.length >= 3) {
        baseForecast.modelSpreadF = Math.max(baseForecast.modelSpreadF, baseForecast.modelSpreadF * 1.2);
      }

      // Upstream alerts arriving before peak heating increase uncertainty
      const incomingBeforePeak = upstreamAlerts.filter(a => a.estimatedArrivalHours < 6);
      if (incomingBeforePeak.length > 0) {
        baseForecast.modelSpreadF = Math.max(baseForecast.modelSpreadF, baseForecast.modelSpreadF * 1.15);
      }
    }

    // Apply weather hazard adjustments
    if (hazards) {
      // Storm cooling
      if (hazards.storm.estimatedTempImpactF < -3) {
        baseForecast.pointForecastHighF += hazards.storm.estimatedTempImpactF * 0.5; // partial application
        baseForecast.modelSpreadF = Math.max(baseForecast.modelSpreadF, baseForecast.modelSpreadF * 1.25);
      }

      // Precipitation cooling (moderate rain ~2°F)
      if (hazards.precip.isRaining && hazards.precip.trend !== 'DECREASING') {
        baseForecast.pointForecastHighF -= 1.5;
      }

      // Cloud divergence: more clouds than expected = cooler
      if (hazards.clouds.cloudDivergence > 20) {
        baseForecast.pointForecastHighF -= hazards.clouds.cloudDivergence * 0.03; // ~1°F per 30% extra cloud
      } else if (hazards.clouds.cloudDivergence < -20) {
        baseForecast.pointForecastHighF -= hazards.clouds.cloudDivergence * 0.03; // warmer if clearing
      }
    }

    // Fetch ground truth (uses forecast high for divergence check)
    let groundTruth: { divergence: TempDivergence | null; trajectory: TempTrajectory | null } | null = null;
    try {
      groundTruth = await this.getGroundTruth(location, baseForecast.pointForecastHighF);

      // If METAR shows significant divergence, adjust forecast
      if (groundTruth.divergence && groundTruth.divergence.confidence > 0.5) {
        const div = groundTruth.divergence;
        if (div.likelyOvershoot) {
          baseForecast.pointForecastHighF = (baseForecast.pointForecastHighF + div.estimatedActualHighF) / 2;
        } else if (div.likelyUndershoot) {
          baseForecast.pointForecastHighF = (baseForecast.pointForecastHighF + div.estimatedActualHighF) / 2;
        }
      }

      // ASOS trajectory provides minute-level confidence
      if (groundTruth.trajectory && groundTruth.trajectory.peakDetected) {
        // Peak already detected — actual high is known
        baseForecast.pointForecastHighF = (baseForecast.pointForecastHighF + groundTruth.trajectory.estimatedPeakF) / 2;
        baseForecast.modelSpreadF = Math.min(baseForecast.modelSpreadF, 2); // Very confident
      }
    } catch { /* non-critical */ }

    // Round final values
    baseForecast.pointForecastHighF = Math.round(baseForecast.pointForecastHighF * 10) / 10;
    baseForecast.modelSpreadF = Math.round(baseForecast.modelSpreadF * 10) / 10;

    return {
      forecast: baseForecast,
      movers,
      upstreamAlerts,
      conditions,
      conditionsAdjustmentF: adjustmentF,
      multiModel,
      groundTruth,
      hazards,
    };
  }

  // Get market move timeline for dashboard display
  getMarketMoveTimeline(location: WeatherLocation, targetDate: string): {
    nextMoveHour: number | null;
    nextMoveType: string | null;
    timeline: { hour: number; events: string[] }[];
  } | null {
    const key = `${location.name}:${targetDate}`;
    const cached = this.moversCache.get(key);
    if (!cached) return null;

    return this.conditionsService.getMarketMoveTimeline(cached.conditions, cached.movers);
  }

  // Fetch multi-model ensemble data and integrate into forecast
  async getMultiModelData(location: WeatherLocation, targetDate: string): Promise<EnsembleForecast | null> {
    const key = `${location.name}:${targetDate}`;
    const cached = this.multiModelCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.enhancedCacheTTL) return cached.data;

    try {
      const ensemble = await this.multiModel.fetchEnsemble(location, targetDate);
      this.multiModelCache.set(key, { data: ensemble, fetchedAt: Date.now() });
      return ensemble;
    } catch {
      return null;
    }
  }

  // Fetch ground truth: METAR divergence + ASOS minute trajectory
  async getGroundTruth(location: WeatherLocation, forecastHighF: number): Promise<{
    divergence: TempDivergence | null;
    trajectory: TempTrajectory | null;
  }> {
    const key = location.name;
    const cached = this.groundTruthCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.enhancedCacheTTL) {
      return { divergence: cached.divergence, trajectory: cached.trajectory };
    }

    const [_, trajectory] = await Promise.all([
      this.metar.fetchAllCities().catch(() => []),
      this.asosMinute.getTrajectory(location.name).catch(() => null),
    ]);

    const divergence = this.metar.detectTempDivergence(location.name, forecastHighF);

    this.groundTruthCache.set(key, { divergence, trajectory, fetchedAt: Date.now() });
    return { divergence, trajectory };
  }

  // Fetch weather hazards: precipitation, clouds, storms
  async getWeatherHazards(location: WeatherLocation): Promise<{
    precip: PrecipNowcast;
    clouds: CloudAnalysis;
    storm: StormStatus;
  }> {
    const key = location.name;
    const cached = this.hazardCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.enhancedCacheTTL) {
      return { precip: cached.precip, clouds: cached.clouds, storm: cached.storm };
    }

    const [precip, clouds, storm] = await Promise.all([
      this.rainViewer.getPrecipitation(location),
      this.satellite.getCloudAnalysis(location),
      this.lightning.getStormStatus(location),
    ]);

    this.hazardCache.set(key, { precip, clouds, storm, fetchedAt: Date.now() });
    return { precip, clouds, storm };
  }

  // Get calibration stats for a city
  getCalibrationStats(location: string): { count: number; meanError: number; meanAbsError: number; rmse: number } | null {
    try {
      const row = db.prepare(`
        SELECT
          COUNT(*) as count,
          AVG(forecast_error_f) as mean_error,
          AVG(ABS(forecast_error_f)) as mean_abs_error,
          SQRT(AVG(forecast_error_f * forecast_error_f)) as rmse
        FROM weather_forecasts
        WHERE location = ? AND forecast_error_f IS NOT NULL
      `).get(location) as any;

      if (!row || row.count === 0) return null;

      return {
        count: row.count,
        meanError: Math.round(row.mean_error * 100) / 100,
        meanAbsError: Math.round(row.mean_abs_error * 100) / 100,
        rmse: Math.round(row.rmse * 100) / 100,
      };
    } catch {
      return null;
    }
  }
}

export { CITY_CLIMATOLOGY };
export default WeatherEnsemble;
