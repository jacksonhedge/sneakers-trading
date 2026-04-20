import fetch from "node-fetch";
import { BaseScraper } from "./base-scraper.js";
import type {
  NormalizedMarket,
  NormalizedOutcome,
  ScraperConfig,
  Sport,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/*  FanDuel Predicts Scraper                                                  */
/*                                                                            */
/*  FanDuel's prediction market platform offering CFTC-regulated binary       */
/*  yes/no contracts. Prices are in cents (0-100). Uses FanDuel's sportsbook  */
/*  API infrastructure but surfaces prediction/event contract markets.        */
/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * FanDuel sport/category IDs for prediction markets.
 * These may differ from their sportsbook group IDs.
 */
const FD_PREDICT_SPORT_IDS: Record<string, number> = {
  NFL: 12,
  NBA: 14,
  MLB: 16,
  NHL: 15,
  Other: 99, // placeholder for non-sport event markets
};

export const SCRAPER_CONFIG: ScraperConfig = {
  id: "fdp",
  name: "FanDuel Predicts",
  category: "prediction",
  mono: "FP",
  tint: "#1493FF",
  enabled: true,
  pollIntervalMs: 15000,
  maxRps: 1,
  demoMode: false,
  apiBase: "https://sbapi.nj.sportsbook.fanduel.com/api",
  sports: ["NFL", "NBA", "MLB", "NHL", "Other"] as Sport[],
};

/* ── FanDuel Predict API response shapes (minimal) ───────────────────────── */

interface FDRunner {
  selectionId?: number;
  runnerName?: string;
  handicap?: number;
  winRunnerOdds?: {
    americanOdds?: string;
    decimalOdds?: number;
    trueOdds?: number;
  };
  result?: { type?: string };
  /** For prediction markets: contract price in cents */
  price?: number;
}

interface FDMarket {
  marketId?: string;
  marketName?: string;
  marketType?: string;
  runners?: FDRunner[];
  isSuspended?: boolean;
  /** Tags or labels that indicate prediction market type */
  eventMarketDescription?: string;
  bettingType?: string;
}

interface FDEvent {
  eventId?: number;
  name?: string;
  competitionName?: string;
  openDate?: string;
  inPlay?: boolean;
  markets?: FDMarket[];
}

interface FDAttachment {
  events?: Record<string, FDEvent>;
  markets?: Record<string, FDMarket>;
}

interface FDResponse {
  attachments?: FDAttachment;
  eventTypes?: Array<{ name?: string }>;
}

/* ── Scraper class ────────────────────────────────────────────────────────── */

export default class FanDuelPredict extends BaseScraper {
  constructor(overrides?: Partial<ScraperConfig>) {
    super({ ...SCRAPER_CONFIG, ...overrides });
  }

  /* ------------------------------------------------------------------ */
  /*  Live fetch                                                        */
  /* ------------------------------------------------------------------ */

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    const allMarkets: NormalizedMarket[] = [];

    const sportEntries = Object.entries(FD_PREDICT_SPORT_IDS).filter(([sport]) =>
      this.config.sports.includes(sport as Sport),
    );

    for (const [sport, sportId] of sportEntries) {
      try {
        const url = `${this.config.apiBase}/content-managed-page?page=CUSTOM&customPageId=prediction&_ak=FhMFpcPWXMeyZxOx&eventTypeId=${sportId}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "application/json",
            },
            signal: controller.signal as any,
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }

          const data = (await res.json()) as FDResponse;
          const markets = this.parsePredictionMarkets(sport as Sport, data);
          allMarkets.push(...markets);
        } finally {
          clearTimeout(timeout);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[scraper:${this.config.id}] Failed to fetch ${sport} predictions: ${message}`,
        );
      }
    }

    return allMarkets;
  }

  /* ------------------------------------------------------------------ */
  /*  Response parsing                                                  */
  /* ------------------------------------------------------------------ */

  private parsePredictionMarkets(
    sport: Sport,
    data: FDResponse,
  ): NormalizedMarket[] {
    const markets: NormalizedMarket[] = [];
    const attachedEvents = data.attachments?.events ?? {};
    const attachedMarkets = data.attachments?.markets ?? {};

    // Process events from attachments
    for (const event of Object.values(attachedEvents)) {
      const eventMarkets = event.markets ?? [];

      for (const market of eventMarkets) {
        if (market.isSuspended || !market.runners?.length) continue;

        // Filter for binary/prediction markets
        if (!this.isPredictionMarket(market)) continue;

        const externalId =
          market.marketId ?? `fdp-${Date.now()}-${Math.random()}`;
        const outcomes = this.mapPredictionOutcomes(market.runners);

        const eventName = market.marketName ?? event.name ?? "Unknown Prediction";
        const startTime = event.openDate
          ? new Date(event.openDate).getTime()
          : Date.now() + 86400000;

        markets.push({
          id: this.makeId("fdp", externalId),
          externalId,
          platformId: "fdp",
          platformName: "FanDuel Predicts",
          sport,
          league: event.competitionName ?? sport,
          event: {
            name: eventName,
            startTime,
            isLive: event.inPlay ?? false,
          },
          marketType: "prediction",
          marketName: market.marketName ?? "Prediction",
          outcomes,
          lastUpdated: Date.now(),
          isActive: true,
        });
      }
    }

    // Also check standalone attached markets
    for (const market of Object.values(attachedMarkets)) {
      if (market.isSuspended || !market.runners?.length) continue;
      if (!this.isPredictionMarket(market)) continue;

      const externalId =
        market.marketId ?? `fdp-${Date.now()}-${Math.random()}`;
      const outcomes = this.mapPredictionOutcomes(market.runners);

      markets.push({
        id: this.makeId("fdp", externalId),
        externalId,
        platformId: "fdp",
        platformName: "FanDuel Predicts",
        sport,
        league: sport,
        event: {
          name: market.marketName ?? "Unknown Prediction",
          startTime: Date.now() + 86400000,
          isLive: false,
        },
        marketType: "prediction",
        marketName: market.marketName ?? "Prediction",
        outcomes,
        lastUpdated: Date.now(),
        isActive: true,
      });
    }

    return markets;
  }

  private isPredictionMarket(market: FDMarket): boolean {
    // Binary markets with yes/no runners
    if (market.runners?.length === 2) {
      const names = market.runners.map((r) =>
        (r.runnerName ?? "").toLowerCase(),
      );
      if (names.includes("yes") && names.includes("no")) return true;
      if (names.some((n) => n.includes("yes"))) return true;
    }

    // Check market type / description for prediction keywords
    const desc = (
      market.eventMarketDescription ??
      market.marketName ??
      ""
    ).toLowerCase();
    if (desc.includes("predict") || desc.includes("will ")) return true;

    if (market.bettingType === "BINARY" || market.marketType === "BINARY")
      return true;

    return false;
  }

  private mapPredictionOutcomes(runners: FDRunner[]): NormalizedOutcome[] {
    return runners
      .filter(
        (r) =>
          r.winRunnerOdds?.americanOdds != null || r.price != null,
      )
      .map((r, idx) => {
        const priceCents = r.price ?? undefined;
        let american: number;
        let decimal: number;
        let implied: number;

        if (priceCents != null && priceCents > 0 && priceCents < 100) {
          american = this.centsToAmerican(priceCents);
          implied = priceCents / 100;
          decimal = 1 / implied;
        } else {
          american = parseInt(r.winRunnerOdds?.americanOdds ?? "0", 10);
          decimal =
            r.winRunnerOdds?.decimalOdds ?? this.americanToDecimal(american);
          implied = this.americanToImplied(american);
        }

        const label = r.runnerName ?? (idx === 0 ? "Yes" : "No");
        const side = label.toLowerCase().includes("no")
          ? ("no" as const)
          : ("yes" as const);

        return {
          label,
          side,
          americanOdds: american,
          decimalOdds: Math.round(decimal * 100) / 100,
          impliedProb: Math.round(implied * 10000) / 10000,
          priceCents,
        };
      });
  }

  /* ------------------------------------------------------------------ */
  /*  Demo data — ~18 prediction markets                                */
  /* ------------------------------------------------------------------ */

  protected generateDemoData(): NormalizedMarket[] {
    const now = Date.now();
    const markets: NormalizedMarket[] = [];
    let idx = 0;

    const addPrediction = (
      sport: Sport,
      league: string,
      question: string,
      yesCents: number,
      startOffset = 0,
    ): void => {
      idx++;
      const noCents = 100 - yesCents;
      const externalId = `fdp-demo-${idx}`;

      markets.push({
        id: this.makeId("fdp", externalId),
        externalId,
        platformId: "fdp",
        platformName: "FanDuel Predicts",
        sport,
        league,
        event: {
          name: question,
          startTime: now + startOffset,
          isLive: false,
        },
        marketType: "prediction",
        marketName: question,
        outcomes: [
          {
            label: "Yes",
            side: "yes",
            americanOdds: this.centsToAmerican(yesCents),
            decimalOdds: Math.round((100 / yesCents) * 100) / 100,
            impliedProb: yesCents / 100,
            priceCents: yesCents,
          },
          {
            label: "No",
            side: "no",
            americanOdds: this.centsToAmerican(noCents),
            decimalOdds: Math.round((100 / noCents) * 100) / 100,
            impliedProb: noCents / 100,
            priceCents: noCents,
          },
        ],
        lastUpdated: now,
        isActive: true,
      });
    };

    // NFL predictions
    addPrediction("NFL", "NFL", "Will the Bills win the AFC East?", 58, 86400000 * 30);
    addPrediction("NFL", "NFL", "Will Lamar Jackson win MVP?", 24, 86400000 * 45);
    addPrediction("NFL", "NFL", "Will the Bears make the playoffs?", 32, 86400000 * 30);

    // NBA predictions
    addPrediction("NBA", "NBA", "Will the Nuggets win the Western Conference?", 28, 86400000 * 20);
    addPrediction("NBA", "NBA", "Will Nikola Jokic average 25+ PPG?", 70, 86400000 * 15);
    addPrediction("NBA", "NBA", "Will any team win 70+ games?", 5, 86400000 * 30);
    addPrediction("NBA", "NBA", "Will the Knicks reach the NBA Finals?", 18, 86400000 * 25);

    // MLB predictions
    addPrediction("MLB", "MLB", "Will the Dodgers win the NL Pennant?", 30, 86400000 * 40);
    addPrediction("MLB", "MLB", "Will anyone hit 60+ home runs?", 8, 86400000 * 50);
    addPrediction("MLB", "MLB", "Will the Mets make the postseason?", 45, 86400000 * 35);

    // NHL predictions
    addPrediction("NHL", "NHL", "Will the Oilers win the Stanley Cup?", 15, 86400000 * 20);
    addPrediction("NHL", "NHL", "Will a Canadian team win the Stanley Cup?", 33, 86400000 * 20);

    // Other — politics, entertainment, current events
    addPrediction("Other", "Politics", "Will the Senate flip parties in 2026?", 42, 86400000 * 120);
    addPrediction("Other", "Politics", "Will a major trade deal be signed before year-end?", 35, 86400000 * 90);
    addPrediction("Other", "Entertainment", "Will the Oscars Best Picture gross over $500M?", 28, 86400000 * 60);
    addPrediction("Other", "Entertainment", "Will a streaming show break 100M household views?", 52, 86400000 * 45);
    addPrediction("Other", "Weather", "Will a Category 5 hurricane hit the US mainland in 2026?", 18, 86400000 * 100);
    addPrediction("Other", "Economics", "Will Bitcoin exceed $150k before year-end?", 30, 86400000 * 90);

    return markets;
  }
}
