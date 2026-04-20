/* -------------------------------------------------------------------------- */
/*  Sneakers Scraper Types                                                    */
/*                                                                            */
/*  Canonical shapes used by every scraper, the normalizer, the arb engine,   */
/*  and the web terminal. All odds are stored as implied probability (0-1)    */
/*  internally; display formatting happens at the view layer.                 */
/* -------------------------------------------------------------------------- */

export type Sport =
  | "NFL" | "NBA" | "MLB" | "NHL"
  | "NCAAF" | "NCAAB"
  | "MMA" | "Boxing"
  | "Soccer" | "Tennis" | "Golf"
  | "Esports" | "Other";

export type MarketType =
  | "moneyline"
  | "spread"
  | "total"
  | "player_prop"
  | "game_prop"
  | "futures"
  | "prediction"    // prediction markets (yes/no binary)
  | "parlay"
  | "other";

export type OutcomeSide = "home" | "away" | "over" | "under" | "yes" | "no" | "draw" | "other";

export interface NormalizedOutcome {
  label: string;              // "Kansas City Chiefs", "Over 45.5", "YES"
  side: OutcomeSide;
  americanOdds: number;       // +150, -110
  decimalOdds: number;        // 2.50, 1.91
  impliedProb: number;        // 0.40, 0.524
  /** For prediction markets: price in cents (0-100). */
  priceCents?: number;
  /** For spreads/totals: the line number. */
  line?: number;
}

export interface NormalizedMarket {
  id: string;                 // sneakers-internal UUID
  externalId: string;         // platform-native ID
  platformId: string;         // matches lib/platforms.ts id
  platformName: string;

  sport: Sport;
  league: string;             // "NFL", "NBA", "Premier League", etc.

  event: {
    name: string;             // "Kansas City Chiefs vs Philadelphia Eagles"
    home?: string;
    away?: string;
    startTime: number;        // unix ms
    isLive: boolean;
  };

  marketType: MarketType;
  marketName: string;         // "Moneyline", "Spread", "Player Points O/U", "Will X happen?"
  line?: number;              // spread/total line

  outcomes: NormalizedOutcome[];

  lastUpdated: number;        // unix ms — when we last fetched this
  isActive: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Scraper health / metrics                                                  */
/* -------------------------------------------------------------------------- */

export type ScraperState = "running" | "stopped" | "error" | "starting" | "rate_limited";

export type ScraperCategory = "sportsbook" | "prediction" | "sweepstakes" | "exchange";

export interface ScraperMetrics {
  marketsScraped: number;
  eventsScraped: number;
  lastSuccessfulFetch: number | null;  // unix ms
  lastError: string | null;
  lastErrorTime: number | null;
  errorCount: number;
  totalFetches: number;
  avgLatencyMs: number;
  uptimePercent: number;
  startedAt: number | null;
}

export interface ScraperStatus {
  id: string;                  // matches platforms.ts id
  name: string;
  category: ScraperCategory;
  state: ScraperState;
  mono: string;                // two-letter logo
  tint: string;                // brand color
  pollIntervalMs: number;
  metrics: ScraperMetrics;
  /** Which sport groups this scraper covers. */
  sports: Sport[];
  /** API base URL for transparency in dashboard. */
  apiBase: string;
}

/* -------------------------------------------------------------------------- */
/*  Scraper config                                                            */
/* -------------------------------------------------------------------------- */

export interface ScraperConfig {
  id: string;
  name: string;
  category: ScraperCategory;
  mono: string;
  tint: string;
  enabled: boolean;
  pollIntervalMs: number;
  /** Max requests per second to this platform. */
  maxRps: number;
  /** Use mock data instead of live API calls. */
  demoMode: boolean;
  apiBase: string;
  sports: Sport[];
}
