// NOAA ERDDAP Sea Surface Temperature Service
// Fetches SST from NOAA OISSTv2.1 (CoastWatch ERDDAP) — no auth required
// Data has ~2 week lag, so we query 14 days ago for current and 21 days ago for trend
// SST anomaly signals: warm = enhanced moisture/storms, cold = marine layer/cooling
// Useful for coastal cities where SST directly modulates air temperature and fog

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface SSTSignal {
  city: string;
  sstCelsius: number;
  sstFahrenheit: number;
  sstAnomaly: number;           // °C vs 7-day-prior baseline (positive = warmer)
  trend: 'WARMING' | 'COOLING' | 'STABLE';
  weatherImplication: string;   // narrative impact on coastal weather
  temperatureImpactF: number;   // estimated °F impact on coastal air temp
}

// City SST grid coordinates (ERDDAP uses 0-360 longitude, 0.25° resolution)
interface SSTLocation {
  lat: number;
  lon360: number; // longitude in 0-360 format
}

const CITY_SST_COORDS: Record<string, SSTLocation> = {
  'NYC':      { lat: 40.125,  lon360: 286.125 },   // -73.875 → 360-73.875
  'Miami':    { lat: 25.875,  lon360: 279.875 },   // -80.125 → 360-80.125
  'LA':       { lat: 33.875,  lon360: 241.625 },   // -118.375 → 360-118.375
  'Tokyo':    { lat: 35.625,  lon360: 139.875 },
  'London':   { lat: 51.375,  lon360: 0.875 },
  'Shanghai': { lat: 31.125,  lon360: 121.875 },
};

const ERDDAP_BASE = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg.json';
const DATASET = 'ncdcOisst21Agg';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildErddapUrl(dateStr: string, lat: number, lon360: number): string {
  // ERDDAP griddap query: sst[(date T12:00:00Z)][(0.0)][(lat)][(lon)]
  const timeSpec = `${dateStr}T12:00:00Z`;
  const query = `sst[(${timeSpec})][(0.0)][(${lat})][(${lon360})]`;
  return `${ERDDAP_BASE}?${encodeURIComponent(query)}`;
}

async function fetchSST(dateStr: string, lat: number, lon360: number): Promise<number | null> {
  const url = buildErddapUrl(dateStr, lat, lon360);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      timeout: 15000,
    } as any);

    if (!resp.ok) {
      // Try progressively earlier dates — OISST can lag 14-20 days
      for (let daysBack = 1; daysBack <= 7; daysBack++) {
        const fallbackDate = isoDate(new Date(new Date(dateStr).getTime() - daysBack * 24 * 60 * 60 * 1000));
        const fallbackUrl = buildErddapUrl(fallbackDate, lat, lon360);
        const fallbackResp = await fetch(fallbackUrl, {
          headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
          timeout: 15000,
        } as any);
        if (fallbackResp.ok) {
          const fallbackData = (await fallbackResp.json()) as any;
          return extractSSTFromErddap(fallbackData);
        }
      }
      return null;
    }

    const data = (await resp.json()) as any;
    return extractSSTFromErddap(data);
  } catch (e) {
    console.error(`[SST] Fetch error for ${dateStr} lat=${lat} lon=${lon360}: ${(e as Error).message}`);
    return null;
  }
}

function extractSSTFromErddap(data: any): number | null {
  // ERDDAP JSON response has a "rows" array; SST is typically the 5th column (index 4)
  // Column order: time, altitude, latitude, longitude, sst
  const rows = data?.table?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (!Array.isArray(row) || row.length < 5) return null;
  const val = parseFloat(row[4]);
  return isNaN(val) ? null : val;
}

function celsiusToFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

class SSTService {
  private cache: Map<string, { data: SSTSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 3600 * 1000; // 1 hour (SST data updates daily)

  private resolveCoords(location: WeatherLocation): SSTLocation | null {
    return CITY_SST_COORDS[location.name] ?? null;
  }

  async getSignal(location: WeatherLocation): Promise<SSTSignal | null> {
    const coords = this.resolveCoords(location);
    if (!coords) return null;

    const cacheKey = location.name;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    try {
      const now = new Date();
      // Data has ~2 week lag; use 14 days ago for "current" and 21 days ago for trend baseline
      const currentDate = isoDate(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000));
      const baselineDate = isoDate(new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000));

      const [currentSST, baselineSST] = await Promise.all([
        fetchSST(currentDate, coords.lat, coords.lon360),
        fetchSST(baselineDate, coords.lat, coords.lon360),
      ]);

      if (currentSST === null) return null;

      const sstC = currentSST;
      const sstF = celsiusToFahrenheit(sstC);

      // Anomaly vs 7-day-prior baseline
      const sstAnomaly = baselineSST !== null ? Math.round((sstC - baselineSST) * 100) / 100 : 0;

      // Trend classification
      let trend: SSTSignal['trend'] = 'STABLE';
      if (sstAnomaly > 0.3) trend = 'WARMING';
      else if (sstAnomaly < -0.3) trend = 'COOLING';

      // Weather implications
      const implications: string[] = [];

      if (sstAnomaly > 1) {
        implications.push(
          `Warm SST anomaly (+${sstAnomaly.toFixed(1)}°C) — enhanced evaporation and moisture transport, elevated rain/storm risk, warmer coastal nights`
        );
      } else if (sstAnomaly < -1) {
        implications.push(
          `Cold SST anomaly (${sstAnomaly.toFixed(1)}°C) — strengthened marine layer, cooler coastal temps and increased fog risk`
        );
      }

      if (sstC > 28) {
        implications.push('Very warm SST — tropical convection and hurricane development potential');
      } else if (sstC < 10) {
        implications.push('Cold SST — persistent marine layer, suppressed convection, fog-prone coastal areas');
      }

      if (trend === 'WARMING') {
        implications.push('Upward SST trend — coastal moisture increasing over next few days');
      } else if (trend === 'COOLING') {
        implications.push('Downward SST trend — marine cooling signal may suppress coastal temps');
      }

      if (implications.length === 0) {
        implications.push(`SST ${sstC.toFixed(1)}°C — near-normal, minimal coastal weather impact`);
      }

      // Rough temperature impact on coastal air: SST anomaly drives ~20% air temp feedback near shore
      const temperatureImpactF = Math.round(sstAnomaly * (9 / 5) * 0.2 * 10) / 10;

      const signal: SSTSignal = {
        city: location.name,
        sstCelsius: Math.round(sstC * 100) / 100,
        sstFahrenheit: Math.round(sstF * 10) / 10,
        sstAnomaly,
        trend,
        weatherImplication: implications.join('; '),
        temperatureImpactF,
      };

      this.cache.set(cacheKey, { data: signal, fetchedAt: Date.now() });
      return signal;
    } catch (e) {
      console.error(`[SST] Signal error for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  async getAllSignals(): Promise<SSTSignal[]> {
    const signals: SSTSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      if (!this.resolveCoords(loc)) continue;
      const signal = await this.getSignal(loc);
      if (signal) signals.push(signal);
      await new Promise(r => setTimeout(r, 400));
    }
    return signals;
  }
}

export default SSTService;
