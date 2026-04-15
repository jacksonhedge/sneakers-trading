// Convection Service
// Fetches CAPE, air quality, and soil moisture data from Open-Meteo free APIs (no auth needed)
//
// CAPE (Convective Available Potential Energy) measures storm fuel:
//   0-500 J/kg   = STABLE     — no convection
//   500-1500     = MARGINAL   — isolated storms possible
//   1500-3000    = MODERATE   — scattered storms likely
//   3000+        = EXTREME    — severe storms / tornadoes possible
//
// CIN (Convective Inhibition): negative values = cap suppressing storms.
// When CIN rises from -100 → -20, the cap is eroding → explosive convection imminent.
//
// Soil moisture modifies surface heating by 3-10°F — a multi-day edge because soil changes slowly.
// High AQI + calm wind = temperature inversion = stagnant high pressure (hot, clear).

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

export interface ConvectionSignal {
  city: string;

  // CAPE / convection
  cape: number;                   // J/kg — current (nearest hour)
  capeMax24h: number;             // J/kg — max over next 24 hours
  cin: number;                    // J/kg — current (negative = cap present)
  convectionRisk: 'STABLE' | 'MARGINAL' | 'MODERATE' | 'EXTREME';
  capEroding: boolean;            // CIN trending from very negative toward 0

  // Air quality
  aqi: number;                    // US AQI — current
  pm2_5: number;                  // µg/m³
  pm10: number;                   // µg/m³
  dust: number;                   // µg/m³
  aqiTrend: 'RISING' | 'FALLING' | 'STABLE';

  // Soil
  soilMoisture: number;           // m³/m³ (0–1 cm depth)
  soilMoisture1to3cm: number;     // m³/m³ (1–3 cm depth)
  soilTemperature: number;        // °C at 0 cm

  // Derived
  temperatureAdjustF: number;     // Combined °F adjustment from all factors
  stormProbability: number;       // 0-100
  precipitableWaterProxy: number; // Estimated PW index from CAPE + soil moisture combo

  fetchedAt: string;              // ISO timestamp
}

// ─── thresholds ─────────────────────────────────────────────────────────────

function classifyConvectionRisk(cape: number): ConvectionSignal['convectionRisk'] {
  if (cape >= 3000) return 'EXTREME';
  if (cape >= 1500) return 'MODERATE';
  if (cape >= 500)  return 'MARGINAL';
  return 'STABLE';
}

function isCinEroding(cinValues: number[]): boolean {
  // Need at least 3 readings; cap eroding = CIN rising (becoming less negative) toward 0
  if (cinValues.length < 3) return false;
  const recent = cinValues.slice(0, 6); // first 6 hours
  if (recent.length < 2) return false;
  const first = recent[0];
  const last  = recent[recent.length - 1];
  // Eroding: started very capped (< -50) and is now significantly less negative (gained > 30 J/kg)
  return first < -50 && (last - first) > 30;
}

function computeAqiTrend(aqiValues: number[]): ConvectionSignal['aqiTrend'] {
  if (aqiValues.length < 4) return 'STABLE';
  const firstHalf  = aqiValues.slice(0, Math.floor(aqiValues.length / 2));
  const secondHalf = aqiValues.slice(Math.floor(aqiValues.length / 2));
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const delta = avg(secondHalf) - avg(firstHalf);
  if (delta >  10) return 'RISING';
  if (delta < -10) return 'FALLING';
  return 'STABLE';
}

function computeTempAdjust(
  cape: number,
  cin: number,
  capEroding: boolean,
  aqi: number,
  aqiTrend: ConvectionSignal['aqiTrend'],
  soilMoisture: number,
): number {
  let adj = 0;

  // Soil moisture effect: primary multi-day edge
  if (soilMoisture > 0.4) {
    adj -= 4;   // wet soil suppresses daytime heating ~3-5°F
  } else if (soilMoisture < 0.2) {
    adj += 7;   // dry soil amplifies heating ~5-10°F (center of range)
  }

  // CAPE / storm potential cooling
  if (cape >= 3000 || (capEroding && cape >= 1500)) {
    adj -= 17;  // extreme CAPE: storm can drop temps 15-20°F
  } else if (cape >= 1500) {
    adj -= 8;   // moderate CAPE: significant cooling likely
  } else if (cape >= 500) {
    adj -= 3;   // marginal CAPE: slight cooling possible
  }

  // High AQI = stagnant high pressure = extra warming
  if (aqi > 150 && aqiTrend !== 'FALLING') {
    adj += 3;
  } else if (aqi > 100 && aqiTrend === 'RISING') {
    adj += 2;
  }

  // AQI dropping fast = frontal passage already underway → cooling
  if (aqiTrend === 'FALLING' && aqi < 50) {
    adj -= 2;
  }

  return Math.round(adj * 10) / 10;
}

function computeStormProbability(
  cape: number,
  cin: number,
  capEroding: boolean,
): number {
  if (cape < 100) return 0;

  // Base probability from CAPE
  let prob = 0;
  if (cape >= 3000)      prob = 85;
  else if (cape >= 1500) prob = 60;
  else if (cape >= 500)  prob = 30;
  else                   prob = 10;

  // CIN modifiers: strong cap suppresses even high CAPE
  if (cin < -200) {
    prob = Math.round(prob * 0.2);  // very strong cap — storms very unlikely
  } else if (cin < -100) {
    prob = Math.round(prob * 0.5);
  } else if (cin < -50) {
    prob = Math.round(prob * 0.75);
  }

  // Cap eroding boosts probability significantly
  if (capEroding) {
    prob = Math.min(95, prob + 20);
  }

  return Math.max(0, Math.min(100, prob));
}

function computePrecipitableWaterProxy(cape: number, soilMoisture: number): number {
  // Heuristic: CAPE needs moisture to build; combine both signals into a 0-100 index
  // Higher CAPE and wetter soil = more precipitable water available
  const capeContrib     = Math.min(50, cape / 60);          // 0-50
  const moistureContrib = Math.min(50, soilMoisture * 125); // 0-50 (saturated ~0.4)
  return Math.round(capeContrib + moistureContrib);
}

// ─── service ────────────────────────────────────────────────────────────────

class ConvectionService {
  private cache: Map<string, { data: ConvectionSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 300 * 1000; // 300 seconds

  // Fetch CAPE + CIN from Open-Meteo forecast API
  private async fetchCape(lat: number, lon: number): Promise<{ cape: number[]; cin: number[] }> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cape,convective_inhibition&forecast_days=2`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return { cape: [], cin: [] };

      const data = (await resp.json()) as any;
      const cape: number[] = (data.hourly?.cape || []).map((v: any) => (typeof v === 'number' ? v : 0));
      const cin:  number[] = (data.hourly?.convective_inhibition || []).map((v: any) => (typeof v === 'number' ? v : 0));
      return { cape, cin };
    } catch {
      return { cape: [], cin: [] };
    }
  }

  // Fetch air quality from Open-Meteo air quality API
  private async fetchAirQuality(lat: number, lon: number): Promise<{
    aqi: number[];
    pm2_5: number[];
    pm10: number[];
    dust: number[];
  }> {
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10,us_aqi,dust&forecast_days=2`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return { aqi: [], pm2_5: [], pm10: [], dust: [] };

      const data = (await resp.json()) as any;
      const toNumbers = (arr: any[]): number[] =>
        (arr || []).map((v: any) => (typeof v === 'number' ? v : 0));

      return {
        aqi:   toNumbers(data.hourly?.us_aqi  || []),
        pm2_5: toNumbers(data.hourly?.pm2_5   || []),
        pm10:  toNumbers(data.hourly?.pm10    || []),
        dust:  toNumbers(data.hourly?.dust    || []),
      };
    } catch {
      return { aqi: [], pm2_5: [], pm10: [], dust: [] };
    }
  }

  // Fetch soil moisture + soil temperature from Open-Meteo forecast API
  private async fetchSoil(lat: number, lon: number): Promise<{
    moisture0to1: number[];
    moisture1to3: number[];
    soilTemp: number[];
  }> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_temperature_0cm&forecast_days=2`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        timeout: 10000,
      } as any);
      if (!resp.ok) return { moisture0to1: [], moisture1to3: [], soilTemp: [] };

      const data = (await resp.json()) as any;
      const toNumbers = (arr: any[]): number[] =>
        (arr || []).map((v: any) => (typeof v === 'number' ? v : 0));

      return {
        moisture0to1: toNumbers(data.hourly?.soil_moisture_0_to_1cm || []),
        moisture1to3: toNumbers(data.hourly?.soil_moisture_1_to_3cm || []),
        soilTemp:     toNumbers(data.hourly?.soil_temperature_0cm    || []),
      };
    } catch {
      return { moisture0to1: [], moisture1to3: [], soilTemp: [] };
    }
  }

  // Build a ConvectionSignal from raw fetched data
  private buildSignal(
    location: WeatherLocation,
    capeData: { cape: number[]; cin: number[] },
    aqData:   { aqi: number[]; pm2_5: number[]; pm10: number[]; dust: number[] },
    soilData: { moisture0to1: number[]; moisture1to3: number[]; soilTemp: number[] },
  ): ConvectionSignal {
    // Current values = first available non-zero (index 0 = current hour)
    const currentCape = capeData.cape[0] ?? 0;
    const currentCin  = capeData.cin[0]  ?? 0;

    // Max CAPE over next 24 hours
    const cape24h     = capeData.cape.slice(0, 24);
    const capeMax24h  = cape24h.length > 0 ? Math.max(...cape24h) : currentCape;

    // CIN trend (first 6 hours) for cap-erosion detection
    const cinSlice    = capeData.cin.slice(0, 6);
    const capEroding  = isCinEroding(cinSlice);

    // Air quality
    const currentAqi   = aqData.aqi[0]   ?? 0;
    const currentPm2_5 = aqData.pm2_5[0] ?? 0;
    const currentPm10  = aqData.pm10[0]  ?? 0;
    const currentDust  = aqData.dust[0]  ?? 0;
    const aqiTrend     = computeAqiTrend(aqData.aqi.slice(0, 12));

    // Soil
    const soilMoisture     = soilData.moisture0to1[0] ?? 0;
    const soilMoisture1to3 = soilData.moisture1to3[0] ?? 0;
    const soilTemperature  = soilData.soilTemp[0]     ?? 0;

    // Derived
    const convectionRisk    = classifyConvectionRisk(capeMax24h);
    const tempAdjust        = computeTempAdjust(
      currentCape, currentCin, capEroding, currentAqi, aqiTrend, soilMoisture,
    );
    const stormProbability  = computeStormProbability(capeMax24h, currentCin, capEroding);
    const precipWaterProxy  = computePrecipitableWaterProxy(currentCape, soilMoisture);

    return {
      city:                   location.name,
      cape:                   Math.round(currentCape),
      capeMax24h:             Math.round(capeMax24h),
      cin:                    Math.round(currentCin),
      convectionRisk,
      capEroding,
      aqi:                    Math.round(currentAqi),
      pm2_5:                  Math.round(currentPm2_5 * 10) / 10,
      pm10:                   Math.round(currentPm10  * 10) / 10,
      dust:                   Math.round(currentDust  * 10) / 10,
      aqiTrend,
      soilMoisture:           Math.round(soilMoisture     * 1000) / 1000,
      soilMoisture1to3cm:     Math.round(soilMoisture1to3 * 1000) / 1000,
      soilTemperature:        Math.round(soilTemperature  * 10) / 10,
      temperatureAdjustF:     tempAdjust,
      stormProbability,
      precipitableWaterProxy: precipWaterProxy,
      fetchedAt:              new Date().toISOString(),
    };
  }

  // Fetch and return convection signal for a single location
  async getSignal(location: WeatherLocation): Promise<ConvectionSignal> {
    const key    = location.name;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const [capeData, aqData, soilData] = await Promise.all([
      this.fetchCape(location.lat, location.lon),
      this.fetchAirQuality(location.lat, location.lon),
      this.fetchSoil(location.lat, location.lon),
    ]);

    const signal = this.buildSignal(location, capeData, aqData, soilData);
    this.cache.set(key, { data: signal, fetchedAt: Date.now() });
    return signal;
  }

  // Fetch signals for all configured weather locations
  async getAllSignals(): Promise<ConvectionSignal[]> {
    const signals: ConvectionSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      try {
        const signal = await this.getSignal(loc);
        signals.push(signal);
      } catch (e) {
        console.error(`[Convection] Failed for ${loc.name}: ${(e as Error).message}`);
      }
      // Respect Open-Meteo rate limits — stagger requests
      await new Promise(r => setTimeout(r, 250));
    }
    return signals;
  }
}

export default ConvectionService;
