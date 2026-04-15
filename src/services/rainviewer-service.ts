// RainViewer Service — Precipitation nowcasting and radar tile imagery
// Uses RainViewer API for global radar composites + Open-Meteo for minutely precipitation

import fetch from 'node-fetch';
import { WeatherLocation } from './noaa-weather-service.js';

export interface RadarFrame {
  timestamp: number;
  path: string;
  tileUrl: string;
}

export interface PrecipNowcast {
  location: string;
  currentPrecipMmHr: number;
  precipNext30min: number;
  precipNext60min: number;
  isRaining: boolean;
  radarAvailable: boolean;
  frames: RadarFrame[];
  trend: 'INCREASING' | 'DECREASING' | 'STEADY' | 'DRY';
}

class RainViewerService {
  private cache: Map<string, { data: PrecipNowcast; fetchedAt: number }> = new Map();
  private radarCache: { past: RadarFrame[]; nowcast: RadarFrame[]; fetchedAt: number } | null = null;
  private cacheTTL = 5 * 60 * 1000; // 5 min

  async getRadarFrames(): Promise<{ past: RadarFrame[]; nowcast: RadarFrame[] }> {
    if (this.radarCache && Date.now() - this.radarCache.fetchedAt < this.cacheTTL) {
      return { past: this.radarCache.past, nowcast: this.radarCache.nowcast };
    }

    try {
      const resp = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = (await resp.json()) as any;

      const past: RadarFrame[] = (data.radar?.past || []).map((f: any) => ({
        timestamp: f.time,
        path: f.path,
        tileUrl: `https://tilecache.rainviewer.com${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
      }));

      const nowcast: RadarFrame[] = (data.radar?.nowcast || []).map((f: any) => ({
        timestamp: f.time,
        path: f.path,
        tileUrl: `https://tilecache.rainviewer.com${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
      }));

      this.radarCache = { past, nowcast, fetchedAt: Date.now() };
      return { past, nowcast };
    } catch (e) {
      console.error(`[RainViewer] Frames fetch failed: ${(e as Error).message}`);
      return { past: [], nowcast: [] };
    }
  }

  async getPrecipitation(location: WeatherLocation): Promise<PrecipNowcast> {
    const key = location.name;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    let currentPrecip = 0;
    let precip30 = 0;
    let precip60 = 0;
    let trend: PrecipNowcast['trend'] = 'DRY';

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&minutely_15=precipitation&timezone=auto&forecast_minutely_15=8`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = (await resp.json()) as any;
      const precip = data.minutely_15?.precipitation || [];

      // Current = first value, 30min = avg of next 2, 60min = avg of next 4
      currentPrecip = precip[0] ?? 0;
      precip30 = precip.length >= 3
        ? (precip[1] + precip[2]) / 2
        : precip[1] ?? 0;
      precip60 = precip.length >= 5
        ? (precip[1] + precip[2] + precip[3] + precip[4]) / 4
        : precip30;

      // Trend
      if (currentPrecip === 0 && precip30 === 0 && precip60 === 0) {
        trend = 'DRY';
      } else if (precip60 > currentPrecip + 0.1) {
        trend = 'INCREASING';
      } else if (precip60 < currentPrecip - 0.1) {
        trend = 'DECREASING';
      } else {
        trend = 'STEADY';
      }
    } catch (e) {
      console.error(`[RainViewer] Precip fetch failed for ${location.name}: ${(e as Error).message}`);
    }

    // Get radar frames
    const { past, nowcast } = await this.getRadarFrames();

    const result: PrecipNowcast = {
      location: location.name,
      currentPrecipMmHr: Math.round(currentPrecip * 10) / 10,
      precipNext30min: Math.round(precip30 * 10) / 10,
      precipNext60min: Math.round(precip60 * 10) / 10,
      isRaining: currentPrecip > 0.1,
      radarAvailable: past.length > 0,
      frames: [...past.slice(-3), ...nowcast.slice(0, 3)],
      trend,
    };

    this.cache.set(key, { data: result, fetchedAt: Date.now() });
    return result;
  }

  getTileUrl(lat: number, lon: number, zoom: number, frame: RadarFrame): string {
    const { x, y } = this.latLonToTile(lat, lon, zoom);
    return frame.tileUrl.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
  }

  latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  }
}

export default RainViewerService;
