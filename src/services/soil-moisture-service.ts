// NASA POWER Soil Moisture Service
// Fetches soil wetness (surface, root zone, profile) from the NASA POWER API
// No auth required — data has a ~3-5 day lag
//
// Soil dryness amplifies daytime heating (less evapotranspiration → more sensible heat).
// Saturated soils enhance precipitation recycling and suppress temperature extremes.
// These biases are systematic and predictable, making soil moisture a useful
// model-correction signal for temperature markets.

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

// ----- Interfaces --------------------------------------------------------

export type SoilCondition = 'VERY_DRY' | 'DRY' | 'NORMAL' | 'WET' | 'SATURATED';
export type MoistureTrend = 'DRYING' | 'STABLE' | 'WETTING';

export interface SoilMoistureSignal {
  city: string;
  surfaceWetness: number;      // GWETTOP 0–1
  rootZoneWetness: number;     // GWETROOT 0–1
  profileWetness: number;      // GWETPROF 0–1
  soilCondition: SoilCondition;
  recentPrecip: number;        // mm accumulated over the window
  trend: MoistureTrend;
  temperatureAdjustF: number;  // bias correction for model temp forecasts
  precipRecyclingRisk: boolean; // saturated soil → enhanced moisture recycling
  fetchedAt: string;
}

// ----- Helpers -----------------------------------------------------------

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function classifyCondition(gwettop: number): SoilCondition {
  if (gwettop < 0.2)  return 'VERY_DRY';
  if (gwettop < 0.4)  return 'DRY';
  if (gwettop < 0.7)  return 'NORMAL';
  if (gwettop < 0.9)  return 'WET';
  return 'SATURATED';
}

/**
 * Temperature adjustment (°F) based on soil condition.
 * Dry soils allow more sensible heat flux → warmer than model expects.
 * Wet/saturated soils cool via latent heat flux → cooler.
 */
function temperatureAdjust(condition: SoilCondition): number {
  switch (condition) {
    case 'VERY_DRY':   return +7;   // midpoint of +5 to +10
    case 'DRY':        return +3;   // midpoint of +2 to +5
    case 'NORMAL':     return  0;
    case 'WET':        return -3;   // midpoint of -2 to -5
    case 'SATURATED':  return -5;
  }
}

/**
 * Determine moisture trend over the observation window.
 * Compare the first-half average to the second-half average.
 */
function computeTrend(series: number[]): MoistureTrend {
  if (series.length < 2) return 'STABLE';
  const half = Math.floor(series.length / 2);
  const early = series.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const late  = series.slice(half).reduce((s, v) => s + v, 0) / (series.length - half);
  const delta = late - early;
  if (delta >  0.05) return 'WETTING';
  if (delta < -0.05) return 'DRYING';
  return 'STABLE';
}

// ----- NASA POWER API response shape -------------------------------------

interface PowerResponse {
  properties?: {
    parameter?: Record<string, Record<string, number>>;
  };
}

// ----- Service class -----------------------------------------------------

class SoilMoistureService {
  private cache: Map<string, { data: SoilMoistureSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 7200 * 1000; // 2 hours — data updates slowly

  async getSignal(location: WeatherLocation): Promise<SoilMoistureSignal | null> {
    const cacheKey = location.name;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.data;
    }

    // Use window: 10 days ago → 5 days ago (accounts for ~3-5 day lag)
    const now = new Date();
    const endDate   = new Date(now);
    const startDate = new Date(now);
    endDate.setUTCDate(endDate.getUTCDate() - 5);
    startDate.setUTCDate(startDate.getUTCDate() - 10);

    const params = [
      'GWETTOP',
      'GWETROOT',
      'GWETPROF',
      'T2M',
      'PRECTOTCORR',
    ].join(',');

    const url =
      `https://power.larc.nasa.gov/api/temporal/daily/point` +
      `?parameters=${params}` +
      `&community=AG` +
      `&longitude=${location.lon}` +
      `&latitude=${location.lat}` +
      `&start=${formatDateYYYYMMDD(startDate)}` +
      `&end=${formatDateYYYYMMDD(endDate)}` +
      `&format=JSON`;

    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });

      if (!resp.ok) {
        console.error(`[SoilMoisture] HTTP ${resp.status} for ${location.name}`);
        return null;
      }

      const json = (await resp.json()) as PowerResponse;
      const param = json.properties?.parameter;
      if (!param) {
        console.warn(`[SoilMoisture] No parameter data for ${location.name}`);
        return null;
      }

      const gwettop  = param['GWETTOP']      ?? {};
      const gwetroot = param['GWETROOT']     ?? {};
      const gwetprof = param['GWETPROF']     ?? {};
      const precip   = param['PRECTOTCORR']  ?? {};

      // Collect daily values (filter out fill values: -999)
      const topValues  = Object.values(gwettop).filter(v => v > -900);
      const rootValues = Object.values(gwetroot).filter(v => v > -900);
      const profValues = Object.values(gwetprof).filter(v => v > -900);
      const precipVals = Object.values(precip).filter(v => v > -900);

      if (topValues.length === 0) {
        console.warn(`[SoilMoisture] Empty dataset for ${location.name}`);
        return null;
      }

      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

      const avgTop  = avg(topValues);
      const avgRoot = rootValues.length > 0 ? avg(rootValues) : avgTop;
      const avgProf = profValues.length > 0 ? avg(profValues) : avgTop;
      const totalPrecip = precipVals.reduce((s, v) => s + v, 0);

      const condition          = classifyCondition(avgTop);
      const trend              = computeTrend(topValues);
      const tempAdjF           = temperatureAdjust(condition);
      const precipRecycling    = condition === 'SATURATED' || condition === 'WET';

      const signal: SoilMoistureSignal = {
        city:                location.name,
        surfaceWetness:      Math.round(avgTop  * 1000) / 1000,
        rootZoneWetness:     Math.round(avgRoot * 1000) / 1000,
        profileWetness:      Math.round(avgProf * 1000) / 1000,
        soilCondition:       condition,
        recentPrecip:        Math.round(totalPrecip * 10) / 10,
        trend,
        temperatureAdjustF:  tempAdjF,
        precipRecyclingRisk: precipRecycling,
        fetchedAt:           new Date().toISOString(),
      };

      this.cache.set(cacheKey, { data: signal, fetchedAt: Date.now() });
      return signal;
    } catch (e) {
      console.error(`[SoilMoisture] Fetch error for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  async getAllSignals(): Promise<SoilMoistureSignal[]> {
    const signals: SoilMoistureSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      const signal = await this.getSignal(loc);
      if (signal) signals.push(signal);
      await new Promise(r => setTimeout(r, 500)); // NASA POWER is rate-sensitive
    }
    return signals;
  }
}

export default SoilMoistureService;
