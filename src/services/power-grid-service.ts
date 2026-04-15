// Power Grid Load Service
// Tracks electricity demand as a temperature proxy
// Load spikes correlate with extreme temperatures (AC in summer, heating in winter)
// Divergence from day-of-week baseline signals unexpected temperature change
// NYISO data: no auth required, 5-minute updates

import fetch from 'node-fetch';

export interface PowerLoadReading {
  region: string;
  loadMW: number;
  timestamp: string;
}

export interface PowerGridSignal {
  region: string;
  currentLoadMW: number;
  baselineLoadMW: number;  // Typical for this hour/day
  loadChange: number;      // % above/below baseline
  temperatureSignal: 'NORMAL' | 'HOT' | 'COLD' | 'EXTREME_HOT' | 'EXTREME_COLD';
  description: string;
}

// NYISO region mapping
const NYISO_REGIONS: Record<string, string> = {
  'N.Y.C.': 'NYC',
  'LONGIL': 'Long Island',
  'HUD VL': 'Hudson Valley',
  'CENTRL': 'Central NY',
  'WEST': 'Western NY',
  'NORTH': 'Northern NY',
};

// Approximate baseline loads by hour (MW) for NYC region
// Summer vs winter baselines differ significantly
const NYC_HOURLY_BASELINE: number[] = [
  // 0-5: overnight
  4200, 4000, 3900, 3800, 3900, 4100,
  // 6-11: morning ramp
  4500, 5000, 5500, 5800, 6000, 6200,
  // 12-17: afternoon peak
  6400, 6500, 6600, 6500, 6300, 6000,
  // 18-23: evening decline
  5700, 5400, 5100, 4800, 4500, 4300,
];

class PowerGridService {
  private cache: { data: PowerGridSignal[]; fetchedAt: number } | null = null;
  private cacheTTL = 10 * 60 * 1000; // 10 min

  // Fetch current NYISO actual load data
  async fetchNYISOLoad(): Promise<PowerLoadReading[]> {
    try {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const url = `http://mis.nyiso.com/public/csv/pal/${today}pal.csv`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return [];

      const csv = await resp.text();
      const lines = csv.split('\n').filter(l => l.trim());
      if (lines.length < 2) return [];

      const readings: PowerLoadReading[] = [];

      // CSV format: "Time Stamp","Time Zone","Name","PTID","Load"
      // Get the latest readings (last few rows per region)
      for (let i = lines.length - 1; i >= 1 && readings.length < 20; i--) {
        const parts = lines[i].split(',');
        if (parts.length < 5) continue;

        const timestamp = parts[0]?.replace(/"/g, '').trim();
        const region = parts[2]?.replace(/"/g, '').trim();
        const load = parseFloat(parts[4]?.replace(/"/g, '').trim());

        if (!region || isNaN(load)) continue;

        readings.push({ region, loadMW: load, timestamp });
      }

      return readings;
    } catch (e) {
      console.error(`[PowerGrid] NYISO fetch error: ${(e as Error).message}`);
      return [];
    }
  }

  // Analyze power grid data for temperature signals
  async getSignals(): Promise<PowerGridSignal[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTTL) {
      return this.cache.data;
    }

    const readings = await this.fetchNYISOLoad();
    if (readings.length === 0) return [];

    // Get latest reading per region
    const latestByRegion = new Map<string, PowerLoadReading>();
    for (const r of readings) {
      if (!latestByRegion.has(r.region) || r.timestamp > latestByRegion.get(r.region)!.timestamp) {
        latestByRegion.set(r.region, r);
      }
    }

    const hour = new Date().getUTCHours();
    const signals: PowerGridSignal[] = [];

    for (const [region, reading] of latestByRegion) {
      const friendlyName = NYISO_REGIONS[region] || region;

      // Use NYC baseline as reference
      const baseline = region === 'N.Y.C.' ? NYC_HOURLY_BASELINE[hour] || 5000 : reading.loadMW;
      const loadChange = baseline > 0
        ? Math.round(((reading.loadMW - baseline) / baseline) * 100)
        : 0;

      // Temperature signal
      let temperatureSignal: PowerGridSignal['temperatureSignal'] = 'NORMAL';
      if (region === 'N.Y.C.' || region === 'LONGIL') {
        if (loadChange > 30) temperatureSignal = 'EXTREME_HOT';
        else if (loadChange > 15) temperatureSignal = 'HOT';
        else if (loadChange < -20) temperatureSignal = 'EXTREME_COLD';
        else if (loadChange < -10) temperatureSignal = 'COLD';
      }

      let description = `${friendlyName}: ${reading.loadMW.toFixed(0)} MW`;
      if (region === 'N.Y.C.') {
        description += ` (${loadChange > 0 ? '+' : ''}${loadChange}% vs baseline ${baseline} MW)`;
        if (temperatureSignal !== 'NORMAL') {
          description += ` — ${temperatureSignal.replace('_', ' ')} temperature signal`;
        }
      }

      signals.push({
        region: friendlyName,
        currentLoadMW: Math.round(reading.loadMW),
        baselineLoadMW: baseline,
        loadChange,
        temperatureSignal,
        description,
      });
    }

    this.cache = { data: signals, fetchedAt: Date.now() };
    return signals;
  }
}

export default PowerGridService;
