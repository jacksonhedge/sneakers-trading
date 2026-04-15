// Movebank Animal Tracking Service
// Pulls GPS tracking data from tagged animals (birds, bats, sharks, mammals)
// Detects behavioral anomalies that may indicate incoming weather fronts
// Animals change behavior before storms — direction changes, altitude drops, clustering

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

// Movebank credentials — free account at movebank.org
// Read lazily so dotenv has time to load before we check
const getMovebank = () => ({
  user: process.env.MOVEBANK_USER || '',
  pass: process.env.MOVEBANK_PASS || '',
});

export interface AnimalStudy {
  id: number;
  name: string;
  lat: number;
  lon: number;
  species: string;
  individualCount: number;
}

export interface AnimalEvent {
  timestamp: string;
  lat: number;
  lon: number;
  individualId: string;
  studyId: number;
}

export interface AnimalBehaviorSignal {
  city: string;
  studiesNearby: number;
  recentEvents: number;
  anomalyDetected: boolean;
  anomalyType: 'NONE' | 'DIRECTION_CHANGE' | 'ALTITUDE_DROP' | 'CLUSTERING' | 'FLIGHT_HALT';
  anomalyStrength: number;  // 0-100
  signalDescription: string;
  weatherImplication: 'NONE' | 'FRONT_APPROACHING' | 'STORM_INCOMING' | 'PRESSURE_DROP';
  leadTimeHours: number;  // Estimated hours before weather arrives
  confidence: number;  // 0-1
}

// Movebank study IDs for weather-relevant species near our cities
// These are real Movebank study IDs for migratory birds in relevant regions
const WEATHER_RELEVANT_STUDIES: { studyId: number; name: string; species: string; region: string }[] = [
  { studyId: 2911040, name: 'Turkey Vultures Acopian', species: 'Turkey Vulture', region: 'Eastern US' },
  { studyId: 9651291, name: 'Movebank Barn Swallows', species: 'Barn Swallow', region: 'Global' },
  { studyId: 10449318, name: 'GPS tracking White Storks', species: 'White Stork', region: 'Europe' },
  { studyId: 164325437, name: 'Frigate bird tracking', species: 'Frigate Bird', region: 'Tropical' },
];

// Map cities to approximate search radius
const CITY_SEARCH_RADIUS_KM = 200;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class MovebankService {
  private cache: Map<string, { data: AnimalBehaviorSignal; fetchedAt: number }> = new Map();
  private studyCache: AnimalStudy[] = [];
  private studyCacheFetchedAt = 0;
  private cacheTTL = 30 * 60 * 1000; // 30 min — animal data doesn't change rapidly
  private studyCacheTTL = 6 * 60 * 60 * 1000; // 6 hours for study list

  // Fetch available studies and filter to weather-relevant ones near our cities
  async fetchStudiesNearCity(location: WeatherLocation): Promise<AnimalStudy[]> {
    // Use cached study list if available
    if (this.studyCache.length > 0 && Date.now() - this.studyCacheFetchedAt < this.studyCacheTTL) {
      return this.studyCache.filter(s =>
        distanceKm(location.lat, location.lon, s.lat, s.lon) < CITY_SEARCH_RADIUS_KM
      );
    }

    try {
      const url = 'https://www.movebank.org/movebank/service/direct-read?entity_type=study&attributes=id,name,main_location_lat,main_location_long,number_of_individuals,taxon_ids';
      const headers: Record<string, string> = { 'User-Agent': 'SneakersWeatherBot/1.0' };
      const { user, pass } = getMovebank();
      if (user && pass) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
      }
      const resp = await fetch(url, {
        headers,
        timeout: 15000,
      } as any);
      if (!resp.ok) return [];

      const csv = await resp.text();
      const lines = csv.split('\n');
      const header = lines[0]?.split(',') || [];
      const idxId = header.indexOf('id');
      const idxName = header.indexOf('name');
      const idxLat = header.indexOf('main_location_lat');
      const idxLon = header.indexOf('main_location_long');
      const idxCount = header.indexOf('number_of_individuals');

      const studies: AnimalStudy[] = [];
      for (let i = 1; i < Math.min(lines.length, 5000); i++) {
        const fields = lines[i]?.split(',');
        if (!fields || fields.length < Math.max(idxId, idxLat, idxLon) + 1) continue;

        const lat = parseFloat(fields[idxLat]);
        const lon = parseFloat(fields[idxLon]);
        if (isNaN(lat) || isNaN(lon)) continue;

        studies.push({
          id: parseInt(fields[idxId]) || 0,
          name: (fields[idxName] || '').replace(/"/g, ''),
          lat, lon,
          species: '',
          individualCount: parseInt(fields[idxCount]) || 0,
        });
      }

      this.studyCache = studies;
      this.studyCacheFetchedAt = Date.now();

      return studies.filter(s =>
        distanceKm(location.lat, location.lon, s.lat, s.lon) < CITY_SEARCH_RADIUS_KM
      );
    } catch (e) {
      console.error(`[Movebank] Study fetch error: ${(e as Error).message}`);
      return [];
    }
  }

  // Fetch recent events from a study (GPS positions in last 24h)
  async fetchRecentEvents(studyId: number, hoursBack = 24): Promise<AnimalEvent[]> {
    try {
      const start = Date.now() - hoursBack * 3600 * 1000;
      const url = `https://www.movebank.org/movebank/service/direct-read?entity_type=event&study_id=${studyId}&sensor_type_id=653&timestamp_start=${start}&attributes=timestamp,location_lat,location_long,individual_id`;

      const evtHeaders: Record<string, string> = { 'User-Agent': 'SneakersWeatherBot/1.0' };
      const { user: evtUser, pass: evtPass } = getMovebank();
      if (evtUser && evtPass) {
        evtHeaders['Authorization'] = 'Basic ' + Buffer.from(`${evtUser}:${evtPass}`).toString('base64');
      }
      const resp = await fetch(url, {
        headers: evtHeaders,
        timeout: 15000,
      } as any);
      if (!resp.ok) return [];

      const csv = await resp.text();
      const lines = csv.split('\n');
      const header = lines[0]?.split(',') || [];
      const idxTs = header.indexOf('timestamp');
      const idxLat = header.indexOf('location_lat');
      const idxLon = header.indexOf('location_long');
      const idxInd = header.indexOf('individual_id');

      const events: AnimalEvent[] = [];
      for (let i = 1; i < Math.min(lines.length, 1000); i++) {
        const fields = lines[i]?.split(',');
        if (!fields || fields.length < 4) continue;

        const lat = parseFloat(fields[idxLat]);
        const lon = parseFloat(fields[idxLon]);
        if (isNaN(lat) || isNaN(lon)) continue;

        events.push({
          timestamp: fields[idxTs] || '',
          lat, lon,
          individualId: fields[idxInd] || '',
          studyId,
        });
      }

      return events;
    } catch {
      return [];
    }
  }

  // Analyze animal behavior near a city for weather signals
  async analyzeBehavior(location: WeatherLocation): Promise<AnimalBehaviorSignal> {
    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const studies = await this.fetchStudiesNearCity(location);
    let totalEvents = 0;
    let anomalyDetected = false;
    let anomalyType: AnimalBehaviorSignal['anomalyType'] = 'NONE';
    let anomalyStrength = 0;
    const { user: mbUser } = getMovebank();
    let signalDescription = mbUser ? 'No animal tracking data available nearby' : 'Set MOVEBANK_USER & MOVEBANK_PASS in .env (free at movebank.org)';
    let weatherImplication: AnimalBehaviorSignal['weatherImplication'] = 'NONE';
    let leadTimeHours = 0;
    let confidence = 0;

    // Try to get events from known weather-relevant studies
    const relevantStudyIds = WEATHER_RELEVANT_STUDIES
      .filter(ws => {
        // Check if this study is near the city
        const study = studies.find(s => s.id === ws.studyId);
        return !!study;
      })
      .map(ws => ws.studyId);

    // Also try the top 3 closest studies with most individuals
    const topStudies = studies
      .filter(s => s.individualCount > 5)
      .sort((a, b) => {
        const distA = distanceKm(location.lat, location.lon, a.lat, a.lon);
        const distB = distanceKm(location.lat, location.lon, b.lat, b.lon);
        return distA - distB;
      })
      .slice(0, 3);

    const studiesToCheck = [...new Set([...relevantStudyIds, ...topStudies.map(s => s.id)])].slice(0, 5);

    for (const studyId of studiesToCheck) {
      try {
        const events = await this.fetchRecentEvents(studyId, 24);
        totalEvents += events.length;

        if (events.length >= 10) {
          // Analyze for anomalies
          const analysis = this.detectAnomalies(events, location);
          if (analysis.anomalyStrength > anomalyStrength) {
            anomalyDetected = analysis.anomalyDetected;
            anomalyType = analysis.anomalyType;
            anomalyStrength = analysis.anomalyStrength;
            signalDescription = analysis.description;
            weatherImplication = analysis.weatherImplication;
            leadTimeHours = analysis.leadTimeHours;
            confidence = analysis.confidence;
          }
        }

        await new Promise(r => setTimeout(r, 500)); // Rate limit
      } catch { /* skip study */ }
    }

    if (studies.length > 0 && totalEvents === 0) {
      signalDescription = `${studies.length} studies nearby, no recent events (data may require auth)`;
    } else if (studies.length > 0 && !anomalyDetected) {
      signalDescription = `${totalEvents} animal positions from ${studiesToCheck.length} studies — normal behavior`;
    }

    const result: AnimalBehaviorSignal = {
      city: location.name,
      studiesNearby: studies.length,
      recentEvents: totalEvents,
      anomalyDetected,
      anomalyType,
      anomalyStrength,
      signalDescription,
      weatherImplication,
      leadTimeHours,
      confidence,
    };

    this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Detect behavioral anomalies in GPS event data
  private detectAnomalies(events: AnimalEvent[], targetCity: WeatherLocation): {
    anomalyDetected: boolean;
    anomalyType: AnimalBehaviorSignal['anomalyType'];
    anomalyStrength: number;
    description: string;
    weatherImplication: AnimalBehaviorSignal['weatherImplication'];
    leadTimeHours: number;
    confidence: number;
  } {
    // Group events by individual
    const byIndividual = new Map<string, AnimalEvent[]>();
    for (const e of events) {
      const arr = byIndividual.get(e.individualId) || [];
      arr.push(e);
      byIndividual.set(e.individualId, arr);
    }

    let directionChanges = 0;
    let clusteringScore = 0;
    let flightHalts = 0;
    const totalIndividuals = byIndividual.size;

    for (const [_, indEvents] of byIndividual) {
      if (indEvents.length < 3) continue;

      // Sort by timestamp
      indEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Check for sudden direction changes
      for (let i = 2; i < indEvents.length; i++) {
        const bearing1 = this.bearing(indEvents[i - 2].lat, indEvents[i - 2].lon, indEvents[i - 1].lat, indEvents[i - 1].lon);
        const bearing2 = this.bearing(indEvents[i - 1].lat, indEvents[i - 1].lon, indEvents[i].lat, indEvents[i].lon);
        const turnAngle = Math.abs(bearing2 - bearing1);
        const normalizedTurn = turnAngle > 180 ? 360 - turnAngle : turnAngle;
        if (normalizedTurn > 90) directionChanges++;
      }

      // Check for flight halt (multiple positions very close together)
      const lastEvents = indEvents.slice(-5);
      if (lastEvents.length >= 3) {
        const maxDist = Math.max(...lastEvents.slice(1).map(e =>
          distanceKm(lastEvents[0].lat, lastEvents[0].lon, e.lat, e.lon)
        ));
        if (maxDist < 0.5) flightHalts++; // Less than 500m movement
      }
    }

    // Check for clustering (many individuals in small area)
    if (events.length >= 20) {
      const latCenter = events.reduce((s, e) => s + e.lat, 0) / events.length;
      const lonCenter = events.reduce((s, e) => s + e.lon, 0) / events.length;
      const avgDist = events.reduce((s, e) => s + distanceKm(latCenter, lonCenter, e.lat, e.lon), 0) / events.length;
      // Low average distance = clustering
      if (avgDist < 10) clusteringScore = Math.max(0, 100 - avgDist * 10);
    }

    // Determine if anomaly is significant
    const directionChangePct = totalIndividuals > 0 ? directionChanges / totalIndividuals : 0;
    const flightHaltPct = totalIndividuals > 0 ? flightHalts / totalIndividuals : 0;

    if (directionChangePct > 0.5 && directionChanges > 3) {
      return {
        anomalyDetected: true,
        anomalyType: 'DIRECTION_CHANGE',
        anomalyStrength: Math.min(100, Math.round(directionChangePct * 100)),
        description: `${directionChanges}/${totalIndividuals} animals reversed direction — possible pressure system incoming`,
        weatherImplication: 'FRONT_APPROACHING',
        leadTimeHours: 6,
        confidence: Math.min(0.7, directionChangePct * 0.8),
      };
    }

    if (flightHaltPct > 0.4 && flightHalts > 2) {
      return {
        anomalyDetected: true,
        anomalyType: 'FLIGHT_HALT',
        anomalyStrength: Math.min(100, Math.round(flightHaltPct * 100)),
        description: `${flightHalts}/${totalIndividuals} animals stopped moving — potential storm sheltering behavior`,
        weatherImplication: 'STORM_INCOMING',
        leadTimeHours: 3,
        confidence: Math.min(0.6, flightHaltPct * 0.7),
      };
    }

    if (clusteringScore > 50) {
      return {
        anomalyDetected: true,
        anomalyType: 'CLUSTERING',
        anomalyStrength: Math.round(clusteringScore),
        description: `Animals clustering tightly (score ${Math.round(clusteringScore)}) — possible pressure drop response`,
        weatherImplication: 'PRESSURE_DROP',
        leadTimeHours: 4,
        confidence: clusteringScore / 200,
      };
    }

    return {
      anomalyDetected: false,
      anomalyType: 'NONE',
      anomalyStrength: 0,
      description: 'Normal movement patterns',
      weatherImplication: 'NONE',
      leadTimeHours: 0,
      confidence: 0,
    };
  }

  // Calculate bearing between two points
  private bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  // Get signals for all monitored cities
  hasCredentials(): boolean { const { user, pass } = getMovebank(); return !!(user && pass); }

  async getAllSignals(): Promise<AnimalBehaviorSignal[]> {
    const signals: AnimalBehaviorSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      try {
        const signal = await this.analyzeBehavior(loc);
        signals.push(signal);
      } catch {
        signals.push({
          city: loc.name, studiesNearby: 0, recentEvents: 0,
          anomalyDetected: false, anomalyType: 'NONE', anomalyStrength: 0,
          signalDescription: 'Error fetching data', weatherImplication: 'NONE',
          leadTimeHours: 0, confidence: 0,
        });
      }
    }
    return signals;
  }
}

export default MovebankService;
