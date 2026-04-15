// NEXRAD High-Resolution Radar Service
// Fetches NEXRAD Level III composites from Iowa Environmental Mesonet (IEM)
// Higher resolution than RainViewer for US cities — direct NOAA NEXRAD network
// Also provides per-station radar and national CONUS composite imagery

import fetch from 'node-fetch';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface NexradAnalysis {
  station: string;
  city: string;
  product: string;
  imagePath: string;
  imageUrl: string;
  capturedAt: Date;
  precipCoveragePct: number;
  maxReflectivity: number;  // dBZ scale approximation
  dominantType: 'NONE' | 'LIGHT' | 'MODERATE' | 'HEAVY' | 'EXTREME';
  stormCells: number;
}

export interface ConusComposite {
  imagePath: string;
  imageUrl: string;
  capturedAt: Date;
  totalPrecipPct: number;
}

// Map cities to nearest NEXRAD station IDs
const CITY_NEXRAD: Record<string, string> = {
  'NYC': 'KOKX',      // Upton, NY (covers NYC metro)
  'Chicago': 'KLOT',  // Romeoville, IL
  'LA': 'KVTX',       // Los Angeles, CA
  'Miami': 'KAMX',    // Miami, FL
  'Denver': 'KFTG',   // Front Range, CO
};

const US_CITIES = Object.keys(CITY_NEXRAD);

// IEM NEXRAD image color classification for N0Q (base reflectivity)
// Colors in N0Q product: gray<5dBZ, blue/green=5-35dBZ, yellow/orange=35-50dBZ, red=50-65dBZ, purple/white>65dBZ
function classifyNexradPixel(r: number, g: number, b: number, a: number): 'clear' | 'light' | 'moderate' | 'heavy' | 'extreme' {
  if (a < 20) return 'clear';

  // Black/dark gray background
  if (r < 30 && g < 30 && b < 30) return 'clear';
  // Very dark — background
  if (r + g + b < 80) return 'clear';

  // Blue/cyan/green tones = light precip (5-35 dBZ)
  if ((b > 100 && r < 80) || (g > 120 && b > 80 && r < 80)) return 'light';
  if (g > 150 && r < 120 && b < 120) return 'light';

  // Yellow/green = moderate (35-50 dBZ)
  if (r > 150 && g > 150 && b < 100) return 'moderate';
  if (g > 130 && r > 130 && b < 80) return 'moderate';

  // Orange/red = heavy (50-65 dBZ)
  if (r > 180 && g < 120 && b < 80) return 'heavy';
  if (r > 200 && g > 80 && g < 160 && b < 60) return 'heavy';

  // Purple/magenta/white = extreme (>65 dBZ)
  if (r > 180 && b > 140 && g < 100) return 'extreme';
  if (r > 220 && g > 220 && b > 220) return 'extreme';

  // Faint colored pixels are at least light
  if (a > 40 && (r + g + b) > 120) return 'light';
  return 'clear';
}

class NexradService {
  private screenshotDir: string;
  private cache: Map<string, { data: NexradAnalysis; fetchedAt: number }> = new Map();
  private conusCache: { data: ConusComposite; fetchedAt: number } | null = null;
  private cacheTTL = 5 * 60 * 1000; // 5 min

  constructor() {
    this.screenshotDir = path.join(__dirname, '../../logs/nexrad-screenshots');
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  getScreenshotDir(): string { return this.screenshotDir; }

  // Fetch CONUS national composite — single image covering all US
  async fetchConusComposite(): Promise<ConusComposite | null> {
    if (this.conusCache && Date.now() - this.conusCache.fetchedAt < this.cacheTTL) {
      return this.conusCache.data;
    }

    try {
      const url = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.png';
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return null;

      const buffer = Buffer.from(await resp.arrayBuffer());
      const filename = `conus_n0q_${Date.now()}.png`;
      const filePath = path.join(this.screenshotDir, filename);
      fs.writeFileSync(filePath, buffer);

      // Analyze for total precip coverage
      const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
      const channels = info.channels;
      let precipPixels = 0;
      const totalPixels = info.width * info.height;

      for (let i = 0; i < data.length; i += channels) {
        const cls = classifyNexradPixel(data[i], data[i + 1], data[i + 2], channels > 3 ? data[i + 3] : 255);
        if (cls !== 'clear') precipPixels++;
      }

      const result: ConusComposite = {
        imagePath: filePath,
        imageUrl: `/api/nexrad/image/${filename}`,
        capturedAt: new Date(),
        totalPrecipPct: Math.round((precipPixels / totalPixels) * 1000) / 10,
      };

      this.conusCache = { data: result, fetchedAt: Date.now() };
      return result;
    } catch (e) {
      console.error(`[NEXRAD] CONUS fetch error: ${(e as Error).message}`);
      return null;
    }
  }

  // Convert lat/lon to tile coordinates
  private latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  }

  // Fetch per-station radar for a specific city using IEM tile service
  async fetchStationRadar(location: WeatherLocation): Promise<NexradAnalysis | null> {
    const station = CITY_NEXRAD[location.name];
    if (!station) return null;

    const cached = this.cache.get(location.name);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    try {
      // Use IEM tile service — compose a 3x3 grid at zoom 8 centered on the city
      const zoom = 8;
      const center = this.latLonToTile(location.lat, location.lon, zoom);
      const tiles: Buffer[] = [];

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = center.x + dx;
          const ty = center.y + dy;
          const url = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${station}-N0Q-0/${zoom}/${tx}/${ty}.png`;
          try {
            const resp = await fetch(url, {
              headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
              timeout: 8000,
            } as any);
            if (resp.ok) {
              tiles.push(Buffer.from(await resp.arrayBuffer()));
            } else {
              // Use transparent placeholder
              tiles.push(await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
            }
          } catch {
            tiles.push(await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
          }
        }
      }

      // Composite 3x3 grid into single image
      const compositeInputs = tiles.map((buf, i) => ({
        input: buf,
        left: (i % 3) * 256,
        top: Math.floor(i / 3) * 256,
      }));

      const composited = await sharp({
        create: { width: 768, height: 768, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).composite(compositeInputs).png().toBuffer();

      const filename = `${station}_n0q_${Date.now()}.png`;
      const filePath = path.join(this.screenshotDir, filename);
      fs.writeFileSync(filePath, composited);

      // Pixel analysis
      const analysis = await this.analyzeRadarImage(composited);

      const result: NexradAnalysis = {
        station,
        city: location.name,
        product: 'N0Q',
        imagePath: filePath,
        imageUrl: `/api/nexrad/image/${filename}`,
        capturedAt: new Date(),
        ...analysis,
      };

      this.cache.set(location.name, { data: result, fetchedAt: Date.now() });
      return result;
    } catch (e) {
      console.error(`[NEXRAD] Station ${station} fetch error: ${(e as Error).message}`);
      return null;
    }
  }

  // Fetch radar for all US cities
  async fetchAllStations(): Promise<NexradAnalysis[]> {
    const results: NexradAnalysis[] = [];

    for (const cityName of US_CITIES) {
      const location = WEATHER_LOCATIONS.find(l => l.name === cityName);
      if (!location) continue;
      const result = await this.fetchStationRadar(location);
      if (result) results.push(result);
      await new Promise(r => setTimeout(r, 200)); // Rate limit
    }

    return results;
  }

  private async analyzeRadarImage(buffer: Buffer): Promise<{
    precipCoveragePct: number;
    maxReflectivity: number;
    dominantType: NexradAnalysis['dominantType'];
    stormCells: number;
  }> {
    try {
      const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
      const channels = info.channels;
      const totalPixels = info.width * info.height;

      const counts = { clear: 0, light: 0, moderate: 0, heavy: 0, extreme: 0 };

      for (let i = 0; i < data.length; i += channels) {
        const cls = classifyNexradPixel(data[i], data[i + 1], data[i + 2], channels > 3 ? data[i + 3] : 255);
        counts[cls]++;
      }

      const precipPixels = counts.light + counts.moderate + counts.heavy + counts.extreme;
      const precipPct = Math.round((precipPixels / totalPixels) * 1000) / 10;

      // Estimate max reflectivity from classification
      let maxReflectivity = 0;
      if (counts.extreme > 0) maxReflectivity = 70;
      else if (counts.heavy > 0) maxReflectivity = 55;
      else if (counts.moderate > 0) maxReflectivity = 42;
      else if (counts.light > 0) maxReflectivity = 25;

      // Dominant type
      let dominantType: NexradAnalysis['dominantType'] = 'NONE';
      if (counts.extreme > totalPixels * 0.001) dominantType = 'EXTREME';
      else if (counts.heavy > totalPixels * 0.005) dominantType = 'HEAVY';
      else if (counts.moderate > totalPixels * 0.01) dominantType = 'MODERATE';
      else if (counts.light > totalPixels * 0.005) dominantType = 'LIGHT';

      // Rough storm cell count — clusters of heavy/extreme pixels
      // Simplified: estimate from ratio of heavy pixels to total precip
      const stormPixels = counts.heavy + counts.extreme;
      const stormCells = stormPixels > 0 ? Math.max(1, Math.round(stormPixels / (totalPixels * 0.005))) : 0;

      return { precipCoveragePct: precipPct, maxReflectivity, dominantType, stormCells };
    } catch {
      return { precipCoveragePct: 0, maxReflectivity: 0, dominantType: 'NONE', stormCells: 0 };
    }
  }

  // Fetch NWS active storm-based warnings as GeoJSON
  async fetchActiveWarnings(): Promise<any[]> {
    try {
      const resp = await fetch('https://mesonet.agron.iastate.edu/geojson/sbw.geojson', {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return [];
      const data = (await resp.json()) as any;
      return (data.features || []).slice(0, 50); // Cap to prevent huge payloads
    } catch {
      return [];
    }
  }

  listScreenshots(): string[] {
    try {
      return fs.readdirSync(this.screenshotDir)
        .filter(f => f.endsWith('.png'))
        .sort()
        .slice(-50); // Last 50
    } catch {
      return [];
    }
  }
}

export default NexradService;
