// NOAA CO-OPS Tidal Service
// Real-time water levels, air pressure, wind, and water temperature from NOAA tide stations
// Storm surge = observed water level minus predicted astronomical tide
// Barometric pressure from tide stations is ground-truth surface data
// No auth required

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface TidalWeatherSignal {
  city: string;
  stationId: string;
  stationName: string;
  waterLevel: number;         // ft MLLW (observed)
  predictedTide: number;      // ft MLLW (astronomical prediction)
  surgeFt: number;            // observed minus predicted
  surgeAlert: 'NONE' | 'MINOR' | 'MODERATE' | 'MAJOR';
  airPressure: number;        // hPa
  pressureTrend: 'FALLING' | 'STABLE' | 'RISING';
  windSpeed: number;          // mph
  windDirection: number;      // degrees
  waterTemp: number;          // °F
  weatherImplication: string;
  temperatureImpactF: number; // estimated °F impact on air temp from water proximity
}

// Coastal city → NOAA CO-OPS station mapping
const CITY_STATIONS: Record<string, { id: string; name: string }> = {
  'NYC':    { id: '8518750', name: 'The Battery, NY' },
  'Miami':  { id: '8723214', name: 'Virginia Key, FL' },
  'LA':     { id: '9410660', name: 'Los Angeles, CA' },
  'Boston': { id: '8443970', name: 'Boston, MA' },
};

// San Francisco is in WEATHER_LOCATIONS as part of the broader set — handle by name alias
const SF_STATION = { id: '9414290', name: 'San Francisco, CA' };

const BASE_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const APP_NAME = 'SneakersWeather';

function buildUrl(stationId: string, product: string, extraParams: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    date: 'latest',
    station: stationId,
    product,
    datum: 'MLLW',
    units: 'english',
    time_zone: 'gmt',
    application: APP_NAME,
    format: 'json',
    ...extraParams,
  });
  return `${BASE_URL}?${params.toString()}`;
}

function buildPredictionsUrl(stationId: string, beginDate: string, endDate: string): string {
  const params = new URLSearchParams({
    begin_date: beginDate,
    end_date: endDate,
    station: stationId,
    product: 'predictions',
    datum: 'MLLW',
    units: 'english',
    time_zone: 'gmt',
    application: APP_NAME,
    format: 'json',
    interval: 'h',
  });
  return `${BASE_URL}?${params.toString()}`;
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Extract the most recent value from a CO-OPS response
function parseLatestValue(data: any, field = 'v'): number | null {
  const readings = data?.data;
  if (!Array.isArray(readings) || readings.length === 0) return null;
  const last = readings[readings.length - 1];
  const val = parseFloat(last?.[field]);
  return isNaN(val) ? null : val;
}

// For wind, direction is 'd' and speed is 's'
function parseWindReading(data: any): { speed: number; direction: number } | null {
  const readings = data?.data;
  if (!Array.isArray(readings) || readings.length === 0) return null;
  const last = readings[readings.length - 1];
  const speed = parseFloat(last?.s);
  const direction = parseFloat(last?.d);
  if (isNaN(speed) || isNaN(direction)) return null;
  return { speed, direction };
}

// Find the closest prediction to right now from the hourly predictions response
function findClosestPrediction(data: any): number | null {
  const predictions = data?.predictions;
  if (!Array.isArray(predictions) || predictions.length === 0) return null;

  const now = Date.now();
  let closest: { diff: number; val: number } | null = null;

  for (const p of predictions) {
    const t = new Date(p.t + ' GMT').getTime();
    const diff = Math.abs(t - now);
    const val = parseFloat(p.v);
    if (!isNaN(val) && (closest === null || diff < closest.diff)) {
      closest = { diff, val };
    }
  }

  return closest ? closest.val : null;
}

// Derive a simple pressure trend by comparing first and last readings in the latest batch
function derivePressureTrend(data: any): 'FALLING' | 'STABLE' | 'RISING' {
  const readings = data?.data;
  if (!Array.isArray(readings) || readings.length < 2) return 'STABLE';
  const first = parseFloat(readings[0]?.v);
  const last = parseFloat(readings[readings.length - 1]?.v);
  if (isNaN(first) || isNaN(last)) return 'STABLE';
  const delta = last - first;
  if (delta <= -0.5) return 'FALLING';
  if (delta >= 0.5) return 'RISING';
  return 'STABLE';
}

class TidalService {
  private cache: Map<string, { data: TidalWeatherSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 120 * 1000; // 120 seconds

  private resolveStation(location: WeatherLocation): { id: string; name: string } | null {
    // Direct match
    if (CITY_STATIONS[location.name]) return CITY_STATIONS[location.name];
    // Fuzzy: San Francisco
    if (location.name.toLowerCase().includes('san francisco') || location.name === 'SF') return SF_STATION;
    return null;
  }

  async getSignal(location: WeatherLocation): Promise<TidalWeatherSignal | null> {
    const station = this.resolveStation(location);
    if (!station) return null;

    const cacheKey = location.name;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    try {
      // Fetch water_level, air_pressure, wind, water_temperature in parallel
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const beginDate = yyyymmdd(yesterday);
      const endDate = yyyymmdd(today);

      const [waterLevelResp, airPressureResp, windResp, waterTempResp, predictionsResp] = await Promise.allSettled([
        fetch(buildUrl(station.id, 'water_level'), { headers: { 'User-Agent': 'SneakersWeatherBot/1.0' }, timeout: 10000 } as any),
        fetch(buildUrl(station.id, 'air_pressure'), { headers: { 'User-Agent': 'SneakersWeatherBot/1.0' }, timeout: 10000 } as any),
        fetch(buildUrl(station.id, 'wind'),         { headers: { 'User-Agent': 'SneakersWeatherBot/1.0' }, timeout: 10000 } as any),
        fetch(buildUrl(station.id, 'water_temperature'), { headers: { 'User-Agent': 'SneakersWeatherBot/1.0' }, timeout: 10000 } as any),
        fetch(buildPredictionsUrl(station.id, beginDate, endDate), { headers: { 'User-Agent': 'SneakersWeatherBot/1.0' }, timeout: 10000 } as any),
      ]);

      const parseJson = async (result: PromiseSettledResult<any>): Promise<any> => {
        if (result.status !== 'fulfilled' || !result.value?.ok) return null;
        try { return await result.value.json(); } catch { return null; }
      };

      const [wlData, apData, windData, wtData, predData] = await Promise.all([
        parseJson(waterLevelResp),
        parseJson(airPressureResp),
        parseJson(windResp),
        parseJson(waterTempResp),
        parseJson(predictionsResp),
      ]);

      const waterLevel = parseLatestValue(wlData) ?? NaN;
      const airPressure = parseLatestValue(apData) ?? NaN;
      const windReading = parseWindReading(windData);
      const waterTemp = parseLatestValue(wtData) ?? NaN;
      const predictedTide = findClosestPrediction(predData) ?? NaN;

      // Require at minimum water level to return a signal
      if (isNaN(waterLevel)) return null;

      const surgeFt = !isNaN(predictedTide) ? waterLevel - predictedTide : 0;

      let surgeAlert: TidalWeatherSignal['surgeAlert'] = 'NONE';
      const absSurge = Math.abs(surgeFt);
      if (absSurge > 2) surgeAlert = 'MAJOR';
      else if (absSurge > 1) surgeAlert = 'MODERATE';
      else if (absSurge > 0.5) surgeAlert = 'MINOR';

      const pressureTrend = derivePressureTrend(apData);

      // Weather implication narrative
      const implications: string[] = [];
      if (surgeAlert === 'MAJOR') implications.push('MAJOR storm surge — significant coastal flooding risk');
      else if (surgeAlert === 'MODERATE') implications.push('Moderate storm surge — coastal flooding possible');
      else if (surgeAlert === 'MINOR') implications.push('Minor storm surge — low-lying flooding possible');

      if (!isNaN(airPressure)) {
        if (airPressure < 1000) implications.push(`Low pressure (${airPressure.toFixed(1)} hPa) — storm conditions`);
        else if (airPressure > 1020) implications.push(`High pressure (${airPressure.toFixed(1)} hPa) — fair weather`);
        if (pressureTrend === 'FALLING') implications.push('Pressure falling — deteriorating conditions');
        else if (pressureTrend === 'RISING') implications.push('Pressure rising — improving conditions');
      }

      // Water temp effect: warm water heats coastal air, cold water cools it and promotes marine layer
      let temperatureImpactF = 0;
      if (!isNaN(waterTemp)) {
        // Typical sea surface ~55°F for LA/SF, ~70°F Miami, ~50°F NYC in spring
        // Anomaly from seasonal norm affects coastal air by ~20% of water-air delta
        const seasonalNorm = location.name === 'Miami' ? 76 : location.name === 'LA' ? 62 : 54;
        const waterAnomaly = waterTemp - seasonalNorm;
        temperatureImpactF = Math.round(waterAnomaly * 0.2 * 10) / 10;
        if (waterTemp < 50) implications.push('Cold water — marine layer / fog risk, cooler coastal temps');
        else if (waterTemp > 75) implications.push('Warm water — enhanced moisture transport, warmer nights');
      }

      if (implications.length === 0) implications.push('Normal tidal conditions');

      const signal: TidalWeatherSignal = {
        city: location.name,
        stationId: station.id,
        stationName: station.name,
        waterLevel: Math.round(waterLevel * 100) / 100,
        predictedTide: isNaN(predictedTide) ? 0 : Math.round(predictedTide * 100) / 100,
        surgeFt: Math.round(surgeFt * 100) / 100,
        surgeAlert,
        airPressure: isNaN(airPressure) ? 0 : Math.round(airPressure * 10) / 10,
        pressureTrend,
        windSpeed: windReading ? Math.round(windReading.speed * 10) / 10 : 0,
        windDirection: windReading ? Math.round(windReading.direction) : 0,
        waterTemp: isNaN(waterTemp) ? 0 : Math.round(waterTemp * 10) / 10,
        weatherImplication: implications.join('; '),
        temperatureImpactF,
      };

      this.cache.set(cacheKey, { data: signal, fetchedAt: Date.now() });
      return signal;
    } catch (e) {
      console.error(`[Tidal] Fetch error for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  async getAllSignals(): Promise<TidalWeatherSignal[]> {
    const signals: TidalWeatherSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      if (!this.resolveStation(loc)) continue;
      const signal = await this.getSignal(loc);
      if (signal) signals.push(signal);
      await new Promise(r => setTimeout(r, 300));
    }
    return signals;
  }
}

export default TidalService;
