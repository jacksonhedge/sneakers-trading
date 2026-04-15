// Resolution Edge Service
// Scrapes actual station observations from aviationweather.gov METAR data
// to detect contracts that are already dead or guaranteed before market resolution.
//
// Strategy: If it's 3PM local time and the station high is already 25°C,
// every "24°C or below" contract is dead (sell) and "25°C or higher" is guaranteed (buy at <$1).

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS, localDateBounds } from './noaa-weather-service.js';
import { PolymarketWeatherMarket, PolymarketOutcome } from './polymarket-weather-scanner.js';

export interface StationObservation {
  stationId: string;
  cityName: string;
  observedAt: Date;
  tempC: number;
  tempF: number;
}

export interface DailyStationSummary {
  stationId: string;
  cityName: string;
  date: string;
  runningHighC: number;     // max temp observed so far today (whole °C)
  runningHighRawC: number;  // max temp with decimals
  observationCount: number;
  latestObsTime: Date;
  hoursOfDataToday: number;
  isComplete: boolean;      // true if past local midnight (full day captured)
}

export interface ResolutionEdge {
  market: PolymarketWeatherMarket;
  outcome: PolymarketOutcome;
  stationHighC: number;        // running high at station (whole °C)
  stationHighRawC: number;
  signal: 'GUARANTEED_YES' | 'DEAD' | 'LIKELY_YES' | 'LIKELY_NO' | 'UNCERTAIN';
  currentYesPrice: number;
  fairValue: number;           // what the contract should be worth (0 or 1 for dead/guaranteed)
  edge: number;                // fairValue - currentYesPrice
  confidence: number;          // 0-1, higher = more certain
  reason: string;
}

// Map city names to ICAO station codes (must match Polymarket resolution stations)
const CITY_TO_ICAO: Record<string, string> = {
  'NYC': 'KJFK',
  'Chicago': 'KORD',
  'LA': 'KLAX',
  'Miami': 'KMIA',
  'Denver': 'KBKF',
  'London': 'EGLC',
  'Tokyo': 'RJTT',
  'Seoul': 'RKSI',
  'Hong Kong': 'VHHH',
  'Shanghai': 'ZSPD',
  'Mexico City': 'MMMX',
  'Wellington': 'NZWN',
  'Beijing': 'ZBAA',
  'Milan': 'LIMC',
};

class ResolutionEdgeService {
  private cache: Map<string, { data: DailyStationSummary; fetchedAt: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 min

  // Fetch METAR observations for all stations in one call
  async fetchAllObservations(): Promise<Map<string, StationObservation[]>> {
    const stations = Object.values(CITY_TO_ICAO);
    const ids = stations.join(',');

    try {
      const url = `https://aviationweather.gov/api/data/metar?ids=${ids}&format=json&hours=24`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) {
        console.error(`[RESOLUTION] METAR fetch failed: HTTP ${resp.status}`);
        return new Map();
      }

      const data = (await resp.json()) as any[];
      const byStation = new Map<string, StationObservation[]>();

      // Reverse map: ICAO -> city name
      const icaoToCity: Record<string, string> = {};
      for (const [city, icao] of Object.entries(CITY_TO_ICAO)) {
        icaoToCity[icao] = city;
      }

      for (const obs of data) {
        const stationId = obs.icaoId || obs.stationId;
        if (!stationId) continue;

        const cityName = icaoToCity[stationId] || stationId;
        const tempC = obs.temp ?? null;
        if (tempC === null) continue;

        const entry: StationObservation = {
          stationId,
          cityName,
          observedAt: new Date(obs.obsTime * 1000 || obs.reportTime),
          tempC,
          tempF: tempC * 9 / 5 + 32,
        };

        if (!byStation.has(stationId)) byStation.set(stationId, []);
        byStation.get(stationId)!.push(entry);
      }

      return byStation;
    } catch (e) {
      console.error(`[RESOLUTION] METAR fetch error: ${(e as Error).message}`);
      return new Map();
    }
  }

  // Compute running daily high for a station on a specific date
  getDailySummary(observations: StationObservation[], location: WeatherLocation, targetDate: string): DailyStationSummary | null {
    const cacheKey = `${location.name}:${targetDate}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const { start, end } = localDateBounds(targetDate, location.tz);

    // Filter observations to the target local date
    const todayObs = observations.filter(o => o.observedAt >= start && o.observedAt <= end);
    if (todayObs.length === 0) return null;

    const maxRawC = Math.max(...todayObs.map(o => o.tempC));
    const maxWholeC = Math.round(maxRawC); // Wunderground rounds to whole °C
    const latest = todayObs.reduce((a, b) => a.observedAt > b.observedAt ? a : b);
    const earliest = todayObs.reduce((a, b) => a.observedAt < b.observedAt ? a : b);
    const hoursSpan = (latest.observedAt.getTime() - earliest.observedAt.getTime()) / 3600000;

    // Is the local day complete? Check if current time is past local midnight
    const now = new Date();
    const isComplete = now > end;

    const summary: DailyStationSummary = {
      stationId: CITY_TO_ICAO[location.name] || '',
      cityName: location.name,
      date: targetDate,
      runningHighC: maxWholeC,
      runningHighRawC: Math.round(maxRawC * 10) / 10,
      observationCount: todayObs.length,
      latestObsTime: latest.observedAt,
      hoursOfDataToday: Math.round(hoursSpan * 10) / 10,
      isComplete,
    };

    this.cache.set(cacheKey, { data: summary, fetchedAt: Date.now() });
    return summary;
  }

  // Find resolution edges: contracts that are dead or guaranteed based on actual observations
  async findResolutionEdges(markets: PolymarketWeatherMarket[]): Promise<ResolutionEdge[]> {
    const allObs = await this.fetchAllObservations();
    if (allObs.size === 0) return [];

    const edges: ResolutionEdge[] = [];

    for (const market of markets) {
      const location = WEATHER_LOCATIONS.find(l => l.name === market.location);
      if (!location) continue;

      const icao = CITY_TO_ICAO[market.location];
      if (!icao) continue;

      const observations = allObs.get(icao);
      if (!observations || observations.length === 0) continue;

      const summary = this.getDailySummary(observations, location, market.targetDate);
      if (!summary) continue;

      // How far through the day are we? (local time)
      const { start, end } = localDateBounds(market.targetDate, location.tz);
      const now = new Date();
      const dayProgress = Math.max(0, Math.min(1, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
      const localHour = dayProgress * 24;

      // Temperature typically peaks between 2-5 PM local. After that, high is ~locked in.
      const pastPeakHours = localHour > 17; // 5 PM local
      const nearPeak = localHour > 14;       // 2 PM local

      for (const outcome of market.outcomes) {
        const edge = this.evaluateOutcome(outcome, summary, dayProgress, pastPeakHours, nearPeak, localHour);
        if (edge) {
          edges.push({ market, outcome, ...edge });
        }
      }
    }

    // Sort by absolute edge size
    edges.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));

    if (edges.length > 0) {
      console.log(`[RESOLUTION] ${edges.length} resolution edges found across ${markets.length} markets`);
      for (const e of edges.slice(0, 5)) {
        console.log(`  ${e.signal} ${e.outcome.label} @ ${e.market.location}: station high ${e.stationHighC}°C, price ${(e.currentYesPrice * 100).toFixed(0)}%, fair ${(e.fairValue * 100).toFixed(0)}%, edge ${(e.edge * 100).toFixed(1)}c — ${e.reason}`);
      }
    }

    return edges;
  }

  private evaluateOutcome(
    outcome: PolymarketOutcome,
    summary: DailyStationSummary,
    dayProgress: number,
    pastPeakHours: boolean,
    nearPeak: boolean,
    localHour: number,
  ): Omit<ResolutionEdge, 'market' | 'outcome'> | null {
    const stationHighC = summary.runningHighC;
    const yesPrice = outcome.yesPrice;

    if (outcome.isCeiling) {
      // "X°C or higher" — resolves YES if actual high >= X
      const thresholdC = outcome.temperatureC;

      if (stationHighC >= thresholdC) {
        // Already hit the threshold — this is GUARANTEED YES
        const fairValue = 1.0;
        const edge = fairValue - yesPrice;
        if (edge > 0.02) { // only if market hasn't priced it in yet
          return {
            stationHighC, stationHighRawC: summary.runningHighRawC,
            signal: 'GUARANTEED_YES', currentYesPrice: yesPrice, fairValue, edge,
            confidence: 0.99,
            reason: `Station already hit ${stationHighC}°C ≥ ${thresholdC}°C threshold`,
          };
        }
      } else if (pastPeakHours && stationHighC < thresholdC) {
        // Past peak, hasn't hit threshold — very likely NO
        const gap = thresholdC - stationHighC;
        const confidence = Math.min(0.95, 0.7 + gap * 0.1);
        const fairValue = 1 - confidence;
        const edge = fairValue - yesPrice;
        if (Math.abs(edge) > 0.05) {
          return {
            stationHighC, stationHighRawC: summary.runningHighRawC,
            signal: 'LIKELY_NO', currentYesPrice: yesPrice, fairValue, edge,
            confidence,
            reason: `Past 5PM local, high is ${stationHighC}°C, needs ${thresholdC}°C (${gap}°C gap)`,
          };
        }
      }
    } else if (outcome.isFloor) {
      // "X°C or below" — resolves YES if actual high <= X
      const thresholdC = outcome.temperatureC;

      if (stationHighC > thresholdC) {
        // Already exceeded threshold — this is DEAD
        const fairValue = 0.0;
        const edge = fairValue - yesPrice;
        if (Math.abs(edge) > 0.02) {
          return {
            stationHighC, stationHighRawC: summary.runningHighRawC,
            signal: 'DEAD', currentYesPrice: yesPrice, fairValue, edge,
            confidence: 0.99,
            reason: `Station already hit ${stationHighC}°C > ${thresholdC}°C threshold — contract is dead`,
          };
        }
      } else if (pastPeakHours && stationHighC <= thresholdC) {
        // Past peak and still below — very likely YES
        const gap = thresholdC - stationHighC;
        const confidence = Math.min(0.95, 0.7 + gap * 0.1);
        const fairValue = confidence;
        const edge = fairValue - yesPrice;
        if (edge > 0.05) {
          return {
            stationHighC, stationHighRawC: summary.runningHighRawC,
            signal: 'LIKELY_YES', currentYesPrice: yesPrice, fairValue, edge,
            confidence,
            reason: `Past 5PM local, high is ${stationHighC}°C ≤ ${thresholdC}°C (${gap}°C buffer)`,
          };
        }
      }
    } else {
      // Exact bucket: "X°C" — resolves YES if actual high rounds to X°C
      const bucketC = outcome.temperatureC;

      if (summary.isComplete || pastPeakHours) {
        // Day is done or past peak — we know the high
        if (stationHighC === bucketC) {
          // This bucket should win
          const confidence = pastPeakHours && !summary.isComplete ? 0.85 : 0.98;
          const fairValue = confidence;
          const edge = fairValue - yesPrice;
          if (edge > 0.03) {
            return {
              stationHighC, stationHighRawC: summary.runningHighRawC,
              signal: 'GUARANTEED_YES', currentYesPrice: yesPrice, fairValue, edge,
              confidence,
              reason: `Station high is ${stationHighC}°C = bucket ${bucketC}°C`,
            };
          }
        } else {
          // Wrong bucket — should be 0
          const confidence = pastPeakHours && !summary.isComplete ? 0.85 : 0.98;
          const fairValue = 1 - confidence;
          const edge = fairValue - yesPrice;
          if (Math.abs(edge) > 0.03 && yesPrice > 0.05) {
            return {
              stationHighC, stationHighRawC: summary.runningHighRawC,
              signal: 'DEAD', currentYesPrice: yesPrice, fairValue, edge,
              confidence,
              reason: `Station high is ${stationHighC}°C ≠ bucket ${bucketC}°C`,
            };
          }
        }
      } else if (nearPeak) {
        // Near peak hours — high is forming but not locked in
        // If current high already exceeds this bucket, it's dead
        if (stationHighC > bucketC) {
          const fairValue = 0.0;
          const edge = fairValue - yesPrice;
          if (Math.abs(edge) > 0.05 && yesPrice > 0.05) {
            return {
              stationHighC, stationHighRawC: summary.runningHighRawC,
              signal: 'DEAD', currentYesPrice: yesPrice, fairValue, edge,
              confidence: 0.95,
              reason: `Already ${stationHighC}°C at ${localHour.toFixed(0)}h local — can't come back to ${bucketC}°C`,
            };
          }
        }
      }
    }

    return null;
  }

  // Track pre-resolution price movements to detect if others are doing this
  // Returns data about how prices changed in the last N hours before resolution
  getPreResolutionPriceMovement(market: PolymarketWeatherMarket): {
    hoursToResolution: number;
    pricesAlreadyCollapsed: boolean;
    collapseEvidence: string;
  } {
    const now = Date.now();
    const endTime = market.endDate.getTime();
    const hoursLeft = (endTime - now) / 3600000;

    // Check if any outcomes are already near 0 or 100
    let collapsed = 0;
    let total = 0;
    for (const o of market.outcomes) {
      total++;
      if (o.yesPrice > 0.90 || o.yesPrice < 0.05) collapsed++;
    }

    const pctCollapsed = total > 0 ? collapsed / total : 0;
    const pricesAlreadyCollapsed = pctCollapsed > 0.7 && hoursLeft < 6;

    return {
      hoursToResolution: hoursLeft,
      pricesAlreadyCollapsed,
      collapseEvidence: pricesAlreadyCollapsed
        ? `${collapsed}/${total} outcomes at extreme prices (>90% or <5%) with ${hoursLeft.toFixed(1)}h left — others likely scraping actuals`
        : `${collapsed}/${total} outcomes at extremes — market still has uncertainty`,
    };
  }

  // Get all station summaries for dashboard display
  async getAllSummaries(targetDate: string): Promise<DailyStationSummary[]> {
    const allObs = await this.fetchAllObservations();
    const summaries: DailyStationSummary[] = [];

    for (const location of WEATHER_LOCATIONS) {
      const icao = CITY_TO_ICAO[location.name];
      if (!icao) continue;

      const obs = allObs.get(icao);
      if (!obs) continue;

      const summary = this.getDailySummary(obs, location, targetDate);
      if (summary) summaries.push(summary);
    }

    return summaries;
  }
}

export default ResolutionEdgeService;
