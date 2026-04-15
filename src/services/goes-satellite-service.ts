// GOES Satellite Service — Cloud imagery + divergence analysis
// Uses NASA GIBS for satellite tile URLs + Open-Meteo for cloud layer data

import fetch from 'node-fetch';
import { WeatherLocation } from './noaa-weather-service.js';

export interface SatelliteFrame {
  timestamp: Date;
  product: string;
  tileUrl: string;
  region: string;
}

export interface CloudAnalysis {
  location: string;
  currentCloudPct: number;
  forecastCloudPct: number;
  cloudTrend: 'CLEARING' | 'BUILDING' | 'STEADY';
  cloudDivergence: number; // actual minus forecast
  highClouds: number;
  midClouds: number;
  lowClouds: number;
  satelliteAvailable: boolean;
  latestImageTime: Date;
}

class GoesSatelliteService {
  private cache: Map<string, { data: CloudAnalysis; fetchedAt: number }> = new Map();
  private cacheTTL = 10 * 60 * 1000; // 10 min

  async getCloudAnalysis(location: WeatherLocation): Promise<CloudAnalysis> {
    const key = location.name;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    let currentCloud = 0;
    let forecastCloud = 0;
    let highClouds = 0;
    let midClouds = 0;
    let lowClouds = 0;
    let trend: CloudAnalysis['cloudTrend'] = 'STEADY';

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=cloud_cover&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&timezone=auto&forecast_hours=6`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = (await resp.json()) as any;

      currentCloud = data.current?.cloud_cover ?? 0;

      const hourlyCloud = data.hourly?.cloud_cover || [];
      const hourlyLow = data.hourly?.cloud_cover_low || [];
      const hourlyMid = data.hourly?.cloud_cover_mid || [];
      const hourlyHigh = data.hourly?.cloud_cover_high || [];

      // Current hour forecast
      forecastCloud = hourlyCloud[0] ?? currentCloud;
      lowClouds = hourlyLow[0] ?? 0;
      midClouds = hourlyMid[0] ?? 0;
      highClouds = hourlyHigh[0] ?? 0;

      // Trend: compare first 2 hours to last 2 hours of 6-hour window
      if (hourlyCloud.length >= 4) {
        const early = (hourlyCloud[0] + hourlyCloud[1]) / 2;
        const late = (hourlyCloud[hourlyCloud.length - 2] + hourlyCloud[hourlyCloud.length - 1]) / 2;
        if (late < early - 10) trend = 'CLEARING';
        else if (late > early + 10) trend = 'BUILDING';
        else trend = 'STEADY';
      }
    } catch (e) {
      console.error(`[Satellite] Cloud analysis failed for ${location.name}: ${(e as Error).message}`);
    }

    const result: CloudAnalysis = {
      location: location.name,
      currentCloudPct: Math.round(currentCloud),
      forecastCloudPct: Math.round(forecastCloud),
      cloudTrend: trend,
      cloudDivergence: Math.round(currentCloud - forecastCloud),
      highClouds: Math.round(highClouds),
      midClouds: Math.round(midClouds),
      lowClouds: Math.round(lowClouds),
      satelliteAvailable: true,
      latestImageTime: new Date(),
    };

    this.cache.set(key, { data: result, fetchedAt: Date.now() });
    return result;
  }

  getSatelliteTileUrl(lat: number, lon: number, product?: string): string {
    // Determine GOES-East vs GOES-West based on longitude
    const isWest = lon < -135;
    const defaultProduct = isWest
      ? 'GOES-West_ABI_Band2_Red_Visible_1km'
      : 'GOES-East_ABI_Band2_Red_Visible_1km';
    const p = product || defaultProduct;

    const today = new Date().toISOString().split('T')[0];
    // NASA GIBS WMTS tile URL
    return `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${p}/default/${today}/250m/{z}/{y}/{x}.jpg`;
  }

  getLatestFrames(region: 'CONUS' | 'FULL_DISK' | 'MESOSCALE'): SatelliteFrame[] {
    const now = new Date();
    const products = {
      'CONUS': ['GOES-East_ABI_Band2_Red_Visible_1km', 'GOES-East_ABI_Band13_Clean_Infrared'],
      'FULL_DISK': ['GOES-East_ABI_Band2_Red_Visible_1km'],
      'MESOSCALE': ['GOES-East_ABI_Band2_Red_Visible_1km'],
    };

    const today = now.toISOString().split('T')[0];

    return (products[region] || products.CONUS).map(product => ({
      timestamp: now,
      product,
      tileUrl: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${product}/default/${today}/250m/{z}/{y}/{x}.jpg`,
      region,
    }));
  }
}

export default GoesSatelliteService;
