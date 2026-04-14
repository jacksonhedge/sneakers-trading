// Polymarket Weather Market Scanner
// Discovers temperature prediction events via Gamma API and parses them into tradeable outcomes
//
// Polymarket structure: Each temperature event (e.g., "Highest temperature in London on April 15?")
// contains ~11 sub-markets, each a Yes/No binary: "Will the highest temperature be 15°C on April 15?"
// The "Yes" price on each sub-market is the market's implied probability for that temperature.

import fetch from 'node-fetch';
import { celsiusToFahrenheit } from './noaa-weather-service.js';

export interface PolymarketOutcome {
  conditionId: string;
  tokenId: string;
  label: string;
  temperatureC: number;
  temperatureF: number;
  isFloor: boolean;    // "X°C or below"
  isCeiling: boolean;  // "X°C or higher"
  yesPrice: number;    // Market-implied probability
  noPrice: number;
  rangeLowF: number;
  rangeHighF: number;
  price: number;       // Alias for yesPrice (compatibility with edge calculator)
}

export interface PolymarketWeatherMarket {
  eventId: string;
  conditionId: string;  // First sub-market's conditionId (for compatibility)
  slug: string;
  question: string;
  location: string;
  targetDate: string;
  metric: 'high' | 'low';
  unit: 'C';
  outcomes: PolymarketOutcome[];
  endDate: Date;
  active: boolean;
  volume: number;
  liquidity: number;
}

// Cities that Polymarket runs daily temperature markets for
const POLYMARKET_CITIES = [
  'london', 'seoul', 'tokyo', 'shanghai', 'hong-kong',
  'mexico-city', 'milan', 'beijing', 'wellington',
  'new-york-city', 'chicago', 'denver', 'miami', 'los-angeles',
];

// Map Polymarket slug city names to our internal location names
const SLUG_TO_LOCATION: Record<string, string> = {
  'london': 'London',
  'seoul': 'Seoul',
  'tokyo': 'Tokyo',
  'shanghai': 'Shanghai',
  'hong-kong': 'Hong Kong',
  'mexico-city': 'Mexico City',
  'milan': 'Milan',
  'beijing': 'Beijing',
  'wellington': 'Wellington',
  'new-york-city': 'NYC',
  'chicago': 'Chicago',
  'denver': 'Denver',
  'miami': 'Miami',
  'los-angeles': 'LA',
};

class PolymarketWeatherScanner {
  private gammaApi = 'https://gamma-api.polymarket.com';
  private clobApi = 'https://clob.polymarket.com';

  // Scan for active temperature markets across all cities and upcoming dates
  async scanWeatherMarkets(): Promise<PolymarketWeatherMarket[]> {
    const markets: PolymarketWeatherMarket[] = [];
    const today = new Date();

    // Search for temperature events for today and the next 3 days
    const dates: string[] = [];
    for (let d = 0; d <= 3; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      dates.push(this.formatDateForSlug(date));
    }

    // Build slug patterns for all city+date combos
    const slugs: string[] = [];
    for (const city of POLYMARKET_CITIES) {
      for (const dateSlug of dates) {
        slugs.push(`highest-temperature-in-${city}-on-${dateSlug}`);
      }
    }

    // Fetch events in parallel batches (rate-limited)
    const batchSize = 5;
    for (let i = 0; i < slugs.length; i += batchSize) {
      const batch = slugs.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(slug => this.fetchEventBySlug(slug))
      );

      for (const result of results) {
        if (result) markets.push(result);
      }

      // Rate limit between batches
      if (i + batchSize < slugs.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return markets;
  }

  private formatDateForSlug(date: Date): string {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}-${day}-${year}`;
  }

  private formatDateISO(dateSlug: string): string {
    // "april-15-2026" -> "2026-04-15"
    const months: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12',
    };
    const parts = dateSlug.split('-');
    if (parts.length < 3) return '';
    const month = months[parts[0]] || '01';
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }

  private async fetchEventBySlug(slug: string): Promise<PolymarketWeatherMarket | null> {
    try {
      const resp = await fetch(
        `${this.gammaApi}/events?slug=${slug}&closed=false`,
        { headers: { Accept: 'application/json' } }
      );

      if (!resp.ok) return null;

      const events = (await resp.json()) as any[];
      if (events.length === 0) return null;

      const event = events[0];
      return this.parseEvent(event, slug);
    } catch (e) {
      return null;
    }
  }

  private parseEvent(event: any, slug: string): PolymarketWeatherMarket | null {
    const title = event.title || '';
    const subMarkets = event.markets || [];
    if (subMarkets.length === 0) return null;

    // Parse location from slug: "highest-temperature-in-london-on-april-15-2026"
    const slugMatch = slug.match(/highest-temperature-in-(.+?)-on-(.+)/);
    if (!slugMatch) return null;

    const citySlug = slugMatch[1];
    const dateSlug = slugMatch[2];
    const location = SLUG_TO_LOCATION[citySlug];
    if (!location) return null;

    const targetDate = this.formatDateISO(dateSlug);
    if (!targetDate) return null;

    // Parse each sub-market into an outcome
    const outcomes: PolymarketOutcome[] = [];

    for (const m of subMarkets) {
      const question = m.question || '';
      const parsed = this.parseSubMarket(m, question);
      if (parsed) outcomes.push(parsed);
    }

    if (outcomes.length === 0) return null;

    // Sort by temperature ascending
    outcomes.sort((a, b) => a.temperatureC - b.temperatureC);

    // Calculate ranges: each outcome covers from midpoint-below to midpoint-above
    this.assignRanges(outcomes);

    const totalVolume = subMarkets.reduce((s: number, m: any) => s + (parseFloat(m.volume) || 0), 0);
    const totalLiquidity = subMarkets.reduce((s: number, m: any) => s + (parseFloat(m.liquidity) || 0), 0);

    return {
      eventId: event.id || '',
      conditionId: outcomes[0]?.conditionId || '',
      slug,
      question: title,
      location,
      targetDate,
      metric: 'high',
      unit: 'C',
      outcomes,
      endDate: new Date(subMarkets[0]?.endDate || Date.now()),
      active: true,
      volume: totalVolume,
      liquidity: totalLiquidity,
    };
  }

  private parseSubMarket(raw: any, question: string): PolymarketOutcome | null {
    // Parse: "Will the highest temperature in London be 15°C on April 14?"
    // Also: "Will the highest temperature in London be 10°C or below on April 14?"
    // Also: "Will the highest temperature in London be 20°C or higher on April 14?"
    const tempMatch = question.match(/be\s+(\d+)\s*°?\s*C\s*(or below|or higher)?\s/i);
    if (!tempMatch) return null;

    const tempC = parseInt(tempMatch[1]);
    const modifier = (tempMatch[2] || '').toLowerCase();
    const isFloor = modifier === 'or below';
    const isCeiling = modifier === 'or higher';
    const tempF = celsiusToFahrenheit(tempC);

    // Get prices
    let yesPrice = 0;
    let noPrice = 0;
    const prices = raw.outcomePrices;
    if (typeof prices === 'string') {
      try {
        const parsed = JSON.parse(prices);
        yesPrice = parseFloat(parsed[0]) || 0;
        noPrice = parseFloat(parsed[1]) || 0;
      } catch { /* */ }
    } else if (Array.isArray(prices)) {
      yesPrice = parseFloat(prices[0]) || 0;
      noPrice = parseFloat(prices[1]) || 0;
    }

    // Get token IDs
    let tokenId = '';
    const clobTokenIds = raw.clobTokenIds;
    if (typeof clobTokenIds === 'string') {
      try {
        const parsed = JSON.parse(clobTokenIds);
        tokenId = parsed[0] || ''; // Yes token
      } catch { /* */ }
    } else if (Array.isArray(clobTokenIds)) {
      tokenId = clobTokenIds[0] || '';
    }

    const label = isFloor ? `${tempC}°C or below` :
                  isCeiling ? `${tempC}°C or higher` :
                  `${tempC}°C`;

    return {
      conditionId: raw.conditionId || raw.id || '',
      tokenId,
      label,
      temperatureC: tempC,
      temperatureF: tempF,
      isFloor,
      isCeiling,
      yesPrice,
      noPrice,
      rangeLowF: tempF - 0.9, // Will be recalculated by assignRanges
      rangeHighF: tempF + 0.9,
      price: yesPrice,
    };
  }

  // Assign temperature ranges so each outcome covers a 1°C band
  // e.g., "15°C" covers 14.5°C to 15.5°C (in Fahrenheit)
  private assignRanges(outcomes: PolymarketOutcome[]): void {
    for (let i = 0; i < outcomes.length; i++) {
      const o = outcomes[i];
      if (o.isFloor) {
        // "10°C or below" covers -infinity to 10.5°C
        o.rangeLowF = -100;
        o.rangeHighF = celsiusToFahrenheit(o.temperatureC + 0.5);
      } else if (o.isCeiling) {
        // "20°C or higher" covers 19.5°C to +infinity
        o.rangeLowF = celsiusToFahrenheit(o.temperatureC - 0.5);
        o.rangeHighF = 300;
      } else {
        // Exact temp "15°C" covers 14.5°C to 15.5°C
        o.rangeLowF = celsiusToFahrenheit(o.temperatureC - 0.5);
        o.rangeHighF = celsiusToFahrenheit(o.temperatureC + 0.5);
      }
    }
  }

  // Fetch live orderbook for precise pricing on a specific token
  async fetchOrderbook(tokenId: string): Promise<{ bestBid: number; bestAsk: number; midpoint: number } | null> {
    try {
      const resp = await fetch(`${this.clobApi}/book?token_id=${tokenId}`, {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) return null;

      const data = (await resp.json()) as any;
      const bids = data.bids || [];
      const asks = data.asks || [];

      const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
      const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 1;

      return { bestBid, bestAsk, midpoint: (bestBid + bestAsk) / 2 };
    } catch {
      return null;
    }
  }

  // Enrich all outcomes with live orderbook data for precise pricing
  async enrichWithOrderbook(market: PolymarketWeatherMarket): Promise<PolymarketWeatherMarket> {
    const enriched = { ...market, outcomes: [...market.outcomes] };

    for (let i = 0; i < enriched.outcomes.length; i++) {
      const o = enriched.outcomes[i];
      if (!o.tokenId) continue;

      const book = await this.fetchOrderbook(o.tokenId);
      if (book) {
        enriched.outcomes[i] = { ...o, price: book.midpoint, yesPrice: book.midpoint };
      }

      await new Promise(r => setTimeout(r, 150));
    }

    return enriched;
  }
}

export default PolymarketWeatherScanner;
