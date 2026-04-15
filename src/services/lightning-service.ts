// Lightning & Severe Weather Service
// NWS alerts (US) + Open-Meteo weather codes for storm detection globally

import fetch from 'node-fetch';
import { WeatherLocation } from './noaa-weather-service.js';

export interface WeatherAlert {
  type: 'THUNDERSTORM' | 'SEVERE' | 'TORNADO' | 'FLOOD' | 'HEAT' | 'COLD' | 'WIND';
  headline: string;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE' | 'EXTREME';
  onset: Date;
  expires: Date;
  area: string;
  source: string;
}

export interface StormStatus {
  location: string;
  hasActiveAlerts: boolean;
  alerts: WeatherAlert[];
  stormRisk: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  thunderstormProb: number;
  weatherCode: number;
  weatherDescription: string;
  tempImpact: 'COOLING' | 'WARMING' | 'NEUTRAL';
  estimatedTempImpactF: number;
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

class LightningService {
  private cache: Map<string, { data: StormStatus; fetchedAt: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000;

  async getStormStatus(location: WeatherLocation): Promise<StormStatus> {
    const key = location.name;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const alerts: WeatherAlert[] = [];
    let weatherCode = 0;
    let stormCodes: number[] = [];

    // Fetch NWS alerts for US cities
    const isUS = location.lon >= -130 && location.lon <= -60;
    if (isUS) {
      try {
        const resp = await fetch(
          `https://api.weather.gov/alerts/active?point=${location.lat},${location.lon}`,
          { headers: { 'User-Agent': 'SneakersWeatherBot/1.0', Accept: 'application/geo+json' } }
        );
        if (resp.ok) {
          const data = (await resp.json()) as any;
          for (const f of (data.features || [])) {
            const p = f.properties;
            if (!p) continue;

            const eventLower = (p.event || '').toLowerCase();
            let type: WeatherAlert['type'] = 'WIND';
            if (eventLower.includes('thunderstorm') || eventLower.includes('lightning')) type = 'THUNDERSTORM';
            else if (eventLower.includes('tornado')) type = 'TORNADO';
            else if (eventLower.includes('flood')) type = 'FLOOD';
            else if (eventLower.includes('heat') || eventLower.includes('excessive')) type = 'HEAT';
            else if (eventLower.includes('cold') || eventLower.includes('freeze') || eventLower.includes('chill')) type = 'COLD';
            else if (eventLower.includes('severe')) type = 'SEVERE';

            const sevMap: Record<string, WeatherAlert['severity']> = {
              'Minor': 'MINOR', 'Moderate': 'MODERATE', 'Severe': 'SEVERE', 'Extreme': 'EXTREME',
            };

            alerts.push({
              type,
              headline: p.headline || p.event || '',
              severity: sevMap[p.severity] || 'MINOR',
              onset: new Date(p.onset || p.effective || Date.now()),
              expires: new Date(p.expires || p.ends || Date.now() + 3600000),
              area: p.areaDesc || '',
              source: 'NWS',
            });
          }
        }
      } catch { /* NWS API can be flaky */ }
    }

    // Fetch Open-Meteo weather codes (works globally)
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=weather_code&hourly=weather_code&timezone=auto&forecast_hours=6`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        weatherCode = data.current?.weather_code ?? 0;
        stormCodes = (data.hourly?.weather_code || []).filter((c: number) => c >= 95);
      }
    } catch { /* non-critical */ }

    // Assess storm risk
    const hasThunderstorm = weatherCode >= 95 || alerts.some(a => a.type === 'THUNDERSTORM');
    const hasSevere = alerts.some(a => a.severity === 'SEVERE' || a.severity === 'EXTREME');
    const futureStorms = stormCodes.length;

    let stormRisk: StormStatus['stormRisk'] = 'NONE';
    if (hasSevere || weatherCode >= 99) stormRisk = 'EXTREME';
    else if (hasThunderstorm) stormRisk = 'HIGH';
    else if (futureStorms > 0) stormRisk = 'MODERATE';
    else if (weatherCode >= 80) stormRisk = 'LOW';

    const thunderstormProb = hasThunderstorm ? 90 :
      futureStorms >= 3 ? 70 : futureStorms > 0 ? 40 : weatherCode >= 80 ? 20 : 0;

    // Temperature impact
    const { impact, degreesF } = this.assessTempImpact(alerts, weatherCode);

    const result: StormStatus = {
      location: location.name,
      hasActiveAlerts: alerts.length > 0,
      alerts,
      stormRisk,
      thunderstormProb,
      weatherCode,
      weatherDescription: WMO_CODES[weatherCode] || `Code ${weatherCode}`,
      tempImpact: impact,
      estimatedTempImpactF: degreesF,
    };

    this.cache.set(key, { data: result, fetchedAt: Date.now() });
    return result;
  }

  getWeatherCodeDescription(code: number): string {
    return WMO_CODES[code] || `Unknown (${code})`;
  }

  assessTempImpact(alerts: WeatherAlert[], weatherCode: number): { impact: StormStatus['tempImpact']; degreesF: number } {
    // Thunderstorms cause significant cooling
    if (weatherCode >= 95) return { impact: 'COOLING', degreesF: -10 };
    if (weatherCode >= 80) return { impact: 'COOLING', degreesF: -5 };

    // Check alerts
    const hasThunderstorm = alerts.some(a => a.type === 'THUNDERSTORM');
    const hasSevere = alerts.some(a => a.type === 'SEVERE' || a.type === 'TORNADO');
    const hasHeat = alerts.some(a => a.type === 'HEAT');
    const hasCold = alerts.some(a => a.type === 'COLD');

    if (hasSevere) return { impact: 'COOLING', degreesF: -15 };
    if (hasThunderstorm) return { impact: 'COOLING', degreesF: -8 };
    if (hasCold) return { impact: 'COOLING', degreesF: -3 };
    if (hasHeat) return { impact: 'WARMING', degreesF: 0 }; // Already factored in forecasts

    // Rain cools
    if (weatherCode >= 61) return { impact: 'COOLING', degreesF: -3 };

    return { impact: 'NEUTRAL', degreesF: 0 };
  }
}

export default LightningService;
