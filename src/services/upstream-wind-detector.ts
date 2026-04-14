// Upstream Wind Detector — Spatial weather propagation analysis
// Monitors "sentinel" locations upwind of target cities to detect incoming weather changes
// before they arrive. If a cold front is 150km west of NYC and wind is 25mph from the west,
// we know it arrives in ~4 hours — giving us a trading edge before the market reacts.
//
// How it works:
//   1. For each target city, define sentinel stations in 8 compass directions (50-200km away)
//   2. Fetch current conditions at the target + all sentinels in parallel
//   3. Check the upwind sentinel (based on current wind direction at target)
//   4. Compare upwind conditions vs target — differences = incoming weather
//   5. Estimate arrival time = distance / wind speed
//   6. Generate alerts: "Cold air mass 120km NW of London, arriving in ~3h, -4°F impact"

import fetch from 'node-fetch';
import { WeatherLocation } from './noaa-weather-service.js';

export interface SentinelStation {
  name: string;          // e.g., "NYC-NW" or "Reading (W of London)"
  lat: number;
  lon: number;
  bearing: number;       // Compass bearing FROM target city (0=N, 90=E, 180=S, 270=W)
  distanceKm: number;    // Distance from target city
}

export interface UpstreamConditions {
  tempF: number;
  cloudCoverPct: number;
  windSpeedMph: number;
  windDirectionDeg: number;
  precipMm: number;
}

export interface UpstreamAlert {
  targetCity: string;
  targetDate: string;
  sentinelName: string;
  sentinelBearing: number;
  distanceKm: number;
  // What's different upstream
  tempDiffF: number;         // Upstream temp - target temp (negative = colder air incoming)
  cloudDiffPct: number;      // Upstream clouds - target clouds
  precipUpstream: number;    // Precip at sentinel (mm)
  // Timing
  windSpeedMph: number;
  estimatedArrivalHours: number;
  estimatedArrivalTime: string;
  // Impact assessment
  impactDirection: 'WARMER' | 'COOLER' | 'WETTER' | 'CLEARING';
  impactMagnitudeF: number;
  confidence: number;        // 0-1
  description: string;
}

// Sentinel stations around each target city — positioned along actual weather corridors
//
// Design principles:
//   1. CLOSE "tripwire" stations (20-50km) for rapid detection (minutes to ~1hr lead)
//   2. MID-RANGE stations (60-150km) for 1-4 hour advance warning
//   3. FAR stations (150-300km) for strategic 4-8 hour forecasting
//   4. Aligned with PREVAILING WIND directions, not arbitrary compass points
//   5. Account for terrain blockers (Rockies, Alps, basins)
//   6. Cover cold front approach corridors (typically NW in NH)
//
// Season-aware: April = transitional for NH (W/NW dominant), early autumn for SH
//
const SENTINEL_NETWORKS: Record<string, SentinelStation[]> = {
  // NYC: Prevailing W/NW. Cold fronts from NW, nor'easters from NE.
  // Appalachians to W channel flow. Coastal plain otherwise flat.
  'NYC': [
    // CLOSE — rapid detection
    { name: 'Newark (W-near)', lat: 40.74, lon: -74.17, bearing: 270, distanceKm: 15 },
    { name: 'White Plains (N-near)', lat: 41.03, lon: -73.77, bearing: 350, distanceKm: 40 },
    { name: 'New Brunswick (SW-near)', lat: 40.49, lon: -74.45, bearing: 235, distanceKm: 40 },
    // MID — 1-3 hour lead on W/NW flow
    { name: 'Allentown (W)', lat: 40.60, lon: -75.49, bearing: 275, distanceKm: 120 },
    { name: 'Scranton (NW)', lat: 41.41, lon: -75.66, bearing: 315, distanceKm: 160 },
    { name: 'Danbury CT (NE)', lat: 41.40, lon: -73.45, bearing: 30, distanceKm: 85 },
    // FAR — 4-6 hour strategic (cold front approach)
    { name: 'Harrisburg (W-far)', lat: 40.27, lon: -76.88, bearing: 270, distanceKm: 230 },
    { name: 'Albany (N-far)', lat: 42.65, lon: -73.76, bearing: 0, distanceKm: 220 },
  ],
  // Chicago: Prevailing W/NW across open prairie. Lake Michigan to E.
  // Cold fronts from NW (Alberta clippers), storms from SW (Colorado lows).
  'Chicago': [
    // CLOSE — rapid detection on flat prairie
    { name: 'Aurora (W-near)', lat: 41.76, lon: -88.32, bearing: 270, distanceKm: 50 },
    { name: 'Joliet (SW-near)', lat: 41.53, lon: -88.08, bearing: 225, distanceKm: 45 },
    { name: 'Waukegan (N-near)', lat: 42.36, lon: -87.84, bearing: 0, distanceKm: 55 },
    // MID — 1-3 hour lead (W/NW wind corridor)
    { name: 'Rockford (NW)', lat: 42.27, lon: -89.09, bearing: 310, distanceKm: 130 },
    { name: 'DeKalb (W)', lat: 41.93, lon: -88.75, bearing: 275, distanceKm: 95 },
    { name: 'Kankakee (S)', lat: 41.12, lon: -87.86, bearing: 180, distanceKm: 85 },
    // FAR — cold front early warning across prairie
    { name: 'Dubuque (NW-far)', lat: 42.50, lon: -90.66, bearing: 310, distanceKm: 280 },
    { name: 'Champaign (SW-far)', lat: 40.12, lon: -88.24, bearing: 200, distanceKm: 200 },
  ],
  // LA: Prevailing W/SW onshore Pacific. Santa Ana from NE/E through passes.
  // San Gabriel Mtns to N/E block continental air. Coastal basin.
  'LA': [
    // CLOSE — detect sea breeze shifts and approaching marine layer
    { name: 'Santa Monica (W-near)', lat: 34.02, lon: -118.49, bearing: 270, distanceKm: 25 },
    { name: 'Pasadena (N-near)', lat: 34.15, lon: -118.14, bearing: 0, distanceKm: 20 },
    { name: 'Long Beach (S-near)', lat: 33.77, lon: -118.19, bearing: 180, distanceKm: 35 },
    // MID — Pacific storms and marine layer approach
    { name: 'Oxnard (WNW)', lat: 34.20, lon: -119.18, bearing: 290, distanceKm: 100 },
    { name: 'Camarillo (NW)', lat: 34.22, lon: -119.04, bearing: 305, distanceKm: 85 },
    // MID — Santa Ana wind detection (NE through Cajon/Banning passes)
    { name: 'Palmdale (NE)', lat: 34.58, lon: -118.12, bearing: 15, distanceKm: 60 },
    { name: 'San Bernardino (E)', lat: 34.11, lon: -117.29, bearing: 80, distanceKm: 85 },
    // FAR — Pacific storm early warning
    { name: 'Santa Barbara (NW-far)', lat: 34.42, lon: -119.70, bearing: 305, distanceKm: 150 },
  ],
  // Miami: Prevailing E/SE (trade winds). Cold fronts from NW/N.
  // Dead flat, surrounded by water. Sea breeze convergence drives afternoon storms.
  'Miami': [
    // CLOSE — trade wind corridor detection
    { name: 'Fort Lauderdale (N-near)', lat: 26.12, lon: -80.14, bearing: 0, distanceKm: 45 },
    { name: 'Homestead (S-near)', lat: 25.47, lon: -80.48, bearing: 200, distanceKm: 40 },
    // MID — cold front approach from NW/N
    { name: 'Palm Beach (N)', lat: 26.72, lon: -80.05, bearing: 0, distanceKm: 110 },
    { name: 'Naples (W)', lat: 26.14, lon: -81.79, bearing: 270, distanceKm: 170 },
    { name: 'Fort Myers (NW)', lat: 26.64, lon: -81.87, bearing: 300, distanceKm: 190 },
    // FAR — cold front early detection
    { name: 'Tampa (NW-far)', lat: 27.95, lon: -82.46, bearing: 320, distanceKm: 340 },
    { name: 'Vero Beach (N-far)', lat: 27.64, lon: -80.39, bearing: 0, distanceKm: 210 },
  ],
  // Denver: Front Range to W (blocks Pacific flow). Cold from NW slides E of Rockies.
  // Upslope storms from E/NE. Chinook from W (over mountains, descending).
  // NOTE: Grand Junction (W of Rockies) removed — mountains completely block surface flow
  'Denver': [
    // CLOSE — immediate detection on Front Range
    { name: 'Boulder (NW-near)', lat: 40.01, lon: -105.27, bearing: 330, distanceKm: 40 },
    { name: 'Castle Rock (S-near)', lat: 39.37, lon: -104.86, bearing: 180, distanceKm: 45 },
    { name: 'Brighton (NE-near)', lat: 39.99, lon: -104.82, bearing: 20, distanceKm: 30 },
    // MID — cold front corridor (NW along Front Range) + upslope (E/NE)
    { name: 'Fort Collins (N)', lat: 40.59, lon: -105.08, bearing: 350, distanceKm: 100 },
    { name: 'Limon (E)', lat: 39.26, lon: -103.69, bearing: 90, distanceKm: 120 },
    { name: 'Colorado Springs (S)', lat: 38.83, lon: -104.82, bearing: 180, distanceKm: 105 },
    // FAR — arctic air funneling down eastern slope of Rockies
    { name: 'Cheyenne (N-far)', lat: 41.14, lon: -104.82, bearing: 0, distanceKm: 160 },
    { name: 'Goodland KS (E-far)', lat: 39.35, lon: -101.71, bearing: 85, distanceKm: 290 },
  ],
  // London: Prevailing SW/W (North Atlantic). "Beast from East" NE continental cold.
  // Thames Valley channels E/W flow. Low-lying, no major barriers.
  'London': [
    // CLOSE — detect approaching fronts minutes before arrival
    { name: 'Heathrow (W-near)', lat: 51.47, lon: -0.46, bearing: 265, distanceKm: 25 },
    { name: 'Guildford (SW-near)', lat: 51.24, lon: -0.57, bearing: 225, distanceKm: 45 },
    { name: 'Chelmsford (NE-near)', lat: 51.73, lon: 0.47, bearing: 50, distanceKm: 50 },
    // MID — Atlantic weather corridor (SW/W) + continental (NE)
    { name: 'Reading (W)', lat: 51.45, lon: -0.97, bearing: 270, distanceKm: 60 },
    { name: 'Southampton (SW)', lat: 50.90, lon: -1.40, bearing: 225, distanceKm: 120 },
    { name: 'Oxford (WNW)', lat: 51.75, lon: -1.25, bearing: 290, distanceKm: 85 },
    { name: 'Canterbury (SE)', lat: 51.28, lon: 1.08, bearing: 110, distanceKm: 90 },
    // FAR — deep Atlantic/continental early warning
    { name: 'Bristol (W-far)', lat: 51.45, lon: -2.59, bearing: 270, distanceKm: 170 },
    { name: 'Birmingham (NW-far)', lat: 52.49, lon: -1.90, bearing: 315, distanceKm: 190 },
  ],
  // Tokyo: NW winter (Siberian), S/SE summer (Pacific). Kanto Plain is flat.
  // Mountains to W/NW. Tokyo Bay sea breeze from S.
  'Tokyo': [
    // CLOSE — rapid detection on Kanto Plain
    { name: 'Yokohama (SW-near)', lat: 35.44, lon: 139.64, bearing: 210, distanceKm: 30 },
    { name: 'Saitama (N-near)', lat: 35.86, lon: 139.65, bearing: 0, distanceKm: 25 },
    { name: 'Chiba (E-near)', lat: 35.61, lon: 140.12, bearing: 100, distanceKm: 40 },
    // MID — NW winter wind corridor + SW summer storms
    { name: 'Maebashi (NW)', lat: 36.39, lon: 139.06, bearing: 320, distanceKm: 100 },
    { name: 'Mito (NE)', lat: 36.34, lon: 140.45, bearing: 35, distanceKm: 100 },
    { name: 'Odawara (SW)', lat: 35.26, lon: 139.15, bearing: 235, distanceKm: 65 },
    // FAR — winter cold air masses crossing from Sea of Japan side
    { name: 'Nagano (NW-far)', lat: 36.65, lon: 138.18, bearing: 310, distanceKm: 175 },
    { name: 'Shizuoka (SW-far)', lat: 34.98, lon: 138.38, bearing: 230, distanceKm: 160 },
  ],
  // Seoul: NW/N winter (Siberian cold), SW/S summer (monsoon). Mountains N/E.
  // Han River valley channels W/E flow. Yellow Sea to W.
  'Seoul': [
    // CLOSE — Han River valley and nearby detection
    { name: 'Incheon (W-near)', lat: 37.46, lon: 126.71, bearing: 265, distanceKm: 28 },
    { name: 'Suwon (S-near)', lat: 37.26, lon: 127.03, bearing: 185, distanceKm: 35 },
    { name: 'Uijeongbu (N-near)', lat: 37.74, lon: 127.04, bearing: 10, distanceKm: 20 },
    // MID — NW cold air corridor + S monsoon approach
    { name: 'Chuncheon (NE)', lat: 37.88, lon: 127.73, bearing: 55, distanceKm: 80 },
    { name: 'Pyeongtaek (S)', lat: 36.99, lon: 127.09, bearing: 185, distanceKm: 65 },
    { name: 'Ganghwa (NW)', lat: 37.75, lon: 126.49, bearing: 310, distanceKm: 50 },
    // FAR — Siberian cold front early warning
    { name: 'Cheonan (S-far)', lat: 36.81, lon: 127.15, bearing: 185, distanceKm: 90 },
    { name: 'Wonju (E-far)', lat: 37.34, lon: 127.95, bearing: 100, distanceKm: 85 },
  ],
  // Hong Kong: NE winter monsoon, SW summer monsoon. Hilly terrain, fragmented coast.
  // Pearl River Delta to W/NW. South China Sea to S/E.
  'Hong Kong': [
    // CLOSE — Pearl River Delta immediate detection
    { name: 'Shenzhen (N-near)', lat: 22.54, lon: 114.06, bearing: 10, distanceKm: 30 },
    { name: 'Macau (W-near)', lat: 22.20, lon: 113.55, bearing: 260, distanceKm: 65 },
    // MID — NE monsoon corridor + SW summer approach
    { name: 'Guangzhou (N)', lat: 23.13, lon: 113.26, bearing: 340, distanceKm: 120 },
    { name: 'Zhuhai (SW)', lat: 22.27, lon: 113.58, bearing: 245, distanceKm: 55 },
    { name: 'Huizhou (NE)', lat: 23.11, lon: 114.42, bearing: 35, distanceKm: 90 },
    // FAR — cold front approach from N (continental China)
    { name: 'Shaoguan (N-far)', lat: 24.80, lon: 113.58, bearing: 0, distanceKm: 280 },
  ],
  // Shanghai: NW winter (dry/cold), SE summer monsoon (wet/warm). Dead flat delta.
  // Yangtze estuary. No terrain barriers — weather approaches unimpeded.
  'Shanghai': [
    // CLOSE — immediate detection on flat delta
    { name: 'Kunshan (W-near)', lat: 31.39, lon: 120.98, bearing: 280, distanceKm: 45 },
    { name: 'Jiaxing (SW-near)', lat: 30.77, lon: 120.76, bearing: 220, distanceKm: 55 },
    { name: 'Nantong (N-near)', lat: 32.06, lon: 120.87, bearing: 5, distanceKm: 90 },
    // MID — NW cold front corridor + SE monsoon approach
    { name: 'Suzhou (W)', lat: 31.30, lon: 120.59, bearing: 275, distanceKm: 85 },
    { name: 'Hangzhou (SW)', lat: 30.27, lon: 120.15, bearing: 220, distanceKm: 170 },
    { name: 'Wuxi (NW)', lat: 31.57, lon: 120.30, bearing: 310, distanceKm: 120 },
    // FAR — deep NW cold air early warning (flat terrain = fast propagation)
    { name: 'Nanjing (W-far)', lat: 32.06, lon: 118.80, bearing: 280, distanceKm: 270 },
    { name: 'Hefei (NW-far)', lat: 31.82, lon: 117.23, bearing: 295, distanceKm: 400 },
  ],
  // Mexico City: High-altitude basin (2,240m) surrounded by mountains/volcanoes.
  // Thermal basin circulation dominates. "Nortes" from N/NE. Limited surface propagation
  // due to terrain — only passes and gaps allow through-flow.
  'Mexico City': [
    // CLOSE — within the basin (detect thermal circulation shifts)
    { name: 'Toluca (W-near)', lat: 19.29, lon: -99.66, bearing: 270, distanceKm: 60 },
    { name: 'Texcoco (E-near)', lat: 19.52, lon: -98.88, bearing: 75, distanceKm: 30 },
    // MID — approach through gaps/passes in surrounding mountains
    { name: 'Pachuca (N)', lat: 20.12, lon: -98.73, bearing: 15, distanceKm: 85 },
    { name: 'Cuernavaca (S)', lat: 18.92, lon: -99.23, bearing: 190, distanceKm: 70 },
    { name: 'Puebla (SE)', lat: 19.04, lon: -98.21, bearing: 115, distanceKm: 100 },
    // FAR — "Norte" cold surge detection from Gulf lowlands
    { name: 'Queretaro (NW-far)', lat: 20.59, lon: -100.39, bearing: 325, distanceKm: 220 },
    { name: 'Veracruz (E-far)', lat: 19.17, lon: -96.13, bearing: 95, distanceKm: 310 },
  ],
  // Milan: Po Valley floor, Alps to N/W (4000m+ barrier), Apennines to S.
  // Atlantic fronts from W (weakened by Alps). Genoa lows from S/SW. Foehn from N.
  // NOTE: Zurich/Innsbruck removed — Alps completely block surface flow from N
  'Milan': [
    // CLOSE — Po Valley immediate detection
    { name: 'Monza (N-near)', lat: 45.58, lon: 9.27, bearing: 10, distanceKm: 15 },
    { name: 'Pavia (S-near)', lat: 45.19, lon: 9.16, bearing: 190, distanceKm: 30 },
    { name: 'Bergamo (NE-near)', lat: 45.70, lon: 9.67, bearing: 55, distanceKm: 40 },
    // MID — Po Valley wind corridor (W-E) + Genoa low approach (S)
    { name: 'Turin (W)', lat: 45.07, lon: 7.69, bearing: 265, distanceKm: 130 },
    { name: 'Genoa (S)', lat: 44.41, lon: 8.93, bearing: 195, distanceKm: 120 },
    { name: 'Brescia (E)', lat: 45.54, lon: 10.22, bearing: 80, distanceKm: 80 },
    { name: 'Parma (SE)', lat: 44.80, lon: 10.33, bearing: 120, distanceKm: 95 },
    // FAR — Atlantic front early warning through Po Valley
    { name: 'Nice (SW-far)', lat: 43.70, lon: 7.27, bearing: 225, distanceKm: 220 },
  ],
  // Beijing: NW/N winter (Siberian cold through mountain gaps), S/SE summer monsoon.
  // Yanshan Mtns to N, Taihang Mtns to W — funnel cold air through gaps.
  // Open to SE (Bohai Sea), S (North China Plain).
  'Beijing': [
    // CLOSE — immediate detection around the city
    { name: 'Langfang (S-near)', lat: 39.52, lon: 116.68, bearing: 185, distanceKm: 50 },
    { name: 'Miyun (NE-near)', lat: 40.38, lon: 116.84, bearing: 25, distanceKm: 55 },
    { name: 'Zhuozhou (SW-near)', lat: 39.49, lon: 115.97, bearing: 220, distanceKm: 55 },
    // MID — NW cold front corridor through mountain gaps
    { name: 'Zhangjiakou (NW)', lat: 40.77, lon: 114.88, bearing: 315, distanceKm: 170 },
    { name: 'Tianjin (SE)', lat: 39.14, lon: 117.18, bearing: 130, distanceKm: 120 },
    { name: 'Baoding (SW)', lat: 38.87, lon: 115.46, bearing: 215, distanceKm: 140 },
    // FAR — Siberian cold early warning (through Yanshan mountain gaps)
    { name: 'Chengde (NE-far)', lat: 40.97, lon: 117.96, bearing: 40, distanceKm: 180 },
    { name: 'Datong (NW-far)', lat: 40.09, lon: 113.30, bearing: 300, distanceKm: 290 },
  ],
  // Wellington: Prevailing NW/N (Roaring Forties westerly belt).
  // Cold fronts from S/SW (Southern Ocean). Cook Strait funnels wind dramatically.
  // Very exposed location — weather arrives fast.
  'Wellington': [
    // CLOSE — Cook Strait funneling (wind accelerates through the strait)
    { name: 'Kapiti Coast (N-near)', lat: -40.91, lon: 174.98, bearing: 350, distanceKm: 50 },
    { name: 'Upper Hutt (NE-near)', lat: -41.12, lon: 175.07, bearing: 25, distanceKm: 25 },
    { name: 'Porirua (N-near)', lat: -41.13, lon: 174.84, bearing: 340, distanceKm: 20 },
    // MID — NW warm front + S/SW cold front corridors
    { name: 'Blenheim (NW-strait)', lat: -41.51, lon: 173.95, bearing: 315, distanceKm: 75 },
    { name: 'Masterton (NE)', lat: -40.95, lon: 175.66, bearing: 40, distanceKm: 80 },
    { name: 'Palmerston North (N)', lat: -40.35, lon: 175.62, bearing: 10, distanceKm: 140 },
    // FAR — Southern Ocean cold front early warning + NW warm flow
    { name: 'Nelson (NW-far)', lat: -41.27, lon: 173.28, bearing: 310, distanceKm: 130 },
    { name: 'Kaikoura (SW-far)', lat: -42.40, lon: 173.68, bearing: 210, distanceKm: 130 },
  ],
};

class UpstreamWindDetector {
  private conditionsCache: Map<string, { data: UpstreamConditions; fetchedAt: number }> = new Map();
  private cacheTTL = 15 * 60 * 1000; // 15 min — upstream conditions change slowly

  // Get sentinel network for a city
  getSentinels(cityName: string): SentinelStation[] {
    return SENTINEL_NETWORKS[cityName] || [];
  }

  // Fetch current conditions at a single point
  private async fetchCurrentConditions(lat: number, lon: number): Promise<UpstreamConditions | null> {
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = this.conditionsCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.data;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

      const resp = await fetch(url);
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const current = data.current;
      if (!current) return null;

      const conditions: UpstreamConditions = {
        tempF: current.temperature_2m,
        cloudCoverPct: current.cloud_cover ?? 0,
        windSpeedMph: current.wind_speed_10m ?? 0,
        windDirectionDeg: current.wind_direction_10m ?? 0,
        precipMm: current.precipitation ?? 0,
      };

      this.conditionsCache.set(cacheKey, { data: conditions, fetchedAt: Date.now() });
      return conditions;
    } catch {
      return null;
    }
  }

  // Find which sentinel is upwind of the target (the one the wind is blowing FROM)
  private findUpwindSentinels(
    targetWindDir: number,
    sentinels: SentinelStation[],
    toleranceDeg: number = 60
  ): SentinelStation[] {
    // Wind direction is where wind comes FROM. So if wind is from 270° (west),
    // we want the sentinel that is to the WEST of the target (bearing ~270°).
    return sentinels.filter(s => {
      let diff = Math.abs(s.bearing - targetWindDir);
      if (diff > 180) diff = 360 - diff;
      return diff <= toleranceDeg;
    }).sort((a, b) => {
      // Prefer closer match to wind direction
      let diffA = Math.abs(a.bearing - targetWindDir);
      if (diffA > 180) diffA = 360 - diffA;
      let diffB = Math.abs(b.bearing - targetWindDir);
      if (diffB > 180) diffB = 360 - diffB;
      return diffA - diffB;
    });
  }

  // Main analysis: detect incoming weather changes for a target city
  async detectUpstreamChanges(
    target: WeatherLocation,
    targetDate: string
  ): Promise<UpstreamAlert[]> {
    const sentinels = this.getSentinels(target.name);
    if (sentinels.length === 0) return [];

    const alerts: UpstreamAlert[] = [];

    // Fetch current conditions at target
    const targetConditions = await this.fetchCurrentConditions(target.lat, target.lon);
    if (!targetConditions) return [];

    // Find upwind sentinels based on current wind direction
    const upwindStations = this.findUpwindSentinels(targetConditions.windDirectionDeg, sentinels);
    if (upwindStations.length === 0) return [];

    // Also check close stations regardless of wind direction (they detect anything nearby)
    const closeStations = sentinels.filter(s => s.distanceKm <= 50);
    const toFetch = new Map<string, SentinelStation>();
    for (const s of upwindStations.slice(0, 4)) toFetch.set(s.name, s);
    for (const s of closeStations) toFetch.set(s.name, s);

    // Fetch conditions at all selected sentinels (batch, with rate limiting)
    const fetches = [...toFetch.values()].map(async (sentinel) => {
      await new Promise(r => setTimeout(r, 80)); // Rate limit
      const conditions = await this.fetchCurrentConditions(sentinel.lat, sentinel.lon);
      return { sentinel, conditions };
    });

    const results = await Promise.all(fetches);

    for (const { sentinel, conditions } of results) {
      if (!conditions) continue;

      // Calculate differences
      const tempDiff = conditions.tempF - targetConditions.tempF;
      const cloudDiff = conditions.cloudCoverPct - targetConditions.cloudCoverPct;

      // Estimate arrival time: distance / wind speed
      const windSpeedKmh = targetConditions.windSpeedMph * 1.609;
      const arrivalHours = windSpeedKmh > 5
        ? sentinel.distanceKm / windSpeedKmh
        : Infinity; // Calm winds = no propagation

      if (arrivalHours > 12) continue; // Too far out to be useful

      const now = new Date();
      const arrivalTime = new Date(now.getTime() + arrivalHours * 3600 * 1000);
      const arrivalTimeStr = arrivalTime.toISOString();

      // Determine if this is a significant change
      const significantTemp = Math.abs(tempDiff) > 3; // >3°F difference
      const significantCloud = Math.abs(cloudDiff) > 25; // >25% cloud change
      const significantPrecip = conditions.precipMm > 0.5 && targetConditions.precipMm < 0.1;

      if (!significantTemp && !significantCloud && !significantPrecip) continue;

      // Classify the incoming change
      let impactDirection: UpstreamAlert['impactDirection'];
      let impactMagnitudeF: number;
      let description: string;

      if (significantTemp && tempDiff < -3) {
        impactDirection = 'COOLER';
        // Scale impact: the temperature difference doesn't arrive 1:1
        // Mixing and terrain reduce it to about 50-70% of the upstream delta
        impactMagnitudeF = Math.abs(tempDiff) * 0.6;
        description = `Cold air mass at ${sentinel.name} (${conditions.tempF.toFixed(0)}°F vs ${targetConditions.tempF.toFixed(0)}°F at ${target.name}). ` +
          `Wind ${targetConditions.windSpeedMph.toFixed(0)}mph from ${this.bearingToCompass(targetConditions.windDirectionDeg)} → ` +
          `arriving in ~${arrivalHours.toFixed(1)}h. May drop high by ${impactMagnitudeF.toFixed(1)}°F.`;
      } else if (significantTemp && tempDiff > 3) {
        impactDirection = 'WARMER';
        impactMagnitudeF = Math.abs(tempDiff) * 0.6;
        description = `Warm air mass at ${sentinel.name} (${conditions.tempF.toFixed(0)}°F vs ${targetConditions.tempF.toFixed(0)}°F at ${target.name}). ` +
          `Wind ${targetConditions.windSpeedMph.toFixed(0)}mph from ${this.bearingToCompass(targetConditions.windDirectionDeg)} → ` +
          `arriving in ~${arrivalHours.toFixed(1)}h. May boost high by ${impactMagnitudeF.toFixed(1)}°F.`;
      } else if (significantCloud && cloudDiff < -25) {
        impactDirection = 'CLEARING';
        impactMagnitudeF = Math.abs(cloudDiff) / 25 * 2; // Rough: 25% cloud change ≈ 2°F
        description = `Clear skies approaching from ${sentinel.name} (${conditions.cloudCoverPct.toFixed(0)}% vs ${targetConditions.cloudCoverPct.toFixed(0)}% cloud at ${target.name}). ` +
          `Clearing arriving in ~${arrivalHours.toFixed(1)}h → increased solar heating.`;
      } else if (significantCloud && cloudDiff > 25) {
        impactDirection = 'COOLER';
        impactMagnitudeF = cloudDiff / 25 * 1.5;
        description = `Cloud bank approaching from ${sentinel.name} (${conditions.cloudCoverPct.toFixed(0)}% vs ${targetConditions.cloudCoverPct.toFixed(0)}% at ${target.name}). ` +
          `Overcast arriving in ~${arrivalHours.toFixed(1)}h → reduced solar heating.`;
      } else if (significantPrecip) {
        impactDirection = 'WETTER';
        impactMagnitudeF = conditions.precipMm > 2 ? 4.0 : 2.0;
        description = `Precipitation at ${sentinel.name} (${conditions.precipMm.toFixed(1)}mm) heading toward ${target.name}. ` +
          `Rain arriving in ~${arrivalHours.toFixed(1)}h → evaporative cooling, temp cap.`;
      } else {
        continue;
      }

      // Confidence based on: wind consistency, distance, magnitude, alignment
      let confidence = 0.45;
      // Stronger wind = faster, more reliable propagation
      if (targetConditions.windSpeedMph > 15) confidence += 0.15;
      else if (targetConditions.windSpeedMph > 8) confidence += 0.1;
      // Closer stations = much more reliable (approaching weather is real, not diffused)
      if (sentinel.distanceKm < 30) confidence += 0.2;
      else if (sentinel.distanceKm < 60) confidence += 0.15;
      else if (sentinel.distanceKm < 100) confidence += 0.1;
      // Larger difference = harder to miss
      if (Math.abs(tempDiff) > 8) confidence += 0.15;
      else if (Math.abs(tempDiff) > 4) confidence += 0.1;
      // Check if upstream wind direction aligns (wind at sentinel blows toward target)
      const sentinelWindTowardTarget = this.windBlowsToward(
        conditions.windDirectionDeg, sentinel.bearing
      );
      if (sentinelWindTowardTarget) confidence += 0.15; // Strong signal: wind at source points at us
      confidence = Math.min(0.95, confidence);

      alerts.push({
        targetCity: target.name,
        targetDate,
        sentinelName: sentinel.name,
        sentinelBearing: sentinel.bearing,
        distanceKm: sentinel.distanceKm,
        tempDiffF: Math.round(tempDiff * 10) / 10,
        cloudDiffPct: Math.round(cloudDiff),
        precipUpstream: conditions.precipMm,
        windSpeedMph: targetConditions.windSpeedMph,
        estimatedArrivalHours: Math.round(arrivalHours * 10) / 10,
        estimatedArrivalTime: arrivalTimeStr,
        impactDirection,
        impactMagnitudeF: Math.round(impactMagnitudeF * 10) / 10,
        confidence: Math.round(confidence * 100) / 100,
        description,
      });
    }

    // Sort by confidence * magnitude (most impactful first)
    alerts.sort((a, b) => (b.confidence * b.impactMagnitudeF) - (a.confidence * a.impactMagnitudeF));
    return alerts;
  }

  // Check if wind at sentinel location blows toward the target
  // Sentinel bearing is direction FROM target TO sentinel
  // If wind at sentinel blows roughly opposite to sentinel bearing, it's blowing toward target
  private windBlowsToward(windDirAtSentinel: number, sentinelBearing: number): boolean {
    // Wind direction = where it comes FROM
    // For wind at sentinel to blow toward target, wind should come FROM the direction
    // opposite to the target (i.e., from beyond the sentinel, toward the target)
    const oppositeOfTarget = (sentinelBearing + 180) % 360;
    // Wind at sentinel should come from roughly the same direction as sentinel bearing
    // (blowing from sentinel toward target)
    let diff = Math.abs(windDirAtSentinel - sentinelBearing);
    if (diff > 180) diff = 360 - diff;
    return diff < 90;
  }

  private bearingToCompass(deg: number): string {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }
}

export default UpstreamWindDetector;
