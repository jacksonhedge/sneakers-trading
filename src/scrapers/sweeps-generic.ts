import { BaseScraper } from "./base-scraper.js";
import type {
  NormalizedMarket,
  NormalizedOutcome,
  ScraperConfig,
  ScraperCategory,
  Sport,
  MarketType,
  OutcomeSide,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/*  Generic Sweepstakes Scraper — Factory Pattern                             */
/*                                                                            */
/*  Covers multiple sweepstakes platforms that operate under similar models:  */
/*  virtual currencies, social casinos, or sweepstakes sportsbooks.           */
/*                                                                            */
/*  All fetchMarkets() implementations are placeholders — these platforms     */
/*  have private/undocumented APIs that require reverse engineering.          */
/* -------------------------------------------------------------------------- */

/* ── Platform configurations ─────────────────────────────────────────────── */

interface SweepsPlatformConfig {
  id: string;
  name: string;
  mono: string;
  tint: string;
  apiBase: string;
  pollIntervalMs: number;
  maxRps: number;
  sports: Sport[];
  /** Brief note about the platform's model */
  description: string;
}

const PLATFORM_CONFIGS: SweepsPlatformConfig[] = [
  {
    id: "stake",
    name: "Stake.us",
    mono: "SK",
    tint: "#00E701",
    apiBase: "https://stake.us/_api/graphql",
    pollIntervalMs: 30000,
    maxRps: 0.5,
    sports: ["NFL", "NBA", "MLB", "NHL", "MMA", "Soccer", "Tennis", "Esports"],
    description:
      "Sweepstakes casino + sportsbook. Uses Gold Coins (free play) and Stake Cash (redeemable). GraphQL API.",
  },
  {
    id: "chm",
    name: "Chumba Casino",
    mono: "CH",
    tint: "#FFD700",
    apiBase: "https://lobby.chumbacasino.com/api",
    pollIntervalMs: 60000,
    maxRps: 0.3,
    sports: ["NFL", "NBA", "MLB", "NHL"],
    description:
      "Sweepstakes casino by VGW. Uses Gold Coins + Sweeps Coins. Primarily casino but has some sports markets.",
  },
  {
    id: "pulsz",
    name: "Pulsz",
    mono: "PZ",
    tint: "#E040FB",
    apiBase: "https://www.pulsz.com/api",
    pollIntervalMs: 60000,
    maxRps: 0.3,
    sports: ["NFL", "NBA", "MLB", "NHL", "Soccer"],
    description:
      "Sweepstakes casino. Uses Gold Coins + Sweepstakes Coins. Limited sports betting, mainly casino games.",
  },
  {
    id: "sb-betr",
    name: "Betr",
    mono: "BT",
    tint: "#FF4444",
    apiBase: "https://api.betr.app",
    pollIntervalMs: 30000,
    maxRps: 0.5,
    sports: ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "MMA", "Soccer"],
    description:
      "Micro-betting + sweepstakes sports platform. Simple yes/no props at $1 or less. Mobile-first.",
  },
];

/** Exported array of all sweepstakes platform configs for registration. */
export const SWEEPS_CONFIGS: SweepsPlatformConfig[] = PLATFORM_CONFIGS;

/* ── Demo data generators per platform ───────────────────────────────────── */

type DemoMarketInput = {
  sport: Sport;
  league: string;
  home: string;
  away: string;
  marketType: MarketType;
  marketName: string;
  outcomes: Array<{
    label: string;
    side: OutcomeSide;
    american: number;
    line?: number;
  }>;
  startOffset?: number;
  isLive?: boolean;
};

const DEMO_DATA: Record<string, DemoMarketInput[]> = {
  stake: [
    // NFL
    { sport: "NFL", league: "NFL", home: "Green Bay Packers", away: "Chicago Bears", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Green Bay Packers", side: "home", american: -170 }, { label: "Chicago Bears", side: "away", american: 145 }], startOffset: 3600000 },
    { sport: "NFL", league: "NFL", home: "Green Bay Packers", away: "Chicago Bears", marketType: "spread", marketName: "Spread", outcomes: [{ label: "Packers -3.5", side: "home", american: -112, line: -3.5 }, { label: "Bears +3.5", side: "away", american: -108, line: 3.5 }], startOffset: 3600000 },
    // NBA
    { sport: "NBA", league: "NBA", home: "Golden State Warriors", away: "LA Clippers", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Golden State Warriors", side: "home", american: -140 }, { label: "LA Clippers", side: "away", american: 120 }], startOffset: 7200000 },
    { sport: "NBA", league: "NBA", home: "Golden State Warriors", away: "LA Clippers", marketType: "total", marketName: "Total Points", outcomes: [{ label: "Over 222.5", side: "over", american: -108, line: 222.5 }, { label: "Under 222.5", side: "under", american: -112, line: 222.5 }], startOffset: 7200000 },
    // MMA
    { sport: "MMA", league: "UFC", home: "Sean O'Malley", away: "Merab Dvalishvili", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Sean O'Malley", side: "home", american: 140 }, { label: "Merab Dvalishvili", side: "away", american: -165 }], startOffset: 172800000 },
    // Soccer
    { sport: "Soccer", league: "Premier League", home: "Tottenham", away: "Aston Villa", marketType: "moneyline", marketName: "Match Result", outcomes: [{ label: "Tottenham", side: "home", american: -105 }, { label: "Draw", side: "draw", american: 230 }, { label: "Aston Villa", side: "away", american: 200 }], startOffset: 21600000 },
    // Esports
    { sport: "Esports", league: "League of Legends LCS", home: "Cloud9", away: "Team Liquid", marketType: "moneyline", marketName: "Match Winner", outcomes: [{ label: "Cloud9", side: "home", american: 115 }, { label: "Team Liquid", side: "away", american: -135 }], startOffset: 14400000 },
    // Tennis
    { sport: "Tennis", league: "ATP", home: "Jannik Sinner", away: "Daniil Medvedev", marketType: "moneyline", marketName: "Match Winner", outcomes: [{ label: "Jannik Sinner", side: "home", american: -200 }, { label: "Daniil Medvedev", side: "away", american: 170 }], startOffset: 28800000 },
    // NHL
    { sport: "NHL", league: "NHL", home: "Tampa Bay Lightning", away: "Florida Panthers", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Tampa Bay Lightning", side: "home", american: 115 }, { label: "Florida Panthers", side: "away", american: -135 }], startOffset: 10800000 },
    // MLB
    { sport: "MLB", league: "MLB", home: "San Francisco Giants", away: "Arizona Diamondbacks", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "San Francisco Giants", side: "home", american: 120 }, { label: "Arizona Diamondbacks", side: "away", american: -140 }], startOffset: 18000000 },
  ],
  chm: [
    { sport: "NFL", league: "NFL", home: "Miami Dolphins", away: "New England Patriots", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Miami Dolphins", side: "home", american: -195 }, { label: "New England Patriots", side: "away", american: 165 }], startOffset: 3600000 },
    { sport: "NFL", league: "NFL", home: "Miami Dolphins", away: "New England Patriots", marketType: "spread", marketName: "Spread", outcomes: [{ label: "Dolphins -4.5", side: "home", american: -110, line: -4.5 }, { label: "Patriots +4.5", side: "away", american: -110, line: 4.5 }], startOffset: 3600000 },
    { sport: "NBA", league: "NBA", home: "Philadelphia 76ers", away: "Brooklyn Nets", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Philadelphia 76ers", side: "home", american: -220 }, { label: "Brooklyn Nets", side: "away", american: 185 }], startOffset: 7200000 },
    { sport: "NBA", league: "NBA", home: "Philadelphia 76ers", away: "Brooklyn Nets", marketType: "total", marketName: "Total Points", outcomes: [{ label: "Over 218.5", side: "over", american: -110, line: 218.5 }, { label: "Under 218.5", side: "under", american: -110, line: 218.5 }], startOffset: 7200000 },
    { sport: "MLB", league: "MLB", home: "Chicago Cubs", away: "St. Louis Cardinals", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Chicago Cubs", side: "home", american: -115 }, { label: "St. Louis Cardinals", side: "away", american: -105 }], startOffset: 14400000 },
    { sport: "MLB", league: "MLB", home: "Chicago Cubs", away: "St. Louis Cardinals", marketType: "total", marketName: "Total Runs", outcomes: [{ label: "Over 9.5", side: "over", american: -105, line: 9.5 }, { label: "Under 9.5", side: "under", american: -115, line: 9.5 }], startOffset: 14400000 },
    { sport: "NHL", league: "NHL", home: "Boston Bruins", away: "Detroit Red Wings", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Boston Bruins", side: "home", american: -180 }, { label: "Detroit Red Wings", side: "away", american: 155 }], startOffset: 10800000 },
    { sport: "NHL", league: "NHL", home: "Boston Bruins", away: "Detroit Red Wings", marketType: "total", marketName: "Total Goals", outcomes: [{ label: "Over 5.5", side: "over", american: -120, line: 5.5 }, { label: "Under 5.5", side: "under", american: 100, line: 5.5 }], startOffset: 10800000 },
    { sport: "NFL", league: "NFL", home: "Baltimore Ravens", away: "Cincinnati Bengals", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Baltimore Ravens", side: "home", american: -155 }, { label: "Cincinnati Bengals", side: "away", american: 132 }], startOffset: 86400000 },
    { sport: "NBA", league: "NBA", home: "Sacramento Kings", away: "Portland Trail Blazers", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Sacramento Kings", side: "home", american: -260 }, { label: "Portland Trail Blazers", side: "away", american: 210 }], startOffset: 18000000 },
  ],
  pulsz: [
    { sport: "NFL", league: "NFL", home: "Seattle Seahawks", away: "Arizona Cardinals", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Seattle Seahawks", side: "home", american: -150 }, { label: "Arizona Cardinals", side: "away", american: 128 }], startOffset: 3600000 },
    { sport: "NFL", league: "NFL", home: "Seattle Seahawks", away: "Arizona Cardinals", marketType: "spread", marketName: "Spread", outcomes: [{ label: "Seahawks -3", side: "home", american: -110, line: -3 }, { label: "Cardinals +3", side: "away", american: -110, line: 3 }], startOffset: 3600000 },
    { sport: "NBA", league: "NBA", home: "Dallas Mavericks", away: "Houston Rockets", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Dallas Mavericks", side: "home", american: -135 }, { label: "Houston Rockets", side: "away", american: 115 }], startOffset: 7200000 },
    { sport: "NBA", league: "NBA", home: "Dallas Mavericks", away: "Houston Rockets", marketType: "total", marketName: "Total Points", outcomes: [{ label: "Over 230.5", side: "over", american: -112, line: 230.5 }, { label: "Under 230.5", side: "under", american: -108, line: 230.5 }], startOffset: 7200000 },
    { sport: "MLB", league: "MLB", home: "Seattle Mariners", away: "Oakland Athletics", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Seattle Mariners", side: "home", american: -225 }, { label: "Oakland Athletics", side: "away", american: 185 }], startOffset: 18000000 },
    { sport: "NHL", league: "NHL", home: "Vancouver Canucks", away: "Calgary Flames", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Vancouver Canucks", side: "home", american: -145 }, { label: "Calgary Flames", side: "away", american: 125 }], startOffset: 10800000 },
    { sport: "Soccer", league: "Premier League", home: "Newcastle United", away: "West Ham", marketType: "moneyline", marketName: "Match Result", outcomes: [{ label: "Newcastle United", side: "home", american: -140 }, { label: "Draw", side: "draw", american: 240 }, { label: "West Ham", side: "away", american: 280 }], startOffset: 21600000 },
    { sport: "NFL", league: "NFL", home: "Detroit Lions", away: "Minnesota Vikings", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Detroit Lions", side: "home", american: -115 }, { label: "Minnesota Vikings", side: "away", american: -105 }], startOffset: 86400000 },
    { sport: "NBA", league: "NBA", home: "Oklahoma City Thunder", away: "Memphis Grizzlies", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Oklahoma City Thunder", side: "home", american: -175 }, { label: "Memphis Grizzlies", side: "away", american: 150 }], startOffset: 14400000 },
    { sport: "MLB", league: "MLB", home: "Minnesota Twins", away: "Cleveland Guardians", marketType: "moneyline", marketName: "Winner", outcomes: [{ label: "Minnesota Twins", side: "home", american: 105 }, { label: "Cleveland Guardians", side: "away", american: -125 }], startOffset: 21600000 },
  ],
  "sb-betr": [
    { sport: "NFL", league: "NFL", home: "Los Angeles Rams", away: "San Francisco 49ers", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Los Angeles Rams", side: "home", american: 155 }, { label: "San Francisco 49ers", side: "away", american: -185 }], startOffset: 3600000 },
    { sport: "NFL", league: "NFL", home: "Los Angeles Rams", away: "San Francisco 49ers", marketType: "game_prop", marketName: "First TD Scorer", outcomes: [{ label: "Christian McCaffrey", side: "other", american: 600 }, { label: "Puka Nacua", side: "other", american: 750 }, { label: "Cooper Kupp", side: "other", american: 800 }], startOffset: 3600000 },
    { sport: "NBA", league: "NBA", home: "Minnesota Timberwolves", away: "San Antonio Spurs", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Minnesota Timberwolves", side: "home", american: -280 }, { label: "San Antonio Spurs", side: "away", american: 225 }], startOffset: 7200000 },
    { sport: "NBA", league: "NBA", home: "Minnesota Timberwolves", away: "San Antonio Spurs", marketType: "player_prop", marketName: "Victor Wembanyama Points", outcomes: [{ label: "Over 22.5", side: "over", american: -110, line: 22.5 }, { label: "Under 22.5", side: "under", american: -110, line: 22.5 }], startOffset: 7200000 },
    { sport: "MLB", league: "MLB", home: "Detroit Tigers", away: "Kansas City Royals", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Detroit Tigers", side: "home", american: 110 }, { label: "Kansas City Royals", side: "away", american: -130 }], startOffset: 18000000 },
    { sport: "NHL", league: "NHL", home: "Nashville Predators", away: "St. Louis Blues", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Nashville Predators", side: "home", american: -125 }, { label: "St. Louis Blues", side: "away", american: 105 }], startOffset: 10800000 },
    { sport: "NCAAF", league: "NCAAF", home: "Texas Longhorns", away: "Oklahoma Sooners", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Texas Longhorns", side: "home", american: -145 }, { label: "Oklahoma Sooners", side: "away", american: 125 }], startOffset: 86400000 },
    { sport: "NCAAB", league: "NCAAB", home: "Kansas Jayhawks", away: "Kentucky Wildcats", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Kansas Jayhawks", side: "home", american: -130 }, { label: "Kentucky Wildcats", side: "away", american: 110 }], startOffset: 43200000 },
    { sport: "MMA", league: "UFC", home: "Dustin Poirier", away: "Justin Gaethje", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Dustin Poirier", side: "home", american: -115 }, { label: "Justin Gaethje", side: "away", american: -105 }], startOffset: 172800000 },
    { sport: "Soccer", league: "MLS", home: "Inter Miami", away: "Atlanta United", marketType: "moneyline", marketName: "Pick", outcomes: [{ label: "Inter Miami", side: "home", american: -200 }, { label: "Draw", side: "draw", american: 280 }, { label: "Atlanta United", side: "away", american: 400 }], startOffset: 28800000 },
  ],
};

/* ── Generic Sweepstakes Scraper class ───────────────────────────────────── */

export default class SweepsGenericScraper extends BaseScraper {
  private platformConfig: SweepsPlatformConfig;

  constructor(platformConfig: SweepsPlatformConfig, overrides?: Partial<ScraperConfig>) {
    const scraperConfig: ScraperConfig = {
      id: platformConfig.id,
      name: platformConfig.name,
      category: "sweepstakes" as ScraperCategory,
      mono: platformConfig.mono,
      tint: platformConfig.tint,
      enabled: true,
      pollIntervalMs: platformConfig.pollIntervalMs,
      maxRps: platformConfig.maxRps,
      demoMode: false,
      apiBase: platformConfig.apiBase,
      sports: platformConfig.sports,
      ...overrides,
    };
    super(scraperConfig);
    this.platformConfig = platformConfig;
  }

  /* ------------------------------------------------------------------ */
  /*  Live fetch — PLACEHOLDER                                          */
  /*                                                                    */
  /*  TODO: Each sweepstakes platform has a private API that requires   */
  /*  reverse engineering. Use demo mode until APIs are mapped.          */
  /* ------------------------------------------------------------------ */

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    console.warn(
      `[scraper:${this.config.id}] TODO: ${this.platformConfig.name} API is not implemented. ` +
        `${this.platformConfig.description} ` +
        `API base: ${this.platformConfig.apiBase}. ` +
        `Use demo mode (demoMode: true) until the API is reverse-engineered. ` +
        `Returning empty results.`,
    );
    return [];
  }

  /* ------------------------------------------------------------------ */
  /*  Demo data — ~10 markets per platform                              */
  /* ------------------------------------------------------------------ */

  protected generateDemoData(): NormalizedMarket[] {
    const now = Date.now();
    const demoInputs = DEMO_DATA[this.config.id] ?? [];

    return demoInputs.map((input, idx) => {
      const externalId = `${this.config.id}-demo-${idx + 1}`;

      return {
        id: this.makeId(this.config.id, externalId),
        externalId,
        platformId: this.config.id,
        platformName: this.config.name,
        sport: input.sport,
        league: input.league,
        event: {
          name: `${input.away} @ ${input.home}`,
          home: input.home,
          away: input.away,
          startTime: now + (input.startOffset ?? 3600000),
          isLive: input.isLive ?? false,
        },
        marketType: input.marketType,
        marketName: input.marketName,
        line: input.outcomes[0]?.line,
        outcomes: input.outcomes.map((o) => ({
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
      };
    });
  }
}

/* ── Factory function ────────────────────────────────────────────────────── */

/**
 * Create a sweepstakes scraper instance for a specific platform.
 *
 * @param platformId - One of: "stake", "chm", "pulsz", "sb-betr"
 * @param overrides  - Optional ScraperConfig overrides
 * @throws If the platformId is not found in SWEEPS_CONFIGS
 */
export function createSweepsScraper(
  platformId: string,
  overrides?: Partial<ScraperConfig>,
): SweepsGenericScraper {
  const platformConfig = PLATFORM_CONFIGS.find((c) => c.id === platformId);
  if (!platformConfig) {
    throw new Error(
      `Unknown sweepstakes platform: "${platformId}". ` +
        `Available: ${PLATFORM_CONFIGS.map((c) => c.id).join(", ")}`,
    );
  }
  return new SweepsGenericScraper(platformConfig, overrides);
}
