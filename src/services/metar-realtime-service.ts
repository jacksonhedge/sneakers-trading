// METAR Real-Time Ground Truth Service
// Fetches live airport weather observations every 5-20 minutes
// Compares actual temperature against forecast to detect divergence in real time

import fetch from 'node-fetch';
import { WeatherLocation, celsiusToFahrenheit } from './noaa-weather-service.js';

export interface MetarObservation {
  stationId: string;
  cityName: string;
  observedAt: Date;
  tempC: number;
  tempF: number;
  dewpointC: number;
  windSpeedKts: number;
  windGustKts: number | null;
  windDirectionDeg: number;
  cloudCoverPct: number;
  cloudLayers: { cover: string; baseAGL: number }[];
  visibilityMiles: number;
  rawMetar: string;
  flightCategory: string;
}

export interface CityObservation {
  cityName: string;
  stations: MetarObservation[];
  bestTempC: number;
  bestTempF: number;
  bestCloudCover: number;
  bestWindSpeed: number;
  observedAt: Date;
  tempTrend: 'RISING' | 'FALLING' | 'STEADY' | 'UNKNOWN';
  tempChangeRatePerHour: number;
}

export interface TempDivergence {
  cityName: string;
  currentTempF: number;
  forecastHighF: number;
  divergenceF: number;        // positive = running hotter than expected
  heatingRate: number;         // °F/hour actual
  expectedHeatingRate: number; // °F/hour expected
  likelyOvershoot: boolean;
  likelyUndershoot: boolean;
  estimatedActualHighF: number;
  confidence: number;
}

// ICAO codes for each target city
const CITY_STATIONS: Record<string, { icao: string[]; network?: string }> = {
  'NYC':         { icao: ['KJFK', 'KLGA', 'KEWR'] },
  'Chicago':     { icao: ['KORD', 'KMDW'] },
  'LA':          { icao: ['KLAX', 'KBUR', 'KSNA'] },
  'Miami':       { icao: ['KMIA', 'KFLL'] },
  'Denver':      { icao: ['KDEN'] },
  'London':      { icao: ['EGLL', 'EGSS'] },
  'Tokyo':       { icao: ['RJTT', 'RJAA'] },
  'Seoul':       { icao: ['RKSI', 'RKSS'] },
  'Hong Kong':   { icao: ['VHHH'] },
  'Shanghai':    { icao: ['ZSPD', 'ZSSS'] },
  'Mexico City': { icao: ['MMMX'] },
  'Milan':       { icao: ['LIMC', 'LIML'] },
  'Beijing':     { icao: ['ZBAA'] },
  'Wellington':  { icao: ['NZWN'] },
};

const CLOUD_COVER_MAP: Record<string, number> = {
  'CLR': 0, 'SKC': 0, 'FEW': 25, 'SCT': 50, 'BKN': 75, 'OVC': 100,
};

class MetarRealtimeService {
  private cache: Map<string, { data: CityObservation; fetchedAt: number }> = new Map();
  private history: Map<string, { tempF: number; time: Date }[]> = new Map(); // rolling 2hr
  private cacheTTL = 3 * 60 * 1000; // 3 min

  async fetchAllCities(): Promise<CityObservation[]> {
    // Batch all ICAO codes into groups of 20
    const allStations: { icao: string; city: string }[] = [];
    for (const [city, info] of Object.entries(CITY_STATIONS)) {
      for (const icao of info.icao) {
        allStations.push({ icao, city });
      }
    }

    const results: CityObservation[] = [];
    const batchSize = 20;

    for (let i = 0; i < allStations.length; i += batchSize) {
      const batch = allStations.slice(i, i + batchSize);
      const ids = batch.map(s => s.icao).join(',');

      try {
        const url = `https://aviationweather.gov/api/data/metar?ids=${ids}&format=json`;
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        });
        if (!resp.ok) continue;

        const data = (await resp.json()) as any[];
        if (!Array.isArray(data)) continue;

        // Group by city
        const cityObs: Map<string, MetarObservation[]> = new Map();

        for (const metar of data) {
          const station = batch.find(s => s.icao === metar.icaoId);
          if (!station) continue;

          const obs = this.parseMetar(metar, station.city);
          if (!obs) continue;

          if (!cityObs.has(station.city)) cityObs.set(station.city, []);
          cityObs.get(station.city)!.push(obs);
        }

        for (const [city, obs] of cityObs) {
          const cityResult = this.buildCityObservation(city, obs);
          results.push(cityResult);

          // Update history
          const key = city;
          if (!this.history.has(key)) this.history.set(key, []);
          const hist = this.history.get(key)!;
          hist.push({ tempF: cityResult.bestTempF, time: cityResult.observedAt });
          // Keep last 2 hours
          const cutoff = Date.now() - 2 * 60 * 60 * 1000;
          while (hist.length > 0 && hist[0].time.getTime() < cutoff) hist.shift();

          this.cache.set(city, { data: cityResult, fetchedAt: Date.now() });
        }
      } catch (e) {
        console.error(`[METAR] Batch fetch failed: ${(e as Error).message}`);
      }

      if (i + batchSize < allStations.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return results;
  }

  private parseMetar(raw: any, cityName: string): MetarObservation | null {
    try {
      const tempC = raw.temp ?? null;
      if (tempC === null) return null;

      const clouds: { cover: string; baseAGL: number }[] = [];
      let maxCloudPct = 0;
      for (let i = 1; i <= 4; i++) {
        const cover = raw[`cldCvg${i}`];
        const base = raw[`cldBas${i}`];
        if (cover && cover !== 'CLR' && cover !== 'SKC') {
          clouds.push({ cover, baseAGL: base || 0 });
          maxCloudPct = Math.max(maxCloudPct, CLOUD_COVER_MAP[cover] || 0);
        }
      }
      if (raw.cldCvg1 === 'CLR' || raw.cldCvg1 === 'SKC') maxCloudPct = 0;

      return {
        stationId: raw.icaoId,
        cityName,
        observedAt: new Date(raw.obsTime * 1000 || raw.reportTime || Date.now()),
        tempC,
        tempF: celsiusToFahrenheit(tempC),
        dewpointC: raw.dewp ?? 0,
        windSpeedKts: raw.wspd ?? 0,
        windGustKts: raw.wgst || null,
        windDirectionDeg: raw.wdir ?? 0,
        cloudCoverPct: maxCloudPct,
        cloudLayers: clouds,
        visibilityMiles: raw.visib ?? 10,
        rawMetar: raw.rawOb || '',
        flightCategory: raw.fltCat || 'VFR',
      };
    } catch {
      return null;
    }
  }

  private buildCityObservation(city: string, obs: MetarObservation[]): CityObservation {
    const avgTemp = obs.reduce((s, o) => s + o.tempF, 0) / obs.length;
    const avgCloud = obs.reduce((s, o) => s + o.cloudCoverPct, 0) / obs.length;
    const avgWind = obs.reduce((s, o) => s + o.windSpeedKts, 0) / obs.length;
    const latestTime = new Date(Math.max(...obs.map(o => o.observedAt.getTime())));

    // Calculate trend from history
    const hist = this.history.get(city) || [];
    let trend: CityObservation['tempTrend'] = 'UNKNOWN';
    let ratePerHour = 0;

    if (hist.length >= 2) {
      const recent = hist.slice(-6); // last ~30 min of data
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const hoursDiff = (last.time.getTime() - first.time.getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 0.05) {
          ratePerHour = (last.tempF - first.tempF) / hoursDiff;
          if (ratePerHour > 0.5) trend = 'RISING';
          else if (ratePerHour < -0.5) trend = 'FALLING';
          else trend = 'STEADY';
        }
      }
    }

    return {
      cityName: city,
      stations: obs,
      bestTempC: obs.reduce((s, o) => s + o.tempC, 0) / obs.length,
      bestTempF: Math.round(avgTemp * 10) / 10,
      bestCloudCover: Math.round(avgCloud),
      bestWindSpeed: Math.round(avgWind * 10) / 10,
      observedAt: latestTime,
      tempTrend: trend,
      tempChangeRatePerHour: Math.round(ratePerHour * 10) / 10,
    };
  }

  detectTempDivergence(cityName: string, forecastHighF: number): TempDivergence | null {
    const cached = this.cache.get(cityName);
    if (!cached) return null;

    const obs = cached.data;
    const now = new Date();
    const hour = now.getHours();

    // Expected heating curve: temps typically peak around 2-4pm local
    // Morning: rising ~2-4°F/hr, afternoon: plateau, evening: falling
    const peakHour = 15; // 3pm
    const hoursToGo = Math.max(0, peakHour - hour);

    // Current temp vs where we'd expect it given forecast
    // Linear interpolation: at 8am expect ~forecastHigh - 15°F, at 3pm expect forecastHigh
    const morningLowEstF = forecastHighF - 18;
    const expectedNowF = hour <= 8 ? morningLowEstF :
      hour >= peakHour ? forecastHighF :
      morningLowEstF + (forecastHighF - morningLowEstF) * ((hour - 8) / (peakHour - 8));

    const divergence = obs.bestTempF - expectedNowF;

    // Expected heating rate at this hour
    const expectedRate = hour < 10 ? 3.0 : hour < 13 ? 2.0 : hour < 16 ? 0.5 : -1.0;

    // Project where daily high will land based on current trajectory
    let estimatedHigh = obs.bestTempF;
    if (hoursToGo > 0 && obs.tempChangeRatePerHour > 0) {
      // Heating rate decays as we approach peak
      estimatedHigh = obs.bestTempF + obs.tempChangeRatePerHour * hoursToGo * 0.6;
    } else if (hour >= peakHour) {
      // Already past peak — current temp is close to the high
      estimatedHigh = Math.max(obs.bestTempF, forecastHighF * 0.5 + obs.bestTempF * 0.5);
    }

    const overshoot = estimatedHigh > forecastHighF + 1.5;
    const undershoot = estimatedHigh < forecastHighF - 1.5;

    // Confidence based on time of day and data freshness
    let confidence = 0.4;
    if (hour >= 10 && hour <= 16) confidence += 0.2; // More reliable during peak hours
    if (Math.abs(divergence) > 3) confidence += 0.15;
    if (obs.tempTrend !== 'UNKNOWN') confidence += 0.1;
    const dataAge = (Date.now() - obs.observedAt.getTime()) / (1000 * 60);
    if (dataAge < 20) confidence += 0.1;
    confidence = Math.min(0.9, confidence);

    return {
      cityName,
      currentTempF: obs.bestTempF,
      forecastHighF,
      divergenceF: Math.round(divergence * 10) / 10,
      heatingRate: obs.tempChangeRatePerHour,
      expectedHeatingRate: expectedRate,
      likelyOvershoot: overshoot,
      likelyUndershoot: undershoot,
      estimatedActualHighF: Math.round(estimatedHigh * 10) / 10,
      confidence,
    };
  }

  getCityStations(cityName: string): string[] {
    return CITY_STATIONS[cityName]?.icao || [];
  }
}

export default MetarRealtimeService;
