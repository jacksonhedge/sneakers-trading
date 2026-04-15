// Blitzortung Real-Time Lightning Detection Service
// Connects to Blitzortung.org WebSocket for live global lightning strike data
// Tracks strike density near each monitored city for storm activity assessment

import WebSocket from 'ws';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface LightningStrike {
  lat: number;
  lon: number;
  time: number;  // Unix ms
  polarity: number;
  signal: number;
}

export interface CityLightningStatus {
  city: string;
  strikesNear: number;      // Within 50km in last 30min
  strikesMedium: number;    // Within 100km
  strikesWide: number;      // Within 200km
  closestStrikeKm: number;
  lastStrikeTime: Date | null;
  activityLevel: 'NONE' | 'DISTANT' | 'NEARBY' | 'OVERHEAD' | 'INTENSE';
  strikesPerMinute: number;
  approachingCity: boolean;  // Are strikes getting closer over time?
  estimatedTempImpactF: number;
}

// Haversine distance in km
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class BlitzortungService {
  private ws: WebSocket | null = null;
  private strikes: LightningStrike[] = [];
  private maxStrikes = 10000;
  private retentionMs = 30 * 60 * 1000; // Keep 30min of strikes
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cityCache: Map<string, { data: CityLightningStatus; fetchedAt: number }> = new Map();
  private cacheTTL = 30 * 1000; // 30s cache — lightning data is fast-moving

  // Start WebSocket connection
  connect(): void {
    if (this.connected || this.ws) return;

    try {
      this.ws = new WebSocket('wss://ws1.blitzortung.org/');

      this.ws.on('open', () => {
        this.connected = true;
        console.log('[Blitzortung] WebSocket connected — receiving live lightning data');
        // Subscribe to global strikes
        this.ws?.send(JSON.stringify({ a: 418 })); // Region code for global
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.lat !== undefined && msg.lon !== undefined) {
            this.strikes.push({
              lat: msg.lat,
              lon: msg.lon,
              time: msg.time ? msg.time / 1e6 : Date.now(), // Blitzortung sends nanoseconds
              polarity: msg.pol || 0,
              signal: Array.isArray(msg.sig) ? msg.sig.length : 0,
            });

            // Trim old strikes
            if (this.strikes.length > this.maxStrikes) {
              this.strikes = this.strikes.slice(-this.maxStrikes / 2);
            }
          }
        } catch { /* ignore parse errors */ }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        console.log('[Blitzortung] WebSocket disconnected — reconnecting in 10s');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error(`[Blitzortung] WebSocket error: ${err.message}`);
        this.connected = false;
        try { this.ws?.close(); } catch {}
        this.ws = null;
        this.scheduleReconnect();
      });
    } catch (e) {
      console.error(`[Blitzortung] Connect error: ${(e as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 10000);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
  }

  isConnected(): boolean { return this.connected; }

  // Get recent strikes count
  getRecentStrikeCount(): number {
    const cutoff = Date.now() - this.retentionMs;
    return this.strikes.filter(s => s.time > cutoff).length;
  }

  // Purge old data
  private pruneStrikes(): void {
    const cutoff = Date.now() - this.retentionMs;
    this.strikes = this.strikes.filter(s => s.time > cutoff);
  }

  // Analyze lightning near a city
  getCityStatus(location: WeatherLocation): CityLightningStatus {
    const cached = this.cityCache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    this.pruneStrikes();

    const now = Date.now();
    const window30m = now - 30 * 60 * 1000;
    const window5m = now - 5 * 60 * 1000;

    let strikesNear = 0;    // <50km
    let strikesMedium = 0;  // <100km
    let strikesWide = 0;    // <200km
    let closestKm = Infinity;
    let lastStrikeTime: number | null = null;

    // Track distance trend for approach detection
    const recentDistances: { time: number; dist: number }[] = [];

    for (const s of this.strikes) {
      if (s.time < window30m) continue;

      const dist = distanceKm(location.lat, location.lon, s.lat, s.lon);
      if (dist > 200) continue;

      strikesWide++;
      if (dist < 100) strikesMedium++;
      if (dist < 50) strikesNear++;
      if (dist < closestKm) closestKm = dist;
      if (!lastStrikeTime || s.time > lastStrikeTime) lastStrikeTime = s.time;

      recentDistances.push({ time: s.time, dist });
    }

    // Activity level
    let activityLevel: CityLightningStatus['activityLevel'] = 'NONE';
    if (strikesNear > 20) activityLevel = 'INTENSE';
    else if (strikesNear > 5) activityLevel = 'OVERHEAD';
    else if (strikesMedium > 5) activityLevel = 'NEARBY';
    else if (strikesWide > 3) activityLevel = 'DISTANT';

    // Strikes per minute (last 5 min)
    const recentStrikes = this.strikes.filter(s => s.time > window5m && distanceKm(location.lat, location.lon, s.lat, s.lon) < 100);
    const strikesPerMinute = Math.round(recentStrikes.length / 5 * 10) / 10;

    // Approach detection: are average distances decreasing over time?
    let approachingCity = false;
    if (recentDistances.length >= 4) {
      const half = Math.floor(recentDistances.length / 2);
      const olderAvg = recentDistances.slice(0, half).reduce((s, d) => s + d.dist, 0) / half;
      const newerAvg = recentDistances.slice(half).reduce((s, d) => s + d.dist, 0) / (recentDistances.length - half);
      approachingCity = newerAvg < olderAvg * 0.8; // Strikes getting 20%+ closer
    }

    // Temperature impact — storms bring cooling
    let estimatedTempImpactF = 0;
    if (activityLevel === 'INTENSE') estimatedTempImpactF = -12;
    else if (activityLevel === 'OVERHEAD') estimatedTempImpactF = -8;
    else if (activityLevel === 'NEARBY') estimatedTempImpactF = -4;
    else if (activityLevel === 'DISTANT' && approachingCity) estimatedTempImpactF = -2;

    const result: CityLightningStatus = {
      city: location.name,
      strikesNear,
      strikesMedium,
      strikesWide,
      closestStrikeKm: closestKm === Infinity ? -1 : Math.round(closestKm),
      lastStrikeTime: lastStrikeTime ? new Date(lastStrikeTime) : null,
      activityLevel,
      strikesPerMinute,
      approachingCity,
      estimatedTempImpactF,
    };

    this.cityCache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Get status for all monitored cities
  getAllCityStatuses(): CityLightningStatus[] {
    return WEATHER_LOCATIONS.map(loc => this.getCityStatus(loc));
  }

  // Get raw recent strikes for map overlay (limited)
  getRecentStrikes(limit = 500): LightningStrike[] {
    this.pruneStrikes();
    return this.strikes.slice(-limit);
  }
}

export default BlitzortungService;
