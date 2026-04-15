// Kalshi Weather Market Scanner
// Scans Kalshi's regulated prediction markets for temperature events
// Kalshi uses bracket-style markets (e.g., "83° to 84°") in °F
// Series: KXHIGHNY (NYC), KXHIGHCHI (Chicago), KXHIGHMIA (Miami), KXHIGHDEN (Denver)

import fetch from 'node-fetch';
import { celsiusToFahrenheit } from './noaa-weather-service.js';

export interface KalshiOutcome {
  ticker: string;
  label: string;
  tempLowF: number;
  tempHighF: number;
  tempMidF: number;
  tempMidC: number;
  isFloor: boolean;     // "X° or below"
  isCeiling: boolean;   // "X° or above"
  yesBid: number;
  yesAsk: number;
  yesMid: number;       // midpoint price = implied probability
  noBid: number;
  noAsk: number;
  lastPrice: number;
  volume: number;
}

export interface KalshiWeatherMarket {
  eventTicker: string;
  seriesTicker: string;
  title: string;
  location: string;
  targetDate: string;
  outcomes: KalshiOutcome[];
  endDate: Date;
  active: boolean;
  totalVolume: number;
}

// Kalshi series tickers for weather markets
const KALSHI_SERIES: { ticker: string; location: string }[] = [
  { ticker: 'KXHIGHNY', location: 'NYC' },
  { ticker: 'KXHIGHCHI', location: 'Chicago' },
  { ticker: 'KXHIGHMIA', location: 'Miami' },
  { ticker: 'KXHIGHDEN', location: 'Denver' },
  // Future series (scan even if not active yet)
  { ticker: 'KXHIGHLA', location: 'LA' },
  { ticker: 'KXLOWNY', location: 'NYC' },     // Low temp
  { ticker: 'KXRAINNY', location: 'NYC' },     // Rain
  { ticker: 'KXRAINCHI', location: 'Chicago' },
  { ticker: 'KXSNOWNY', location: 'NYC' },     // Snow
];

const API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

class KalshiWeatherScanner {
  private cache: Map<string, { data: KalshiWeatherMarket[]; fetchedAt: number }> = new Map();
  private cacheTTL = 60 * 1000; // 1 min

  async scanWeatherMarkets(): Promise<KalshiWeatherMarket[]> {
    const cached = this.cache.get('all');
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) return cached.data;

    const markets: KalshiWeatherMarket[] = [];

    for (const series of KALSHI_SERIES) {
      try {
        const events = await this.fetchSeriesEvents(series.ticker);
        for (const event of events) {
          const market = await this.parseEvent(event, series);
          if (market) markets.push(market);
        }
      } catch (e) {
        // Series may not exist yet — that's fine
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    }

    this.cache.set('all', { data: markets, fetchedAt: Date.now() });
    return markets;
  }

  private async fetchSeriesEvents(seriesTicker: string): Promise<any[]> {
    try {
      const url = `${API_BASE}/events?status=open&series_ticker=${seriesTicker}&with_nested_markets=true`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'SneakersWeatherBot/1.0' },
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as any;
      return data.events || [];
    } catch {
      return [];
    }
  }

  private async parseEvent(event: any, series: { ticker: string; location: string }): Promise<KalshiWeatherMarket | null> {
    const subMarkets = event.markets || [];
    if (subMarkets.length === 0) {
      // Fetch markets separately if not nested
      try {
        const url = `${API_BASE}/markets?event_ticker=${event.event_ticker}`;
        const resp = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'SneakersWeatherBot/1.0' },
        });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          subMarkets.push(...(data.markets || []));
        }
      } catch {}
    }

    if (subMarkets.length === 0) return null;

    // Parse date from event ticker: KXHIGHNY-26APR15 -> 2026-04-15
    const targetDate = this.parseEventDate(event.event_ticker);
    if (!targetDate) return null;

    const outcomes: KalshiOutcome[] = [];

    for (const m of subMarkets) {
      const outcome = this.parseMarket(m);
      if (outcome) outcomes.push(outcome);
    }

    if (outcomes.length === 0) return null;
    outcomes.sort((a, b) => a.tempMidF - b.tempMidF);

    const totalVolume = outcomes.reduce((s, o) => s + o.volume, 0);

    return {
      eventTicker: event.event_ticker,
      seriesTicker: series.ticker,
      title: event.title || '',
      location: series.location,
      targetDate,
      outcomes,
      endDate: new Date(event.close_time || event.expiration_time || Date.now()),
      active: true,
      totalVolume,
    };
  }

  private parseMarket(m: any): KalshiOutcome | null {
    const ticker = m.ticker || '';
    const subtitle = m.subtitle || m.yes_sub_title || '';

    // Parse temperature from subtitle: "82° or below", "83° to 84°", "91° or above"
    let tempLowF = 0, tempHighF = 0;
    let isFloor = false, isCeiling = false;

    const belowMatch = subtitle.match(/(\d+)°?\s*or\s*below/i);
    const aboveMatch = subtitle.match(/(\d+)°?\s*or\s*above/i);
    const rangeMatch = subtitle.match(/(\d+)°?\s*to\s*(\d+)°?/i);

    if (belowMatch) {
      tempHighF = parseInt(belowMatch[1]);
      tempLowF = tempHighF - 20; // arbitrary lower bound
      isFloor = true;
    } else if (aboveMatch) {
      tempLowF = parseInt(aboveMatch[1]);
      tempHighF = tempLowF + 20;
      isCeiling = true;
    } else if (rangeMatch) {
      tempLowF = parseInt(rangeMatch[1]);
      tempHighF = parseInt(rangeMatch[2]);
    } else {
      // Try to parse from ticker: -T83 (threshold) or -B83.5 (bracket)
      const tMatch = ticker.match(/-T(\d+)$/);
      const bMatch = ticker.match(/-B(\d+\.?\d*)$/);
      if (tMatch) {
        const temp = parseInt(tMatch[1]);
        // Check if it's the low or high end
        if (subtitle.toLowerCase().includes('below') || subtitle.toLowerCase().includes('or less')) {
          tempHighF = temp;
          tempLowF = temp - 20;
          isFloor = true;
        } else {
          tempLowF = temp;
          tempHighF = temp + 20;
          isCeiling = true;
        }
      } else if (bMatch) {
        tempLowF = parseFloat(bMatch[1]) - 0.5;
        tempHighF = parseFloat(bMatch[1]) + 0.5;
      } else {
        return null;
      }
    }

    const tempMidF = (tempLowF + tempHighF) / 2;

    return {
      ticker,
      label: subtitle || `${tempLowF}-${tempHighF}°F`,
      tempLowF,
      tempHighF,
      tempMidF,
      tempMidC: Math.round((tempMidF - 32) * 5 / 9 * 10) / 10,
      isFloor,
      isCeiling,
      yesBid: m.yes_bid || 0,
      yesAsk: m.yes_ask || 0,
      yesMid: ((m.yes_bid || 0) + (m.yes_ask || 0)) / 2 || m.last_price || 0,
      noBid: m.no_bid || 0,
      noAsk: m.no_ask || 0,
      lastPrice: m.last_price || 0,
      volume: m.volume || 0,
    };
  }

  private parseEventDate(eventTicker: string): string | null {
    // KXHIGHNY-26APR15 -> 2026-04-15
    const match = eventTicker.match(/-(\d{2})([A-Z]{3})(\d{2})$/);
    if (!match) return null;

    const year = 2000 + parseInt(match[1]);
    const months: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };
    const month = months[match[2]] || '01';
    const day = match[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export default KalshiWeatherScanner;
