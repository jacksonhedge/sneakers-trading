// Radar Screenshot & Image Analysis Service
// Captures radar tiles at multiple zoom levels per city, composites into images,
// analyzes pixel data for precipitation coverage and intensity
// Also captures GOES satellite imagery for cloud analysis

import fetch from 'node-fetch';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RadarScreenshot {
  cityName: string;
  zoomLevel: 'continental' | 'regional' | 'city';
  zoom: number;
  imagePath: string;         // Local file path
  imageUrl: string;          // Served URL
  capturedAt: Date;
  tileCount: number;
  analysis: RadarAnalysis;
}

export interface RadarAnalysis {
  precipCoveragePct: number;     // % of pixels with precipitation
  maxIntensity: number;          // 0-100 scale
  avgIntensity: number;
  precipPixels: number;
  totalPixels: number;
  dominantType: 'NONE' | 'LIGHT' | 'MODERATE' | 'HEAVY' | 'EXTREME';
  stormCells: number;            // Estimated number of distinct storm clusters
  precipMovingToward: boolean;   // Is precip approaching city center?
  colorBreakdown: {
    clear: number;               // % with no precip
    light: number;               // % light rain (blue/green)
    moderate: number;            // % moderate rain (yellow/green)
    heavy: number;               // % heavy rain (orange/red)
    extreme: number;             // % extreme (purple/white)
  };
}

export interface SatelliteScreenshot {
  region: string;
  product: string;
  imagePath: string;
  imageUrl: string;
  capturedAt: Date;
  cloudCoveragePct: number;
}

export interface CityRadarSnapshot {
  cityName: string;
  screenshots: RadarScreenshot[];
  satellite: SatelliteScreenshot | null;
  timestamp: Date;
  summary: string;
}

// RainViewer only supports certain zoom levels per region.
// International cities (outside Americas/Europe) often fail at z10.
// US cities: use z4 (continental), z7 (regional), z10 (city)
const US_ZOOM_CONFIGS = [
  { label: 'continental' as const, zoom: 4, gridSize: 3 },
  { label: 'regional' as const, zoom: 7, gridSize: 3 },
  { label: 'city' as const, zoom: 10, gridSize: 3 },
];

// International cities: skip z10, use z5 (wide) and z7 (regional) only
const INTL_ZOOM_CONFIGS = [
  { label: 'continental' as const, zoom: 4, gridSize: 3 },
  { label: 'regional' as const, zoom: 7, gridSize: 3 },
];

// US bounding box (approximate)
function isUSCity(lat: number, lon: number): boolean {
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
}

// RainViewer radar color palette — approximate mapping
// Colors: transparent=clear, blue/cyan=light, green/yellow=moderate, orange/red=heavy, magenta/white=extreme
function classifyRadarPixel(r: number, g: number, b: number, a: number): 'clear' | 'light' | 'moderate' | 'heavy' | 'extreme' {
  if (a < 30) return 'clear';  // Transparent = no precip

  // Intensity from RGB
  const brightness = (r + g + b) / 3;

  // Blue/cyan tones = light rain
  if (b > 100 && r < 100 && g < 150) return 'light';
  if (g > 150 && b > 100 && r < 100) return 'light';

  // Green/yellow = moderate
  if (g > 150 && r > 100 && b < 100) return 'moderate';
  if (r > 200 && g > 200 && b < 100) return 'moderate';

  // Orange/red = heavy
  if (r > 200 && g < 150 && b < 100) return 'heavy';
  if (r > 150 && g < 80 && b < 80) return 'heavy';

  // Magenta/white = extreme
  if (r > 200 && b > 150 && g < 100) return 'extreme';
  if (brightness > 200 && a > 200) return 'extreme';

  // Default: if pixel has color and alpha, it's at least light
  if (a > 50 && brightness > 20) return 'light';
  return 'clear';
}

class RadarScreenshotService {
  private screenshotDir: string;
  private cache: Map<string, { data: CityRadarSnapshot; fetchedAt: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 min
  private latestRadarPath = '';

  constructor() {
    this.screenshotDir = path.join(__dirname, '../../logs/radar-screenshots');
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  // Get the latest RainViewer radar frame path
  private async getLatestRadarFrame(): Promise<string | null> {
    try {
      const resp = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as any;
      const past = data.radar?.past || [];
      if (past.length === 0) return null;
      this.latestRadarPath = past[past.length - 1].path;
      return this.latestRadarPath;
    } catch {
      return this.latestRadarPath || null;
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

  // Fetch a single radar tile as a buffer
  private async fetchTile(radarPath: string, zoom: number, x: number, y: number): Promise<Buffer | null> {
    try {
      const url = `https://tilecache.rainviewer.com${radarPath}/256/${zoom}/${x}/${y}/2/1_1.png`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return null;
      return Buffer.from(await resp.arrayBuffer());
    } catch {
      return null;
    }
  }

  // Composite a grid of tiles into a single image
  private async compositeTiles(tiles: (Buffer | null)[], gridSize: number): Promise<Buffer> {
    const tileSize = 256;
    const outputSize = tileSize * gridSize;

    // Create base image (dark background for map context)
    const composites: sharp.OverlayOptions[] = [];

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const idx = row * gridSize + col;
        const tile = tiles[idx];
        if (tile) {
          composites.push({
            input: tile,
            left: col * tileSize,
            top: row * tileSize,
          });
        }
      }
    }

    return sharp({
      create: {
        width: outputSize,
        height: outputSize,
        channels: 4,
        background: { r: 20, g: 20, b: 30, alpha: 255 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();
  }

  // Analyze radar image pixels
  private async analyzeImage(imageBuffer: Buffer): Promise<RadarAnalysis> {
    try {
      const { data, info } = await sharp(imageBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const totalPixels = info.width * info.height;
      const counts = { clear: 0, light: 0, moderate: 0, heavy: 0, extreme: 0 };
      let intensitySum = 0;
      let maxIntensity = 0;

      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = info.channels >= 4 ? data[i + 3] : 255;

        const type = classifyRadarPixel(r, g, b, a);
        counts[type]++;

        if (type !== 'clear') {
          const intensity = type === 'light' ? 20 : type === 'moderate' ? 50 : type === 'heavy' ? 80 : 100;
          intensitySum += intensity;
          maxIntensity = Math.max(maxIntensity, intensity);
        }
      }

      const precipPixels = totalPixels - counts.clear;
      const precipCoverage = (precipPixels / totalPixels) * 100;
      const avgIntensity = precipPixels > 0 ? intensitySum / precipPixels : 0;

      // Estimate storm cells: count connected regions of heavy+ precip
      // Simplified: just count heavy pixel clusters by sampling
      let stormCells = 0;
      if (counts.heavy > 50) stormCells = Math.ceil(counts.heavy / 500);
      if (counts.extreme > 20) stormCells += Math.ceil(counts.extreme / 200);

      let dominantType: RadarAnalysis['dominantType'] = 'NONE';
      if (counts.extreme > totalPixels * 0.01) dominantType = 'EXTREME';
      else if (counts.heavy > totalPixels * 0.02) dominantType = 'HEAVY';
      else if (counts.moderate > totalPixels * 0.03) dominantType = 'MODERATE';
      else if (counts.light > totalPixels * 0.01) dominantType = 'LIGHT';

      // Check if precip is approaching city center (center quadrant analysis)
      const centerStart = Math.floor(info.width * 0.35);
      const centerEnd = Math.ceil(info.width * 0.65);
      let centerPrecip = 0;
      let outerPrecip = 0;

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const idx = (y * info.width + x) * info.channels;
          const a = info.channels >= 4 ? data[idx + 3] : 255;
          if (a < 30) continue;

          const type = classifyRadarPixel(data[idx], data[idx + 1], data[idx + 2], a);
          if (type !== 'clear') {
            if (x >= centerStart && x <= centerEnd && y >= centerStart && y <= centerEnd) {
              centerPrecip++;
            } else {
              outerPrecip++;
            }
          }
        }
      }

      const precipMoving = outerPrecip > centerPrecip * 1.5 && outerPrecip > 100;

      return {
        precipCoveragePct: Math.round(precipCoverage * 10) / 10,
        maxIntensity,
        avgIntensity: Math.round(avgIntensity),
        precipPixels,
        totalPixels,
        dominantType,
        stormCells,
        precipMovingToward: precipMoving,
        colorBreakdown: {
          clear: Math.round((counts.clear / totalPixels) * 1000) / 10,
          light: Math.round((counts.light / totalPixels) * 1000) / 10,
          moderate: Math.round((counts.moderate / totalPixels) * 1000) / 10,
          heavy: Math.round((counts.heavy / totalPixels) * 1000) / 10,
          extreme: Math.round((counts.extreme / totalPixels) * 1000) / 10,
        },
      };
    } catch (e) {
      console.error(`[Radar] Image analysis failed: ${(e as Error).message}`);
      return {
        precipCoveragePct: 0, maxIntensity: 0, avgIntensity: 0, precipPixels: 0,
        totalPixels: 0, dominantType: 'NONE', stormCells: 0, precipMovingToward: false,
        colorBreakdown: { clear: 100, light: 0, moderate: 0, heavy: 0, extreme: 0 },
      };
    }
  }

  // Capture radar screenshots for a single city at all zoom levels
  async captureCity(location: WeatherLocation): Promise<CityRadarSnapshot> {
    const key = location.name;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const radarPath = await this.getLatestRadarFrame();
    const screenshots: RadarScreenshot[] = [];

    if (radarPath) {
      const zoomConfigs = isUSCity(location.lat, location.lon) ? US_ZOOM_CONFIGS : INTL_ZOOM_CONFIGS;
      for (const config of zoomConfigs) {
        try {
          const centerTile = this.latLonToTile(location.lat, location.lon, config.zoom);
          const halfGrid = Math.floor(config.gridSize / 2);

          // Fetch grid of tiles around center
          const tilePromises: Promise<Buffer | null>[] = [];
          for (let row = -halfGrid; row <= halfGrid; row++) {
            for (let col = -halfGrid; col <= halfGrid; col++) {
              tilePromises.push(this.fetchTile(radarPath, config.zoom, centerTile.x + col, centerTile.y + row));
            }
          }

          const tiles = await Promise.all(tilePromises);

          // Check if tiles are error images ("Zoom Level Not Supported")
          // Error tiles have distinctive text rendering — detect by checking if
          // the first tile has high non-transparent pixel variance (text on dark bg)
          if (tiles[0]) {
            try {
              const meta = await sharp(tiles[0]).metadata();
              // Error tiles from RainViewer are exactly 256x256 with specific colors
              // Check if the tile has a suspiciously high number of near-white pixels (text)
              const { data } = await sharp(tiles[0]).raw().toBuffer({ resolveWithObject: true });
              let textPixels = 0;
              for (let i = 0; i < data.length; i += (meta.channels || 4)) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                // "Zoom Level Not Supported" text is light gray on dark background
                if (r > 150 && g > 150 && b > 150 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
                  textPixels++;
                }
              }
              const totalPx = (meta.width || 256) * (meta.height || 256);
              if (textPixels > totalPx * 0.02 && textPixels < totalPx * 0.15) {
                // Looks like an error tile — skip this zoom level
                console.log(`[Radar] ${location.name} z${config.zoom}: error tile detected (text pixels: ${textPixels}), skipping`);
                continue;
              }
            } catch { /* proceed if detection fails */ }
          }

          const composite = await this.compositeTiles(tiles, config.gridSize);

          // Save to disk
          const filename = `${location.name.toLowerCase().replace(/\s+/g, '-')}_${config.label}_z${config.zoom}.png`;
          const filePath = path.join(this.screenshotDir, filename);
          fs.writeFileSync(filePath, composite);

          // Analyze
          const analysis = await this.analyzeImage(composite);

          screenshots.push({
            cityName: location.name,
            zoomLevel: config.label,
            zoom: config.zoom,
            imagePath: filePath,
            imageUrl: `/api/radar/image/${filename}`,
            capturedAt: new Date(),
            tileCount: tiles.filter(t => t !== null).length,
            analysis,
          });
        } catch (e) {
          console.error(`[Radar] ${location.name} z${config.zoom} failed: ${(e as Error).message}`);
        }
      }
    }

    // Capture GOES satellite image
    let satellite: SatelliteScreenshot | null = null;
    try {
      satellite = await this.captureSatellite(location);
    } catch { /* non-critical */ }

    // Build summary
    const cityZoom = screenshots.find(s => s.zoomLevel === 'city');
    const regionalZoom = screenshots.find(s => s.zoomLevel === 'regional');
    let summary = `${location.name}: `;
    if (cityZoom) {
      summary += `City precip ${cityZoom.analysis.precipCoveragePct}% (${cityZoom.analysis.dominantType})`;
      if (cityZoom.analysis.precipMovingToward) summary += ' [APPROACHING]';
    }
    if (regionalZoom && regionalZoom.analysis.precipCoveragePct > 5) {
      summary += ` | Regional ${regionalZoom.analysis.precipCoveragePct}% coverage`;
      if (regionalZoom.analysis.stormCells > 0) summary += ` (${regionalZoom.analysis.stormCells} storm cells)`;
    }

    const snapshot: CityRadarSnapshot = {
      cityName: location.name,
      screenshots,
      satellite,
      timestamp: new Date(),
      summary,
    };

    this.cache.set(key, { data: snapshot, fetchedAt: Date.now() });
    return snapshot;
  }

  // Capture GOES satellite image for a city
  private async captureSatellite(location: WeatherLocation): Promise<SatelliteScreenshot | null> {
    try {
      // Use NOAA GOES latest CONUS GeoColor imagery
      const url = 'https://cdn.star.nesdis.noaa.gov/GOES16/ABI/CONUS/GEOCOLOR/latest.jpg';
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return null;

      const buffer = Buffer.from(await resp.arrayBuffer());

      // Crop to approximate region around city
      // GOES CONUS image is roughly: lat 20-55N, lon -130 to -60W
      // Map lat/lon to pixel coordinates
      const imgMeta = await sharp(buffer).metadata();
      if (!imgMeta.width || !imgMeta.height) return null;

      const w = imgMeta.width;
      const h = imgMeta.height;

      // Only crop for cities in CONUS range
      if (location.lon < -130 || location.lon > -60 || location.lat < 20 || location.lat > 55) {
        // International city — save full CONUS for reference but mark differently
        const filename = `satellite_conus_latest.jpg`;
        const filePath = path.join(this.screenshotDir, filename);
        fs.writeFileSync(filePath, buffer);

        return {
          region: 'CONUS',
          product: 'GEOCOLOR',
          imagePath: filePath,
          imageUrl: `/api/radar/image/${filename}`,
          capturedAt: new Date(),
          cloudCoveragePct: 0, // Not analyzed for full image
        };
      }

      // Crop around US city
      const xPct = (location.lon - (-130)) / ((-60) - (-130));
      const yPct = 1 - (location.lat - 20) / (55 - 20);
      const cropSize = Math.min(w, h) * 0.15; // ~15% of image = regional view

      const left = Math.max(0, Math.floor(xPct * w - cropSize / 2));
      const top = Math.max(0, Math.floor(yPct * h - cropSize / 2));
      const cropW = Math.min(Math.floor(cropSize), w - left);
      const cropH = Math.min(Math.floor(cropSize), h - top);

      const cropped = await sharp(buffer)
        .extract({ left, top, width: cropW, height: cropH })
        .resize(512, 512)
        .png()
        .toBuffer();

      const filename = `satellite_${location.name.toLowerCase().replace(/\s+/g, '-')}.png`;
      const filePath = path.join(this.screenshotDir, filename);
      fs.writeFileSync(filePath, cropped);

      // Analyze cloud coverage from satellite (bright pixels = clouds)
      const { data: pixels, info } = await sharp(cropped).raw().toBuffer({ resolveWithObject: true });
      let cloudPixels = 0;
      const total = info.width * info.height;
      for (let i = 0; i < pixels.length; i += info.channels) {
        const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        if (brightness > 160) cloudPixels++; // Bright = clouds
      }

      return {
        region: location.name,
        product: 'GEOCOLOR',
        imagePath: filePath,
        imageUrl: `/api/radar/image/${filename}`,
        capturedAt: new Date(),
        cloudCoveragePct: Math.round((cloudPixels / total) * 100),
      };
    } catch (e) {
      console.error(`[Satellite] Capture failed for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  // Capture all cities
  async captureAllCities(): Promise<CityRadarSnapshot[]> {
    const snapshots: CityRadarSnapshot[] = [];

    for (const location of WEATHER_LOCATIONS) {
      try {
        const snapshot = await this.captureCity(location);
        snapshots.push(snapshot);
      } catch (e) {
        console.error(`[Radar] Capture failed for ${location.name}: ${(e as Error).message}`);
      }
      // Rate limit tile fetching
      await new Promise(r => setTimeout(r, 500));
    }

    return snapshots;
  }

  // Get screenshot directory path
  getScreenshotDir(): string {
    return this.screenshotDir;
  }

  // List all saved screenshots
  listScreenshots(): string[] {
    try {
      return fs.readdirSync(this.screenshotDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    } catch {
      return [];
    }
  }
}

export default RadarScreenshotService;
