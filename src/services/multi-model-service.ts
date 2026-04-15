// Multi-Model Ensemble Service
// Fetches forecasts from ECMWF IFS, ICON, GFS, GEM, JMA, HRRR via Open-Meteo
// Analyzes model agreement, spread, and outliers for better probability estimation

import fetch from 'node-fetch';
import { WeatherLocation } from './noaa-weather-service.js';

export interface ModelForecast {
  modelName: string;
  tempHighF: number;
  tempLowF: number;
  precipProbPct: number;
  cloudCoverPct: number;
  windSpeedMph: number;
  fetchedAt: Date;
}

export interface EnsembleForecast {
  location: string;
  targetDate: string;
  models: ModelForecast[];
  ensembleMeanHighF: number;
  ensembleMedianHighF: number;
  ensembleSpreadF: number;
  modelAgreement: 'STRONG' | 'MODERATE' | 'WEAK';
  outlierModels: string[];
  bestEstimateHighF: number;
  confidenceInterval: { low: number; high: number };
}

export interface EnsembleMember {
  member: number;
  tempHighF: number;
}

const MODEL_CONFIGS: { id: string; name: string; usOnly?: boolean }[] = [
  { id: 'ecmwf_ifs025', name: 'ECMWF IFS' },
  { id: 'icon_global', name: 'ICON' },
  { id: 'gfs_global', name: 'GFS' },
  { id: 'gem_global', name: 'GEM' },
  { id: 'jma_gsm', name: 'JMA' },
  { id: 'ncep_hrrr_conus', name: 'HRRR', usOnly: true },
];

const US_CITIES = ['NYC', 'Chicago', 'LA', 'Miami', 'Denver'];

class MultiModelService {
  private cache: Map<string, { data: EnsembleForecast; fetchedAt: number }> = new Map();
  private cacheTTL = 15 * 60 * 1000; // 15 min

  async fetchEnsemble(location: WeatherLocation, targetDate: string): Promise<EnsembleForecast> {
    const key = `${location.name}:${targetDate}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const isUS = US_CITIES.includes(location.name);
    const activeModels = MODEL_CONFIGS.filter(m => !m.usOnly || isUS);
    const modelIds = activeModels.map(m => m.id).join(',');

    const models: ModelForecast[] = [];

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&start_date=${targetDate}&end_date=${targetDate}&models=${modelIds}`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = (await resp.json()) as any;

      // Open-Meteo returns data keyed by model name under daily
      // e.g. data.daily.temperature_2m_max_ecmwf_ifs025
      for (const model of activeModels) {
        try {
          const suffix = `_${model.id}`;
          const highArr = data.daily?.[`temperature_2m_max${suffix}`] ?? data.daily?.temperature_2m_max;
          const lowArr = data.daily?.[`temperature_2m_min${suffix}`] ?? data.daily?.temperature_2m_min;
          const precipArr = data.daily?.[`precipitation_probability_max${suffix}`] ?? data.daily?.precipitation_probability_max;
          const cloudArr = data.daily?.[`cloud_cover_mean${suffix}`] ?? data.daily?.cloud_cover_mean;
          const windArr = data.daily?.[`wind_speed_10m_max${suffix}`] ?? data.daily?.wind_speed_10m_max;

          const highF = Array.isArray(highArr) ? highArr[0] : null;
          const lowF = Array.isArray(lowArr) ? lowArr[0] : null;
          if (highF == null || lowF == null) continue;

          models.push({
            modelName: model.name,
            tempHighF: highF,
            tempLowF: lowF,
            precipProbPct: Array.isArray(precipArr) ? (precipArr[0] ?? 0) : 0,
            cloudCoverPct: Array.isArray(cloudArr) ? (cloudArr[0] ?? 0) : 0,
            windSpeedMph: Array.isArray(windArr) ? (windArr[0] ?? 0) : 0,
            fetchedAt: new Date(),
          });
        } catch { /* skip model */ }
      }
    } catch (e) {
      console.error(`[MultiModel] Fetch failed for ${location.name}: ${(e as Error).message}`);
    }

    const analysis = this.analyzeEnsemble(models);

    const result: EnsembleForecast = {
      location: location.name,
      targetDate,
      models,
      ...analysis,
    };

    this.cache.set(key, { data: result, fetchedAt: Date.now() });
    return result;
  }

  analyzeEnsemble(models: ModelForecast[]): {
    ensembleMeanHighF: number;
    ensembleMedianHighF: number;
    ensembleSpreadF: number;
    modelAgreement: 'STRONG' | 'MODERATE' | 'WEAK';
    outlierModels: string[];
    bestEstimateHighF: number;
    confidenceInterval: { low: number; high: number };
  } {
    if (models.length === 0) {
      return {
        ensembleMeanHighF: 0, ensembleMedianHighF: 0, ensembleSpreadF: 0,
        modelAgreement: 'WEAK', outlierModels: [], bestEstimateHighF: 0,
        confidenceInterval: { low: 0, high: 0 },
      };
    }

    const highs = models.map(m => m.tempHighF).sort((a, b) => a - b);
    const mean = highs.reduce((s, v) => s + v, 0) / highs.length;
    const median = highs.length % 2 === 0
      ? (highs[highs.length / 2 - 1] + highs[highs.length / 2]) / 2
      : highs[Math.floor(highs.length / 2)];
    const spread = highs[highs.length - 1] - highs[0];

    // Agreement
    const agreement: 'STRONG' | 'MODERATE' | 'WEAK' =
      spread < 3 ? 'STRONG' : spread < 6 ? 'MODERATE' : 'WEAK';

    // Outliers: 1.5 * IQR
    const q1 = highs[Math.floor(highs.length * 0.25)];
    const q3 = highs[Math.floor(highs.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const outlierModels = models
      .filter(m => m.tempHighF < lowerBound || m.tempHighF > upperBound)
      .map(m => m.modelName);

    // Trimmed mean (exclude outliers)
    const trimmed = models.filter(m => !outlierModels.includes(m.modelName));
    const bestEstimate = trimmed.length > 0
      ? trimmed.reduce((s, m) => s + m.tempHighF, 0) / trimmed.length
      : mean;

    return {
      ensembleMeanHighF: Math.round(mean * 10) / 10,
      ensembleMedianHighF: Math.round(median * 10) / 10,
      ensembleSpreadF: Math.round(spread * 10) / 10,
      modelAgreement: agreement,
      outlierModels,
      bestEstimateHighF: Math.round(bestEstimate * 10) / 10,
      confidenceInterval: {
        low: Math.round((bestEstimate - spread / 2) * 10) / 10,
        high: Math.round((bestEstimate + spread / 2) * 10) / 10,
      },
    };
  }

  async fetchEnsembleMembers(location: WeatherLocation, targetDate: string): Promise<EnsembleMember[]> {
    try {
      const url = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${location.lat}&longitude=${location.lon}&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=auto&start_date=${targetDate}&end_date=${targetDate}&models=ecmwf_ifs025`;

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) return [];

      const data = (await resp.json()) as any;
      const members: EnsembleMember[] = [];

      // Ensemble API returns temperature_2m_max for each member
      if (data.daily) {
        for (const key of Object.keys(data.daily)) {
          if (key.startsWith('temperature_2m_max_member')) {
            const memberNum = parseInt(key.replace('temperature_2m_max_member', ''));
            const val = data.daily[key]?.[0];
            if (val != null) {
              members.push({ member: memberNum, tempHighF: val });
            }
          }
        }
      }

      return members;
    } catch {
      return [];
    }
  }

  // HRRR 15-minute precipitation forecast (3km resolution, US only)
  async fetchHrrrMinutely(location: WeatherLocation): Promise<{
    intervals: { time: string; precipMm: number; weatherCode: number }[];
    totalPrecipMm: number;
    maxRateMmHr: number;
    precipitating: boolean;
  } | null> {
    if (!US_CITIES.includes(location.name)) return null;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&minutely_15=precipitation,weather_code&models=ncep_hrrr_conus&forecast_minutely_15=96&timezone=auto`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const times = data.minutely_15?.time || [];
      const precips = data.minutely_15?.precipitation || data.minutely_15?.precipitation_ncep_hrrr_conus || [];
      const codes = data.minutely_15?.weather_code || data.minutely_15?.weather_code_ncep_hrrr_conus || [];

      const intervals: { time: string; precipMm: number; weatherCode: number }[] = [];
      let totalPrecip = 0;
      let maxRate = 0;

      for (let i = 0; i < Math.min(times.length, precips.length); i++) {
        const precipMm = precips[i] ?? 0;
        totalPrecip += precipMm;
        maxRate = Math.max(maxRate, precipMm * 4); // Convert 15-min accumulation to mm/hr
        intervals.push({
          time: times[i],
          precipMm,
          weatherCode: codes[i] ?? 0,
        });
      }

      return {
        intervals: intervals.slice(0, 96), // 24 hours of 15-min data
        totalPrecipMm: Math.round(totalPrecip * 10) / 10,
        maxRateMmHr: Math.round(maxRate * 10) / 10,
        precipitating: intervals.slice(0, 4).some(i => i.precipMm > 0), // Next hour
      };
    } catch {
      return null;
    }
  }

  // NBM (National Blend of Models) — NOAA's best consensus for US
  async fetchNbmForecast(location: WeatherLocation, targetDate: string): Promise<ModelForecast | null> {
    if (!US_CITIES.includes(location.name)) return null;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&start_date=${targetDate}&end_date=${targetDate}&models=nbm_conus`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const d = data.daily;
      const highF = d?.temperature_2m_max?.[0] ?? d?.temperature_2m_max_nbm_conus?.[0];
      const lowF = d?.temperature_2m_min?.[0] ?? d?.temperature_2m_min_nbm_conus?.[0];
      if (highF == null || lowF == null) return null;

      return {
        modelName: 'NBM',
        tempHighF: highF,
        tempLowF: lowF,
        precipProbPct: d?.precipitation_probability_max?.[0] ?? d?.precipitation_probability_max_nbm_conus?.[0] ?? 0,
        cloudCoverPct: d?.cloud_cover_mean?.[0] ?? d?.cloud_cover_mean_nbm_conus?.[0] ?? 0,
        windSpeedMph: d?.wind_speed_10m_max?.[0] ?? d?.wind_speed_10m_max_nbm_conus?.[0] ?? 0,
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  }
}

export default MultiModelService;
