// Tomorrow.io Weather API Service
// Higher-resolution forecasts with proprietary nowcasting model
// Provides: minute-level precipitation, air quality, pollen, cloud ceiling
// Free tier: 500 req/day, 25 req/hour

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface TomorrowRealtime {
  city: string;
  temperature: number;        // Celsius
  temperatureF: number;
  temperatureApparent: number; // Feels-like °C
  temperatureApparentF: number;
  humidity: number;
  windSpeed: number;          // m/s
  windSpeedMph: number;
  windDirection: number;
  windGust: number;
  pressure: number;           // hPa
  precipitationProbability: number;
  precipitationIntensity: number; // mm/hr
  cloudCover: number;
  cloudBase: number | null;   // km
  cloudCeiling: number | null; // km
  uvIndex: number;
  visibility: number;         // km
  dewPoint: number;
  weatherCode: number;
  fetchedAt: Date;
}

export interface TomorrowHourly {
  time: string;
  temperatureF: number;
  precipitationProbability: number;
  precipitationIntensity: number;
  cloudCover: number;
  windSpeedMph: number;
  weatherCode: number;
}

export interface TomorrowForecast {
  city: string;
  current: TomorrowRealtime | null;
  hourly: TomorrowHourly[];
  tempHighF: number;
  tempLowF: number;
  maxPrecipProb: number;
  avgCloudCover: number;
  divergenceFromOpenMeteoF: number; // Comparison with our multi-model estimate
}

const getTomorrowKey = () => process.env.TOMORROW_API_KEY || '';
const TOMORROW_BASE = 'https://api.tomorrow.io/v4';

// Tomorrow.io weather codes to descriptions
const WEATHER_CODES: Record<number, string> = {
  0: 'Unknown', 1000: 'Clear', 1100: 'Mostly Clear', 1101: 'Partly Cloudy',
  1102: 'Mostly Cloudy', 1001: 'Cloudy', 2000: 'Fog', 2100: 'Light Fog',
  4000: 'Drizzle', 4001: 'Rain', 4200: 'Light Rain', 4201: 'Heavy Rain',
  5000: 'Snow', 5001: 'Flurries', 5100: 'Light Snow', 5101: 'Heavy Snow',
  6000: 'Freezing Drizzle', 6001: 'Freezing Rain', 6200: 'Light Freezing Rain',
  6201: 'Heavy Freezing Rain', 7000: 'Ice Pellets', 7101: 'Heavy Ice Pellets',
  7102: 'Light Ice Pellets', 8000: 'Thunderstorm',
};

function cToF(c: number): number { return Math.round((c * 9 / 5 + 32) * 10) / 10; }
function msToMph(ms: number): number { return Math.round(ms * 2.237 * 10) / 10; }

class TomorrowService {
  private cache: Map<string, { data: TomorrowForecast; fetchedAt: number }> = new Map();
  private cacheTTL = 15 * 60 * 1000; // 15 min
  private requestCount = 0;
  private requestResetTime = Date.now();
  private hourlyRequestCount = 0;
  private hourlyResetTime = Date.now();

  private canMakeRequest(): boolean {
    const now = Date.now();

    // Reset hourly counter
    if (now - this.hourlyResetTime > 3600000) {
      this.hourlyRequestCount = 0;
      this.hourlyResetTime = now;
    }
    // Reset daily counter
    if (now - this.requestResetTime > 86400000) {
      this.requestCount = 0;
      this.requestResetTime = now;
    }

    return this.requestCount < 450 && this.hourlyRequestCount < 22;
  }

  private async tomorrowFetch(endpoint: string): Promise<any> {
    if (!getTomorrowKey()) return null;
    if (!this.canMakeRequest()) return null;

    this.requestCount++;
    this.hourlyRequestCount++;

    const separator = endpoint.includes('?') ? '&' : '?';
    const resp = await fetch(`${TOMORROW_BASE}${endpoint}${separator}apikey=${getTomorrowKey()}`, {
      headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      timeout: 10000,
    } as any);

    if (!resp.ok) {
      if (resp.status === 429) {
        console.warn('[Tomorrow.io] Rate limited');
        this.hourlyRequestCount = 25;
      }
      return null;
    }

    return resp.json();
  }

  // Fetch current conditions
  async getRealtime(location: WeatherLocation): Promise<TomorrowRealtime | null> {
    const data = await this.tomorrowFetch(
      `/weather/realtime?location=${location.lat},${location.lon}&units=metric`
    );
    if (!data?.data?.values) return null;

    const v = data.data.values;
    return {
      city: location.name,
      temperature: v.temperature ?? 0,
      temperatureF: cToF(v.temperature ?? 0),
      temperatureApparent: v.temperatureApparent ?? v.temperature ?? 0,
      temperatureApparentF: cToF(v.temperatureApparent ?? v.temperature ?? 0),
      humidity: v.humidity ?? 0,
      windSpeed: v.windSpeed ?? 0,
      windSpeedMph: msToMph(v.windSpeed ?? 0),
      windDirection: v.windDirection ?? 0,
      windGust: v.windGust ?? 0,
      pressure: v.pressureSurfaceLevel ?? 0,
      precipitationProbability: v.precipitationProbability ?? 0,
      precipitationIntensity: v.precipitationIntensity ?? 0,
      cloudCover: v.cloudCover ?? 0,
      cloudBase: v.cloudBase ?? null,
      cloudCeiling: v.cloudCeiling ?? null,
      uvIndex: v.uvIndex ?? 0,
      visibility: v.visibility ?? 0,
      dewPoint: v.dewPoint ?? 0,
      weatherCode: v.weatherCode ?? 0,
      fetchedAt: new Date(),
    };
  }

  // Fetch hourly forecast
  async getHourlyForecast(location: WeatherLocation): Promise<TomorrowHourly[]> {
    const data = await this.tomorrowFetch(
      `/weather/forecast?location=${location.lat},${location.lon}&units=metric&timesteps=1h`
    );
    if (!data?.timelines?.hourly) return [];

    return data.timelines.hourly.slice(0, 24).map((h: any) => ({
      time: h.time || '',
      temperatureF: cToF(h.values?.temperature ?? 0),
      precipitationProbability: h.values?.precipitationProbability ?? 0,
      precipitationIntensity: h.values?.precipitationIntensity ?? 0,
      cloudCover: h.values?.cloudCover ?? 0,
      windSpeedMph: msToMph(h.values?.windSpeed ?? 0),
      weatherCode: h.values?.weatherCode ?? 0,
    }));
  }

  // Full forecast for a city
  async getForecast(location: WeatherLocation): Promise<TomorrowForecast> {
    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    if (!getTomorrowKey()) {
      const noKey: TomorrowForecast = {
        city: location.name, current: null, hourly: [],
        tempHighF: 0, tempLowF: 0, maxPrecipProb: 0, avgCloudCover: 0,
        divergenceFromOpenMeteoF: 0,
      };
      return noKey;
    }

    const [current, hourly] = await Promise.all([
      this.getRealtime(location),
      this.getHourlyForecast(location),
    ]);

    const temps = hourly.map(h => h.temperatureF);
    const tempHighF = temps.length > 0 ? Math.max(...temps) : (current?.temperatureF ?? 0);
    const tempLowF = temps.length > 0 ? Math.min(...temps) : (current?.temperatureF ?? 0);
    const maxPrecipProb = hourly.length > 0 ? Math.max(...hourly.map(h => h.precipitationProbability)) : 0;
    const avgCloudCover = hourly.length > 0 ? hourly.reduce((s, h) => s + h.cloudCover, 0) / hourly.length : 0;

    const result: TomorrowForecast = {
      city: location.name,
      current,
      hourly,
      tempHighF,
      tempLowF,
      maxPrecipProb,
      avgCloudCover: Math.round(avgCloudCover),
      divergenceFromOpenMeteoF: 0, // Set externally when comparing
    };

    this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Get forecasts for all monitored cities (rate-limit aware)
  async getAllForecasts(): Promise<TomorrowForecast[]> {
    const forecasts: TomorrowForecast[] = [];

    for (const loc of WEATHER_LOCATIONS) {
      if (!this.canMakeRequest()) {
        forecasts.push({
          city: loc.name, current: null, hourly: [],
          tempHighF: 0, tempLowF: 0, maxPrecipProb: 0, avgCloudCover: 0,
          divergenceFromOpenMeteoF: 0,
        });
        continue;
      }

      try {
        const forecast = await this.getForecast(loc);
        forecasts.push(forecast);
        await new Promise(r => setTimeout(r, 500)); // Rate limit spacing
      } catch {
        forecasts.push({
          city: loc.name, current: null, hourly: [],
          tempHighF: 0, tempLowF: 0, maxPrecipProb: 0, avgCloudCover: 0,
          divergenceFromOpenMeteoF: 0,
        });
      }
    }

    return forecasts;
  }

  hasApiKey(): boolean {
    return !!getTomorrowKey();
  }

  getWeatherDescription(code: number): string {
    return WEATHER_CODES[code] || `Code ${code}`;
  }

  getRemainingRequests(): { daily: number; hourly: number } {
    return {
      daily: Math.max(0, 450 - this.requestCount),
      hourly: Math.max(0, 22 - this.hourlyRequestCount),
    };
  }
}

export default TomorrowService;
