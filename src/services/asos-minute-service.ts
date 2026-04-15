// ASOS 1-Minute Temperature Service
// Fetches minute-by-minute observations from Iowa Mesonet for US cities
// Enables real-time peak detection and trajectory analysis

import fetch from 'node-fetch';

export interface MinuteObservation {
  stationId: string;
  timestamp: Date;
  tempF: number;
  dewpointF: number;
  windSpeedKts: number;
  windDirDeg: number;
  precipIn: number;
}

export interface TempTrajectory {
  cityName: string;
  currentTempF: number;
  tempRate1min: number;
  tempRate5min: number;
  tempRate15min: number;
  tempRate30min: number;
  trajectory: 'RAPID_WARMING' | 'WARMING' | 'STEADY' | 'COOLING' | 'RAPID_COOLING';
  peakDetected: boolean;
  estimatedPeakF: number;
  estimatedPeakTime: Date;
  observations: MinuteObservation[];
}

const CITY_STATIONS: Record<string, string[]> = {
  'NYC': ['JFK', 'LGA', 'EWR'],
  'Chicago': ['ORD', 'MDW'],
  'LA': ['LAX', 'BUR', 'SNA'],
  'Miami': ['MIA', 'FLL'],
  'Denver': ['DEN'],
};

class AsosMinuteService {
  private cache: Map<string, { data: TempTrajectory; fetchedAt: number }> = new Map();
  private history: Map<string, MinuteObservation[]> = new Map(); // rolling 60 min per station
  private cacheTTL = 2 * 60 * 1000;

  async fetchMinuteData(stationId: string): Promise<MinuteObservation[]> {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000); // 60 min ago

    const fmt = (d: Date) => {
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const da = String(d.getUTCDate()).padStart(2, '0');
      const h = String(d.getUTCHours()).padStart(2, '0');
      const mi = String(d.getUTCMinutes()).padStart(2, '0');
      return `${y}-${mo}-${da}T${h}:${mi}Z`;
    };

    const sts = encodeURIComponent(fmt(start));
    const ets = encodeURIComponent(fmt(now));

    try {
      const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos1min.py?station=${stationId}&sts=${sts}&ets=${ets}&vars=tmpf,dwpf,sknt,drct,p01m&sample=1min&what=download&delim=comma&gis=no`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 15000,
      } as any);
      if (!resp.ok) return [];

      const text = await resp.text();
      const lines = text.trim().split('\n');
      const observations: MinuteObservation[] = [];

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 6) continue;

        const [station, valid, tmpf, dwpf, sknt, drct, p01m] = parts;

        // 'M' = missing data
        const temp = tmpf === 'M' ? NaN : parseFloat(tmpf);
        if (isNaN(temp)) continue;

        observations.push({
          stationId: station?.trim() || stationId,
          timestamp: new Date(valid?.trim() || ''),
          tempF: temp,
          dewpointF: dwpf === 'M' ? 0 : parseFloat(dwpf) || 0,
          windSpeedKts: sknt === 'M' ? 0 : parseFloat(sknt) || 0,
          windDirDeg: drct === 'M' ? 0 : parseFloat(drct) || 0,
          precipIn: p01m === 'M' ? 0 : parseFloat(p01m) || 0,
        });
      }

      // Update history
      this.history.set(stationId, observations);
      return observations;
    } catch (e) {
      console.error(`[ASOS] Fetch failed for ${stationId}: ${(e as Error).message}`);
      return this.history.get(stationId) || [];
    }
  }

  async getTrajectory(cityName: string): Promise<TempTrajectory | null> {
    if (!this.isUSCity(cityName)) return null;

    const cached = this.cache.get(cityName);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const stations = CITY_STATIONS[cityName];
    if (!stations) return null;

    // Fetch all stations
    const allObs: MinuteObservation[] = [];
    for (const stn of stations) {
      const obs = await this.fetchMinuteData(stn);
      allObs.push(...obs);
    }

    if (allObs.length === 0) return null;

    // Sort by time
    allObs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Average across stations at each minute
    const minuteAvgs: { time: Date; tempF: number }[] = [];
    const byMinute = new Map<number, number[]>();

    for (const obs of allObs) {
      const key = Math.floor(obs.timestamp.getTime() / 60000) * 60000;
      if (!byMinute.has(key)) byMinute.set(key, []);
      byMinute.get(key)!.push(obs.tempF);
    }

    for (const [time, temps] of byMinute) {
      minuteAvgs.push({
        time: new Date(time),
        tempF: temps.reduce((s, t) => s + t, 0) / temps.length,
      });
    }
    minuteAvgs.sort((a, b) => a.time.getTime() - b.time.getTime());

    if (minuteAvgs.length < 2) return null;

    const current = minuteAvgs[minuteAvgs.length - 1];

    // Calculate rates
    const rate = (minsAgo: number): number => {
      const cutoff = current.time.getTime() - minsAgo * 60 * 1000;
      const past = minuteAvgs.find(m => m.time.getTime() >= cutoff);
      if (!past || past === current) return 0;
      const mins = (current.time.getTime() - past.time.getTime()) / 60000;
      return mins > 0 ? (current.tempF - past.tempF) / mins : 0;
    };

    const rate1 = rate(1);
    const rate5 = rate(5);
    const rate15 = rate(15);
    const rate30 = rate(30);

    // Classify trajectory
    let trajectory: TempTrajectory['trajectory'];
    if (rate5 > 0.3) trajectory = 'RAPID_WARMING';
    else if (rate5 > 0.05) trajectory = 'WARMING';
    else if (rate5 < -0.3) trajectory = 'RAPID_COOLING';
    else if (rate5 < -0.05) trajectory = 'COOLING';
    else trajectory = 'STEADY';

    // Peak detection: temp declining for 15+ minutes after rising
    let peakDetected = false;
    let peakTemp = current.tempF;
    let peakTime = current.time;

    if (minuteAvgs.length >= 15) {
      const maxEntry = minuteAvgs.reduce((best, m) => m.tempF > best.tempF ? m : best, minuteAvgs[0]);
      const maxIdx = minuteAvgs.indexOf(maxEntry);
      const sinceMax = minuteAvgs.length - 1 - maxIdx;

      if (sinceMax >= 15 && maxEntry.tempF > current.tempF + 0.5) {
        peakDetected = true;
        peakTemp = maxEntry.tempF;
        peakTime = maxEntry.time;
      }
    }

    // Estimate peak if still rising
    let estimatedPeakF = current.tempF;
    const estimatedPeakTime = new Date();
    if (!peakDetected && rate5 > 0.02) {
      // Project based on decaying rate — peak usually 2-4 hours before sunset
      const now = new Date();
      const hoursLeft = Math.max(0, 15 - now.getHours()); // hours until 3pm
      estimatedPeakF = current.tempF + rate5 * hoursLeft * 60 * 0.4; // decay factor
      estimatedPeakTime.setHours(Math.min(now.getHours() + Math.ceil(hoursLeft * 0.7), 16));
    } else if (peakDetected) {
      estimatedPeakF = peakTemp;
    }

    const result: TempTrajectory = {
      cityName,
      currentTempF: Math.round(current.tempF * 10) / 10,
      tempRate1min: Math.round(rate1 * 100) / 100,
      tempRate5min: Math.round(rate5 * 100) / 100,
      tempRate15min: Math.round(rate15 * 100) / 100,
      tempRate30min: Math.round(rate30 * 100) / 100,
      trajectory,
      peakDetected,
      estimatedPeakF: Math.round(estimatedPeakF * 10) / 10,
      estimatedPeakTime,
      observations: allObs.slice(-30), // last 30 observations
    };

    this.cache.set(cityName, { data: result, fetchedAt: Date.now() });
    return result;
  }

  isUSCity(cityName: string): boolean {
    return cityName in CITY_STATIONS;
  }
}

export default AsosMinuteService;
