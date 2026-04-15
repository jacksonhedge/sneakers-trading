// FAA Airport Status Service
// Fetches real-time FAA NAS Status data to confirm weather events happening RIGHT NOW
// Ground stops / ground delays = hard evidence weather is on the ground, not just forecast
// Key insight: FAA ground stops are almost exclusively weather-driven — real-time verification

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type DelaySeverity = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';
export type WeatherType = 'thunderstorms' | 'wind' | 'fog' | 'snow' | 'ice' | 'general';
export type DelayTrend = 'Increasing' | 'Decreasing' | 'stable';

export interface GroundStop {
  airport: string;
  reason: string;
  endTime: string;
}

export interface GroundDelay {
  airport: string;
  reason: string;
  avgMinutes: number;
  maxMinutes: number;
}

export interface ArrivalDepartureDelay {
  airport: string;
  reason: string;
  type: 'Arrival' | 'Departure' | 'Unknown';
  minMinutes: number;
  maxMinutes: number;
  trend: DelayTrend;
}

export interface AirportClosure {
  airport: string;
  reason: string;
  start: string;
  reopen: string;
}

export interface AirportDelayInfo {
  iata: string;
  groundStop: GroundStop | null;
  groundDelay: GroundDelay | null;
  arrivalDepartureDelays: ArrivalDepartureDelay[];
  closure: AirportClosure | null;
  maxDelayMinutes: number;
  severity: DelaySeverity;
  isWeatherRelated: boolean;
  weatherTypes: WeatherType[];
}

export interface FAAWeatherSignal {
  city: string;
  airports: AirportDelayInfo[];
  overallSeverity: DelaySeverity;
  isWeatherRelated: boolean;
  weatherType: WeatherType;           // dominant weather type
  maxDelayMinutes: number;
  trend: DelayTrend;
  confidence: number;                  // 0–1: how confident we are in weather assessment
  estimatedTempImpactF: number;        // estimated temperature impact in °F
  fetchedAt: Date;
}

// ---------------------------------------------------------------------------
// City → airport IATA codes (US airports only — FAA NAS only covers US NAS)
// ---------------------------------------------------------------------------

const CITY_AIRPORTS: Record<string, string[]> = {
  'NYC':          ['JFK', 'LGA', 'EWR', 'TEB'],
  'Chicago':      ['ORD', 'MDW'],
  'LA':           ['LAX', 'SNA', 'BUR'],
  'Miami':        ['MIA', 'FLL'],
  'Denver':       ['DEN'],
  'London':       [],   // Non-US — FAA NAS does not cover
  'Tokyo':        [],
  'Seoul':        [],
  'Hong Kong':    [],
  'Shanghai':     [],
  'Mexico City':  [],
  'Wellington':   [],
  'Beijing':      [],
  'Milan':        [],
};

// ---------------------------------------------------------------------------
// Delay duration parsing helpers
// ---------------------------------------------------------------------------

/**
 * Convert a FAA delay string like "40 minutes", "1 hour and 28 minutes",
 * "2 hours and 15 minutes" into a total minutes integer.
 */
function parseDelayMinutes(raw: string): number {
  if (!raw) return 0;
  const s = raw.trim().toLowerCase();

  // "X hour[s] and Y minute[s]"
  const hoursAndMinutes = s.match(/(\d+)\s*hour[s]?\s+and\s+(\d+)\s*minute[s]?/);
  if (hoursAndMinutes) {
    return parseInt(hoursAndMinutes[1], 10) * 60 + parseInt(hoursAndMinutes[2], 10);
  }

  // "X hour[s]"
  const hoursOnly = s.match(/(\d+)\s*hour[s]?/);
  if (hoursOnly) {
    return parseInt(hoursOnly[1], 10) * 60;
  }

  // "X minute[s]"
  const minutesOnly = s.match(/(\d+)\s*minute[s]?/);
  if (minutesOnly) {
    return parseInt(minutesOnly[1], 10);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Weather-reason detection
// ---------------------------------------------------------------------------

const WEATHER_KEYWORDS: Record<WeatherType, RegExp> = {
  thunderstorms: /thunder|tstm|convect/i,
  wind:          /wind/i,
  fog:           /fog|vis|visibility|ifr|low ceiling/i,
  snow:          /snow|blizzard|winter/i,
  ice:           /ice|icing|freezing/i,
  general:       /wx|weather/i,
};

function detectWeatherTypes(reason: string): WeatherType[] {
  if (!reason) return [];
  const types: WeatherType[] = [];
  for (const [type, re] of Object.entries(WEATHER_KEYWORDS) as [WeatherType, RegExp][]) {
    if (re.test(reason)) {
      types.push(type);
    }
  }
  return types;
}

function isWeatherReason(reason: string): boolean {
  return (
    /thunderstorm|thunder|tstm|wind|WX|weather|fog|snow|ice|icing|blizzard|freezing|convect|vis|ifr/i.test(reason)
  );
}

/** Pick the single most-severe weather type from a list. */
function dominantWeatherType(types: WeatherType[]): WeatherType {
  const priority: WeatherType[] = ['thunderstorms', 'snow', 'ice', 'fog', 'wind', 'general'];
  for (const p of priority) {
    if (types.includes(p)) return p;
  }
  return 'general';
}

// ---------------------------------------------------------------------------
// Temperature impact estimation
// ---------------------------------------------------------------------------

function estimateTempImpact(weatherType: WeatherType, severity: DelaySeverity): number {
  if (severity === 'NONE') return 0;
  switch (weatherType) {
    case 'thunderstorms': return -8;
    case 'snow':          return -15;
    case 'ice':           return -10;
    case 'fog':           return -3;
    case 'wind':          return -2;
    case 'general':       return -5;
  }
}

// ---------------------------------------------------------------------------
// Severity determination
// ---------------------------------------------------------------------------

function severityFromDelays(
  hasGroundStop: boolean,
  hasClosure: boolean,
  maxDelayMinutes: number,
): DelaySeverity {
  if (hasGroundStop || hasClosure || maxDelayMinutes > 120) return 'SEVERE';
  if (maxDelayMinutes >= 60) return 'MODERATE';
  if (maxDelayMinutes > 0) return 'MINOR';
  return 'NONE';
}

// ---------------------------------------------------------------------------
// XML parsing helpers (regex-based, no xml2js)
// ---------------------------------------------------------------------------

/** Extract the text content of all occurrences of a tag. */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

/** Extract the first occurrence of a tag's text content. */
function extractFirst(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

/** Extract an attribute value from the first tag match. */
function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'));
  return m ? m[1].trim() : '';
}

// ---------------------------------------------------------------------------
// Raw FAA data types
// ---------------------------------------------------------------------------

interface RawFAAData {
  groundStops: GroundStop[];
  groundDelays: GroundDelay[];
  arrivalDepartureDelays: ArrivalDepartureDelay[];
  closures: AirportClosure[];
  updateTime: string;
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

export default class FAAStatusService {
  private readonly FAA_URL = 'https://nasstatus.faa.gov/api/airport-status-information';
  private readonly CACHE_TTL = 120 * 1000; // 120 seconds

  /** Shared cache for the raw FAA XML response (single endpoint). */
  private rawCache: { data: RawFAAData; fetchedAt: number } | null = null;

  /** Per-city signal cache. */
  private signalCache: Map<string, { data: FAAWeatherSignal; fetchedAt: number }> = new Map();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Fetch and parse FAA status. Returns full raw dataset. */
  async fetchStatus(): Promise<RawFAAData> {
    if (this.rawCache && Date.now() - this.rawCache.fetchedAt < this.CACHE_TTL) {
      return this.rawCache.data;
    }

    let xml = '';
    try {
      const resp = await fetch(this.FAA_URL, {
        headers: {
          'User-Agent': 'SneakersWeatherBot/1.0',
          Accept: 'application/xml, text/xml, */*',
        },
        timeout: 15000,
      } as any);

      if (!resp.ok) {
        throw new Error(`FAA status HTTP ${resp.status}`);
      }
      xml = await resp.text();
    } catch (err) {
      console.error('[FAAStatusService] fetch error:', err);
      // Return empty structure on failure so callers degrade gracefully
      return { groundStops: [], groundDelays: [], arrivalDepartureDelays: [], closures: [], updateTime: '' };
    }

    const data = this.parseXML(xml);
    this.rawCache = { data, fetchedAt: Date.now() };
    return data;
  }

  /** Get a weather signal for a single WeatherLocation. */
  async getWeatherSignal(location: WeatherLocation): Promise<FAAWeatherSignal> {
    const cached = this.signalCache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL) {
      return cached.data;
    }

    const raw = await this.fetchStatus();
    const signal = this.buildSignal(location.name, raw);

    this.signalCache.set(location.name, { data: signal, fetchedAt: Date.now() });
    return signal;
  }

  /** Get weather signals for all WEATHER_LOCATIONS. */
  async getAllSignals(): Promise<FAAWeatherSignal[]> {
    const raw = await this.fetchStatus();
    return WEATHER_LOCATIONS.map((loc) => this.buildSignal(loc.name, raw));
  }

  // -------------------------------------------------------------------------
  // XML parsing
  // -------------------------------------------------------------------------

  private parseXML(xml: string): RawFAAData {
    const updateTime = extractFirst(xml, 'Update_Time');

    // ---- Ground Stops -------------------------------------------------------
    const groundStops: GroundStop[] = [];
    const groundStopBlocks = extractAll(xml, 'Program');
    for (const block of groundStopBlocks) {
      const arpt = extractFirst(block, 'ARPT');
      if (!arpt) continue;
      groundStops.push({
        airport: arpt.toUpperCase(),
        reason: extractFirst(block, 'Reason'),
        endTime: extractFirst(block, 'End_Time'),
      });
    }

    // ---- Ground Delays -------------------------------------------------------
    const groundDelays: GroundDelay[] = [];
    const groundDelayBlocks = extractAll(xml, 'Ground_Delay');
    for (const block of groundDelayBlocks) {
      const arpt = extractFirst(block, 'ARPT');
      if (!arpt) continue;
      const avgRaw = extractFirst(block, 'Avg');
      const maxRaw = extractFirst(block, 'Max');
      groundDelays.push({
        airport: arpt.toUpperCase(),
        reason: extractFirst(block, 'Reason'),
        avgMinutes: parseDelayMinutes(avgRaw),
        maxMinutes: parseDelayMinutes(maxRaw),
      });
    }

    // ---- Arrival/Departure Delays --------------------------------------------
    const arrivalDepartureDelays: ArrivalDepartureDelay[] = [];
    const adDelayBlocks = extractAll(xml, 'Delay');
    for (const block of adDelayBlocks) {
      const arpt = extractFirst(block, 'ARPT');
      if (!arpt) continue;

      // There may be multiple Arrival_Departure sub-elements
      const adBlocks = extractAll(block, 'Arrival_Departure');
      if (adBlocks.length === 0) {
        // Fallback: treat entire block as one entry
        arrivalDepartureDelays.push({
          airport: arpt.toUpperCase(),
          reason: extractFirst(block, 'Reason'),
          type: 'Unknown',
          minMinutes: 0,
          maxMinutes: 0,
          trend: 'stable',
        });
        continue;
      }

      for (const adBlock of adBlocks) {
        // Type is an attribute: <Arrival_Departure Type="Departure">
        const typeAttr = extractAttr(block, 'Arrival_Departure', 'Type') as 'Arrival' | 'Departure' | 'Unknown';
        const minRaw = extractFirst(adBlock, 'Min');
        const maxRaw = extractFirst(adBlock, 'Max');
        const trendRaw = extractFirst(adBlock, 'Trend').trim();
        const trend: DelayTrend =
          trendRaw === 'Increasing' ? 'Increasing'
          : trendRaw === 'Decreasing' ? 'Decreasing'
          : 'stable';

        arrivalDepartureDelays.push({
          airport: arpt.toUpperCase(),
          reason: extractFirst(block, 'Reason'),
          type: typeAttr || 'Unknown',
          minMinutes: parseDelayMinutes(minRaw),
          maxMinutes: parseDelayMinutes(maxRaw),
          trend,
        });
      }
    }

    // ---- Airport Closures ---------------------------------------------------
    const closures: AirportClosure[] = [];
    const closureBlocks = extractAll(xml, 'Airport');
    for (const block of closureBlocks) {
      const arpt = extractFirst(block, 'ARPT');
      if (!arpt) continue;
      closures.push({
        airport: arpt.toUpperCase(),
        reason: extractFirst(block, 'Reason'),
        start: extractFirst(block, 'Start'),
        reopen: extractFirst(block, 'Reopen'),
      });
    }

    return { groundStops, groundDelays, arrivalDepartureDelays, closures, updateTime };
  }

  // -------------------------------------------------------------------------
  // Signal construction
  // -------------------------------------------------------------------------

  private buildSignal(cityName: string, raw: RawFAAData): FAAWeatherSignal {
    const airportCodes = CITY_AIRPORTS[cityName] ?? [];

    const airportInfos: AirportDelayInfo[] = airportCodes.map((iata) =>
      this.buildAirportInfo(iata, raw),
    );

    // Aggregate across all city airports
    const allWeatherTypes: WeatherType[] = [];
    let overallMaxDelayMinutes = 0;
    let hasGroundStop = false;
    let hasClosure = false;
    let anyWeatherRelated = false;
    const trends: DelayTrend[] = [];

    for (const info of airportInfos) {
      overallMaxDelayMinutes = Math.max(overallMaxDelayMinutes, info.maxDelayMinutes);
      if (info.groundStop) hasGroundStop = true;
      if (info.closure) hasClosure = true;
      if (info.isWeatherRelated) anyWeatherRelated = true;
      allWeatherTypes.push(...info.weatherTypes);
      for (const ad of info.arrivalDepartureDelays) {
        trends.push(ad.trend);
      }
    }

    const overallSeverity = severityFromDelays(hasGroundStop, hasClosure, overallMaxDelayMinutes);
    const dominant = allWeatherTypes.length > 0 ? dominantWeatherType([...new Set(allWeatherTypes)]) : 'general';

    // Trend: prefer Increasing > stable > Decreasing
    const overallTrend: DelayTrend =
      trends.includes('Increasing') ? 'Increasing'
      : trends.includes('Decreasing') ? 'Decreasing'
      : 'stable';

    // Confidence: higher when we have direct ground stop or closure confirmation
    let confidence = 0;
    if (overallSeverity !== 'NONE') {
      confidence = 0.5; // base
      if (hasGroundStop) confidence = Math.min(1, confidence + 0.35);
      if (hasClosure) confidence = Math.min(1, confidence + 0.25);
      if (anyWeatherRelated) confidence = Math.min(1, confidence + 0.15);
      if (overallSeverity === 'MODERATE') confidence = Math.min(1, confidence + 0.05);
      if (overallSeverity === 'SEVERE') confidence = Math.min(1, confidence + 0.10);
    }

    const estimatedTempImpactF =
      anyWeatherRelated ? estimateTempImpact(dominant, overallSeverity) : 0;

    return {
      city: cityName,
      airports: airportInfos,
      overallSeverity,
      isWeatherRelated: anyWeatherRelated,
      weatherType: dominant,
      maxDelayMinutes: overallMaxDelayMinutes,
      trend: overallTrend,
      confidence: Math.round(confidence * 100) / 100,
      estimatedTempImpactF,
      fetchedAt: new Date(),
    };
  }

  private buildAirportInfo(iata: string, raw: RawFAAData): AirportDelayInfo {
    const groundStop = raw.groundStops.find((g) => g.airport === iata) ?? null;
    const groundDelay = raw.groundDelays.find((g) => g.airport === iata) ?? null;
    const arrivalDepartureDelays = raw.arrivalDepartureDelays.filter((d) => d.airport === iata);
    const closure = raw.closures.find((c) => c.airport === iata) ?? null;

    // Collect all reasons to check for weather
    const allReasons = [
      groundStop?.reason ?? '',
      groundDelay?.reason ?? '',
      ...arrivalDepartureDelays.map((d) => d.reason),
      closure?.reason ?? '',
    ];

    const weatherTypes: WeatherType[] = [];
    let anyWeatherRelated = false;
    for (const r of allReasons) {
      if (!r) continue;
      if (isWeatherReason(r)) anyWeatherRelated = true;
      weatherTypes.push(...detectWeatherTypes(r));
    }

    // Derive max delay
    let maxDelayMinutes = 0;
    if (groundDelay) maxDelayMinutes = Math.max(maxDelayMinutes, groundDelay.maxMinutes);
    for (const ad of arrivalDepartureDelays) {
      maxDelayMinutes = Math.max(maxDelayMinutes, ad.maxMinutes);
    }

    const severity = severityFromDelays(!!groundStop, !!closure, maxDelayMinutes);

    return {
      iata,
      groundStop,
      groundDelay,
      arrivalDepartureDelays,
      closure,
      maxDelayMinutes,
      severity,
      isWeatherRelated: anyWeatherRelated,
      weatherTypes: [...new Set(weatherTypes)],
    };
  }
}
