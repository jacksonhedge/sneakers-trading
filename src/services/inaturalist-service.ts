// iNaturalist Wildlife Observation Service
// Tracks bird, mammal, and insect observations near monitored cities
// Sudden drops in observation density = animals sheltering before storm fronts
// Surges in unusual species = weather-displaced animals
// No auth required, 100 req/min rate limit

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface WildlifeObservation {
  id: number;
  species: string;
  commonName: string;
  taxonGroup: string;
  lat: number;
  lon: number;
  observedAt: string;
  count: number;
  qualityGrade: string;
  locationName: string;
}

export interface WildlifeSignal {
  city: string;
  recentObservations: number;     // Last 24h
  baselineObservations: number;   // 7-day daily average
  observationChange: number;      // % change from baseline (-40% = drop)
  speciesCount: number;
  topSpecies: { name: string; count: number }[];
  anomalyDetected: boolean;
  anomalyType: 'NONE' | 'ACTIVITY_DROP' | 'ACTIVITY_SURGE' | 'SPECIES_DISPLACEMENT' | 'INSECT_HALT';
  signalStrength: number;         // 0-100
  weatherImplication: 'NONE' | 'FRONT_APPROACHING' | 'STORM_INCOMING' | 'POST_FRONT_FALLOUT' | 'PRESSURE_DROP';
  description: string;
  confidence: number;             // 0-1
}

const INATURALIST_BASE = 'https://api.inaturalist.org/v1';

// Taxon IDs for weather-relevant groups
const TAXON_IDS = {
  birds: 3,
  mammals: 40151,
  insects: 47158,
};

class INaturalistService {
  private cache: Map<string, { data: WildlifeSignal; fetchedAt: number }> = new Map();
  private baselineCache: Map<string, { avg: number; fetchedAt: number }> = new Map();
  private cacheTTL = 30 * 60 * 1000; // 30 min
  private baselineTTL = 6 * 60 * 60 * 1000; // 6 hours

  // Fetch recent observations near a location
  private async fetchObservations(lat: number, lon: number, radiusKm: number, taxonId: number, daysBack: number): Promise<WildlifeObservation[]> {
    try {
      const d2 = new Date().toISOString().split('T')[0];
      const d1 = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

      const url = `${INATURALIST_BASE}/observations?lat=${lat}&lng=${lon}&radius=${radiusKm}&taxon_id=${taxonId}&d1=${d1}&d2=${d2}&order=desc&order_by=observed_on&per_page=200&quality_grade=research,needs_id`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 12000,
      } as any);
      if (!resp.ok) return [];

      const data = (await resp.json()) as any;
      const results = data.results || [];

      return results.map((r: any) => {
        const loc = (r.location || '').split(',');
        return {
          id: r.id || 0,
          species: r.taxon?.name || '',
          commonName: r.taxon?.preferred_common_name || r.taxon?.name || 'Unknown',
          taxonGroup: r.taxon?.iconic_taxon_name || '',
          lat: parseFloat(loc[0]) || lat,
          lon: parseFloat(loc[1]) || lon,
          observedAt: r.observed_on || r.time_observed_at || '',
          count: 1, // iNaturalist is per-observation
          qualityGrade: r.quality_grade || '',
          locationName: r.place_guess || '',
        };
      });
    } catch (e) {
      console.error(`[iNaturalist] Fetch error: ${(e as Error).message}`);
      return [];
    }
  }

  // Get species count summary
  private async fetchSpeciesCounts(lat: number, lon: number, radiusKm: number, daysBack: number): Promise<{ name: string; count: number }[]> {
    try {
      const d2 = new Date().toISOString().split('T')[0];
      const d1 = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

      const url = `${INATURALIST_BASE}/observations/species_counts?lat=${lat}&lng=${lon}&radius=${radiusKm}&d1=${d1}&d2=${d2}&taxon_id=${TAXON_IDS.birds}&per_page=20`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return [];

      const data = (await resp.json()) as any;
      return (data.results || []).map((r: any) => ({
        name: r.taxon?.preferred_common_name || r.taxon?.name || 'Unknown',
        count: r.count || 0,
      }));
    } catch {
      return [];
    }
  }

  // Get baseline daily observation count (7-day average)
  private async getBaseline(location: WeatherLocation): Promise<number> {
    const key = `baseline:${location.name}`;
    const cached = this.baselineCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.baselineTTL) return cached.avg;

    try {
      // Get total observations in last 7 days
      const d2 = new Date().toISOString().split('T')[0];
      const d1 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

      const url = `${INATURALIST_BASE}/observations?lat=${location.lat}&lng=${location.lon}&radius=80&taxon_id=${TAXON_IDS.birds}&d1=${d1}&d2=${d2}&per_page=1`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return 0;

      const data = (await resp.json()) as any;
      const totalWeek = data.total_results || 0;
      const dailyAvg = Math.round(totalWeek / 7);

      this.baselineCache.set(key, { avg: dailyAvg, fetchedAt: Date.now() });
      return dailyAvg;
    } catch {
      return 0;
    }
  }

  // Analyze wildlife patterns for weather signals
  async analyzeCity(location: WeatherLocation): Promise<WildlifeSignal> {
    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    // Fetch recent bird observations (last 1 day) and baseline in parallel
    const [recentBirds, speciesCounts, baseline] = await Promise.all([
      this.fetchObservations(location.lat, location.lon, 80, TAXON_IDS.birds, 1),
      this.fetchSpeciesCounts(location.lat, location.lon, 80, 1),
      this.getBaseline(location),
    ]);

    const recentCount = recentBirds.length;
    const speciesCount = new Set(recentBirds.map(o => o.species)).size;

    // Calculate change from baseline
    const observationChange = baseline > 0
      ? Math.round(((recentCount - baseline) / baseline) * 100)
      : 0;

    // Anomaly detection
    let anomalyDetected = false;
    let anomalyType: WildlifeSignal['anomalyType'] = 'NONE';
    let signalStrength = 0;
    let weatherImplication: WildlifeSignal['weatherImplication'] = 'NONE';
    let description = `${recentCount} bird observations (baseline: ${baseline}/day)`;
    let confidence = 0;

    if (baseline > 10) {
      // Significant drop in observations — animals sheltering before storm
      if (observationChange < -40) {
        anomalyDetected = true;
        anomalyType = 'ACTIVITY_DROP';
        signalStrength = Math.min(100, Math.abs(observationChange));
        weatherImplication = observationChange < -60 ? 'STORM_INCOMING' : 'FRONT_APPROACHING';
        description = `Bird activity down ${Math.abs(observationChange)}% from baseline (${recentCount} vs ${baseline} avg) — possible incoming weather system`;
        confidence = Math.min(0.7, Math.abs(observationChange) / 150);
      }
      // Surge in observations — post-front fallout, birds grounded by weather
      else if (observationChange > 60) {
        anomalyDetected = true;
        anomalyType = 'ACTIVITY_SURGE';
        signalStrength = Math.min(100, observationChange);
        weatherImplication = 'POST_FRONT_FALLOUT';
        description = `Bird activity surge +${observationChange}% (${recentCount} vs ${baseline} avg) — possible post-front fallout or migration wave`;
        confidence = Math.min(0.5, observationChange / 200);
      }
    }

    const result: WildlifeSignal = {
      city: location.name,
      recentObservations: recentCount,
      baselineObservations: baseline,
      observationChange,
      speciesCount,
      topSpecies: speciesCounts.slice(0, 5),
      anomalyDetected,
      anomalyType,
      signalStrength,
      weatherImplication,
      description,
      confidence,
    };

    this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Analyze all monitored cities
  async getAllSignals(): Promise<WildlifeSignal[]> {
    const signals: WildlifeSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      try {
        const signal = await this.analyzeCity(loc);
        signals.push(signal);
        await new Promise(r => setTimeout(r, 600)); // Rate limit spacing
      } catch {
        signals.push({
          city: loc.name, recentObservations: 0, baselineObservations: 0,
          observationChange: 0, speciesCount: 0, topSpecies: [],
          anomalyDetected: false, anomalyType: 'NONE', signalStrength: 0,
          weatherImplication: 'NONE', description: 'Error fetching data', confidence: 0,
        });
      }
    }
    return signals;
  }
}

export default INaturalistService;
