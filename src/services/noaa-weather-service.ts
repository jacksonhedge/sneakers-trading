// NOAA/NWS Weather Forecast Service
// Fetches forecast data and converts to probability distributions for temperature markets

import fetch from 'node-fetch';

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
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
export const WEATHER_LOCATIONS: WeatherLocation[] = [
  { name: 'NYC', lat: 40.7128, lon: -74.006 },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298 },
  { name: 'LA', lat: 34.0522, lon: -118.2437 },
  { name: 'Miami', lat: 25.7617, lon: -80.1918 },
  { name: 'Denver', lat: 39.7392, lon: -104.9903 },
  { name: 'London', lat: 51.5074, lon: -0.1278 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Seoul', lat: 37.5665, lon: 126.978 },
  { name: 'Hong Kong', lat: 22.3193, lon: 114.1694 },
  { name: 'Shanghai', lat: 31.2304, lon: 121.4737 },
  { name: 'Mexico City', lat: 19.4326, lon: -99.1332 },
  { name: 'Wellington', lat: -41.2865, lon: 174.7762 },
  { name: 'Beijing', lat: 39.9042, lon: 116.4074 },
  { name: 'Milan', lat: 45.4642, lon: 9.19 },
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

      // Find matching day/night periods for target date
      const targetStart = new Date(targetDate + 'T00:00:00');
      const targetEnd = new Date(targetDate + 'T23:59:59');

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

      const targetStart = new Date(targetDate + 'T00:00:00');
      const targetEnd = new Date(targetDate + 'T23:59:59');

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
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${targetDate}&end_date=${targetDate}&temperature_unit=fahrenheit`;

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
