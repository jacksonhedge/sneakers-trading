// NOAA/NWS Weather Forecast Service
// Fetches forecast data and converts to probability distributions for temperature markets

import fetch from 'node-fetch';

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
  tz: string;           // IANA timezone (e.g., 'America/New_York', 'Asia/Tokyo')
  nwsOffice?: string;
  gridX?: number;
  gridY?: number;
}

export interface TemperatureBucket {
  rangeLabel: string;
  rangeLowF: number;
  rangeHighF: number;
  probability: number;
}

export interface TemperatureForecast {
  location: WeatherLocation;
  targetDate: string;
  forecastTime: Date;
  hoursUntilTarget: number;
  pointForecastHighF: number;
  pointForecastLowF: number;
  modelSpreadF: number;
  temperatureDistribution: TemperatureBucket[];
}

// Supported cities mapped to coordinates
// IMPORTANT: Coordinates must match the exact Wunderground/resolution station
// that Polymarket uses, NOT the city center. Markets resolve at airport stations.
export const WEATHER_LOCATIONS: WeatherLocation[] = [
  { name: 'NYC', lat: 40.6413, lon: -73.7781, tz: 'America/New_York' },          // KJFK
  { name: 'Chicago', lat: 41.9742, lon: -87.9073, tz: 'America/Chicago' },       // KORD
  { name: 'LA', lat: 33.9425, lon: -118.4081, tz: 'America/Los_Angeles' },       // KLAX
  { name: 'Miami', lat: 25.7959, lon: -80.2870, tz: 'America/New_York' },        // KMIA
  { name: 'Denver', lat: 39.7017, lon: -104.7517, tz: 'America/Denver' },        // KBKF
  { name: 'London', lat: 51.5053, lon: 0.0553, tz: 'Europe/London' },            // EGLC
  { name: 'Tokyo', lat: 35.5533, lon: 139.7811, tz: 'Asia/Tokyo' },              // RJTT
  { name: 'Seoul', lat: 37.4692, lon: 126.4505, tz: 'Asia/Seoul' },              // RKSI
  { name: 'Hong Kong', lat: 22.3019, lon: 114.1742, tz: 'Asia/Hong_Kong' },      // HK Observatory
  { name: 'Shanghai', lat: 31.1434, lon: 121.8052, tz: 'Asia/Shanghai' },        // ZSPD
  { name: 'Mexico City', lat: 19.4363, lon: -99.0721, tz: 'America/Mexico_City' }, // MMMX
  { name: 'Wellington', lat: -41.3272, lon: 174.8053, tz: 'Pacific/Auckland' },   // NZWN
  { name: 'Beijing', lat: 40.0799, lon: 116.6031, tz: 'Asia/Shanghai' },         // ZBAA
  { name: 'Milan', lat: 45.6306, lon: 8.7231, tz: 'Europe/Rome' },               // LIMC
];

// Forecast uncertainty (std dev in °F) scales with hours until target
const UNCERTAINTY_SCALING: [number, number][] = [
  [0, 1.5],
  [6, 2.0],
  [12, 2.5],
  [24, 3.5],
  [48, 5.0],
  [72, 7.0],
  [120, 10.0],
];

// Convert a target date string (e.g., '2026-04-15') to local midnight boundaries
// for the given timezone. Returns UTC Date objects for filtering hourly forecasts.
export function localDateBounds(targetDate: string, tz: string): { start: Date; end: Date } {
  // Build a date string in the target timezone, then convert to UTC
  // e.g., '2026-04-15' in 'Asia/Tokyo' → 2026-04-14T15:00:00Z to 2026-04-15T14:59:59Z
  const startLocal = new Date(new Date(targetDate + 'T00:00:00').toLocaleString('en-US', { timeZone: tz }));
  const endLocal = new Date(new Date(targetDate + 'T23:59:59').toLocaleString('en-US', { timeZone: tz }));

  // More reliable approach: compute UTC offset for this date in this timezone
  const refDate = new Date(targetDate + 'T12:00:00Z'); // noon UTC as reference
  const localStr = refDate.toLocaleString('en-US', { timeZone: tz, hour12: false });
  const localRef = new Date(localStr);
  const offsetMs = localRef.getTime() - refDate.getTime();

  const start = new Date(new Date(targetDate + 'T00:00:00Z').getTime() - offsetMs);
  const end = new Date(new Date(targetDate + 'T23:59:59Z').getTime() - offsetMs);

  return { start, end };
}

// Normal distribution CDF approximation (Abramowitz & Stegun)
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

function getUncertainty(hoursOut: number): number {
  for (let i = UNCERTAINTY_SCALING.length - 1; i >= 0; i--) {
    if (hoursOut >= UNCERTAINTY_SCALING[i][0]) {
      if (i === UNCERTAINTY_SCALING.length - 1) return UNCERTAINTY_SCALING[i][1];
      const [h0, s0] = UNCERTAINTY_SCALING[i];
      const [h1, s1] = UNCERTAINTY_SCALING[i + 1];
      const frac = (hoursOut - h0) / (h1 - h0);
      return s0 + frac * (s1 - s0);
    }
  }
  return UNCERTAINTY_SCALING[0][1];
}

export function celsiusToFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * 5 / 9;
}

export function buildTemperatureDistribution(
  meanF: number,
  stdDevF: number,
  buckets: { label: string; lowF: number; highF: number }[]
): TemperatureBucket[] {
  return buckets.map(b => {
    const lowZ = (b.lowF - meanF) / stdDevF;
    const highZ = (b.highF - meanF) / stdDevF;
    const prob = normalCDF(highZ) - normalCDF(lowZ);
    return {
      rangeLabel: b.label,
      rangeLowF: b.lowF,
      rangeHighF: b.highF,
      probability: Math.max(0, Math.min(1, prob)),
    };
  });
}

class NOAAWeatherService {
  private baseUrl = 'https://api.weather.gov';
  private userAgent = 'SneakersTradingBot/1.0 (weather-arbitrage)';
  private locationCache: Map<string, { office: string; gridX: number; gridY: number }> = new Map();
  private forecastCache: Map<string, { data: any; fetchedAt: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  async resolveLocation(location: WeatherLocation): Promise<WeatherLocation> {
    const key = `${location.lat},${location.lon}`;
    if (this.locationCache.has(key)) {
      const cached = this.locationCache.get(key)!;
      return { ...location, nwsOffice: cached.office, gridX: cached.gridX, gridY: cached.gridY };
    }

    const resp = await fetch(`${this.baseUrl}/points/${location.lat},${location.lon}`, {
      headers: { 'User-Agent': this.userAgent, Accept: 'application/geo+json' },
    });

    if (!resp.ok) {
      // NWS only covers US locations
      throw new Error(`NWS point lookup failed for ${location.name}: ${resp.status}`);
    }

    const data = (await resp.json()) as any;
    const props = data.properties;
    const resolved = {
      office: props.gridId,
      gridX: props.gridX,
      gridY: props.gridY,
    };
    this.locationCache.set(key, resolved);
    return { ...location, nwsOffice: resolved.office, gridX: resolved.gridX, gridY: resolved.gridY };
  }

  async fetchForecast(location: WeatherLocation, targetDate: string): Promise<TemperatureForecast | null> {
    try {
      const resolved = await this.resolveLocation(location);
      if (!resolved.nwsOffice) return null;

      const cacheKey = `${resolved.nwsOffice}/${resolved.gridX}/${resolved.gridY}`;
      let forecastData: any;

      const cached = this.forecastCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
        forecastData = cached.data;
      } else {
        const resp = await fetch(
          `${this.baseUrl}/gridpoints/${resolved.nwsOffice}/${resolved.gridX},${resolved.gridY}/forecast`,
          { headers: { 'User-Agent': this.userAgent, Accept: 'application/geo+json' } }
        );
        if (!resp.ok) return null;
        forecastData = await resp.json();
        this.forecastCache.set(cacheKey, { data: forecastData, fetchedAt: Date.now() });
      }

      const periods = (forecastData as any).properties?.periods || [];

      // Find matching day/night periods for target date (using local timezone)
      const { start: targetStart, end: targetEnd } = localDateBounds(targetDate, location.tz);

      let highF: number | null = null;
      let lowF: number | null = null;

      for (const p of periods) {
        const periodStart = new Date(p.startTime);
        if (periodStart >= targetStart && periodStart <= targetEnd) {
          if (p.isDaytime && (highF === null || p.temperature > highF)) {
            highF = p.temperature;
          }
          if (!p.isDaytime && (lowF === null || p.temperature < lowF)) {
            lowF = p.temperature;
          }
        }
      }

      // If we didn't find day/night split, use any matching period
      if (highF === null) {
        for (const p of periods) {
          const periodStart = new Date(p.startTime);
          if (periodStart >= targetStart && periodStart <= targetEnd) {
            if (highF === null || p.temperature > (highF as number)) highF = p.temperature;
            if (lowF === null || p.temperature < (lowF as number)) lowF = p.temperature;
          }
        }
      }

      if (highF === null) return null;
      if (lowF === null) lowF = highF - 10; // rough estimate if only daytime available

      const now = new Date();
      const targetMidnight = new Date(targetDate + 'T12:00:00');
      const hoursUntil = Math.max(0, (targetMidnight.getTime() - now.getTime()) / (1000 * 60 * 60));
      const stdDev = getUncertainty(hoursUntil);

      return {
        location: resolved,
        targetDate,
        forecastTime: now,
        hoursUntilTarget: hoursUntil,
        pointForecastHighF: highF,
        pointForecastLowF: lowF,
        modelSpreadF: stdDev,
        temperatureDistribution: [], // Populated when matched with market buckets
      };
    } catch (e) {
      console.error(`[NOAA] Forecast fetch failed for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  // Fetch hourly forecast for more granular data
  async fetchHourlyForecast(location: WeatherLocation, targetDate: string): Promise<TemperatureForecast | null> {
    try {
      const resolved = await this.resolveLocation(location);
      if (!resolved.nwsOffice) return null;

      const resp = await fetch(
        `${this.baseUrl}/gridpoints/${resolved.nwsOffice}/${resolved.gridX},${resolved.gridY}/forecast/hourly`,
        { headers: { 'User-Agent': this.userAgent, Accept: 'application/geo+json' } }
      );
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const periods = data.properties?.periods || [];

      const { start: targetStart, end: targetEnd } = localDateBounds(targetDate, location.tz);

      let highF: number | null = null;
      let lowF: number | null = null;
      const hourlyTemps: number[] = [];

      for (const p of periods) {
        const pStart = new Date(p.startTime);
        if (pStart >= targetStart && pStart <= targetEnd) {
          hourlyTemps.push(p.temperature);
          if (highF === null || p.temperature > highF) highF = p.temperature;
          if (lowF === null || p.temperature < lowF) lowF = p.temperature;
        }
      }

      if (highF === null || hourlyTemps.length === 0) return null;

      const now = new Date();
      const targetMidnight = new Date(targetDate + 'T12:00:00');
      const hoursUntil = Math.max(0, (targetMidnight.getTime() - now.getTime()) / (1000 * 60 * 60));

      // Use actual hourly spread if available, otherwise fallback to scaling
      let stdDev: number;
      if (hourlyTemps.length >= 4) {
        // Intra-day spread as additional uncertainty signal
        const range = highF! - lowF!;
        stdDev = Math.max(getUncertainty(hoursUntil), range * 0.15);
      } else {
        stdDev = getUncertainty(hoursUntil);
      }

      return {
        location: resolved,
        targetDate,
        forecastTime: now,
        hoursUntilTarget: hoursUntil,
        pointForecastHighF: highF!,
        pointForecastLowF: lowF!,
        modelSpreadF: stdDev,
        temperatureDistribution: [],
      };
    } catch (e) {
      console.error(`[NOAA] Hourly forecast failed for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  // For non-US locations, use Open-Meteo (free, no key required)
  async fetchOpenMeteoForecast(location: WeatherLocation, targetDate: string): Promise<TemperatureForecast | null> {
    try {
      const tz = encodeURIComponent(location.tz);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=temperature_2m_max,temperature_2m_min&timezone=${tz}&start_date=${targetDate}&end_date=${targetDate}&temperature_unit=fahrenheit`;

      const resp = await fetch(url);
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const daily = data.daily;
      if (!daily || !daily.temperature_2m_max || daily.temperature_2m_max.length === 0) return null;

      const highF = daily.temperature_2m_max[0];
      const lowF = daily.temperature_2m_min[0];

      const now = new Date();
      const targetMidnight = new Date(targetDate + 'T12:00:00');
      const hoursUntil = Math.max(0, (targetMidnight.getTime() - now.getTime()) / (1000 * 60 * 60));
      const stdDev = getUncertainty(hoursUntil);

      return {
        location,
        targetDate,
        forecastTime: now,
        hoursUntilTarget: hoursUntil,
        pointForecastHighF: highF,
        pointForecastLowF: lowF,
        modelSpreadF: stdDev,
        temperatureDistribution: [],
      };
    } catch (e) {
      console.error(`[OpenMeteo] Forecast failed for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  // Smart fetch: NWS for US cities, Open-Meteo for international
  async fetchBestForecast(location: WeatherLocation, targetDate: string): Promise<TemperatureForecast | null> {
    const isUS = location.lat > 24 && location.lat < 50 && location.lon > -125 && location.lon < -66;

    if (isUS) {
      // Try hourly first (more precise), fall back to daily
      const hourly = await this.fetchHourlyForecast(location, targetDate);
      if (hourly) return hourly;
      const daily = await this.fetchForecast(location, targetDate);
      if (daily) return daily;
    }

    return this.fetchOpenMeteoForecast(location, targetDate);
  }
}

export default NOAAWeatherService;
