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
/*  FanDuel Sportsbook Scraper                                                */
/* -------------------------------------------------------------------------- */

const COMPETITION_IDS: Record<string, number> = {
  NFL: 15942,
  NBA: 7522,
  MLB: 10485,
  NHL: 7524,
  MMA: 11231,
  Soccer: 10932,
  Tennis: 10061,
  Golf: 11096,
  NCAAF: 15869,
  NCAAB: 7616,
};

/** FanDuel custom-page slugs for each sport. */
const SPORT_SLUGS: Record<string, string> = {
  NFL: "nfl",
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  MMA: "mma",
  Soccer: "soccer",
  Tennis: "tennis",
  Golf: "golf",
  NCAAF: "college-football",
  NCAAB: "college-basketball",
};

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const SCRAPER_CONFIG: ScraperConfig = {
  id: "fd",
  name: "FanDuel Sportsbook",
  category: "sportsbook",
  mono: "FD",
  tint: "#1493FF",
  enabled: true,
  pollIntervalMs: 10000,
  maxRps: 2,
  demoMode: false,
  apiBase: "https://sbapi.nj.sportsbook.fanduel.com/api",
  sports: [
    "NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB",
    "MMA", "Soccer", "Tennis", "Golf",
  ] as Sport[],
};

/* ── FanDuel API response shapes (minimal) ────────────────────────────────── */

interface FDRunner {
  selectionId?: number;
  handicap?: number;
  winRunnerOdds?: {
    americanDisplayOdds?: { americanOdds?: string };
    decimalDisplayOdds?: { decimalOdds?: number };
    trueOdds?: { decimalOdds?: number };
  };
  runnerName?: string;
  result?: { type?: string };
  runnerOrder?: number;
}

interface FDMarket {
  marketId?: string;
  marketName?: string;
  marketType?: string;
  runners?: FDRunner[];
  inPlay?: boolean;
  isSuspended?: boolean;
  eventId?: string;
}

interface FDEvent {
  eventId?: string;
  name?: string;
  competitionId?: number;
  openDate?: string;
  inPlay?: boolean;
  teamName1?: string;
  teamName2?: string;
}

interface FDCompetition {
  competitionId?: number;
  name?: string;
}

interface FDAttachments {
  events?: Record<string, FDEvent>;
  markets?: Record<string, FDMarket>;
  competitions?: Record<string, FDCompetition>;
}

interface FDResponse {
  attachments?: FDAttachments;
}

/* ── Scraper class ────────────────────────────────────────────────────────── */

export default class FanDuelSportsbook extends BaseScraper {
  constructor(overrides?: Partial<ScraperConfig>) {
    super({ ...SCRAPER_CONFIG, ...overrides });
  }

  /* ------------------------------------------------------------------ */
  /*  Live fetch                                                        */
  /* ------------------------------------------------------------------ */

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    const allMarkets: NormalizedMarket[] = [];

    const sportEntries = Object.entries(SPORT_SLUGS).filter(([sport]) =>
      this.config.sports.includes(sport as Sport),
    );

    for (const [sport, slug] of sportEntries) {
      try {
        const markets = await this.fetchSportPage(sport as Sport, slug);
        allMarkets.push(...markets);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[scraper:${this.config.id}] Failed to fetch ${sport}: ${message}`,
        );
        // Continue with other sports
      }
    }

    return allMarkets;
  }

  private async fetchSportPage(
    sport: Sport,
    slug: string,
  ): Promise<NormalizedMarket[]> {
    const url = `${this.config.apiBase}/content-managed-page?page=CUSTOM&customPageId=${slug}`;

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
      return this.parseResponse(sport, data);
    } finally {
      clearTimeout(timeout);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Response parsing                                                  */
  /* ------------------------------------------------------------------ */

  private parseResponse(sport: Sport, data: FDResponse): NormalizedMarket[] {
    const markets: NormalizedMarket[] = [];
    const attachments = data.attachments;

    if (!attachments) return markets;

    const fdEvents = attachments.events ?? {};
    const fdMarkets = attachments.markets ?? {};
    const fdCompetitions = attachments.competitions ?? {};

    // Build event lookup
    const eventMap = new Map<string, FDEvent>();
    for (const [id, ev] of Object.entries(fdEvents)) {
      eventMap.set(id, ev);
    }

    // Resolve competition name for league
    const resolveLeague = (competitionId?: number): string => {
      if (competitionId == null) return sport;
      const comp = fdCompetitions[String(competitionId)];
      return comp?.name ?? sport;
    };

    for (const [marketId, fdMarket] of Object.entries(fdMarkets)) {
      if (fdMarket.isSuspended || !fdMarket.runners?.length) continue;

      const eventId = fdMarket.eventId ?? "";
      const event = eventMap.get(eventId);
      const league = event ? resolveLeague(event.competitionId) : sport;
      const eventName = event?.name ?? "Unknown Event";
      const startTime = event?.openDate
        ? new Date(event.openDate).getTime()
        : Date.now() + 86400000;
      const isLive = fdMarket.inPlay ?? event?.inPlay ?? false;

      const marketType = this.inferMarketType(fdMarket.marketName ?? "");
      const outcomes = this.mapRunners(fdMarket.runners, marketType);
      const line = this.extractLine(fdMarket.runners);

      const externalId = fdMarket.marketId ?? marketId;

      const market: NormalizedMarket = {
        id: this.makeId("fd", externalId),
        externalId,
        platformId: "fd",
        platformName: "FanDuel Sportsbook",
        sport,
        league,
        event: {
          name: eventName,
          home: event?.teamName1,
          away: event?.teamName2,
          startTime,
          isLive,
        },
        marketType,
        marketName: fdMarket.marketName ?? "Unknown",
        line,
        outcomes,
        lastUpdated: Date.now(),
        isActive: true,
      };

      markets.push(market);
    }

    return markets;
  }

  private inferMarketType(name: string): MarketType {
    const lower = name.toLowerCase();
    if (lower.includes("moneyline") || lower.includes("money line") || lower === "winner") return "moneyline";
    if (lower.includes("spread") || lower.includes("handicap")) return "spread";
    if (lower.includes("total") || lower.includes("over/under") || lower.includes("o/u")) return "total";
    if (lower.includes("player") || lower.includes("pts") || lower.includes("reb") || lower.includes("ast") || lower.includes("to record")) return "player_prop";
    if (lower.includes("futures") || lower.includes("outright") || lower.includes("champion")) return "futures";
    if (lower.includes("parlay")) return "parlay";
    return "game_prop";
  }

  private mapRunners(
    runners: FDRunner[],
    marketType: MarketType,
  ): NormalizedOutcome[] {
    return runners
      .filter((r) => r.winRunnerOdds?.americanDisplayOdds?.americanOdds != null)
      .map((r, idx) => {
        const americanStr = r.winRunnerOdds?.americanDisplayOdds?.americanOdds ?? "0";
        const american = parseInt(americanStr, 10);
        const decimal =
          r.winRunnerOdds?.decimalDisplayOdds?.decimalOdds ??
          this.americanToDecimal(american);
        const implied = this.americanToImplied(american);

        return {
          label: r.runnerName ?? `Runner ${idx + 1}`,
          side: this.inferSide(r.runnerName ?? "", idx, marketType),
          americanOdds: parsedAmerican,
          decimalOdds: Math.round(decimal * 100) / 100,
          impliedProb: Math.round(implied * 10000) / 10000,
          line: r.handicap,
        };
      });
  }

  private inferSide(label: string, index: number, marketType: MarketType): OutcomeSide {
    const lower = label.toLowerCase();
    if (lower.includes("over")) return "over";
    if (lower.includes("under")) return "under";
    if (lower.includes("yes")) return "yes";
    if (lower.includes("no")) return "no";
    if (lower.includes("draw") || lower.includes("tie")) return "draw";
    if (marketType === "moneyline" || marketType === "spread") {
      return index === 0 ? "home" : "away";
    }
    return "other";
  }

  private extractLine(runners: FDRunner[]): number | undefined {
    for (const r of runners) {
      if (r.handicap != null) return r.handicap;
    }
    return undefined;
  }

  /* ------------------------------------------------------------------ */
  /*  Demo data                                                         */
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
      outcomes: Array<{ label: string; side: OutcomeSide; american: number; line?: number }>,
      startOffset = 0,
      isLive = false,
    ): void => {
      idx++;
      const externalId = `fd-demo-${idx}`;
      markets.push({
        id: this.makeId("fd", externalId),
        externalId,
        platformId: "fd",
        platformName: "FanDuel Sportsbook",
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
          decimalOdds: Math.round(this.americanToDecimal(o.american) * 100) / 100,
          impliedProb: Math.round(this.americanToImplied(o.american) * 10000) / 10000,
          line: o.line,
        })),
        lastUpdated: now,
        isActive: true,
      });
    };

    // NFL
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Philadelphia Eagles", "moneyline", "Moneyline", [
      { label: "Kansas City Chiefs", side: "home", american: -150 },
      { label: "Philadelphia Eagles", side: "away", american: 128 },
    ], 3600000);
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Philadelphia Eagles", "spread", "Spread", [
      { label: "Kansas City Chiefs -3", side: "home", american: -108, line: -3 },
      { label: "Philadelphia Eagles +3", side: "away", american: -112, line: 3 },
    ], 3600000);
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Philadelphia Eagles", "total", "Total Points", [
      { label: "Over 49", side: "over", american: -112, line: 49 },
      { label: "Under 49", side: "under", american: -108, line: 49 },
    ], 3600000);
    addMarket("NFL", "NFL", "Buffalo Bills", "Miami Dolphins", "moneyline", "Moneyline", [
      { label: "Buffalo Bills", side: "home", american: -210 },
      { label: "Miami Dolphins", side: "away", american: 175 },
    ], 7200000);

    // NBA
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "moneyline", "Moneyline", [
      { label: "Boston Celtics", side: "home", american: -185 },
      { label: "Milwaukee Bucks", side: "away", american: 158 },
    ], 5400000);
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "spread", "Spread", [
      { label: "Boston Celtics -5", side: "home", american: -108, line: -5 },
      { label: "Milwaukee Bucks +5", side: "away", american: -112, line: 5 },
    ], 5400000);
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "total", "Total Points", [
      { label: "Over 229", side: "over", american: -110, line: 229 },
      { label: "Under 229", side: "under", american: -110, line: 229 },
    ], 5400000);
    addMarket("NBA", "NBA", "Los Angeles Lakers", "Golden State Warriors", "moneyline", "Moneyline", [
      { label: "Los Angeles Lakers", side: "home", american: 105 },
      { label: "Golden State Warriors", side: "away", american: -125 },
    ], 9000000);
    addMarket("NBA", "NBA", "Los Angeles Lakers", "Golden State Warriors", "player_prop", "Stephen Curry - Points", [
      { label: "Over 29.5", side: "over", american: -110, line: 29.5 },
      { label: "Under 29.5", side: "under", american: -110, line: 29.5 },
    ], 9000000);
    addMarket("NBA", "NBA", "New York Knicks", "Philadelphia 76ers", "moneyline", "Moneyline", [
      { label: "New York Knicks", side: "home", american: -140 },
      { label: "Philadelphia 76ers", side: "away", american: 118 },
    ], 12600000, true);

    // MLB
    addMarket("MLB", "MLB", "New York Yankees", "Boston Red Sox", "moneyline", "Moneyline", [
      { label: "New York Yankees", side: "home", american: -130 },
      { label: "Boston Red Sox", side: "away", american: 112 },
    ], 14400000);
    addMarket("MLB", "MLB", "New York Yankees", "Boston Red Sox", "total", "Total Runs", [
      { label: "Over 9", side: "over", american: -108, line: 9 },
      { label: "Under 9", side: "under", american: -112, line: 9 },
    ], 14400000);
    addMarket("MLB", "MLB", "Houston Astros", "Texas Rangers", "moneyline", "Moneyline", [
      { label: "Houston Astros", side: "home", american: -145 },
      { label: "Texas Rangers", side: "away", american: 122 },
    ], 18000000);

    // NHL
    addMarket("NHL", "NHL", "Toronto Maple Leafs", "Montreal Canadiens", "moneyline", "Moneyline", [
      { label: "Toronto Maple Leafs", side: "home", american: -160 },
      { label: "Montreal Canadiens", side: "away", american: 135 },
    ], 7200000);
    addMarket("NHL", "NHL", "Toronto Maple Leafs", "Montreal Canadiens", "total", "Total Goals", [
      { label: "Over 6", side: "over", american: -115, line: 6 },
      { label: "Under 6", side: "under", american: -105, line: 6 },
    ], 7200000);
    addMarket("NHL", "NHL", "Colorado Avalanche", "Dallas Stars", "moneyline", "Moneyline", [
      { label: "Colorado Avalanche", side: "home", american: -130 },
      { label: "Dallas Stars", side: "away", american: 110 },
    ], 10800000);

    // NCAAF
    addMarket("NCAAF", "NCAAF", "Ohio State Buckeyes", "Michigan Wolverines", "moneyline", "Moneyline", [
      { label: "Ohio State Buckeyes", side: "home", american: -120 },
      { label: "Michigan Wolverines", side: "away", american: 100 },
    ], 86400000);
    addMarket("NCAAF", "NCAAF", "Ohio State Buckeyes", "Michigan Wolverines", "spread", "Spread", [
      { label: "Ohio State Buckeyes -2.5", side: "home", american: -110, line: -2.5 },
      { label: "Michigan Wolverines +2.5", side: "away", american: -110, line: 2.5 },
    ], 86400000);

    // NCAAB
    addMarket("NCAAB", "NCAAB", "Kansas Jayhawks", "Kentucky Wildcats", "moneyline", "Moneyline", [
      { label: "Kansas Jayhawks", side: "home", american: -175 },
      { label: "Kentucky Wildcats", side: "away", american: 148 },
    ], 43200000);
    addMarket("NCAAB", "NCAAB", "Kansas Jayhawks", "Kentucky Wildcats", "total", "Total Points", [
      { label: "Over 148.5", side: "over", american: -108, line: 148.5 },
      { label: "Under 148.5", side: "under", american: -112, line: 148.5 },
    ], 43200000);

    // MMA
    addMarket("MMA", "UFC", "Israel Adesanya", "Dricus Du Plessis", "moneyline", "Moneyline", [
      { label: "Israel Adesanya", side: "home", american: 130 },
      { label: "Dricus Du Plessis", side: "away", american: -155 },
    ], 172800000);
    addMarket("MMA", "UFC", "Israel Adesanya", "Dricus Du Plessis", "total", "Total Rounds", [
      { label: "Over 2.5", side: "over", american: -140, line: 2.5 },
      { label: "Under 2.5", side: "under", american: 118, line: 2.5 },
    ], 172800000);

    // Soccer
    addMarket("Soccer", "Premier League", "Arsenal", "Chelsea", "moneyline", "Match Result", [
      { label: "Arsenal", side: "home", american: -125 },
      { label: "Draw", side: "draw", american: 240 },
      { label: "Chelsea", side: "away", american: 220 },
    ], 21600000);
    addMarket("Soccer", "MLS", "LAFC", "Inter Miami", "moneyline", "Match Result", [
      { label: "LAFC", side: "home", american: 105 },
      { label: "Draw", side: "draw", american: 230 },
      { label: "Inter Miami", side: "away", american: 165 },
    ], 28800000);

    // Tennis
    addMarket("Tennis", "ATP", "Jannik Sinner", "Daniil Medvedev", "moneyline", "Match Winner", [
      { label: "Jannik Sinner", side: "home", american: -200 },
      { label: "Daniil Medvedev", side: "away", american: 168 },
    ], 28800000);
    addMarket("Tennis", "WTA", "Aryna Sabalenka", "Elena Rybakina", "moneyline", "Match Winner", [
      { label: "Aryna Sabalenka", side: "home", american: -145 },
      { label: "Elena Rybakina", side: "away", american: 122 },
    ], 36000000);

    // Golf
    addMarket("Golf", "PGA Tour", "Various", "US Open", "futures", "Tournament Winner", [
      { label: "Scottie Scheffler", side: "other", american: 450 },
      { label: "Xander Schauffele", side: "other", american: 800 },
      { label: "Rory McIlroy", side: "other", american: 1000 },
      { label: "Collin Morikawa", side: "other", american: 1600 },
    ], 259200000);

    // Extra player props
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "player_prop", "Giannis Antetokounmpo - Points + Rebounds", [
      { label: "Over 42.5", side: "over", american: -112, line: 42.5 },
      { label: "Under 42.5", side: "under", american: -108, line: 42.5 },
    ], 5400000);
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Philadelphia Eagles", "player_prop", "Travis Kelce - Receiving Yards", [
      { label: "Over 65.5", side: "over", american: -108, line: 65.5 },
      { label: "Under 65.5", side: "under", american: -112, line: 65.5 },
    ], 3600000);
    addMarket("MLB", "MLB", "Houston Astros", "Texas Rangers", "total", "Total Runs", [
      { label: "Over 8", side: "over", american: -115, line: 8 },
      { label: "Under 8", side: "under", american: -105, line: 8 },
    ], 18000000);
    addMarket("Soccer", "Premier League", "Arsenal", "Chelsea", "total", "Total Goals", [
      { label: "Over 2.5", side: "over", american: -125, line: 2.5 },
      { label: "Under 2.5", side: "under", american: 105, line: 2.5 },
    ], 21600000);
    addMarket("NFL", "NFL", "Buffalo Bills", "Miami Dolphins", "spread", "Spread", [
      { label: "Buffalo Bills -4.5", side: "home", american: -110, line: -4.5 },
      { label: "Miami Dolphins +4.5", side: "away", american: -110, line: 4.5 },
    ], 7200000);
    addMarket("NHL", "NHL", "Colorado Avalanche", "Dallas Stars", "total", "Total Goals", [
      { label: "Over 5.5", side: "over", american: -108, line: 5.5 },
      { label: "Under 5.5", side: "under", american: -112, line: 5.5 },
    ], 10800000);
    addMarket("NBA", "NBA", "Los Angeles Lakers", "Golden State Warriors", "spread", "Spread", [
      { label: "Los Angeles Lakers +2", side: "home", american: -110, line: 2 },
      { label: "Golden State Warriors -2", side: "away", american: -110, line: -2 },
    ], 9000000);
    addMarket("MMA", "UFC", "Israel Adesanya", "Dricus Du Plessis", "game_prop", "Fight to Go the Distance", [
      { label: "Yes", side: "yes", american: 105 },
      { label: "No", side: "no", american: -125 },
    ], 172800000);

    return markets;
  }
}
