// NOAA Ocean Buoy Service
// Real-time offshore buoy data from NDBC (National Data Buoy Center)
// Pressure tendency (PTDY) is the #1 storm predictor — 6-24hr lead time
// Also tracks wave height, water temp, wind for coastal weather forecasting
// No auth required

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface BuoyReading {
  stationId: string;
  stationName: string;
  time: string;
  windDir: number;        // degrees
  windSpeed: number;      // m/s
  gust: number;           // m/s
  waveHeight: number;     // meters
  pressure: number;       // hPa
  pressureTendency: number; // hPa change (PTDY) — KEY FIELD
  airTemp: number;        // °C
  waterTemp: number;      // °C
  dewpoint: number;       // °C
  visibility: number;     // nautical miles
}

export interface BuoySignal {
  city: string;
  nearestBuoy: string;
  buoyName: string;
  distanceKm: number;
  pressure: number;
  pressureTendency: number;    // hPa/3hr — negative = storm approaching
  pressureAlert: 'STABLE' | 'FALLING' | 'RAPID_FALL' | 'RISING' | 'RAPID_RISE';
  waveHeight: number;
  waterTemp: number;
  airTemp: number;
  windSpeed: number;
  windGust: number;
  stormSignal: boolean;
  stormLeadTimeHours: number;
  description: string;
}

// Buoy stations near our coastal cities
const CITY_BUOYS: Record<string, { id: string; name: string; lat: number; lon: number }[]> = {
  'NYC': [
    { id: '44025', name: 'NY Bight', lat: 40.251, lon: -73.164 },
    { id: '44065', name: 'NY Harbor', lat: 40.369, lon: -73.703 },
  ],
  'Miami': [
    { id: '41047', name: 'Canaveral East', lat: 27.514, lon: -79.996 },
    { id: '41114', name: 'Fort Pierce', lat: 27.551, lon: -80.217 },
  ],
  'LA': [
    { id: '46025', name: 'Santa Monica Basin', lat: 33.749, lon: -119.053 },
    { id: '46222', name: 'San Pedro', lat: 33.618, lon: -118.317 },
  ],
  'London': [
    { id: '62105', name: 'North Sea K13', lat: 53.217, lon: 3.217 },
  ],
  'Tokyo': [
    { id: '21004', name: 'Hachijo-jima', lat: 33.5, lon: 139.2 },
  ],
  'Wellington': [
    { id: '55042', name: 'Cook Strait', lat: -41.5, lon: 174.5 },
  ],
};

class OceanBuoyService {
  private cache: Map<string, { data: BuoyReading; fetchedAt: number }> = new Map();
  private cacheTTL = 10 * 60 * 1000; // 10 min

  // Parse NDBC realtime2 text format
  private parseBuoyData(text: string): BuoyReading | null {
    const allLines = text.split('\n').filter(l => l.trim());
    if (allLines.length < 3) return null;

    // First line is header (starts with #), second is units (starts with #), data starts at line 2
    const headerLine = allLines[0]?.replace(/^#/, '').trim() || '';
    const headers = headerLine.split(/\s+/);
    const dataLines = allLines.filter(l => !l.startsWith('#'));
    if (dataLines.length === 0) return null;
    // Use second data line if first has MM for PTDY (first line is most recent but may lack tendency)
    const dataLine = (dataLines[1] || dataLines[0]).split(/\s+/);
    if (!dataLine) return null;

    const getValue = (name: string): number => {
      const idx = headers.indexOf(name);
      if (idx < 0 || idx >= dataLine.length) return NaN;
      const raw = dataLine[idx]?.trim();
      if (!raw || raw === 'MM') return NaN;
      const val = parseFloat(raw);
      return val === 99 || val === 999 || val === 9999 || val === 99.0 || val === 999.0 ? NaN : val;
    };

    const year = dataLine[0] || '';
    const month = dataLine[1] || '';
    const day = dataLine[2] || '';
    const hour = dataLine[3] || '';
    const min = dataLine[4] || '';

    return {
      stationId: '',
      stationName: '',
      time: `${year}-${month}-${day}T${hour}:${min}:00Z`,
      windDir: getValue('WDIR'),
      windSpeed: getValue('WSPD'),
      gust: getValue('GST'),
      waveHeight: getValue('WVHT'),
      pressure: getValue('PRES'),
      pressureTendency: getValue('PTDY'),
      airTemp: getValue('ATMP'),
      waterTemp: getValue('WTMP'),
      dewpoint: getValue('DEWP'),
      visibility: getValue('VIS'),
    };
  }

  // Fetch real-time data from a buoy
  async fetchBuoy(stationId: string): Promise<BuoyReading | null> {
    const cached = this.cache.get(stationId);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    try {
      const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return null;

      const text = await resp.text();
      const reading = this.parseBuoyData(text);
      if (!reading) return null;

      reading.stationId = stationId;
      this.cache.set(stationId, { data: reading, fetchedAt: Date.now() });
      return reading;
    } catch (e) {
      console.error(`[Buoy] Fetch ${stationId} error: ${(e as Error).message}`);
      return null;
    }
  }

  // Analyze buoy data for a city
  async getCitySignal(location: WeatherLocation): Promise<BuoySignal | null> {
    const buoys = CITY_BUOYS[location.name];
    if (!buoys || buoys.length === 0) return null;

    // Try each buoy until we get data
    for (const buoy of buoys) {
      const reading = await this.fetchBuoy(buoy.id);
      if (!reading || isNaN(reading.pressure)) continue;

      reading.stationName = buoy.name;

      const ptdy = isNaN(reading.pressureTendency) ? 0 : reading.pressureTendency;

      // Classify pressure tendency
      let pressureAlert: BuoySignal['pressureAlert'] = 'STABLE';
      if (ptdy <= -6) pressureAlert = 'RAPID_FALL';
      else if (ptdy <= -3) pressureAlert = 'FALLING';
      else if (ptdy >= 6) pressureAlert = 'RAPID_RISE';
      else if (ptdy >= 3) pressureAlert = 'RISING';

      // Storm signal detection
      const stormSignal = ptdy <= -3 || (reading.waveHeight > 3 && ptdy < 0);
      let stormLeadTimeHours = 0;
      if (ptdy <= -6) stormLeadTimeHours = 3;
      else if (ptdy <= -3) stormLeadTimeHours = 6;
      else if (ptdy < 0 && reading.waveHeight > 2) stormLeadTimeHours = 12;

      // Distance from city
      const distanceKm = this.distanceKm(location.lat, location.lon, buoy.lat, buoy.lon);

      let description = `${buoy.name}: ${reading.pressure.toFixed(1)} hPa`;
      if (!isNaN(ptdy) && ptdy !== 0) {
        description += ` (${ptdy > 0 ? '+' : ''}${ptdy.toFixed(1)} hPa/3hr)`;
      }
      if (stormSignal) {
        description += ` — STORM SIGNAL: pressure ${pressureAlert.replace('_', ' ').toLowerCase()}`;
        if (reading.waveHeight > 2) description += `, waves ${reading.waveHeight.toFixed(1)}m`;
      }

      return {
        city: location.name,
        nearestBuoy: buoy.id,
        buoyName: buoy.name,
        distanceKm: Math.round(distanceKm),
        pressure: reading.pressure,
        pressureTendency: ptdy,
        pressureAlert,
        waveHeight: isNaN(reading.waveHeight) ? 0 : reading.waveHeight,
        waterTemp: isNaN(reading.waterTemp) ? 0 : reading.waterTemp,
        airTemp: isNaN(reading.airTemp) ? 0 : reading.airTemp,
        windSpeed: isNaN(reading.windSpeed) ? 0 : reading.windSpeed,
        windGust: isNaN(reading.gust) ? 0 : reading.gust,
        stormSignal,
        stormLeadTimeHours,
        description,
      };
    }

    return null;
  }

  // Get signals for all cities with buoy coverage
  async getAllSignals(): Promise<BuoySignal[]> {
    const signals: BuoySignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      const signal = await this.getCitySignal(loc);
      if (signal) signals.push(signal);
      await new Promise(r => setTimeout(r, 300));
    }
    return signals;
  }

  private distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

export default OceanBuoyService;
