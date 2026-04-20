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
/*  DraftKings Sportsbook Scraper                                             */
/* -------------------------------------------------------------------------- */

const SPORT_GROUP_IDS: Record<string, number> = {
  NFL: 88808,
  NBA: 42648,
  MLB: 84240,
  NHL: 42133,
  MMA: 199820,
  Soccer: 40253,
  Tennis: 92081,
  Golf: 13958,
  NCAAF: 87637,
  NCAAB: 92483,
};

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const SCRAPER_CONFIG: ScraperConfig = {
  id: "dk",
  name: "DraftKings Sportsbook",
  category: "sportsbook",
  mono: "DK",
  tint: "#53D337",
  enabled: true,
  pollIntervalMs: 10000,
  maxRps: 2,
  demoMode: false,
  apiBase: "https://sportsbook-nash.draftkings.com/sites/US-SB/api/v5",
  sports: [
    "NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB",
    "MMA", "Soccer", "Tennis", "Golf",
  ] as Sport[],
};

/* ── DraftKings API response shapes (minimal) ─────────────────────────────── */

interface DKOutcome {
  label?: string;
  oddsAmerican?: string;
  oddsDecimal?: number;
  odds?: number;
  line?: number;
  participants?: Array<{ name?: string }>;
}

interface DKOffer {
  providerOfferId?: string;
  label?: string;
  outcomes?: DKOutcome[];
  isSuspended?: boolean;
}

interface DKOfferCategory {
  name?: string;
  offerSubcategoryDescriptors?: Array<{
    name?: string;
    offerSubcategory?: { offers?: DKOffer[][] };
  }>;
}

interface DKEvent {
  eventId?: number;
  name?: string;
  teamName1?: string;
  teamName2?: string;
  startDate?: string;
  eventStatus?: { state?: string };
}

interface DKResponse {
  eventGroup?: { name?: string };
  events?: DKEvent[];
  offerCategories?: DKOfferCategory[];
}

/* ── Scraper class ────────────────────────────────────────────────────────── */

export default class DraftKingsSportsbook extends BaseScraper {
  constructor(overrides?: Partial<ScraperConfig>) {
    super({ ...SCRAPER_CONFIG, ...overrides });
  }

  /* ------------------------------------------------------------------ */
  /*  Live fetch                                                        */
  /* ------------------------------------------------------------------ */

  protected async fetchMarkets(): Promise<NormalizedMarket[]> {
    const allMarkets: NormalizedMarket[] = [];

    const sportEntries = Object.entries(SPORT_GROUP_IDS).filter(([sport]) =>
      this.config.sports.includes(sport as Sport),
    );

    for (const [sport, groupId] of sportEntries) {
      try {
        const markets = await this.fetchSportGroup(sport as Sport, groupId);
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

  private async fetchSportGroup(
    sport: Sport,
    groupId: number,
  ): Promise<NormalizedMarket[]> {
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

      const data = (await res.json()) as DKResponse;
      return this.parseResponse(sport, data);
    } finally {
      clearTimeout(timeout);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Response parsing                                                  */
  /* ------------------------------------------------------------------ */

  private parseResponse(sport: Sport, data: DKResponse): NormalizedMarket[] {
    const markets: NormalizedMarket[] = [];
    const events = data.events ?? [];
    const offerCategories = data.offerCategories ?? [];
    const league = data.eventGroup?.name ?? sport;

    // Build an event lookup by ID
    const eventMap = new Map<number, DKEvent>();
    for (const ev of events) {
      if (ev.eventId != null) {
        eventMap.set(ev.eventId, ev);
      }
    }

    for (const category of offerCategories) {
      const categoryName = category.name ?? "Unknown";

      for (const sub of category.offerSubcategoryDescriptors ?? []) {
        const subName = sub.name ?? categoryName;
        const offerRows = sub.offerSubcategory?.offers ?? [];

        for (const offerRow of offerRows) {
          for (const offer of offerRow) {
            if (offer.isSuspended || !offer.outcomes?.length) continue;

            const externalId = offer.providerOfferId ?? `dk-${Date.now()}-${Math.random()}`;
            const marketType = this.inferMarketType(subName);
            const outcomes = this.mapOutcomes(offer.outcomes, marketType);
            const line = this.extractLine(offer.outcomes);

            // Try to find the matching event (DK associates offers with events)
            // For simplicity we attach to the first event if we can't resolve
            const firstEvent = events[0];
            const eventName = offer.label ?? firstEvent?.name ?? "Unknown Event";
            const startTime = firstEvent?.startDate
              ? new Date(firstEvent.startDate).getTime()
              : Date.now() + 86400000;
            const isLive = firstEvent?.eventStatus?.state === "started";

            const market: NormalizedMarket = {
              id: this.makeId("dk", externalId),
              externalId,
              platformId: "dk",
              platformName: "DraftKings Sportsbook",
              sport,
              league,
              event: {
                name: eventName,
                home: firstEvent?.teamName1,
                away: firstEvent?.teamName2,
                startTime,
                isLive,
              },
              marketType,
              marketName: subName,
              line,
              outcomes,
              lastUpdated: Date.now(),
              isActive: true,
            };

            markets.push(market);
          }
        }
      }
    }

    return markets;
  }

  private inferMarketType(name: string): MarketType {
    const lower = name.toLowerCase();
    if (lower.includes("moneyline") || lower.includes("money line")) return "moneyline";
    if (lower.includes("spread") || lower.includes("handicap")) return "spread";
    if (lower.includes("total") || lower.includes("over/under") || lower.includes("o/u")) return "total";
    if (lower.includes("player") || lower.includes("pts") || lower.includes("reb") || lower.includes("ast")) return "player_prop";
    if (lower.includes("futures") || lower.includes("winner") || lower.includes("champion")) return "futures";
    if (lower.includes("parlay")) return "parlay";
    return "game_prop";
  }

  private mapOutcomes(
    dkOutcomes: DKOutcome[],
    marketType: MarketType,
  ): NormalizedOutcome[] {
    return dkOutcomes
      .filter((o) => o.oddsAmerican != null)
      .map((o, idx) => {
        const american = parseInt(o.oddsAmerican ?? "0", 10);
        const decimal = o.oddsDecimal ?? this.americanToDecimal(american);
        const implied = this.americanToImplied(american);

        return {
          label: o.label ?? `Outcome ${idx + 1}`,
          side: this.inferSide(o.label ?? "", idx, marketType),
          americanOdds: american,
          decimalOdds: Math.round(decimal * 100) / 100,
          impliedProb: Math.round(implied * 10000) / 10000,
          line: o.line,
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

  private extractLine(outcomes: DKOutcome[]): number | undefined {
    for (const o of outcomes) {
      if (o.line != null) return o.line;
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
      const externalId = `dk-demo-${idx}`;
      markets.push({
        id: this.makeId("dk", externalId),
        externalId,
        platformId: "dk",
        platformName: "DraftKings Sportsbook",
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
      { label: "Kansas City Chiefs", side: "home", american: -145 },
      { label: "Philadelphia Eagles", side: "away", american: 125 },
    ], 3600000);
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Philadelphia Eagles", "spread", "Spread", [
      { label: "Kansas City Chiefs -2.5", side: "home", american: -110, line: -2.5 },
      { label: "Philadelphia Eagles +2.5", side: "away", american: -110, line: 2.5 },
    ], 3600000);
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Philadelphia Eagles", "total", "Total Points", [
      { label: "Over 48.5", side: "over", american: -110, line: 48.5 },
      { label: "Under 48.5", side: "under", american: -110, line: 48.5 },
    ], 3600000);
    addMarket("NFL", "NFL", "San Francisco 49ers", "Dallas Cowboys", "moneyline", "Moneyline", [
      { label: "San Francisco 49ers", side: "home", american: -175 },
      { label: "Dallas Cowboys", side: "away", american: 150 },
    ], 7200000);
    addMarket("NFL", "NFL", "San Francisco 49ers", "Dallas Cowboys", "spread", "Spread", [
      { label: "San Francisco 49ers -3.5", side: "home", american: -115, line: -3.5 },
      { label: "Dallas Cowboys +3.5", side: "away", american: -105, line: 3.5 },
    ], 7200000);

    // NBA
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "moneyline", "Moneyline", [
      { label: "Boston Celtics", side: "home", american: -180 },
      { label: "Milwaukee Bucks", side: "away", american: 155 },
    ], 5400000);
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "spread", "Spread", [
      { label: "Boston Celtics -4.5", side: "home", american: -110, line: -4.5 },
      { label: "Milwaukee Bucks +4.5", side: "away", american: -110, line: 4.5 },
    ], 5400000);
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "total", "Total Points", [
      { label: "Over 228.5", side: "over", american: -108, line: 228.5 },
      { label: "Under 228.5", side: "under", american: -112, line: 228.5 },
    ], 5400000);
    addMarket("NBA", "NBA", "Los Angeles Lakers", "Golden State Warriors", "moneyline", "Moneyline", [
      { label: "Los Angeles Lakers", side: "home", american: 110 },
      { label: "Golden State Warriors", side: "away", american: -130 },
    ], 9000000);
    addMarket("NBA", "NBA", "Los Angeles Lakers", "Golden State Warriors", "player_prop", "Lebron James - Points", [
      { label: "Over 27.5", side: "over", american: -115, line: 27.5 },
      { label: "Under 27.5", side: "under", american: -105, line: 27.5 },
    ], 9000000);
    addMarket("NBA", "NBA", "Denver Nuggets", "Phoenix Suns", "moneyline", "Moneyline", [
      { label: "Denver Nuggets", side: "home", american: -200 },
      { label: "Phoenix Suns", side: "away", american: 170 },
    ], 10800000, true);
    addMarket("NBA", "NBA", "Denver Nuggets", "Phoenix Suns", "spread", "Spread", [
      { label: "Denver Nuggets -5.5", side: "home", american: -112, line: -5.5 },
      { label: "Phoenix Suns +5.5", side: "away", american: -108, line: 5.5 },
    ], 10800000, true);

    // MLB
    addMarket("MLB", "MLB", "New York Yankees", "Boston Red Sox", "moneyline", "Moneyline", [
      { label: "New York Yankees", side: "home", american: -135 },
      { label: "Boston Red Sox", side: "away", american: 115 },
    ], 14400000);
    addMarket("MLB", "MLB", "New York Yankees", "Boston Red Sox", "total", "Total Runs", [
      { label: "Over 8.5", side: "over", american: -105, line: 8.5 },
      { label: "Under 8.5", side: "under", american: -115, line: 8.5 },
    ], 14400000);
    addMarket("MLB", "MLB", "Los Angeles Dodgers", "San Diego Padres", "moneyline", "Moneyline", [
      { label: "Los Angeles Dodgers", side: "home", american: -165 },
      { label: "San Diego Padres", side: "away", american: 140 },
    ], 18000000);
    addMarket("MLB", "MLB", "Los Angeles Dodgers", "San Diego Padres", "spread", "Run Line", [
      { label: "Los Angeles Dodgers -1.5", side: "home", american: 120, line: -1.5 },
      { label: "San Diego Padres +1.5", side: "away", american: -140, line: 1.5 },
    ], 18000000);

    // NHL
    addMarket("NHL", "NHL", "Toronto Maple Leafs", "Montreal Canadiens", "moneyline", "Moneyline", [
      { label: "Toronto Maple Leafs", side: "home", american: -155 },
      { label: "Montreal Canadiens", side: "away", american: 130 },
    ], 7200000);
    addMarket("NHL", "NHL", "Toronto Maple Leafs", "Montreal Canadiens", "total", "Total Goals", [
      { label: "Over 6.5", side: "over", american: 105, line: 6.5 },
      { label: "Under 6.5", side: "under", american: -125, line: 6.5 },
    ], 7200000);
    addMarket("NHL", "NHL", "Edmonton Oilers", "Vegas Golden Knights", "moneyline", "Moneyline", [
      { label: "Edmonton Oilers", side: "home", american: -120 },
      { label: "Vegas Golden Knights", side: "away", american: 100 },
    ], 10800000);

    // NCAAF
    addMarket("NCAAF", "NCAAF", "Alabama Crimson Tide", "Georgia Bulldogs", "moneyline", "Moneyline", [
      { label: "Alabama Crimson Tide", side: "home", american: 140 },
      { label: "Georgia Bulldogs", side: "away", american: -165 },
    ], 86400000);
    addMarket("NCAAF", "NCAAF", "Alabama Crimson Tide", "Georgia Bulldogs", "spread", "Spread", [
      { label: "Alabama Crimson Tide +3.5", side: "home", american: -110, line: 3.5 },
      { label: "Georgia Bulldogs -3.5", side: "away", american: -110, line: -3.5 },
    ], 86400000);

    // NCAAB
    addMarket("NCAAB", "NCAAB", "Duke Blue Devils", "North Carolina Tar Heels", "moneyline", "Moneyline", [
      { label: "Duke Blue Devils", side: "home", american: -150 },
      { label: "North Carolina Tar Heels", side: "away", american: 128 },
    ], 43200000);
    addMarket("NCAAB", "NCAAB", "Duke Blue Devils", "North Carolina Tar Heels", "total", "Total Points", [
      { label: "Over 152.5", side: "over", american: -110, line: 152.5 },
      { label: "Under 152.5", side: "under", american: -110, line: 152.5 },
    ], 43200000);

    // MMA
    addMarket("MMA", "UFC", "Jon Jones", "Stipe Miocic", "moneyline", "Moneyline", [
      { label: "Jon Jones", side: "home", american: -300 },
      { label: "Stipe Miocic", side: "away", american: 240 },
    ], 172800000);
    addMarket("MMA", "UFC", "Jon Jones", "Stipe Miocic", "game_prop", "Method of Victory", [
      { label: "Jones by KO/TKO", side: "other", american: 150 },
      { label: "Jones by Submission", side: "other", american: 400 },
      { label: "Jones by Decision", side: "other", american: 250 },
      { label: "Miocic by KO/TKO", side: "other", american: 500 },
    ], 172800000);

    // Soccer
    addMarket("Soccer", "Premier League", "Manchester City", "Liverpool", "moneyline", "Match Result", [
      { label: "Manchester City", side: "home", american: -110 },
      { label: "Draw", side: "draw", american: 250 },
      { label: "Liverpool", side: "away", american: 200 },
    ], 21600000);
    addMarket("Soccer", "Premier League", "Manchester City", "Liverpool", "total", "Total Goals", [
      { label: "Over 2.5", side: "over", american: -130, line: 2.5 },
      { label: "Under 2.5", side: "under", american: 110, line: 2.5 },
    ], 21600000);
    addMarket("Soccer", "La Liga", "Real Madrid", "Barcelona", "moneyline", "Match Result", [
      { label: "Real Madrid", side: "home", american: 110 },
      { label: "Draw", side: "draw", american: 230 },
      { label: "Barcelona", side: "away", american: 150 },
    ], 43200000);

    // Tennis
    addMarket("Tennis", "ATP", "Novak Djokovic", "Carlos Alcaraz", "moneyline", "Match Winner", [
      { label: "Novak Djokovic", side: "home", american: 115 },
      { label: "Carlos Alcaraz", side: "away", american: -135 },
    ], 28800000);
    addMarket("Tennis", "ATP", "Novak Djokovic", "Carlos Alcaraz", "total", "Total Sets", [
      { label: "Over 3.5", side: "over", american: -140, line: 3.5 },
      { label: "Under 3.5", side: "under", american: 120, line: 3.5 },
    ], 28800000);
    addMarket("Tennis", "WTA", "Iga Swiatek", "Coco Gauff", "moneyline", "Match Winner", [
      { label: "Iga Swiatek", side: "home", american: -190 },
      { label: "Coco Gauff", side: "away", american: 160 },
    ], 36000000);

    // Golf
    addMarket("Golf", "PGA Tour", "Scottie Scheffler", "The Masters", "futures", "Tournament Winner", [
      { label: "Scottie Scheffler", side: "other", american: 500 },
      { label: "Rory McIlroy", side: "other", american: 900 },
      { label: "Jon Rahm", side: "other", american: 1000 },
      { label: "Brooks Koepka", side: "other", american: 1400 },
    ], 259200000);
    addMarket("Golf", "PGA Tour", "Scottie Scheffler", "The Masters", "game_prop", "Top 5 Finish", [
      { label: "Scottie Scheffler Top 5", side: "yes", american: 150 },
      { label: "Scottie Scheffler Not Top 5", side: "no", american: -175 },
    ], 259200000);

    // Additional player props
    addMarket("NBA", "NBA", "Boston Celtics", "Milwaukee Bucks", "player_prop", "Jayson Tatum - Rebounds", [
      { label: "Over 8.5", side: "over", american: -105, line: 8.5 },
      { label: "Under 8.5", side: "under", american: -115, line: 8.5 },
    ], 5400000);
    addMarket("NFL", "NFL", "Kansas City Chiefs", "Philadelphia Eagles", "player_prop", "Patrick Mahomes - Passing Yards", [
      { label: "Over 275.5", side: "over", american: -110, line: 275.5 },
      { label: "Under 275.5", side: "under", american: -110, line: 275.5 },
    ], 3600000);
    addMarket("MLB", "MLB", "New York Yankees", "Boston Red Sox", "player_prop", "Aaron Judge - Home Runs", [
      { label: "Over 0.5", side: "over", american: 200, line: 0.5 },
      { label: "Under 0.5", side: "under", american: -250, line: 0.5 },
    ], 14400000);

    return markets;
  }
}
