// Weather Conditions Service — Hourly wind, cloud cover, and temperature trajectory
// Uses Open-Meteo hourly API to fetch conditions that drive intra-day price movements
// Key insight: weather CHANGES during the day move markets, not steady-state conditions

import fetch from 'node-fetch';
import { WeatherLocation, celsiusToFahrenheit } from './noaa-weather-service.js';

export interface HourlyCondition {
  hour: number;           // 0-23 (local time)
  timeISO: string;        // ISO timestamp
  tempF: number;
  cloudCoverPct: number;  // 0-100
  cloudLowPct: number;    // Low clouds (ground-level overcast)
  cloudMidPct: number;    // Mid-level clouds
  cloudHighPct: number;   // High cirrus (less temp impact)
  windSpeedMph: number;
  windGustsMph: number;
  windDirectionDeg: number;
  precipProbPct: number;
  precipMm: number;
}

export interface DayConditions {
  location: WeatherLocation;
  targetDate: string;
  fetchedAt: Date;
  hours: HourlyCondition[];
  // Derived aggregates
  peakTempF: number;
  peakTempHour: number;
  avgCloudCover: number;
  avgWindSpeed: number;
  maxGust: number;
}

export interface MarketMover {
  location: string;
  targetDate: string;
  type: 'CLOUD_CLEARING' | 'CLOUD_BUILDING' | 'WIND_SHIFT' | 'WIND_CALM' | 'WIND_SURGE' |
        'TEMP_OVERSHOOT' | 'TEMP_UNDERSHOOT' | 'PRECIP_RISK' | 'MODEL_UPDATE';
  triggerHour: number;       // Hour when this event starts (local time)
  triggerTimeISO: string;
  impactDirection: 'WARMER' | 'COOLER' | 'UNCERTAIN';
  impactMagnitudeF: number;  // Estimated temperature impact in °F
  confidence: number;        // 0-1
  description: string;
}

// GFS and ECMWF model run times (UTC) — these are when forecast data updates
// and when markets typically move in response
const MODEL_RUN_TIMES_UTC = {
  GFS: [0, 6, 12, 18],          // Every 6 hours; data available ~3.5h after init
  ECMWF: [0, 12],               // Every 12 hours; data available ~6h after init
  GFS_AVAILABLE_DELAY: 3.5,     // Hours after run time until data is published
  ECMWF_AVAILABLE_DELAY: 6,
};

class WeatherConditionsService {
  private cache: Map<string, { data: DayConditions; fetchedAt: number }> = new Map();
  private cacheTTL = 10 * 60 * 1000; // 10 minutes

  async fetchHourlyConditions(location: WeatherLocation, targetDate: string): Promise<DayConditions | null> {
    const cacheKey = `${location.name}:${targetDate}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.data;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${location.lat}&longitude=${location.lon}` +
        `&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,` +
        `wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability,precipitation` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
        `&timezone=auto&start_date=${targetDate}&end_date=${targetDate}`;

      const resp = await fetch(url);
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const hourly = data.hourly;
      if (!hourly || !hourly.time || hourly.time.length === 0) return null;

      const hours: HourlyCondition[] = [];
      let peakTempF = -Infinity;
      let peakTempHour = 12;
      let totalCloud = 0;
      let totalWind = 0;
      let maxGust = 0;

      for (let i = 0; i < hourly.time.length; i++) {
        const tempF = hourly.temperature_2m[i];
        const cloudCover = hourly.cloud_cover?.[i] ?? 0;
        const cloudLow = hourly.cloud_cover_low?.[i] ?? 0;
        const cloudMid = hourly.cloud_cover_mid?.[i] ?? 0;
        const cloudHigh = hourly.cloud_cover_high?.[i] ?? 0;
        const windSpeed = hourly.wind_speed_10m?.[i] ?? 0;
        const windGusts = hourly.wind_gusts_10m?.[i] ?? 0;
        const windDir = hourly.wind_direction_10m?.[i] ?? 0;
        const precipProb = hourly.precipitation_probability?.[i] ?? 0;
        const precipMm = hourly.precipitation?.[i] ?? 0;

        const hour = new Date(hourly.time[i]).getHours();

        hours.push({
          hour,
          timeISO: hourly.time[i],
          tempF,
          cloudCoverPct: cloudCover,
          cloudLowPct: cloudLow,
          cloudMidPct: cloudMid,
          cloudHighPct: cloudHigh,
          windSpeedMph: windSpeed,
          windGustsMph: windGusts,
          windDirectionDeg: windDir,
          precipProbPct: precipProb,
          precipMm: precipMm,
        });

        if (tempF > peakTempF) {
          peakTempF = tempF;
          peakTempHour = hour;
        }
        totalCloud += cloudCover;
        totalWind += windSpeed;
        if (windGusts > maxGust) maxGust = windGusts;
      }

      const result: DayConditions = {
        location,
        targetDate,
        fetchedAt: new Date(),
        hours,
        peakTempF,
        peakTempHour,
        avgCloudCover: totalCloud / hours.length,
        avgWindSpeed: totalWind / hours.length,
        maxGust,
      };

      this.cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
      return result;
    } catch (e) {
      console.error(`[Conditions] Failed for ${location.name}: ${(e as Error).message}`);
      return null;
    }
  }

  // Detect market-moving weather transitions during the day
  detectMarketMovers(conditions: DayConditions): MarketMover[] {
    const movers: MarketMover[] = [];
    const { hours, location, targetDate } = conditions;
    if (hours.length < 12) return movers;

    // Only analyze daytime hours (6am-8pm local) for high temp markets
    const dayHours = hours.filter(h => h.hour >= 6 && h.hour <= 20);
    if (dayHours.length < 6) return movers;

    // 1. CLOUD TRANSITIONS — biggest driver of daytime high temps
    this.detectCloudTransitions(dayHours, location.name, targetDate, movers);

    // 2. WIND SHIFTS — direction changes affect temp (onshore=cool, offshore=warm)
    this.detectWindShifts(dayHours, location.name, targetDate, movers);

    // 3. WIND SPEED CHANGES — strong winds mix atmosphere, moderate extremes
    this.detectWindSpeedChanges(dayHours, location.name, targetDate, movers);

    // 4. TEMPERATURE TRAJECTORY — heating rate vs expected
    this.detectTempTrajectory(dayHours, conditions.peakTempF, location.name, targetDate, movers);

    // 5. PRECIPITATION RISK — rain/storms cap temperatures
    this.detectPrecipRisk(dayHours, location.name, targetDate, movers);

    // 6. MODEL UPDATE WINDOWS — when GFS/ECMWF data refreshes
    this.addModelUpdateWindows(location.name, targetDate, movers);

    // Sort by trigger hour
    movers.sort((a, b) => a.triggerHour - b.triggerHour);
    return movers;
  }

  private detectCloudTransitions(
    hours: HourlyCondition[], location: string, targetDate: string, movers: MarketMover[]
  ): void {
    // Look for significant cloud cover changes between consecutive hours
    for (let i = 1; i < hours.length; i++) {
      const prev = hours[i - 1];
      const curr = hours[i];
      const change = curr.cloudCoverPct - prev.cloudCoverPct;

      // Cloud clearing: >25% drop in cloud cover
      if (change < -25) {
        // More impact from low clouds clearing than high clouds
        const lowCloudClearing = prev.cloudLowPct - curr.cloudLowPct;
        const tempImpact = lowCloudClearing > 15 ? 3.0 : 1.5;

        movers.push({
          location, targetDate,
          type: 'CLOUD_CLEARING',
          triggerHour: curr.hour,
          triggerTimeISO: curr.timeISO,
          impactDirection: 'WARMER',
          impactMagnitudeF: tempImpact,
          confidence: Math.min(0.9, Math.abs(change) / 60),
          description: `Cloud cover dropping ${Math.abs(change).toFixed(0)}% at ${curr.hour}:00 → ` +
            `solar heating boost, temp may exceed forecast by ${tempImpact.toFixed(1)}°F`,
        });
      }

      // Cloud building: >25% increase
      if (change > 25) {
        const lowCloudBuilding = curr.cloudLowPct - prev.cloudLowPct;
        const tempImpact = lowCloudBuilding > 15 ? -3.0 : -1.5;

        movers.push({
          location, targetDate,
          type: 'CLOUD_BUILDING',
          triggerHour: curr.hour,
          triggerTimeISO: curr.timeISO,
          impactDirection: 'COOLER',
          impactMagnitudeF: Math.abs(tempImpact),
          confidence: Math.min(0.9, change / 60),
          description: `Cloud cover building ${change.toFixed(0)}% at ${curr.hour}:00 → ` +
            `reduced solar heating, temp may fall short by ${Math.abs(tempImpact).toFixed(1)}°F`,
        });
      }
    }

    // Also check for sustained overcast vs clear — affects daily high calculation
    const morningCloud = hours.filter(h => h.hour >= 8 && h.hour <= 11)
      .reduce((s, h) => s + h.cloudCoverPct, 0) / 4;
    const afternoonCloud = hours.filter(h => h.hour >= 13 && h.hour <= 16)
      .reduce((s, h) => s + h.cloudCoverPct, 0) / 4;

    if (morningCloud > 70 && afternoonCloud < 30) {
      movers.push({
        location, targetDate,
        type: 'CLOUD_CLEARING',
        triggerHour: 12,
        triggerTimeISO: hours.find(h => h.hour === 12)?.timeISO || '',
        impactDirection: 'WARMER',
        impactMagnitudeF: 4.0,
        confidence: 0.75,
        description: `Overcast morning (${morningCloud.toFixed(0)}%) clearing to sunny afternoon (${afternoonCloud.toFixed(0)}%) → ` +
          `late-day temperature surge likely, markets may underestimate high`,
      });
    }

    if (morningCloud < 30 && afternoonCloud > 70) {
      movers.push({
        location, targetDate,
        type: 'CLOUD_BUILDING',
        triggerHour: 13,
        triggerTimeISO: hours.find(h => h.hour === 13)?.timeISO || '',
        impactDirection: 'COOLER',
        impactMagnitudeF: 3.0,
        confidence: 0.7,
        description: `Clear morning clouding over by afternoon (${afternoonCloud.toFixed(0)}%) → ` +
          `afternoon heating suppressed, high may come earlier and lower than forecast`,
      });
    }
  }

  private detectWindShifts(
    hours: HourlyCondition[], location: string, targetDate: string, movers: MarketMover[]
  ): void {
    for (let i = 2; i < hours.length; i++) {
      const prev = hours[i - 2];
      const curr = hours[i];

      // Calculate angular difference (handles 360° wraparound)
      let dirChange = Math.abs(curr.windDirectionDeg - prev.windDirectionDeg);
      if (dirChange > 180) dirChange = 360 - dirChange;

      // Significant wind shift: >60° change in 2 hours
      if (dirChange > 60 && curr.windSpeedMph > 5) {
        // Determine if this is likely warming or cooling
        // This is simplified — a proper implementation would use coastal proximity
        const direction: 'WARMER' | 'COOLER' | 'UNCERTAIN' = dirChange > 120 ? 'UNCERTAIN' :
          // Southerly shifts tend to warm in Northern Hemisphere
          (curr.windDirectionDeg > 135 && curr.windDirectionDeg < 225) ? 'WARMER' : 'COOLER';

        movers.push({
          location, targetDate,
          type: 'WIND_SHIFT',
          triggerHour: curr.hour,
          triggerTimeISO: curr.timeISO,
          impactDirection: direction,
          impactMagnitudeF: dirChange > 120 ? 3.0 : 1.5,
          confidence: Math.min(0.7, dirChange / 180 * curr.windSpeedMph / 15),
          description: `Wind shifting ${dirChange.toFixed(0)}° at ${curr.hour}:00 ` +
            `(${prev.windDirectionDeg}° → ${curr.windDirectionDeg}° at ${curr.windSpeedMph.toFixed(0)} mph) → ` +
            `air mass change, temperature may ${direction === 'WARMER' ? 'rise' : direction === 'COOLER' ? 'drop' : 'shift'} unexpectedly`,
        });
      }
    }
  }

  private detectWindSpeedChanges(
    hours: HourlyCondition[], location: string, targetDate: string, movers: MarketMover[]
  ): void {
    for (let i = 1; i < hours.length; i++) {
      const prev = hours[i - 1];
      const curr = hours[i];
      const speedChange = curr.windSpeedMph - prev.windSpeedMph;

      // Wind surge: >10 mph increase
      if (speedChange > 10) {
        movers.push({
          location, targetDate,
          type: 'WIND_SURGE',
          triggerHour: curr.hour,
          triggerTimeISO: curr.timeISO,
          impactDirection: 'UNCERTAIN',
          impactMagnitudeF: 2.0,
          confidence: 0.5,
          description: `Wind surge to ${curr.windSpeedMph.toFixed(0)} mph (gusts ${curr.windGustsMph.toFixed(0)}) at ${curr.hour}:00 → ` +
            `atmospheric mixing may moderate temperatures toward regional average`,
        });
      }

      // Wind calming: going from >15 mph to <5 mph
      if (prev.windSpeedMph > 15 && curr.windSpeedMph < 5) {
        movers.push({
          location, targetDate,
          type: 'WIND_CALM',
          triggerHour: curr.hour,
          triggerTimeISO: curr.timeISO,
          impactDirection: 'WARMER',
          impactMagnitudeF: 2.5,
          confidence: 0.6,
          description: `Winds dying from ${prev.windSpeedMph.toFixed(0)} to ${curr.windSpeedMph.toFixed(0)} mph at ${curr.hour}:00 → ` +
            `reduced mixing allows surface heating, temp may spike higher`,
        });
      }
    }

    // Strong sustained gusts cap heating (evaporative + mixing)
    const peakGusts = Math.max(...hours.map(h => h.windGustsMph));
    if (peakGusts > 30) {
      const gustHour = hours.find(h => h.windGustsMph === peakGusts)!;
      movers.push({
        location, targetDate,
        type: 'WIND_SURGE',
        triggerHour: gustHour.hour,
        triggerTimeISO: gustHour.timeISO,
        impactDirection: 'COOLER',
        impactMagnitudeF: 2.0,
        confidence: 0.65,
        description: `Gusts up to ${peakGusts.toFixed(0)} mph expected → ` +
          `strong mixing limits peak temperature, high may underperform forecast`,
      });
    }
  }

  private detectTempTrajectory(
    hours: HourlyCondition[], forecastPeak: number, location: string, targetDate: string, movers: MarketMover[]
  ): void {
    // Check morning heating rate (8am-11am) to predict if afternoon will overshoot/undershoot
    const morningHours = hours.filter(h => h.hour >= 8 && h.hour <= 11);
    if (morningHours.length < 3) return;

    // Calculate heating rate (°F per hour)
    const heatingRate = (morningHours[morningHours.length - 1].tempF - morningHours[0].tempF) /
      (morningHours.length - 1);

    // Normal heating rate is ~2-4°F/hour in morning
    // Faster than normal → likely to overshoot
    if (heatingRate > 5) {
      movers.push({
        location, targetDate,
        type: 'TEMP_OVERSHOOT',
        triggerHour: 11,
        triggerTimeISO: morningHours[morningHours.length - 1].timeISO,
        impactDirection: 'WARMER',
        impactMagnitudeF: (heatingRate - 3) * 1.5,
        confidence: 0.65,
        description: `Rapid morning heating at ${heatingRate.toFixed(1)}°F/hr (normal ~3°F/hr) → ` +
          `afternoon high may exceed forecast by ${((heatingRate - 3) * 1.5).toFixed(1)}°F`,
      });
    }

    // Slower than normal → likely to undershoot
    if (heatingRate < 1.5 && morningHours[0].cloudCoverPct < 60) {
      movers.push({
        location, targetDate,
        type: 'TEMP_UNDERSHOOT',
        triggerHour: 11,
        triggerTimeISO: morningHours[morningHours.length - 1].timeISO,
        impactDirection: 'COOLER',
        impactMagnitudeF: (3 - heatingRate) * 1.0,
        confidence: 0.55,
        description: `Sluggish morning heating at ${heatingRate.toFixed(1)}°F/hr → ` +
          `afternoon high may fall short of forecast`,
      });
    }
  }

  private detectPrecipRisk(
    hours: HourlyCondition[], location: string, targetDate: string, movers: MarketMover[]
  ): void {
    // Check for precipitation during peak heating hours
    const peakHours = hours.filter(h => h.hour >= 11 && h.hour <= 16);

    for (const h of peakHours) {
      if (h.precipProbPct > 60 && h.precipMm > 1) {
        movers.push({
          location, targetDate,
          type: 'PRECIP_RISK',
          triggerHour: h.hour,
          triggerTimeISO: h.timeISO,
          impactDirection: 'COOLER',
          impactMagnitudeF: h.precipMm > 5 ? 5.0 : 3.0,
          confidence: h.precipProbPct / 100,
          description: `${h.precipProbPct}% chance of rain at ${h.hour}:00 (${h.precipMm.toFixed(1)}mm) → ` +
            `evaporative cooling could drop temp ${h.precipMm > 5 ? '5' : '3'}°F below forecast`,
        });
        break; // Only report first significant precip event
      }
    }
  }

  private addModelUpdateWindows(location: string, targetDate: string, movers: MarketMover[]): void {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Only add model updates for today/tomorrow (when they'd affect the forecast)
    if (targetDate !== todayStr) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (targetDate !== tomorrow.toISOString().split('T')[0]) return;
    }

    const currentHourUTC = now.getUTCHours();

    // Find next GFS run that will be available
    for (const runHour of MODEL_RUN_TIMES_UTC.GFS) {
      const availableHour = runHour + MODEL_RUN_TIMES_UTC.GFS_AVAILABLE_DELAY;
      if (availableHour > currentHourUTC && availableHour < currentHourUTC + 12) {
        // Convert UTC to approximate local (rough — good enough for alerting)
        const localHour = Math.round(availableHour) % 24;
        movers.push({
          location, targetDate,
          type: 'MODEL_UPDATE',
          triggerHour: localHour,
          triggerTimeISO: `${todayStr}T${String(localHour).padStart(2, '0')}:00:00`,
          impactDirection: 'UNCERTAIN',
          impactMagnitudeF: 0,
          confidence: 0.9,
          description: `GFS model run (${String(runHour).padStart(2, '0')}Z) data available ~${String(Math.round(availableHour)).padStart(2, '0')}Z → ` +
            `forecast update may shift market prices. Watch for consensus changes.`,
        });
        break; // Only next upcoming run
      }
    }

    // Find next ECMWF run
    for (const runHour of MODEL_RUN_TIMES_UTC.ECMWF) {
      const availableHour = runHour + MODEL_RUN_TIMES_UTC.ECMWF_AVAILABLE_DELAY;
      if (availableHour > currentHourUTC && availableHour < currentHourUTC + 12) {
        const localHour = Math.round(availableHour) % 24;
        movers.push({
          location, targetDate,
          type: 'MODEL_UPDATE',
          triggerHour: localHour,
          triggerTimeISO: `${todayStr}T${String(localHour).padStart(2, '0')}:00:00`,
          impactDirection: 'UNCERTAIN',
          impactMagnitudeF: 0,
          confidence: 0.95,
          description: `ECMWF model run (${String(runHour).padStart(2, '0')}Z) data available ~${String(Math.round(availableHour)).padStart(2, '0')}Z → ` +
            `gold-standard forecast update, high-probability price catalyst`,
        });
        break;
      }
    }
  }

  // Adjust temperature forecast based on conditions analysis
  adjustForecast(
    baseHighF: number,
    conditions: DayConditions,
    movers: MarketMover[]
  ): { adjustedHighF: number; adjustmentF: number; reason: string } {
    let adjustment = 0;
    const reasons: string[] = [];

    for (const mover of movers) {
      if (mover.type === 'MODEL_UPDATE') continue; // Model updates don't have temp impact

      const sign = mover.impactDirection === 'WARMER' ? 1 :
                   mover.impactDirection === 'COOLER' ? -1 : 0;

      // Weight by confidence and timing (events during peak heating hours matter more)
      const peakWeight = (mover.triggerHour >= 10 && mover.triggerHour <= 15) ? 1.0 : 0.5;
      const adj = sign * mover.impactMagnitudeF * mover.confidence * peakWeight;

      if (Math.abs(adj) > 0.5) {
        adjustment += adj;
        reasons.push(`${mover.type}: ${adj > 0 ? '+' : ''}${adj.toFixed(1)}°F`);
      }
    }

    // Cap total adjustment at ±8°F (don't let conditions overrule the base forecast too much)
    adjustment = Math.max(-8, Math.min(8, adjustment));

    return {
      adjustedHighF: Math.round((baseHighF + adjustment) * 10) / 10,
      adjustmentF: Math.round(adjustment * 10) / 10,
      reason: reasons.length > 0 ? reasons.join(', ') : 'No significant conditions adjustments',
    };
  }

  // Get a summary of when markets should move for a given city/date
  getMarketMoveTimeline(conditions: DayConditions, movers: MarketMover[]): {
    nextMoveHour: number | null;
    nextMoveType: string | null;
    nextMoveDirection: string | null;
    timeline: { hour: number; events: string[] }[];
  } {
    const now = new Date();
    const currentHour = now.getHours();

    const timeline: { hour: number; events: string[] }[] = [];
    let nextMoveHour: number | null = null;
    let nextMoveType: string | null = null;
    let nextMoveDirection: string | null = null;

    for (const mover of movers) {
      // Find or create timeline entry for this hour
      let entry = timeline.find(t => t.hour === mover.triggerHour);
      if (!entry) {
        entry = { hour: mover.triggerHour, events: [] };
        timeline.push(entry);
      }
      entry.events.push(
        `${mover.type} (${mover.impactDirection}, ${(mover.confidence * 100).toFixed(0)}% conf): ${mover.description}`
      );

      // Track next upcoming move
      if (mover.triggerHour > currentHour && nextMoveHour === null) {
        nextMoveHour = mover.triggerHour;
        nextMoveType = mover.type;
        nextMoveDirection = mover.impactDirection;
      }
    }

    timeline.sort((a, b) => a.hour - b.hour);

    return { nextMoveHour, nextMoveType, nextMoveDirection, timeline };
  }
}

export default WeatherConditionsService;
