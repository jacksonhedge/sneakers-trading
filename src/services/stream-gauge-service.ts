// USGS Stream Gauge Service
// Real-time river/stream flow data from the National Water Information System
// Rising gauges confirm precipitation upstream before it's reported officially
// 15-minute update frequency, no auth required

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface GaugeReading {
  siteId: string;
  siteName: string;
  lat: number;
  lon: number;
  streamflow: number;      // ft³/s (cfs)
  gageHeight: number;      // ft
  precipitation: number;   // inches (last reading)
  timestamp: string;
}

export interface StreamSignal {
  city: string;
  gaugesMonitored: number;
  avgStreamflow: number;    // cfs
  maxStreamflow: number;
  totalPrecipitation: number; // inches across all gauges
  risingGauges: number;     // Count of gauges with increasing flow
  floodAlert: boolean;
  description: string;
  rainConfirmed: boolean;   // Upstream gauges showing precip
}

// Map cities to USGS bounding boxes for nearby stream gauges
const CITY_BBOX: Record<string, { minLon: number; minLat: number; maxLon: number; maxLat: number }> = {
  'NYC': { minLon: -74.5, minLat: 40.4, maxLon: -73.5, maxLat: 41.2 },
  'Chicago': { minLon: -88.3, minLat: 41.5, maxLon: -87.3, maxLat: 42.3 },
  'LA': { minLon: -118.8, minLat: 33.5, maxLon: -117.8, maxLat: 34.5 },
  'Miami': { minLon: -80.8, minLat: 25.3, maxLon: -79.8, maxLat: 26.3 },
  'Denver': { minLon: -105.5, minLat: 39.3, maxLon: -104.5, maxLat: 40.2 },
};

class StreamGaugeService {
  private cache: Map<string, { data: StreamSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 15 * 60 * 1000; // 15 min

  // Fetch gauge readings near a city
  private async fetchGauges(bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }): Promise<GaugeReading[]> {
    try {
      // USGS NWIS instantaneous values API
      // 00060 = streamflow, 00065 = gage height, 00045 = precipitation
      const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}&parameterCd=00060,00065,00045&siteType=ST&period=PT2H`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return [];

      const data = (await resp.json()) as any;
      const timeSeries = data.value?.timeSeries || [];

      // Group by site
      const siteMap = new Map<string, GaugeReading>();

      for (const ts of timeSeries) {
        const siteCode = ts.sourceInfo?.siteCode?.[0]?.value || '';
        const siteName = ts.sourceInfo?.siteName || '';
        const lat = ts.sourceInfo?.geoLocation?.geogLocation?.latitude || 0;
        const lon = ts.sourceInfo?.geoLocation?.geogLocation?.longitude || 0;
        const paramCode = ts.variable?.variableCode?.[0]?.value || '';
        const values = ts.values?.[0]?.value || [];
        const latestValue = values.length > 0 ? values[values.length - 1] : null;

        if (!siteCode || !latestValue) continue;

        if (!siteMap.has(siteCode)) {
          siteMap.set(siteCode, {
            siteId: siteCode,
            siteName,
            lat, lon,
            streamflow: 0,
            gageHeight: 0,
            precipitation: 0,
            timestamp: latestValue.dateTime || '',
          });
        }

        const reading = siteMap.get(siteCode)!;
        const val = parseFloat(latestValue.value);
        if (isNaN(val) || val < 0) continue;

        if (paramCode === '00060') reading.streamflow = val;
        else if (paramCode === '00065') reading.gageHeight = val;
        else if (paramCode === '00045') reading.precipitation = val;
      }

      return Array.from(siteMap.values());
    } catch (e) {
      console.error(`[StreamGauge] Fetch error: ${(e as Error).message}`);
      return [];
    }
  }

  // Analyze stream gauge data for a city
  async getCitySignal(location: WeatherLocation): Promise<StreamSignal | null> {
    const bbox = CITY_BBOX[location.name];
    if (!bbox) return null;

    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const gauges = await this.fetchGauges(bbox);
    if (gauges.length === 0) {
      return {
        city: location.name, gaugesMonitored: 0, avgStreamflow: 0, maxStreamflow: 0,
        totalPrecipitation: 0, risingGauges: 0, floodAlert: false,
        description: 'No gauge data available', rainConfirmed: false,
      };
    }

    const withFlow = gauges.filter(g => g.streamflow > 0);
    const avgFlow = withFlow.length > 0
      ? Math.round(withFlow.reduce((s, g) => s + g.streamflow, 0) / withFlow.length)
      : 0;
    const maxFlow = withFlow.length > 0
      ? Math.round(Math.max(...withFlow.map(g => g.streamflow)))
      : 0;

    const totalPrecip = gauges.reduce((s, g) => s + g.precipitation, 0);
    const rainConfirmed = totalPrecip > 0 || gauges.some(g => g.precipitation > 0);

    // Estimate rising gauges (simplified — would need historical comparison)
    // For now, flag if gage heights are above typical base levels
    const risingGauges = gauges.filter(g => g.gageHeight > 3).length; // >3ft suggests elevated

    // Flood alert if any gauge is very high
    const floodAlert = gauges.some(g => g.gageHeight > 10 || g.streamflow > 10000);

    let description = `${gauges.length} gauges | avg flow ${avgFlow} cfs | max ${maxFlow} cfs`;
    if (rainConfirmed) {
      description += ` | RAIN CONFIRMED (${totalPrecip.toFixed(2)}" precip)`;
    }
    if (floodAlert) {
      description += ' | FLOOD ALERT';
    }

    const result: StreamSignal = {
      city: location.name,
      gaugesMonitored: gauges.length,
      avgStreamflow: avgFlow,
      maxStreamflow: maxFlow,
      totalPrecipitation: Math.round(totalPrecip * 100) / 100,
      risingGauges,
      floodAlert,
      description,
      rainConfirmed,
    };

    this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Get all city signals
  async getAllSignals(): Promise<StreamSignal[]> {
    const signals: StreamSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      if (!CITY_BBOX[loc.name]) continue;
      const signal = await this.getCitySignal(loc);
      if (signal) signals.push(signal);
      await new Promise(r => setTimeout(r, 500));
    }
    return signals;
  }
}

export default StreamGaugeService;
