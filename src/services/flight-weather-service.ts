// Flight Weather Proxy Service
// Uses OpenSky Network to detect airport departure drops = incoming weather
// When departure rates drop below baseline, airports are experiencing ground stops/delays
// Ground stops are almost exclusively weather-driven — 1-3hr leading indicator
// No auth required for anonymous access

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface AirportFlightStatus {
  city: string;
  airport: string;
  departures1h: number;
  arrivals1h: number;
  aircraftInArea: number;
  baselineDepartures: number;  // Expected hourly departures
  departureRate: number;       // % of baseline
  weatherDisruption: boolean;
  disruptionSeverity: 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';
  description: string;
}

// Map cities to airports and typical hourly departure counts
const CITY_AIRPORTS: Record<string, { icao: string; iata: string; baselineDepsPerHour: number; lat: number; lon: number }> = {
  'NYC': { icao: 'KJFK', iata: 'JFK', baselineDepsPerHour: 35, lat: 40.6413, lon: -73.7781 },
  'Chicago': { icao: 'KORD', iata: 'ORD', baselineDepsPerHour: 50, lat: 41.9742, lon: -87.9073 },
  'LA': { icao: 'KLAX', iata: 'LAX', baselineDepsPerHour: 40, lat: 33.9425, lon: -118.4081 },
  'Miami': { icao: 'KMIA', iata: 'MIA', baselineDepsPerHour: 25, lat: 25.7959, lon: -80.2870 },
  'Denver': { icao: 'KDEN', iata: 'DEN', baselineDepsPerHour: 40, lat: 39.8561, lon: -104.6737 },
  'London': { icao: 'EGLL', iata: 'LHR', baselineDepsPerHour: 45, lat: 51.4700, lon: -0.4543 },
  'Tokyo': { icao: 'RJTT', iata: 'HND', baselineDepsPerHour: 40, lat: 35.5494, lon: 139.7798 },
};

class FlightWeatherService {
  private cache: Map<string, { data: AirportFlightStatus; fetchedAt: number }> = new Map();
  private cacheTTL = 15 * 60 * 1000; // 15 min

  // Count aircraft in area (proxy for airport activity)
  private async countAircraftInArea(lat: number, lon: number): Promise<number> {
    try {
      // Bounding box ~50km around airport
      const offset = 0.5; // ~50km
      const url = `https://opensky-network.org/api/states/all?lamin=${lat - offset}&lomin=${lon - offset}&lamax=${lat + offset}&lomax=${lon + offset}`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return -1;

      const data = (await resp.json()) as any;
      return data.states?.length || 0;
    } catch {
      return -1;
    }
  }

  // Fetch departure count for an airport in the last hour
  private async fetchDepartures(icao: string): Promise<number> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;
      const url = `https://opensky-network.org/api/flights/departure?airport=${icao}&begin=${oneHourAgo}&end=${now}`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return -1;

      const data = (await resp.json()) as any;
      return Array.isArray(data) ? data.length : -1;
    } catch {
      return -1;
    }
  }

  // Fetch arrival count
  private async fetchArrivals(icao: string): Promise<number> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;
      const url = `https://opensky-network.org/api/flights/arrival?airport=${icao}&begin=${oneHourAgo}&end=${now}`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return -1;

      const data = (await resp.json()) as any;
      return Array.isArray(data) ? data.length : -1;
    } catch {
      return -1;
    }
  }

  // Analyze flight activity for a city
  async getCityStatus(location: WeatherLocation): Promise<AirportFlightStatus | null> {
    const airport = CITY_AIRPORTS[location.name];
    if (!airport) return null;

    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    // Fetch departures, arrivals, and area aircraft count
    const [departures, arrivals, aircraft] = await Promise.all([
      this.fetchDepartures(airport.icao),
      this.fetchArrivals(airport.icao),
      this.countAircraftInArea(airport.lat, airport.lon),
    ]);

    // Adjust baseline for time of day (reduced at night)
    const hour = new Date().getUTCHours();
    const timeMultiplier = (hour >= 6 && hour <= 22) ? 1.0 : 0.3;
    const adjustedBaseline = Math.round(airport.baselineDepsPerHour * timeMultiplier);

    const departureRate = adjustedBaseline > 0 && departures >= 0
      ? Math.round((departures / adjustedBaseline) * 100)
      : -1;

    // Detect weather disruption
    let weatherDisruption = false;
    let disruptionSeverity: AirportFlightStatus['disruptionSeverity'] = 'NONE';
    let description = `${airport.iata}: ${departures >= 0 ? departures : '?'} departures/hr`;

    if (departureRate >= 0 && departureRate < 80) {
      if (departureRate < 30) {
        weatherDisruption = true;
        disruptionSeverity = 'SEVERE';
        description = `${airport.iata}: SEVERE disruption — only ${departureRate}% of normal departures (${departures}/${adjustedBaseline})`;
      } else if (departureRate < 50) {
        weatherDisruption = true;
        disruptionSeverity = 'MODERATE';
        description = `${airport.iata}: Moderate delays — ${departureRate}% of normal (${departures}/${adjustedBaseline})`;
      } else {
        weatherDisruption = true;
        disruptionSeverity = 'MINOR';
        description = `${airport.iata}: Minor delays — ${departureRate}% of normal (${departures}/${adjustedBaseline})`;
      }
    } else if (departures >= 0) {
      description += ` (${departureRate}% of baseline ${adjustedBaseline})`;
    }

    if (aircraft >= 0) {
      description += ` | ${aircraft} aircraft in area`;
    }

    const result: AirportFlightStatus = {
      city: location.name,
      airport: airport.iata,
      departures1h: departures,
      arrivals1h: arrivals,
      aircraftInArea: aircraft,
      baselineDepartures: adjustedBaseline,
      departureRate,
      weatherDisruption,
      disruptionSeverity,
      description,
    };

    this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
    return result;
  }

  // Get all city statuses
  async getAllStatuses(): Promise<AirportFlightStatus[]> {
    const statuses: AirportFlightStatus[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      if (!CITY_AIRPORTS[loc.name]) continue;
      const status = await this.getCityStatus(loc);
      if (status) statuses.push(status);
      await new Promise(r => setTimeout(r, 2000)); // OpenSky rate limit is tight
    }
    return statuses;
  }
}

export default FlightWeatherService;
