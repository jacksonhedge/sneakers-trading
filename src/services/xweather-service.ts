// Xweather Forecast Service
// Commercial weather API with high-precision forecasts — used as a second opinion alongside NOAA/Open-Meteo
// Sign up at https://signup.xweather.com/developer
// Set XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET in .env

import fetch from 'node-fetch';
import { TemperatureForecast, WeatherLocation, celsiusToFahrenheit } from './noaa-weather-service.js';

class XweatherService {
  private baseUrl = 'https://data.api.xweather.com';
  private clientId = process.env.XWEATHER_CLIENT_ID || '';
  private clientSecret = process.env.XWEATHER_CLIENT_SECRET || '';
  private forecastCache: Map<string, { data: any; fetchedAt: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000;

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  async fetchForecast(location: WeatherLocation, targetDate: string): Promise<TemperatureForecast | null> {
    if (!this.isConfigured()) return null;

    try {
      const cacheKey = `${location.lat},${location.lon}:${targetDate}`;
      const cached = this.forecastCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
        return this.parseForecast(cached.data, location, targetDate);
      }

      // Use hourly forecast for maximum precision
      const locationStr = `${location.lat},${location.lon}`;
      const url = `${this.baseUrl}/forecasts/${locationStr}?filter=1hr&limit=72&client_id=${this.clientId}&client_secret=${this.clientSecret}`;

      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!resp.ok) {
        if (resp.status !== 401) console.error(`[Xweather] API error: ${resp.status}`);
        return null;
      }

      const data = (await resp.json()) as any;
      this.forecastCache.set(cacheKey, { data, fetchedAt: Date.now() });
      return this.parseForecast(data, location, targetDate);
    } catch (e) {
      console.error(`[Xweather] Forecast failed for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  private parseForecast(data: any, location: WeatherLocation, targetDate: string): TemperatureForecast | null {
    const response = data.response?.[0] || data.response;
    if (!response) return null;

    const periods = response.periods || [];
    if (periods.length === 0) return null;

    const targetStart = new Date(targetDate + 'T00:00:00');
    const targetEnd = new Date(targetDate + 'T23:59:59');

    let highF: number | null = null;
    let lowF: number | null = null;
    const hourlyTemps: number[] = [];

    for (const p of periods) {
      const periodTime = new Date(p.dateTimeISO || p.timestamp * 1000);
      if (periodTime >= targetStart && periodTime <= targetEnd) {
        // Xweather returns tempF and tempC
        const tempF = p.tempF ?? (p.tempC != null ? celsiusToFahrenheit(p.tempC) : null);
        if (tempF == null) continue;

        hourlyTemps.push(tempF);

        // Use maxTempF if available (for daily intervals), otherwise use tempF
        const maxF = p.maxTempF ?? tempF;
        const minF = p.minTempF ?? tempF;

        if (highF === null || maxF > highF) highF = maxF;
        if (lowF === null || minF < lowF) lowF = minF;
      }
    }

    if (highF === null || hourlyTemps.length === 0) return null;
    if (lowF === null) lowF = highF - 10;

    const now = new Date();
    const targetMidday = new Date(targetDate + 'T12:00:00');
    const hoursUntil = Math.max(0, (targetMidday.getTime() - now.getTime()) / (1000 * 60 * 60));

    // Calculate spread from hourly temps as a measure of intra-day variability
    // Use this to estimate forecast uncertainty more precisely than a fixed scaling
    let stdDev: number;
    if (hourlyTemps.length >= 6) {
      const mean = hourlyTemps.reduce((s, t) => s + t, 0) / hourlyTemps.length;
      const variance = hourlyTemps.reduce((s, t) => s + (t - mean) ** 2, 0) / hourlyTemps.length;
      // Intra-day variability + base forecast uncertainty
      stdDev = Math.max(1.5, Math.sqrt(variance) * 0.3 + (hoursUntil < 12 ? 1.5 : hoursUntil < 24 ? 2.5 : 4.0));
    } else {
      stdDev = hoursUntil < 12 ? 1.5 : hoursUntil < 24 ? 3.0 : 5.0;
    }

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
  }
}

export default XweatherService;
