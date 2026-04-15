// Manifold Markets Weather Scanner
// Scans Manifold for weather prediction markets (temperature, rain, snow)
// Play money (MANA) but useful for signal and testing strategies

import fetch from 'node-fetch';

export interface ManifoldWeatherMarket {
  id: string;
  question: string;
  url: string;
  probability: number;
  volume: number;
  location: string;
  targetDate: string;
  marketType: 'TEMPERATURE' | 'RAIN' | 'SNOW' | 'OTHER';
  closeTime: Date;
  isResolved: boolean;
  creatorName: string;
}

const WEATHER_KEYWORDS = [
  'temperature', 'highest temp', 'high temp', 'low temp',
  'rain', 'rainfall', 'precipitation',
  'snow', 'snowfall',
  'weather', 'degrees',
];

const SEARCH_QUERIES = [
  'highest temperature',
  'will it rain',
  'temperature tomorrow',
  'weather forecast',
  'snowfall',
  'rain today',
  'temperature today',
];

// Map common city mentions to our internal names
const CITY_MAP: Record<string, string> = {
  'new york': 'NYC', 'nyc': 'NYC', 'manhattan': 'NYC',
  'chicago': 'Chicago',
  'los angeles': 'LA', 'la': 'LA',
  'miami': 'Miami',
  'denver': 'Denver',
  'london': 'London',
  'tokyo': 'Tokyo',
  'seoul': 'Seoul',
  'hong kong': 'Hong Kong',
  'shanghai': 'Shanghai',
  'mexico city': 'Mexico City',
  'milan': 'Milan',
  'beijing': 'Beijing',
  'wellington': 'Wellington',
  'paris': 'Paris',
  'amsterdam': 'Amsterdam',
  'bratislava': 'Bratislava',
  'vancouver': 'Vancouver',
};

class ManifoldWeatherScanner {
  private cache: { data: ManifoldWeatherMarket[]; fetchedAt: number } | null = null;
  private cacheTTL = 2 * 60 * 1000; // 2 min

  async scanWeatherMarkets(): Promise<ManifoldWeatherMarket[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTTL) return this.cache.data;

    const allMarkets = new Map<string, ManifoldWeatherMarket>();

    for (const query of SEARCH_QUERIES) {
      try {
        const url = `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(query)}&limit=20&filter=open`;
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'SneakersWeatherBot/1.0' },
        });
        if (!resp.ok) continue;

        const markets = (await resp.json()) as any[];
        for (const m of markets) {
          if (m.isResolved) continue;
          if (m.outcomeType !== 'BINARY') continue;

          const parsed = this.parseMarket(m);
          if (parsed && !allMarkets.has(parsed.id)) {
            allMarkets.set(parsed.id, parsed);
          }
        }
      } catch { /* continue */ }

      await new Promise(r => setTimeout(r, 300));
    }

    const result = Array.from(allMarkets.values());
    this.cache = { data: result, fetchedAt: Date.now() };
    return result;
  }

  private parseMarket(m: any): ManifoldWeatherMarket | null {
    const question = (m.question || '').toLowerCase();

    // Check if it's weather-related
    const isWeather = WEATHER_KEYWORDS.some(kw => question.includes(kw));
    if (!isWeather) return null;

    // Determine market type
    let marketType: ManifoldWeatherMarket['marketType'] = 'OTHER';
    if (question.includes('temperature') || question.includes('temp') || question.includes('degree')) {
      marketType = 'TEMPERATURE';
    } else if (question.includes('rain') || question.includes('precipitation')) {
      marketType = 'RAIN';
    } else if (question.includes('snow')) {
      marketType = 'SNOW';
    }

    // Extract location
    let location = 'Unknown';
    for (const [keyword, cityName] of Object.entries(CITY_MAP)) {
      if (question.includes(keyword)) {
        location = cityName;
        break;
      }
    }

    // Extract date
    let targetDate = '';
    const dateMatch = question.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      targetDate = dateMatch[1];
    } else {
      // Check for "today", "tomorrow", specific dates
      const today = new Date();
      if (question.includes('today')) {
        targetDate = today.toISOString().split('T')[0];
      } else if (question.includes('tomorrow')) {
        const tom = new Date(today);
        tom.setDate(tom.getDate() + 1);
        targetDate = tom.toISOString().split('T')[0];
      } else {
        // Try month-day patterns
        const mdMatch = question.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/i);
        if (mdMatch) {
          const months: Record<string, string> = {
            january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
            july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
          };
          const month = months[mdMatch[1].toLowerCase()];
          const day = mdMatch[2].padStart(2, '0');
          const year = today.getFullYear();
          targetDate = `${year}-${month}-${day}`;
        }
      }
    }

    return {
      id: m.id,
      question: m.question,
      url: m.url || `https://manifold.markets/${m.creatorUsername}/${m.slug}`,
      probability: m.probability || 0,
      volume: m.volume || 0,
      location,
      targetDate,
      marketType,
      closeTime: new Date(m.closeTime || Date.now()),
      isResolved: m.isResolved || false,
      creatorName: m.creatorName || '',
    };
  }
}

export default ManifoldWeatherScanner;
