import fetch from "node-fetch";
import { BaseScraper } from "./base-scraper.js";
import type {
  NormalizedMarket,
  NormalizedOutcome,
  ScraperConfig,
  Sport,
  MarketType,
  OutcomeSide,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/*  Fliff Scraper                                                             */
/*                                                                            */
/*  Fliff is a sweepstakes-model sports pick platform. Users play with        */
/*  "Fliff Coins" (virtual currency) rather than real money. Operates under   */
/*  sweepstakes law, not traditional sportsbook licensing.                    */
/*                                                                            */
/*  NOTE: The Fliff API (api.getfliff.com) is not publicly documented.        */
/*  The fetchMarkets() implementation is a placeholder that requires          */
/*  reverse engineering of their mobile app API. The apiBase URL is           */
/*  approximate and may need adjustment.                                      */
/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

export const SCRAPER_CONFIG: ScraperConfig = {
  id: "fliff",
  name: "Fliff",
  category: "sweepstakes",
  mono: "FL",
  tint: "#8E5CFF",
  enabled: true,
  pollIntervalMs: 30000,
  maxRps: 0.5,
  demoMode: false,
  apiBase: "https://api.getfliff.com", // approximate — needs reverse engineering
  sports: [
    "NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "MMA", "Soccer",
  ] as Sport[],
};

/* ── Scraper class ────────────────────────────────────────────────────────── */

export default class FliffScraper extends BaseScraper {
  constructor(overrides?: Partial<ScraperConfig>) {
    super({ ...SCRAPER_CONFIG, ...overrides });
  }

  /* ------------------------------------------------------------------ */
  /*  Live fetch — PLACEHOLDER                                          */
  /*                                                                    */
  /*  TODO: Reverse engineer Fliff's mobile API to discover:            */
  /*  - Authentication flow (likely device-based token)                 */
  /*  - Event listing endpoints                                        */
  /*  - Market/pick endpoints                                           */
  /*  - Response payload shapes                                         */
  /*                                                                    */
  /*  Tools: mitmproxy, Charles Proxy, or Frida on their iOS/Android   */
  /*  app. Look for GraphQL or REST calls to api.getfliff.com.         */
  /* ------------------------------------------------------------------ */

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    console.warn(
      `[scraper:${this.config.id}] TODO: Fliff API requires reverse engineering. ` +
        `The API at ${this.config.apiBase} is not publicly documented. ` +
        `Use demo mode (demoMode: true) until the API is mapped. ` +
        `Returning empty results.`,
    );
    return [];
  }

  /* ------------------------------------------------------------------ */
  /*  Demo data — ~25 sweepstakes markets with realistic odds           */
  /* ------------------------------------------------------------------ */

  protected generateDemoData(): NormalizedMarket[] {
    const now = Date.now();
    const markets: NormalizedMarket[] = [];
    let idx = 0;

    const addMarket = (
      sport: Sport,
      league: string,
      home: string,
      away: string,
      marketType: MarketType,
      marketName: string,
      outcomes: Array<{
        label: string;
        side: OutcomeSide;
        american: number;
        line?: number;
      }>,
      startOffset = 0,
      isLive = false,
    ): void => {
      idx++;
      const externalId = `fliff-demo-${idx}`;

      markets.push({
        id: this.makeId("fliff", externalId),
        externalId,
        platformId: "fliff",
        platformName: "Fliff",
        sport,
        league,
        event: {
          name: `${away} @ ${home}`,
          home,
          away,
          startTime: now + startOffset,
          isLive,
        },
        marketType,
        marketName,
        line: outcomes[0]?.line,
        outcomes: outcomes.map((o) => ({
          label: o.label,
          side: o.side,
          americanOdds: o.american,
          decimalOdds:
            Math.round(this.americanToDecimal(o.american) * 100) / 100,
          impliedProb:
            Math.round(this.americanToImplied(o.american) * 10000) / 10000,
          line: o.line,
        })),
        lastUpdated: now,
        isActive: true,
      });
    };

    // NFL (4 markets)
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Buffalo Bills", "moneyline", "Pick", [
      { label: "Kansas City Chiefs", side: "home", american: -130 },
      { label: "Buffalo Bills", side: "away", american: 110 },
    ], 3600000);
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Buffalo Bills", "spread", "Spread Pick", [
      { label: "Chiefs -2.5", side: "home", american: -110, line: -2.5 },
      { label: "Bills +2.5", side: "away", american: -110, line: 2.5 },
    ], 3600000);
    addMarket("NFL", "NFL", "Dallas Cowboys", "New York Giants", "moneyline", "Pick", [
      { label: "Dallas Cowboys", side: "home", american: -210 },
      { label: "New York Giants", side: "away", american: 175 },
    ], 7200000);
    addMarket("NFL", "NFL", "Dallas Cowboys", "New York Giants", "total", "Over/Under", [
      { label: "Over 44.5", side: "over", american: -108, line: 44.5 },
      { label: "Under 44.5", side: "under", american: -112, line: 44.5 },
    ], 7200000);

    // NBA (5 markets)
    addMarket("NBA", "NBA", "Boston Celtics", "New York Knicks", "moneyline", "Pick", [
      { label: "Boston Celtics", side: "home", american: -165 },
      { label: "New York Knicks", side: "away", american: 140 },
    ], 5400000);
    addMarket("NBA", "NBA", "Boston Celtics", "New York Knicks", "spread", "Spread Pick", [
      { label: "Celtics -3.5", side: "home", american: -108, line: -3.5 },
      { label: "Knicks +3.5", side: "away", american: -112, line: 3.5 },
    ], 5400000);
    addMarket("NBA", "NBA", "Phoenix Suns", "Denver Nuggets", "moneyline", "Pick", [
      { label: "Phoenix Suns", side: "home", american: 130 },
      { label: "Denver Nuggets", side: "away", american: -155 },
    ], 9000000, true);
    addMarket("NBA", "NBA", "Phoenix Suns", "Denver Nuggets", "total", "Over/Under", [
      { label: "Over 225.5", side: "over", american: -105, line: 225.5 },
      { label: "Under 225.5", side: "under", american: -115, line: 225.5 },
    ], 9000000, true);
    addMarket("NBA", "NBA", "Miami Heat", "Chicago Bulls", "moneyline", "Pick", [
      { label: "Miami Heat", side: "home", american: -190 },
      { label: "Chicago Bulls", side: "away", american: 160 },
    ], 14400000);

    // MLB (4 markets)
    addMarket("MLB", "MLB", "Houston Astros", "Texas Rangers", "moneyline", "Pick", [
      { label: "Houston Astros", side: "home", american: -140 },
      { label: "Texas Rangers", side: "away", american: 120 },
    ], 18000000);
    addMarket("MLB", "MLB", "Houston Astros", "Texas Rangers", "total", "Over/Under", [
      { label: "Over 8.5", side: "over", american: -110, line: 8.5 },
      { label: "Under 8.5", side: "under", american: -110, line: 8.5 },
    ], 18000000);
    addMarket("MLB", "MLB", "Atlanta Braves", "Philadelphia Phillies", "moneyline", "Pick", [
      { label: "Atlanta Braves", side: "home", american: 105 },
      { label: "Philadelphia Phillies", side: "away", american: -125 },
    ], 21600000);
    addMarket("MLB", "MLB", "Atlanta Braves", "Philadelphia Phillies", "spread", "Run Line", [
      { label: "Braves +1.5", side: "home", american: -165, line: 1.5 },
      { label: "Phillies -1.5", side: "away", american: 140, line: -1.5 },
    ], 21600000);

    // NHL (3 markets)
    addMarket("NHL", "NHL", "Colorado Avalanche", "Dallas Stars", "moneyline", "Pick", [
      { label: "Colorado Avalanche", side: "home", american: -135 },
      { label: "Dallas Stars", side: "away", american: 115 },
    ], 10800000);
    addMarket("NHL", "NHL", "Colorado Avalanche", "Dallas Stars", "total", "Over/Under", [
      { label: "Over 6.5", side: "over", american: 110, line: 6.5 },
      { label: "Under 6.5", side: "under", american: -130, line: 6.5 },
    ], 10800000);
    addMarket("NHL", "NHL", "New York Rangers", "Carolina Hurricanes", "moneyline", "Pick", [
      { label: "New York Rangers", side: "home", american: -115 },
      { label: "Carolina Hurricanes", side: "away", american: -105 },
    ], 14400000);

    // NCAAF (2 markets)
    addMarket("NCAAF", "NCAAF", "Ohio State Buckeyes", "Michigan Wolverines", "moneyline", "Pick", [
      { label: "Ohio State Buckeyes", side: "home", american: -125 },
      { label: "Michigan Wolverines", side: "away", american: 105 },
    ], 86400000);
    addMarket("NCAAF", "NCAAF", "Ohio State Buckeyes", "Michigan Wolverines", "spread", "Spread Pick", [
      { label: "Ohio State -2.5", side: "home", american: -110, line: -2.5 },
      { label: "Michigan +2.5", side: "away", american: -110, line: 2.5 },
    ], 86400000);

    // NCAAB (2 markets)
    addMarket("NCAAB", "NCAAB", "UConn Huskies", "Purdue Boilermakers", "moneyline", "Pick", [
      { label: "UConn Huskies", side: "home", american: -145 },
      { label: "Purdue Boilermakers", side: "away", american: 125 },
    ], 43200000);
    addMarket("NCAAB", "NCAAB", "UConn Huskies", "Purdue Boilermakers", "total", "Over/Under", [
      { label: "Over 145.5", side: "over", american: -110, line: 145.5 },
      { label: "Under 145.5", side: "under", american: -110, line: 145.5 },
    ], 43200000);

    // MMA (2 markets)
    addMarket("MMA", "UFC", "Islam Makhachev", "Charles Oliveira", "moneyline", "Pick", [
      { label: "Islam Makhachev", side: "home", american: -250 },
      { label: "Charles Oliveira", side: "away", american: 200 },
    ], 172800000);
    addMarket("MMA", "UFC", "Alex Pereira", "Jamahal Hill", "moneyline", "Pick", [
      { label: "Alex Pereira", side: "home", american: -185 },
      { label: "Jamahal Hill", side: "away", american: 155 },
    ], 172800000);

    // Soccer (3 markets)
    addMarket("Soccer", "Premier League", "Arsenal", "Chelsea", "moneyline", "Pick", [
      { label: "Arsenal", side: "home", american: -120 },
      { label: "Draw", side: "draw", american: 240 },
      { label: "Chelsea", side: "away", american: 210 },
    ], 21600000);
    addMarket("Soccer", "MLS", "LA Galaxy", "LAFC", "moneyline", "Pick", [
      { label: "LA Galaxy", side: "home", american: 130 },
      { label: "Draw", side: "draw", american: 220 },
      { label: "LAFC", side: "away", american: 110 },
    ], 28800000);
    addMarket("Soccer", "La Liga", "Atletico Madrid", "Sevilla", "moneyline", "Pick", [
      { label: "Atletico Madrid", side: "home", american: -175 },
      { label: "Draw", side: "draw", american: 260 },
      { label: "Sevilla", side: "away", american: 350 },
    ], 43200000);

    return markets;
  }
}
