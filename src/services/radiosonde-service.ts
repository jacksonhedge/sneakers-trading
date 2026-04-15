// Radiosonde (Weather Balloon) Upper Air Sounding Service
// Fetches real upper-air profiles from Iowa Environmental Mesonet (IEM)
// Soundings launch at 00Z and 12Z daily — no auth required
//
// Derived indices computed:
//   CAPE       — convective available potential energy (storm fuel)
//   PWAT       — precipitable water (heavy rain predictor)
//   Lifted Index — negative = unstable; < -6 = severe storm environment
//   0-6km wind shear — > 40 kts = tornado-favoring environment
//   Freezing level — height where temp = 0°C
//   Inversion detection — stable cap in lowest 3km

import fetch from 'node-fetch';
import { WeatherLocation, WEATHER_LOCATIONS } from './noaa-weather-service.js';

// ----- Interfaces --------------------------------------------------------

export interface SoundingLevel {
  pressure: number;     // hPa
  height: number;       // meters MSL
  temperature: number;  // °C
  dewpoint: number;     // °C
  windDir: number;      // degrees
  windSpeed: number;    // knots
}

export interface RadiosondeSignal {
  city: string;
  station: string;
  soundingTime: string;                // ISO string of sounding launch time
  levels: number;                      // number of pressure levels returned
  surfaceTemp: number;                 // °C
  surfaceDewpoint: number;             // °C
  surfaceWind: number;                 // knots
  cape: number;                        // J/kg (approx surface-based)
  precipitableWater: number;           // inches
  liftedIndex: number;                 // °C — negative = unstable
  windShear0to6km: number;             // knots
  freezingLevel: number;               // meters MSL (0 if below surface)
  inversionDetected: boolean;
  inversionHeight: number;             // meters MSL of inversion base (0 if none)
  instabilityRisk: 'STABLE' | 'MARGINAL' | 'MODERATE' | 'HIGH' | 'EXTREME';
  heavyRainRisk: boolean;              // PWAT > 1.5 in warm season
  temperatureAdjustF: number;          // model bias correction (°F)
  fetchedAt: string;
}

// ----- Station mapping ---------------------------------------------------

const CITY_STATIONS: Record<string, string> = {
  'NYC':     'KOKX',   // Upton, NY
  'Chicago': 'KILX',   // Lincoln, IL
  'Miami':   'KMFL',   // Miami, FL
  'Denver':  'KDNR',   // Denver, CO
  'LA':      'KVBG',   // Vandenberg, CA
};

// ----- Helpers -----------------------------------------------------------

function padZ(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** Build IEM timestamp string: YYYYMMDDHH00 */
function buildTimestamp(date: Date, zHour: 0 | 12): string {
  const y = date.getUTCFullYear();
  const m = padZ(date.getUTCMonth() + 1);
  const d = padZ(date.getUTCDate());
  return `${y}${m}${d}${padZ(zHour)}00`;
}

/** Determine the most recent sounding timestamp(s) to try, newest first */
function recentSoundingTimestamps(): string[] {
  const now = new Date();
  const hour = now.getUTCHours();

  // Previous day date object
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  if (hour >= 12) {
    // Try today 12Z, then today 00Z, then yesterday 12Z
    return [
      buildTimestamp(now, 12),
      buildTimestamp(now, 0),
      buildTimestamp(yesterday, 12),
    ];
  } else {
    // Try today 00Z, then yesterday 12Z, then yesterday 00Z
    return [
      buildTimestamp(now, 0),
      buildTimestamp(yesterday, 12),
      buildTimestamp(yesterday, 0),
    ];
  }
}

/** Mixing ratio from temperature and dewpoint (g/kg) */
function mixingRatio(tempC: number, dewpointC: number): number {
  // Tetens formula for saturation vapour pressure
  const es = 6.112 * Math.exp((17.67 * dewpointC) / (dewpointC + 243.5));
  const p_approx = 1013; // placeholder; we weight by layer thickness anyway
  return (0.622 * es) / (p_approx - es) * 1000;
}

/** Wind components (u, v) from direction and speed (knots) */
function windComponents(dir: number, spd: number): [number, number] {
  const rad = (dir * Math.PI) / 180;
  return [-spd * Math.sin(rad), -spd * Math.cos(rad)];
}

/** Vector magnitude */
function magnitude(u: number, v: number): number {
  return Math.sqrt(u * u + v * v);
}

// ----- Derived-index computations ----------------------------------------

/**
 * Approximate surface-based CAPE (J/kg).
 * We lift a parcel from the surface dry-adiabatically (Γd = 9.8°C/km) to
 * the LCL, then moist-adiabatically (Γm ≈ 6°C/km) above that. We sum
 * positive buoyancy (parcel warmer than environment) layer by layer.
 */
function computeCAPE(levels: SoundingLevel[]): number {
  if (levels.length < 2) return 0;

  const sfc = levels[0];
  if (!isFinite(sfc.temperature) || !isFinite(sfc.dewpoint)) return 0;

  const g = 9.81;
  const Rd = 287;
  const Γd = 9.8 / 1000;  // K/m dry adiabatic lapse rate
  const Γm = 6.0 / 1000;  // K/m moist adiabatic lapse rate (approx)

  // LCL height approximation: ≈ 125 * (T - Td) metres
  const lclHeight = sfc.height + 125 * (sfc.temperature - sfc.dewpoint);

  let cape = 0;
  let parcelTempC = sfc.temperature;

  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1];
    const upper = levels[i];
    if (!isFinite(upper.temperature) || !isFinite(upper.height)) continue;

    const midHeight = (lower.height + upper.height) / 2;
    const dz = upper.height - lower.height;
    if (dz <= 0) continue;

    // Advance parcel temperature
    const lapse = midHeight < lclHeight ? Γd : Γm;
    parcelTempC -= lapse * dz;

    const envTempK = upper.temperature + 273.15;
    const parcelTempK = parcelTempC + 273.15;
    const buoyancy = g * (parcelTempK - envTempK) / envTempK;

    if (buoyancy > 0) {
      cape += buoyancy * dz;
    }

    // Stop above 100 hPa (tropopause)
    if (upper.pressure < 100) break;
  }

  return Math.max(0, Math.round(cape));
}

/**
 * Precipitable water (inches): integrate specific humidity through the column.
 * PW = (1/ρ_water·g) ∫ q dp  →  PW(m) = (1/g) ∫ q dp/ρ_air
 * Simplified: PW ≈ Σ w_i · Δp / (ρ_water · g)  where w_i is mixing ratio (kg/kg)
 */
function computePWAT(levels: SoundingLevel[]): number {
  if (levels.length < 2) return 0;
  const g = 9.81;
  const rhoWater = 1000; // kg/m³

  let sumPW = 0; // Pa·(kg/kg)

  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1];
    const upper = levels[i];
    if (!isFinite(lower.dewpoint) || !isFinite(upper.dewpoint)) continue;

    const dp = Math.abs((lower.pressure - upper.pressure) * 100); // Pa
    if (dp <= 0) continue;

    // Average mixing ratio (kg/kg)
    const mrLower = mixingRatio(lower.temperature, lower.dewpoint) / 1000;
    const mrUpper = mixingRatio(upper.temperature, upper.dewpoint) / 1000;
    const qAvg = (mrLower + mrUpper) / 2 / (1 + (mrLower + mrUpper) / 2);

    sumPW += qAvg * dp;

    if (upper.pressure < 300) break; // above 300 hPa moisture is negligible
  }

  // PW in meters: sumPW / (rhoWater * g)
  const pwMeters = sumPW / (rhoWater * g);
  // Convert to inches
  return pwMeters * 39.3701;
}

/**
 * Lifted Index: environment temperature minus parcel temperature at 500 hPa.
 * Negative = unstable.
 */
function computeLiftedIndex(levels: SoundingLevel[]): number {
  if (levels.length < 2) return 99;

  const sfc = levels[0];
  if (!isFinite(sfc.temperature) || !isFinite(sfc.dewpoint)) return 99;

  const Γd = 9.8 / 1000;
  const Γm = 6.0 / 1000;
  const lclHeight = sfc.height + 125 * (sfc.temperature - sfc.dewpoint);

  let parcelTempC = sfc.temperature;

  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1];
    const upper = levels[i];
    if (!isFinite(upper.height)) continue;

    const midHeight = (lower.height + upper.height) / 2;
    const dz = upper.height - lower.height;
    if (dz <= 0) continue;

    const lapse = midHeight < lclHeight ? Γd : Γm;
    parcelTempC -= lapse * dz;

    if (Math.abs(upper.pressure - 500) < 15) {
      return Math.round((upper.temperature - parcelTempC) * 10) / 10;
    }
  }

  return 99; // no 500 hPa level found
}

/**
 * 0–6 km wind shear: vector difference between surface wind and wind
 * at the level nearest to 6000m AGL.
 */
function computeWindShear0to6km(levels: SoundingLevel[]): number {
  if (levels.length < 2) return 0;

  const sfcHeight = levels[0].height;
  const targetHeight = sfcHeight + 6000;

  const [u0, v0] = windComponents(levels[0].windDir, levels[0].windSpeed);

  let best: SoundingLevel | null = null;
  let bestDiff = Infinity;

  for (const lvl of levels) {
    if (!isFinite(lvl.height)) continue;
    const diff = Math.abs(lvl.height - targetHeight);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = lvl;
    }
  }

  if (!best || bestDiff > 2000) return 0; // no level within ±2km of 6km

  const [u6, v6] = windComponents(best.windDir, best.windSpeed);
  return Math.round(magnitude(u6 - u0, v6 - v0) * 10) / 10;
}

/** Height (m MSL) where temperature crosses 0°C (linear interpolation). */
function computeFreezingLevel(levels: SoundingLevel[]): number {
  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1];
    const upper = levels[i];
    if (!isFinite(lower.temperature) || !isFinite(upper.temperature)) continue;
    if (lower.temperature >= 0 && upper.temperature < 0) {
      // Interpolate
      const frac = lower.temperature / (lower.temperature - upper.temperature);
      return Math.round(lower.height + frac * (upper.height - lower.height));
    }
  }
  return 0; // surface is already below freezing, or no crossing found
}

/**
 * Detect temperature inversion in the lowest 3km AGL.
 * An inversion occurs when temperature increases with height over a layer.
 * Returns { detected, height } where height is the base of the inversion.
 */
function detectInversion(levels: SoundingLevel[]): { detected: boolean; height: number } {
  if (levels.length < 2) return { detected: false, height: 0 };

  const sfcHeight = levels[0].height;
  const maxHeight = sfcHeight + 3000;

  for (let i = 1; i < levels.length; i++) {
    const lower = levels[i - 1];
    const upper = levels[i];
    if (upper.height > maxHeight) break;
    if (!isFinite(lower.temperature) || !isFinite(upper.temperature)) continue;

    // Temperature increases with height → inversion
    if (upper.temperature > lower.temperature + 0.5) {
      return { detected: true, height: Math.round(lower.height) };
    }
  }

  return { detected: false, height: 0 };
}

/** Classify instability from CAPE and Lifted Index. */
function classifyInstability(
  cape: number,
  li: number
): RadiosondeSignal['instabilityRisk'] {
  if (cape < 100 && li > 0) return 'STABLE';
  if (cape < 500 || li > -2) return 'MARGINAL';
  if (cape < 1500 || li > -4) return 'MODERATE';
  if (cape < 3000 || li > -6) return 'HIGH';
  return 'EXTREME';
}

/**
 * Temperature adjustment hint for the market (°F).
 * Unstable / heavily loaded atmosphere means models often underestimate
 * cloud cover and thus miss cooling; inversions mean models miss warm anomalies.
 */
function computeTempAdjust(
  instability: RadiosondeSignal['instabilityRisk'],
  inversionDetected: boolean,
  pwat: number
): number {
  if (inversionDetected) return +2;            // trapped warm air
  if (instability === 'EXTREME') return -4;    // convective overturn cools surface
  if (instability === 'HIGH') return -2;
  if (pwat > 1.5) return -1;                   // evaporative cooling from heavy rain
  return 0;
}

// ----- Service class -----------------------------------------------------

class RadiosondeService {
  private cache: Map<string, { data: RadiosondeSignal; fetchedAt: number }> = new Map();
  private cacheTTL = 3600 * 1000; // 1 hour — soundings only update 2×/day

  private async fetchSounding(
    station: string,
    ts: string
  ): Promise<SoundingLevel[] | null> {
    const url =
      `https://mesonet.agron.iastate.edu/json/raob.py?ts=${ts}&station=${station}`;
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) return null;

      const json = (await resp.json()) as {
        profiles?: {
          profile?: {
            pres: number;
            hght: number;
            tmpc: number;
            dwpc: number;
            drct: number;
            sknt: number;
          }[];
        }[];
      };

      const profiles = json.profiles;
      if (!profiles || profiles.length === 0) return null;

      const raw = profiles[0].profile;
      if (!raw || raw.length === 0) return null;

      return raw
        .map(r => ({
          pressure:    r.pres  ?? NaN,
          height:      r.hght  ?? NaN,
          temperature: r.tmpc  ?? NaN,
          dewpoint:    r.dwpc  ?? NaN,
          windDir:     r.drct  ?? 0,
          windSpeed:   r.sknt  ?? 0,
        }))
        .filter(l => isFinite(l.pressure) && isFinite(l.height))
        .sort((a, b) => b.pressure - a.pressure); // surface (highest pressure) first
    } catch {
      return null;
    }
  }

  async getSignal(location: WeatherLocation): Promise<RadiosondeSignal | null> {
    const station = CITY_STATIONS[location.name];
    if (!station) return null;

    const cacheKey = `${location.name}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.data;
    }

    const timestamps = recentSoundingTimestamps();
    let levels: SoundingLevel[] | null = null;
    let usedTs = '';

    for (const ts of timestamps) {
      levels = await this.fetchSounding(station, ts);
      if (levels && levels.length >= 10) {
        usedTs = ts;
        break;
      }
    }

    if (!levels || levels.length === 0) {
      console.warn(`[Radiosonde] No valid sounding for ${station}`);
      return null;
    }

    // Parse sounding time back to ISO
    const yr  = parseInt(usedTs.slice(0, 4));
    const mo  = parseInt(usedTs.slice(4, 6)) - 1;
    const dy  = parseInt(usedTs.slice(6, 8));
    const hr  = parseInt(usedTs.slice(8, 10));
    const soundingTime = new Date(Date.UTC(yr, mo, dy, hr)).toISOString();

    const sfc = levels[0];
    const cape         = computeCAPE(levels);
    const pwat         = computePWAT(levels);
    const li           = computeLiftedIndex(levels);
    const shear        = computeWindShear0to6km(levels);
    const freezing     = computeFreezingLevel(levels);
    const inv          = detectInversion(levels);
    const instability  = classifyInstability(cape, li);
    const heavyRainRisk = pwat > 1.5;
    const tempAdjust   = computeTempAdjust(instability, inv.detected, pwat);

    const signal: RadiosondeSignal = {
      city:              location.name,
      station,
      soundingTime,
      levels:            levels.length,
      surfaceTemp:       isFinite(sfc.temperature) ? Math.round(sfc.temperature * 10) / 10 : 0,
      surfaceDewpoint:   isFinite(sfc.dewpoint)    ? Math.round(sfc.dewpoint    * 10) / 10 : 0,
      surfaceWind:       isFinite(sfc.windSpeed)   ? Math.round(sfc.windSpeed)              : 0,
      cape,
      precipitableWater: Math.round(pwat * 100) / 100,
      liftedIndex:       li,
      windShear0to6km:   shear,
      freezingLevel:     freezing,
      inversionDetected: inv.detected,
      inversionHeight:   inv.height,
      instabilityRisk:   instability,
      heavyRainRisk,
      temperatureAdjustF: tempAdjust,
      fetchedAt:         new Date().toISOString(),
    };

    this.cache.set(cacheKey, { data: signal, fetchedAt: Date.now() });
    return signal;
  }

  async getAllSignals(): Promise<RadiosondeSignal[]> {
    const signals: RadiosondeSignal[] = [];
    for (const loc of WEATHER_LOCATIONS) {
      if (!CITY_STATIONS[loc.name]) continue;
      const signal = await this.getSignal(loc);
      if (signal) signals.push(signal);
      await new Promise(r => setTimeout(r, 300));
    }
    return signals;
  }
}

export default RadiosondeService;
