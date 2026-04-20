import { BaseScraper } from "./base-scraper.js";
import type {
  NormalizedMarket,
  NormalizedOutcome,
  ScraperConfig,
  Sport,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/*  Polymarket Scraper — on-chain prediction markets (Polygon / UMA)          */
/*                                                                            */
/*  Uses the public Gamma API for market discovery + pricing. No auth needed  */
/*  for reads. Trading requires signed orders against the CLOB, which we'll   */
/*  wire up in Phase 5 (Order execution).                                     */
/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 20000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PAGE_SIZE = 200;
const MAX_PAGES = 15;

export const SCRAPER_CONFIG: ScraperConfig = {
  id: "polymarket",
  name: "Polymarket",
  category: "prediction",
  mono: "PM",
  tint: "#2F6BFF",
  enabled: true,
  pollIntervalMs: 20000,
  maxRps: 4,
  demoMode: false,
  apiBase: "https://gamma-api.polymarket.com",
  sports: ["Other"] as Sport[],
};

/* ── Gamma API shapes (subset we use) ─────────────────────────────────────── */

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  conditionId?: string;
  questionID?: string;
  endDate?: string;
  startDate?: string;
  category?: string;
  tags?: string[];
  active: boolean;
  closed: boolean;
  archived?: boolean;
  /** JSON-stringified array of strings, e.g. "[\"Yes\",\"No\"]" */
  outcomes?: string;
  /** JSON-stringified array of decimal strings, e.g. "[\"0.62\",\"0.38\"]" */
  outcomePrices?: string;
  /** Actual arrays on some responses */
  clobTokenIds?: string;
  volumeNum?: number;
  volume?: string;
  liquidityNum?: number;
  liquidity?: string;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  groupItemTitle?: string;
}

/* ── Scraper class ────────────────────────────────────────────────────────── */

export default class Polymarket extends BaseScraper {
  constructor(overrides?: Partial<ScraperConfig>) {
    super({ ...SCRAPER_CONFIG, ...overrides });
  }

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    const all: NormalizedMarket[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        active: "true",
        closed: "false",
        archived: "false",
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        order: "volumeNum",
        ascending: "false",
      });

      const url = `${this.config.apiBase}/markets?${params.toString()}`;
      const data = await this.get<GammaMarket[]>(url);

      if (!Array.isArray(data) || data.length === 0) break;

      for (const m of data) {
        const market = this.normalize(m);
        if (market) all.push(market);
      }

      if (data.length < PAGE_SIZE) break;
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

  private normalize(m: GammaMarket): NormalizedMarket | null {
    if (!m.active || m.closed || m.archived) return null;

    const labels = this.parseJsonArray(m.outcomes);
    const prices = this.parseJsonArray(m.outcomePrices).map((p) => {
      const n = typeof p === "number" ? p : parseFloat(String(p));
      return Number.isFinite(n) ? n : 0;
    });

    if (labels.length === 0 || prices.length === 0) return null;
    if (labels.length !== prices.length) return null;

    const outcomes: NormalizedOutcome[] = labels.map((label, idx) => {
      const prob = prices[idx] ?? 0;
      const cents = Math.round(prob * 100);
      const clamped = Math.max(1, Math.min(99, cents));
      return {
        label: String(label),
        side: this.inferSide(String(label)),
        americanOdds: this.centsToAmerican(clamped),
        decimalOdds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 0,
        impliedProb: Math.round(prob * 10000) / 10000,
        priceCents: clamped,
      };
    });

    const startTime = m.startDate ? new Date(m.startDate).getTime() : Date.now();
    const endTime = m.endDate ? new Date(m.endDate).getTime() : Date.now() + 7 * 86400000;
    const isLive = Date.now() >= startTime && Date.now() < endTime;

    const { sport, league } = this.classify(m);

    return {
      id: this.makeId("polymarket", m.id),
      externalId: m.id,
      platformId: "polymarket",
      platformName: "Polymarket",
      sport,
      league,
      event: {
        name: m.question,
        startTime,
        isLive,
      },
      marketType: "prediction",
      marketName: m.groupItemTitle ?? m.question,
      outcomes,
      lastUpdated: Date.now(),
      isActive: true,
    };
  }

  private parseJsonArray(raw: string | undefined): unknown[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private inferSide(label: string): NormalizedOutcome["side"] {
    const lower = label.toLowerCase();
    if (lower === "yes") return "yes";
    if (lower === "no") return "no";
    if (lower.includes("over")) return "over";
    if (lower.includes("under")) return "under";
    if (lower.includes("draw")) return "draw";
    return "other";
  }

  private classify(m: GammaMarket): { sport: Sport; league: string } {
    const hay = `${m.question} ${m.category ?? ""} ${(m.tags ?? []).join(" ")}`.toLowerCase();
    if (/\bnfl\b|super bowl/.test(hay)) return { sport: "NFL", league: "NFL" };
    if (/\bnba\b/.test(hay)) return { sport: "NBA", league: "NBA" };
    if (/\bmlb\b|world series/.test(hay)) return { sport: "MLB", league: "MLB" };
    if (/\bnhl\b|stanley cup/.test(hay)) return { sport: "NHL", league: "NHL" };
    if (/college football|cfb|ncaaf/.test(hay)) return { sport: "NCAAF", league: "NCAAF" };
    if (/march madness|ncaab/.test(hay)) return { sport: "NCAAB", league: "NCAAB" };
    if (/\bufc\b|mma/.test(hay)) return { sport: "MMA", league: "UFC" };
    if (/premier league|la liga|soccer|fifa|world cup|mls/.test(hay)) return { sport: "Soccer", league: "Soccer" };
    if (/tennis|atp|wta/.test(hay)) return { sport: "Tennis", league: "Tennis" };
    if (/pga|golf|masters/.test(hay)) return { sport: "Golf", league: "Golf" };
    if (/esports|dota|csgo|valorant/.test(hay)) return { sport: "Esports", league: "Esports" };
    return { sport: "Other", league: m.category ?? "Events" };
  }

  protected generateDemoData(): NormalizedMarket[] {
    const now = Date.now();
    const mk = (
      id: string,
      question: string,
      sport: Sport,
      league: string,
      yesProb: number,
    ): NormalizedMarket => {
      const yesCents = Math.round(yesProb * 100);
      const noCents = 100 - yesCents;
      return {
        id: this.makeId("polymarket", id),
        externalId: id,
        platformId: "polymarket",
        platformName: "Polymarket",
        sport,
        league,
        event: { name: question, startTime: now + 86400000, isLive: false },
        marketType: "prediction",
        marketName: question,
        outcomes: [
          {
            label: "Yes",
            side: "yes",
            americanOdds: this.centsToAmerican(yesCents),
            decimalOdds: Math.round((1 / yesProb) * 100) / 100,
            impliedProb: yesProb,
            priceCents: yesCents,
          },
          {
            label: "No",
            side: "no",
            americanOdds: this.centsToAmerican(noCents),
            decimalOdds: Math.round((1 / (1 - yesProb)) * 100) / 100,
            impliedProb: 1 - yesProb,
            priceCents: noCents,
          },
        ],
        lastUpdated: now,
        isActive: true,
      };
    };

    return [
      mk("0x1", "Will BTC close above $100k in April 2026?", "Other", "Crypto", 0.72),
      mk("0x2", "Chiefs win Super Bowl LX?", "NFL", "NFL", 0.14),
      mk("0x3", "Celtics win 2026 NBA Finals?", "NBA", "NBA", 0.21),
      mk("0x4", "Trump approval above 50% on May 1?", "Other", "Politics", 0.38),
    ];
  }
}
