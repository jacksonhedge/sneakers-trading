// eBird Migration Anomaly Service
// Tracks bird migration patterns via Cornell Lab's eBird API
// Notable/rare sightings correlate with pressure systems and incoming weather fronts
// Birds alter migration routes and timing based on atmospheric conditions

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface BirdObservation {
  speciesCode: string;
  commonName: string;
  scientificName: string;
  locationName: string;
  lat: number;
  lon: number;
  observedAt: string;
  count: number;
  isNotable: boolean;
}

export interface MigrationSignal {
  city: string;
  recentObservations: number;
  notableObservations: number;
  speciesCount: number;
  migrationActivity: 'LOW' | 'NORMAL' | 'ELEVATED' | 'SURGE';
  anomalyDetected: boolean;
  anomalyDescription: string;
  weatherImplication: 'NONE' | 'FRONT_APPROACHING' | 'CLEARING_SKIES' | 'STORM_AVOIDANCE';
  topNotableSpecies: string[];
  observationDensity: number;  // Observations per km^2 (relative)
}

// eBird API key — users should set this in .env
// Free key from https://ebird.org/api/keygen
// Read lazily so dotenv has time to load before we check
const getEbirdKey = () => process.env.EBIRD_API_KEY || '';
const EBIRD_BASE = 'https://api.ebird.org/v2';

class EBirdService {
  private cache: Map<string, { data: MigrationSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 30 * 60 * 1000; // 30 min
  private requestCount = 0;
  private requestResetTime = Date.now();
  private maxRequestsPerHour = 90; // Stay under 100/hr limit

  private canMakeRequest(): boolean {
    if (Date.now() - this.requestResetTime > 3600000) {
      this.requestCount = 0;
      this.requestResetTime = Date.now();
    }
    return this.requestCount < this.maxRequestsPerHour;
  }

  private async ebirdFetch(endpoint: string): Promise<any> {
    if (!getEbirdKey()) return null;
    if (!this.canMakeRequest()) return null;

    this.requestCount++;

    const resp = await fetch(`${EBIRD_BASE}${endpoint}`, {
      headers: {
        'x-ebirdapitoken': getEbirdKey(),
        'User-Agent': 'SneakersWeatherBot/1.0',
      },
      timeout: 10000,
    } as any);

    if (!resp.ok) {
      if (resp.status === 429) {
        console.warn('[eBird] Rate limited — pausing requests');
        this.requestCount = this.maxRequestsPerHour; // Stop until reset
      }
      return null;
    }

    return resp.json();
  }

  // Get recent observations near a city
  async getRecentObservations(location: WeatherLocation, daysBack = 3): Promise<BirdObservation[]> {
    const data = await this.ebirdFetch(
      `/data/obs/geo/recent?lat=${location.lat}&lng=${location.lon}&dist=40&back=${daysBack}&maxResults=200`
    );
    if (!data || !Array.isArray(data)) return [];

    return data.map((obs: any) => ({
      speciesCode: obs.speciesCode || '',
      commonName: obs.comName || '',
      scientificName: obs.sciName || '',
      locationName: obs.locName || '',
      lat: obs.lat || 0,
      lon: obs.lng || 0,
      observedAt: obs.obsDt || '',
      count: obs.howMany || 0,
      isNotable: false,
    }));
  }

  // Get notable/rare observations (migration anomalies)
  async getNotableObservations(location: WeatherLocation, daysBack = 7): Promise<BirdObservation[]> {
    const data = await this.ebirdFetch(
      `/data/obs/geo/recent/notable?lat=${location.lat}&lng=${location.lon}&dist=50&back=${daysBack}&detail=full`
    );
    if (!data || !Array.isArray(data)) return [];

    return data.map((obs: any) => ({
      speciesCode: obs.speciesCode || '',
      commonName: obs.comName || '',
      scientificName: obs.sciName || '',
      locationName: obs.locName || '',
      lat: obs.lat || 0,
      lon: obs.lng || 0,
      observedAt: obs.obsDt || '',
      count: obs.howMany || 0,
      isNotable: true,
    }));
  }

  // Analyze migration patterns near a city for weather signals
  async analyzeMigration(location: WeatherLocation): Promise<MigrationSignal> {
    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    if (!getEbirdKey()) {
      const noKey: MigrationSignal = {
        city: location.name, recentObservations: 0, notableObservations: 0, speciesCount: 0,
        migrationActivity: 'NORMAL', anomalyDetected: false,
        anomalyDescription: 'No eBird API key configured (set EBIRD_API_KEY in .env)',
        weatherImplication: 'NONE', topNotableSpecies: [], observationDensity: 0,
      };
      this.cache.set(location.name, { data: noKey, fetchedAt: Date.now() });
      return noKey;
    }

    const [recent, notable] = await Promise.all([
      this.getRecentObservations(location, 3),
      this.getNotableObservations(location, 7),
    ]);

    // Count unique species
    const speciesSet = new Set(recent.map(o => o.speciesCode));

    // Analyze migration activity
    const obsCount = recent.length;
    const notableCount = notable.length;
    const speciesCount = speciesSet.size;

    // Activity level based on observation density
    let migrationActivity: MigrationSignal['migrationActivity'] = 'NORMAL';
    if (obsCount > 150 || speciesCount > 80) migrationActivity = 'SURGE';
    else if (obsCount > 100 || speciesCount > 50) migrationActivity = 'ELEVATED';
    else if (obsCount < 20) migrationActivity = 'LOW';

    // Anomaly detection
    let anomalyDetected = false;
    let anomalyDescription = 'Normal migration patterns';
    let weatherImplication: MigrationSignal['weatherImplication'] = 'NONE';

    // High notable count = unusual species appearing (pushed by weather systems)
    if (notableCount > 5) {
      anomalyDetected = true;
      anomalyDescription = `${notableCount} rare species detected — birds may be displaced by approaching weather system`;
      weatherImplication = 'FRONT_APPROACHING';
    }
    // Surge in observations = migration wave (often follows cold front passage)
    else if (migrationActivity === 'SURGE') {
      anomalyDetected = true;
      anomalyDescription = `Migration surge: ${obsCount} observations, ${speciesCount} species — post-front fallout or staging before weather`;
      weatherImplication = 'CLEARING_SKIES';
    }
    // Very low activity = birds avoiding area (storm/severe weather)
    else if (migrationActivity === 'LOW' && speciesCount < 10) {
      anomalyDetected = true;
      anomalyDescription = `Unusually low bird activity (${obsCount} obs, ${speciesCount} species) — possible storm avoidance`;
      weatherImplication = 'STORM_AVOIDANCE';
    }

    // Top notable species
    const topNotable = notable
      .reduce((acc: { name: string; count: number }[], obs) => {
        const existing = acc.find(a => a.name === obs.commonName);
        if (existing) existing.count++;
        else acc.push({ name: obs.commonName, count: 1 });
        return acc;
      }, [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(s => s.name);

    const result: MigrationSignal = {
      city: location.name,
      recentObservations: obsCount,
      notableObservations: notableCount,
      speciesCount,
      migrationActivity,
      anomalyDetected,
      anomalyDescription,
      weatherImplication,
      topNotableSpecies: topNotable,
      observationDensity: Math.round(obsCount / 50 * 10) / 10, // Relative to 50km search radius
    };

    this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Get signals for all monitored cities (rate-limit aware)
  async getAllSignals(): Promise<MigrationSignal[]> {
    const signals: MigrationSignal[] = [];

    for (const loc of WEATHER_LOCATIONS) {
      if (!this.canMakeRequest()) {
        signals.push({
          city: loc.name, recentObservations: 0, notableObservations: 0, speciesCount: 0,
          migrationActivity: 'NORMAL', anomalyDetected: false,
          anomalyDescription: 'Rate limited — will refresh next cycle',
          weatherImplication: 'NONE', topNotableSpecies: [], observationDensity: 0,
        });
        continue;
      }

      try {
        const signal = await this.analyzeMigration(loc);
        signals.push(signal);
        await new Promise(r => setTimeout(r, 1000)); // Be gentle with rate limits
      } catch {
        signals.push({
          city: loc.name, recentObservations: 0, notableObservations: 0, speciesCount: 0,
          migrationActivity: 'NORMAL', anomalyDetected: false,
          anomalyDescription: 'Error fetching data', weatherImplication: 'NONE',
          topNotableSpecies: [], observationDensity: 0,
        });
      }
    }

    return signals;
  }

  hasApiKey(): boolean {
    return !!getEbirdKey();
  }
}

export default EBirdService;
