// OBIS Marine Wildlife Service
// Ocean Biodiversity Information System — 178M+ marine records
// Tracks whales, dolphins, sharks, seals near coastal cities
// Marine mammals approach shores before pressure drops / storms
// No auth required, free API

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface MarineObservation {
  species: string;
  commonName: string;
  lat: number;
  lon: number;
  eventDate: string;
  datasetName: string;
  order: string;
  family: string;
  shoreDistance: number | null; // meters
}

export interface MarineSignal {
  city: string;
  isCoastal: boolean;
  recentSightings: number;
  whaleCount: number;
  sharkCount: number;
  sealCount: number;
  dolphinCount: number;
  avgShoreDistance: number;    // Average distance from shore in km
  anomalyDetected: boolean;
  anomalyType: 'NONE' | 'SHORE_APPROACH' | 'DEEP_DIVE' | 'UNUSUAL_SPECIES' | 'CLUSTER';
  description: string;
  weatherImplication: 'NONE' | 'PRESSURE_DROP' | 'STORM_INCOMING' | 'CURRENT_SHIFT';
  confidence: number;
}

const OBIS_BASE = 'https://api.obis.org/v3';

// WoRMS taxon IDs for weather-relevant marine life
const MARINE_TAXA = {
  cetacea: 2688,       // Whales & dolphins
  sharks: 10194,       // Elasmobranchii (sharks & rays)
  pinnipedia: 148816,  // Seals & sea lions
};

// Coastal cities from our weather locations (within ~100km of coast)
const COASTAL_CITIES: Record<string, boolean> = {
  'NYC': true, 'Miami': true, 'LA': true, 'London': true,
  'Tokyo': true, 'Hong Kong': true, 'Shanghai': true,
  'Wellington': true, 'Milan': false, 'Denver': false,
  'Chicago': false, 'Seoul': true, 'Beijing': false,
  'Mexico City': false,
};

class OBISMarineService {
  private cache: Map<string, { data: MarineSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 60 * 60 * 1000; // 1 hour — marine data updates slowly

  // Fetch marine occurrences near a location using bounding box
  private async fetchOccurrences(lat: number, lon: number, radiusKm: number, taxonId: number): Promise<MarineObservation[]> {
    try {
      // Use WKT POLYGON bounding box instead of POINT+radius
      const degOffset = radiusKm / 111; // ~111km per degree
      const minLat = lat - degOffset;
      const maxLat = lat + degOffset;
      const minLon = lon - degOffset;
      const maxLon = lon + degOffset;
      const wkt = `POLYGON((${minLon} ${minLat},${maxLon} ${minLat},${maxLon} ${maxLat},${minLon} ${maxLat},${minLon} ${minLat}))`;

      const url = `${OBIS_BASE}/occurrence?geometry=${encodeURIComponent(wkt)}&taxonid=${taxonId}&size=100`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return [];

      const data = (await resp.json()) as any;
      return (data.results || []).map((r: any) => ({
        species: r.species || r.scientificName || '',
        commonName: r.vernacularName || r.species || '',
        lat: r.decimalLatitude || 0,
        lon: r.decimalLongitude || 0,
        eventDate: r.eventDate || '',
        datasetName: r.datasetName || '',
        order: r.order || '',
        family: r.family || '',
        shoreDistance: r.shoredistance || null,
      }));
    } catch (e) {
      console.error(`[OBIS] Fetch error: ${(e as Error).message}`);
      return [];
    }
  }

  // Analyze marine wildlife near a city
  async analyzeCity(location: WeatherLocation): Promise<MarineSignal> {
    const isCoastal = COASTAL_CITIES[location.name] ?? false;

    if (!isCoastal) {
      return {
        city: location.name, isCoastal: false, recentSightings: 0,
        whaleCount: 0, sharkCount: 0, sealCount: 0, dolphinCount: 0,
        avgShoreDistance: 0, anomalyDetected: false, anomalyType: 'NONE',
        description: 'Inland city — no marine data', weatherImplication: 'NONE', confidence: 0,
      };
    }

    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    // Fetch all marine taxa in parallel
    const [whales, sharks, seals] = await Promise.all([
      this.fetchOccurrences(location.lat, location.lon, 200, MARINE_TAXA.cetacea),
      this.fetchOccurrences(location.lat, location.lon, 200, MARINE_TAXA.sharks),
      this.fetchOccurrences(location.lat, location.lon, 200, MARINE_TAXA.pinnipedia),
    ]);

    const allObs = [...whales, ...sharks, ...seals];
    const total = allObs.length;

    // Count dolphins vs other cetaceans
    const dolphinCount = whales.filter(w =>
      w.family?.toLowerCase().includes('delphinid') || w.order?.toLowerCase().includes('delphin')
    ).length;
    const whaleCount = whales.length - dolphinCount;

    // Average shore distance
    const shoreDistances = allObs.filter(o => o.shoreDistance != null).map(o => o.shoreDistance!);
    const avgShoreDistance = shoreDistances.length > 0
      ? Math.round(shoreDistances.reduce((s, d) => s + d, 0) / shoreDistances.length / 1000 * 10) / 10
      : -1;

    // Anomaly detection
    let anomalyDetected = false;
    let anomalyType: MarineSignal['anomalyType'] = 'NONE';
    let description = `${total} marine sightings (${whaleCount} whales, ${dolphinCount} dolphins, ${sharks.length} sharks, ${seals.length} seals)`;
    let weatherImplication: MarineSignal['weatherImplication'] = 'NONE';
    let confidence = 0;

    // Shore approach — animals unusually close to shore
    if (avgShoreDistance > 0 && avgShoreDistance < 5 && total > 3) {
      anomalyDetected = true;
      anomalyType = 'SHORE_APPROACH';
      description = `Marine mammals unusually close to shore (avg ${avgShoreDistance}km) — possible pressure drop`;
      weatherImplication = 'PRESSURE_DROP';
      confidence = 0.4;
    }

    // Unusual clustering
    if (total > 20) {
      anomalyDetected = true;
      anomalyType = 'CLUSTER';
      description = `High marine activity: ${total} sightings near ${location.name} — unusual aggregation`;
      weatherImplication = 'CURRENT_SHIFT';
      confidence = 0.3;
    }

    const result: MarineSignal = {
      city: location.name,
      isCoastal: true,
      recentSightings: total,
      whaleCount,
      sharkCount: sharks.length,
      sealCount: seals.length,
      dolphinCount,
      avgShoreDistance,
      anomalyDetected,
      anomalyType,
      description,
      weatherImplication,
      confidence,
    };

    this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Get signals for all coastal cities
  async getAllSignals(): Promise<MarineSignal[]> {
    const signals: MarineSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      try {
        const signal = await this.analyzeCity(loc);
        signals.push(signal);
        if (COASTAL_CITIES[loc.name]) {
          await new Promise(r => setTimeout(r, 1000)); // Rate limit for coastal cities
        }
      } catch {
        signals.push({
          city: loc.name, isCoastal: COASTAL_CITIES[loc.name] ?? false,
          recentSightings: 0, whaleCount: 0, sharkCount: 0, sealCount: 0, dolphinCount: 0,
          avgShoreDistance: 0, anomalyDetected: false, anomalyType: 'NONE',
          description: 'Error fetching data', weatherImplication: 'NONE', confidence: 0,
        });
      }
    }
    return signals;
  }
}

export default OBISMarineService;
