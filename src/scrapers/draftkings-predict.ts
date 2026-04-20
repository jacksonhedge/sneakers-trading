import fetch from "node-fetch";
import { BaseScraper } from "./base-scraper.js";
import type {
  NormalizedMarket,
  NormalizedOutcome,
  ScraperConfig,
  Sport,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/*  DraftKings Predictions Scraper                                            */
/*                                                                            */
/*  DK Predict is a CFTC-regulated prediction market offering binary yes/no   */
/*  contracts priced in cents (0-100). It runs on the same sportsbook infra   */
/*  but surfaces prediction/binary market types instead of traditional odds.  */
/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * DK sport group IDs that may contain prediction/binary markets.
 * These overlap with the sportsbook but we filter for prediction market types.
 */
const PREDICT_GROUP_IDS: Record<string, number> = {
  NFL: 88808,
  NBA: 42648,
  MLB: 84240,
  NHL: 42133,
  // "Other" maps to various non-sport event groups on DK
  // Politics, entertainment, weather, etc.
  Other: 1000000, // placeholder — real ID requires discovery
};

export const SCRAPER_CONFIG: ScraperConfig = {
  id: "dkp",
  name: "DraftKings Predictions",
  category: "prediction",
  mono: "DP",
  tint: "#53D337",
  enabled: true,
  pollIntervalMs: 15000,
  maxRps: 1,
  demoMode: false,
  apiBase: "https://sportsbook-nash.draftkings.com/sites/US-SB/api/v5",
  sports: ["NFL", "NBA", "MLB", "NHL", "Other"] as Sport[],
};

/* ── DraftKings Predict API response shapes (minimal) ────────────────────── */

interface DKPredictOutcome {
  label?: string;
  oddsAmerican?: string;
  oddsDecimal?: number;
  line?: number;
  /** For binary markets, price is sometimes in a custom field */
  price?: number;
}

interface DKPredictOffer {
  providerOfferId?: string;
  label?: string;
  outcomes?: DKPredictOutcome[];
  isSuspended?: boolean;
  /** Some prediction markets use a "betOfferType" or "marketType" field */
  betOfferTypeId?: number;
  tags?: string[];
}

interface DKPredictOfferCategory {
  name?: string;
  offerSubcategoryDescriptors?: Array<{
    name?: string;
    offerSubcategory?: { offers?: DKPredictOffer[][] };
  }>;
}

interface DKPredictEvent {
  eventId?: number;
  name?: string;
  startDate?: string;
  eventStatus?: { state?: string };
}

interface DKPredictResponse {
  eventGroup?: { name?: string };
  events?: DKPredictEvent[];
  offerCategories?: DKPredictOfferCategory[];
}

/* ── Scraper class ────────────────────────────────────────────────────────── */

export default class DraftKingsPredict extends BaseScraper {
  constructor(overrides?: Partial<ScraperConfig>) {
    super({ ...SCRAPER_CONFIG, ...overrides });
  }

  /* ------------------------------------------------------------------ */
  /*  Live fetch                                                        */
  /* ------------------------------------------------------------------ */

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    const allMarkets: NormalizedMarket[] = [];

    const sportEntries = Object.entries(PREDICT_GROUP_IDS).filter(([sport]) =>
      this.config.sports.includes(sport as Sport),
    );

    for (const [sport, groupId] of sportEntries) {
      try {
        const url = `${this.config.apiBase}/eventgroups/${groupId}?format=json`;
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

          const data = (await res.json()) as DKPredictResponse;
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
  /*  Response parsing — filters for prediction/binary market types     */
  /* ------------------------------------------------------------------ */

  private parsePredictionMarkets(
    sport: Sport,
    data: DKPredictResponse,
  ): NormalizedMarket[] {
    const markets: NormalizedMarket[] = [];
    const events = data.events ?? [];
    const offerCategories = data.offerCategories ?? [];
    const league = data.eventGroup?.name ?? sport;

    for (const category of offerCategories) {
      for (const sub of category.offerSubcategoryDescriptors ?? []) {
        const subName = sub.name ?? category.name ?? "Prediction";
        const offerRows = sub.offerSubcategory?.offers ?? [];

        for (const offerRow of offerRows) {
          for (const offer of offerRow) {
            if (offer.isSuspended || !offer.outcomes?.length) continue;

            // Filter for binary/prediction markets:
            // - exactly 2 outcomes (yes/no pattern)
            // - or tagged as prediction/binary
            const isPrediction =
              this.isBinaryMarket(offer) || this.isPredictionTagged(offer);
            if (!isPrediction) continue;

            const externalId =
              offer.providerOfferId ?? `dkp-${Date.now()}-${Math.random()}`;
            const outcomes = this.mapPredictionOutcomes(offer.outcomes);

            const firstEvent = events[0];
            const eventName = offer.label ?? firstEvent?.name ?? "Unknown Prediction";
            const startTime = firstEvent?.startDate
              ? new Date(firstEvent.startDate).getTime()
              : Date.now() + 86400000;

            markets.push({
              id: this.makeId("dkp", externalId),
              externalId,
              platformId: "dkp",
              platformName: "DraftKings Predictions",
              sport,
              league,
              event: {
                name: eventName,
                startTime,
                isLive: false,
              },
              marketType: "prediction",
              marketName: subName,
              outcomes,
              lastUpdated: Date.now(),
              isActive: true,
            });
          }
        }
      }
    }

    return markets;
  }

  private isBinaryMarket(offer: DKPredictOffer): boolean {
    if (!offer.outcomes || offer.outcomes.length !== 2) return false;
    const labels = offer.outcomes.map((o) => (o.label ?? "").toLowerCase());
    return (
      (labels.includes("yes") && labels.includes("no")) ||
      labels.some((l) => l.includes("yes")) ||
      labels.some((l) => l.includes("will"))
    );
  }

  private isPredictionTagged(offer: DKPredictOffer): boolean {
    if (offer.tags?.some((t) => t.toLowerCase().includes("predict"))) return true;
    if (offer.label?.toLowerCase().includes("will ")) return true;
    return false;
  }

  private mapPredictionOutcomes(
    dkOutcomes: DKPredictOutcome[],
  ): NormalizedOutcome[] {
    return dkOutcomes
      .filter((o) => o.oddsAmerican != null || o.price != null)
      .map((o, idx) => {
        // If a price in cents is available, derive odds from that
        const priceCents = o.price ?? undefined;
        let american: number;
        let decimal: number;
        let implied: number;

        if (priceCents != null && priceCents > 0 && priceCents < 100) {
          american = this.centsToAmerican(priceCents);
          implied = priceCents / 100;
          decimal = 1 / implied;
        } else {
          american = parseInt(o.oddsAmerican ?? "0", 10);
          decimal = o.oddsDecimal ?? this.americanToDecimal(american);
          implied = this.americanToImplied(american);
        }

        const label = o.label ?? (idx === 0 ? "Yes" : "No");
        const side = label.toLowerCase().includes("no") ? "no" as const : "yes" as const;

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
  /*  Demo data — ~20 prediction markets                                */
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
      const externalId = `dkp-demo-${idx}`;

      markets.push({
        id: this.makeId("dkp", externalId),
        externalId,
        platformId: "dkp",
        platformName: "DraftKings Predictions",
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
    addPrediction("NFL", "NFL", "Will the Chiefs win the Super Bowl?", 22, 86400000 * 30);
    addPrediction("NFL", "NFL", "Will the Lions make the playoffs?", 68, 86400000 * 30);
    addPrediction("NFL", "NFL", "Will any team go 16-0 in regular season?", 3, 86400000 * 60);
    addPrediction("NFL", "NFL", "Will Patrick Mahomes win MVP?", 18, 86400000 * 45);

    // NBA predictions
    addPrediction("NBA", "NBA", "Will the Celtics repeat as champions?", 35, 86400000 * 20);
    addPrediction("NBA", "NBA", "Will Victor Wembanyama win Rookie of the Year?", 72, 86400000 * 15);
    addPrediction("NBA", "NBA", "Will the Lakers make the Western Conference Finals?", 15, 86400000 * 25);
    addPrediction("NBA", "NBA", "Will Luka Doncic average a triple-double?", 8, 86400000 * 30);

    // MLB predictions
    addPrediction("MLB", "MLB", "Will the Yankees win the World Series?", 14, 86400000 * 40);
    addPrediction("MLB", "MLB", "Will Shohei Ohtani hit 50+ home runs?", 25, 86400000 * 35);
    addPrediction("MLB", "MLB", "Will any pitcher throw a perfect game this season?", 12, 86400000 * 50);

    // NHL predictions
    addPrediction("NHL", "NHL", "Will Connor McDavid win the Hart Trophy?", 42, 86400000 * 20);
    addPrediction("NHL", "NHL", "Will the Maple Leafs advance past the first round?", 55, 86400000 * 15);

    // Other — politics, entertainment, weather, current events
    addPrediction("Other", "Politics", "Will the incumbent win the next presidential election?", 48, 86400000 * 90);
    addPrediction("Other", "Politics", "Will a third-party candidate get 5%+ of the popular vote?", 11, 86400000 * 90);
    addPrediction("Other", "Entertainment", "Will the next Marvel movie gross $1B worldwide?", 38, 86400000 * 60);
    addPrediction("Other", "Entertainment", "Will Taylor Swift announce a new album before July?", 62, 86400000 * 30);
    addPrediction("Other", "Weather", "Will 2026 be the hottest year on record?", 55, 86400000 * 120);
    addPrediction("Other", "Science", "Will SpaceX launch Starship to orbit successfully before June?", 45, 86400000 * 30);
    addPrediction("Other", "Economics", "Will the Fed cut rates before Q3 2026?", 65, 86400000 * 45);

    return markets;
  }
}
