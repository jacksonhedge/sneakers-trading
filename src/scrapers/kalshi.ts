import { BaseScraper } from "./base-scraper.js";
import type {
  NormalizedMarket,
  NormalizedOutcome,
  ScraperConfig,
  Sport,
  MarketType,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/*  Kalshi Scraper — CFTC-regulated event contracts                           */
/*                                                                            */
/*  Public read-only endpoints require NO authentication. We only need auth   */
/*  if we want to place orders or read portfolio. Market discovery, prices,   */
/*  and orderbook snapshots are all public.                                   */
/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 20000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;

export const SCRAPER_CONFIG: ScraperConfig = {
  id: "kalshi",
  name: "Kalshi",
  category: "prediction",
  mono: "KL",
  tint: "#00C48C",
  enabled: true,
  pollIntervalMs: 15000,
  maxRps: 5,
  demoMode: false,
  apiBase: "https://api.elections.kalshi.com/trade-api/v2",
  sports: ["Other"] as Sport[],
};

/* ── API shapes ───────────────────────────────────────────────────────────── */

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time: string;
  close_time: string;
  expected_expiration_time?: string;
  status: "initialized" | "active" | "closed" | "settled" | "finalized";
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_yes_bid?: number;
  previous_yes_ask?: number;
  previous_price?: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  notional_value?: number;
  category?: string;
  can_close_early?: boolean;
  risk_limit_cents?: number;
}

interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

/* ── Scraper class ────────────────────────────────────────────────────────── */

export default class Kalshi extends BaseScraper {
  constructor(overrides?: Partial<ScraperConfig>) {
    super({ ...SCRAPER_CONFIG, ...overrides });
  }

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    const all: NormalizedMarket[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        status: "open",
        limit: String(PAGE_SIZE),
      });
      if (cursor) params.set("cursor", cursor);

      const url = `${this.config.apiBase}/markets?${params.toString()}`;
      const data = await this.get<KalshiMarketsResponse>(url);

      for (const m of data.markets ?? []) {
        const market = this.normalize(m);
        if (market) all.push(market);
      }

      if (!data.cursor || data.markets.length < PAGE_SIZE) break;
      cursor = data.cursor;
    }

    return all;
  }

  private async get<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalize(m: KalshiMarket): NormalizedMarket | null {
    if (m.status !== "active" && m.status !== "initialized") return null;

    const { sport, league } = this.classify(m);

    const yesCents = m.yes_ask > 0 ? m.yes_ask : m.last_price || 50;
    const noCents = m.no_ask > 0 ? m.no_ask : 100 - yesCents;

    const outcomes: NormalizedOutcome[] = [
      {
        label: m.yes_sub_title ?? "YES",
        side: "yes",
        americanOdds: this.centsToAmerican(yesCents),
        decimalOdds: yesCents > 0 ? Math.round((100 / yesCents) * 100) / 100 : 0,
        impliedProb: Math.round((yesCents / 100) * 10000) / 10000,
        priceCents: yesCents,
      },
      {
        label: m.no_sub_title ?? "NO",
        side: "no",
        americanOdds: this.centsToAmerican(noCents),
        decimalOdds: noCents > 0 ? Math.round((100 / noCents) * 100) / 100 : 0,
        impliedProb: Math.round((noCents / 100) * 10000) / 10000,
        priceCents: noCents,
      },
    ];

    const closeTime = new Date(m.close_time).getTime();
    const openTime = new Date(m.open_time).getTime();
    const isLive = Date.now() >= openTime && Date.now() < closeTime;

    return {
      id: this.makeId("kalshi", m.ticker),
      externalId: m.ticker,
      platformId: "kalshi",
      platformName: "Kalshi",
      sport,
      league,
      event: {
        name: m.title,
        startTime: openTime,
        isLive,
      },
      marketType: "prediction" as MarketType,
      marketName: m.subtitle ?? m.title,
      outcomes,
      lastUpdated: Date.now(),
      isActive: m.status === "active",
    };
  }

  /** Heuristic categorization — Kalshi covers sports + politics + econ + weather. */
  private classify(m: KalshiMarket): { sport: Sport; league: string } {
    const hay = `${m.title} ${m.event_ticker} ${m.category ?? ""}`.toLowerCase();
    if (/\bnfl\b|super bowl/.test(hay)) return { sport: "NFL", league: "NFL" };
    if (/\bnba\b|playoff.*basketball/.test(hay)) return { sport: "NBA", league: "NBA" };
    if (/\bmlb\b|world series|baseball/.test(hay)) return { sport: "MLB", league: "MLB" };
    if (/\bnhl\b|stanley cup|hockey/.test(hay)) return { sport: "NHL", league: "NHL" };
    if (/college football|cfb|ncaaf/.test(hay)) return { sport: "NCAAF", league: "NCAAF" };
    if (/march madness|ncaab|college basketball/.test(hay)) return { sport: "NCAAB", league: "NCAAB" };
    if (/\bufc\b|mma/.test(hay)) return { sport: "MMA", league: "UFC" };
    if (/premier league|la liga|soccer|fifa|world cup|mls/.test(hay)) return { sport: "Soccer", league: "Soccer" };
    if (/tennis|atp|wta|grand slam/.test(hay)) return { sport: "Tennis", league: "Tennis" };
    if (/pga|golf|masters/.test(hay)) return { sport: "Golf", league: "Golf" };
    if (/esports|dota|csgo|valorant|league of legends/.test(hay)) return { sport: "Esports", league: "Esports" };
    return { sport: "Other", league: m.category ?? "Events" };
  }

  protected generateDemoData(): NormalizedMarket[] {
    const now = Date.now();
    const mk = (
      ticker: string,
      title: string,
      sport: Sport,
      league: string,
      yesCents: number,
    ): NormalizedMarket => ({
      id: this.makeId("kalshi", ticker),
      externalId: ticker,
      platformId: "kalshi",
      platformName: "Kalshi",
      sport,
      league,
      event: { name: title, startTime: now + 86400000, isLive: false },
      marketType: "prediction",
      marketName: title,
      outcomes: [
        {
          label: "YES",
          side: "yes",
          americanOdds: this.centsToAmerican(yesCents),
          decimalOdds: Math.round((100 / yesCents) * 100) / 100,
          impliedProb: yesCents / 100,
          priceCents: yesCents,
        },
        {
          label: "NO",
          side: "no",
          americanOdds: this.centsToAmerican(100 - yesCents),
          decimalOdds: Math.round((100 / (100 - yesCents)) * 100) / 100,
          impliedProb: (100 - yesCents) / 100,
          priceCents: 100 - yesCents,
        },
      ],
      lastUpdated: now,
      isActive: true,
    });

    return [
      mk("KXNFLGAME-26JAN26KCPHI-KC", "Chiefs beat Eagles?", "NFL", "NFL", 58),
      mk("KXNBACHAMP-26-BOS", "Celtics win 2026 NBA title?", "NBA", "NBA", 22),
      mk("KXCPI-26MAR-3.2", "March CPI above 3.2%?", "Other", "Economics", 47),
      mk("KXPRES-28-DEM", "Democrat wins 2028 election?", "Other", "Politics", 51),
    ];
  }
}
