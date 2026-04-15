// Solar & Space Weather Service
// Tracks solar wind, geomagnetic activity, and UV index
// Solar wind speed >600 km/s correlates with jet stream amplification (3-7 day lead)
// Kp >= 5 correlates with blocking patterns and cold air outbreaks
// EPA UV index inversely correlates with cloud cover
// All endpoints: no auth required

import fetch from 'node-fetch';
import { WeatherLocation } from './noaa-weather-service.js';

export interface SolarWindData {
  timestamp: string;
  density: number;      // protons/cm³
  speed: number;        // km/s
  temperature: number;  // Kelvin
}

export interface GeomagneticData {
  timestamp: string;
  kpValue: number;      // 0-9 scale
  isStorm: boolean;     // Kp >= 5
}

export interface UVForecast {
  city: string;
  zipCode: string;
  hourlyUV: { hour: number; uv: number }[];
  maxUV: number;
  avgUV: number;
  cloudCoverProxy: number; // Estimated cloud cover from UV (100 - UV/maxPossible*100)
}

export interface SolarWeatherSignal {
  solarWindSpeed: number;      // km/s (current)
  solarWindTrend: 'CALM' | 'ELEVATED' | 'HIGH' | 'EXTREME';
  kpIndex: number;             // Current Kp
  geomagneticStorm: boolean;   // Kp >= 5
  jetStreamAmplification: boolean; // Solar wind >600 km/s
  coldOutbreakRisk: number;    // 0-100 based on Kp + solar wind
  description: string;
  leadTimeDays: number;        // How many days until jet stream effect
}

// City ZIP codes for EPA UV API
const CITY_ZIPS: Record<string, string> = {
  'NYC': '10001', 'Chicago': '60601', 'LA': '90001',
  'Miami': '33101', 'Denver': '80201',
};

class SolarWeatherService {
  private solarCache: { data: SolarWeatherSignal; fetchedAt: number } | null = null;
  private uvCache: Map<string, { data: UVForecast; fetchedAt: number }> = new Map();
  private cacheTTL = 30 * 60 * 1000; // 30 min
  private uvCacheTTL = 60 * 60 * 1000; // 1 hour

  // Fetch current solar wind plasma data
  async fetchSolarWind(): Promise<SolarWindData[]> {
    try {
      const resp = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json', {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return [];

      const data = (await resp.json()) as any[];
      // Skip header row
      return data.slice(1).map((row: any) => ({
        timestamp: row[0] || '',
        density: parseFloat(row[1]) || 0,
        speed: parseFloat(row[2]) || 0,
        temperature: parseFloat(row[3]) || 0,
      })).filter(d => d.speed > 0);
    } catch {
      return [];
    }
  }

  // Fetch current planetary K-index
  async fetchKpIndex(): Promise<GeomagneticData[]> {
    try {
      const resp = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return [];

      const data = (await resp.json()) as any[];
      return data.slice(1).map((row: any) => ({
        timestamp: row[0] || '',
        kpValue: parseFloat(row[1]) || 0,
        isStorm: parseFloat(row[1]) >= 5,
      }));
    } catch {
      return [];
    }
  }

  // Get overall solar weather signal
  async getSolarSignal(): Promise<SolarWeatherSignal> {
    if (this.solarCache && Date.now() - this.solarCache.fetchedAt < this.cacheTTL) {
      return this.solarCache.data;
    }

    const [solarWind, kpData] = await Promise.all([
      this.fetchSolarWind(),
      this.fetchKpIndex(),
    ]);

    // Get latest solar wind speed
    const latestWind = solarWind.length > 0 ? solarWind[solarWind.length - 1] : null;
    const currentSpeed = latestWind?.speed || 0;

    // Get latest Kp
    const latestKp = kpData.length > 0 ? kpData[kpData.length - 1] : null;
    const currentKp = latestKp?.kpValue || 0;

    // Classify solar wind
    let solarWindTrend: SolarWeatherSignal['solarWindTrend'] = 'CALM';
    if (currentSpeed > 800) solarWindTrend = 'EXTREME';
    else if (currentSpeed > 600) solarWindTrend = 'HIGH';
    else if (currentSpeed > 450) solarWindTrend = 'ELEVATED';

    const geomagneticStorm = currentKp >= 5;
    const jetStreamAmplification = currentSpeed > 600;

    // Cold outbreak risk (0-100)
    let coldOutbreakRisk = 0;
    if (currentKp >= 7 && currentSpeed > 700) coldOutbreakRisk = 80;
    else if (currentKp >= 5 && currentSpeed > 600) coldOutbreakRisk = 50;
    else if (currentKp >= 5 || currentSpeed > 600) coldOutbreakRisk = 30;
    else if (currentSpeed > 450) coldOutbreakRisk = 15;

    let description = `Solar wind: ${currentSpeed.toFixed(0)} km/s (${solarWindTrend}) | Kp: ${currentKp.toFixed(1)}`;
    if (geomagneticStorm) description += ' | GEOMAGNETIC STORM';
    if (jetStreamAmplification) description += ' | JET STREAM AMPLIFICATION LIKELY';

    const result: SolarWeatherSignal = {
      solarWindSpeed: Math.round(currentSpeed),
      solarWindTrend,
      kpIndex: currentKp,
      geomagneticStorm,
      jetStreamAmplification,
      coldOutbreakRisk,
      description,
      leadTimeDays: jetStreamAmplification ? 3 : 5,
    };

    this.solarCache = { data: result, fetchedAt: Date.now() };
    return result;
  }

  // Fetch UV index forecast for a city (US only)
  async getUVForecast(location: WeatherLocation): Promise<UVForecast | null> {
    const zip = CITY_ZIPS[location.name];
    if (!zip) return null;

    const cached = this.uvCache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.uvCacheTTL) return cached.data;

    try {
      const url = `https://data.epa.gov/efservice/getEnvirofactsUVHOURLY/ZIP/${zip}/JSON`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return null;

      const data = (await resp.json()) as any[];
      if (!Array.isArray(data) || data.length === 0) return null;

      const hourlyUV = data.map((d: any) => ({
        hour: parseInt(d.DATE_TIME?.split(' ')?.[1] || '0') || parseInt(d.ORDER || '0'),
        uv: parseFloat(d.UV_VALUE) || 0,
      }));

      const uvValues = hourlyUV.map(h => h.uv).filter(v => v > 0);
      const maxUV = uvValues.length > 0 ? Math.max(...uvValues) : 0;
      const avgUV = uvValues.length > 0 ? uvValues.reduce((s, v) => s + v, 0) / uvValues.length : 0;

      // Estimate cloud cover from UV — max possible UV at this latitude/time ~10-12
      const maxPossibleUV = 11;
      const cloudCoverProxy = Math.max(0, Math.min(100, Math.round((1 - maxUV / maxPossibleUV) * 100)));

      const result: UVForecast = {
        city: location.name,
        zipCode: zip,
        hourlyUV,
        maxUV: Math.round(maxUV * 10) / 10,
        avgUV: Math.round(avgUV * 10) / 10,
        cloudCoverProxy,
      };

      this.uvCache.set(location.name, { data: result, fetchedAt: Date.now() });
      return result;
    } catch {
      return null;
    }
  }
}

export default SolarWeatherService;
