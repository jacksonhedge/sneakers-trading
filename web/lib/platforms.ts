/* -------------------------------------------------------------------------- */
/*  Sneakers Platform Catalog                                                 */
/*                                                                            */
/*  Every operator Sneakers tracks. Matches OddsJam coverage + our new        */
/*  prediction-market additions. Each entry is static metadata only — live    */
/*  connection state + balances live in mockData.ts / future API.             */
/* -------------------------------------------------------------------------- */

export type Region = "US" | "Global";

export type SportsbookCategory =
  | "US Tier 1"
  | "US Tier 2"
  | "Global"
  | "Offshore"
  | "Exchange";

export type Sportsbook = {
  id: string;
  name: string;
  region: Region;
  category: SportsbookCategory;
  mono: string;
  tint: string;
  /** Optional qualifier — sharp lines, micro-betting, sweepstakes */
  tag?: "sharp" | "micro" | "sweeps";
};

export type PredictionMarketBadge =
  | "CFTC"
  | "Blockchain"
  | "Regulated"
  | "Sportsbook"
  | "Exchange"
  | "Unregulated";

export type PredictionMarket = {
  id: string;
  name: string;
  mono: string;
  tint: string;
  badge: PredictionMarketBadge;
  /** 24h volume in USD — `null` renders a placeholder */
  volume24h: number | null;
};

export type FantasyCategory =
  | "Pick'em"
  | "Draft"
  | "Season"
  | "Micro"
  | "Sweepstakes";

export type FantasyPlatform = {
  id: string;
  name: string;
  mono: string;
  tint: string;
  style: FantasyCategory;
};

/* -------------------------------------------------------------------------- */
/*  SPORTSBOOKS — US Tier 1, US Tier 2, Global, Offshore, Exchanges           */
/* -------------------------------------------------------------------------- */

export const SPORTSBOOKS: Sportsbook[] = [
  // ── US Tier 1 — licensed mainstream books
  { id: "dk",      name: "DraftKings",         region: "US",     category: "US Tier 1", mono: "DK", tint: "#53D337" },
  { id: "fd",      name: "FanDuel",            region: "US",     category: "US Tier 1", mono: "FD", tint: "#1493FF" },
  { id: "mgm",     name: "BetMGM",             region: "US",     category: "US Tier 1", mono: "MG", tint: "#C9A24C" },
  { id: "czr",     name: "Caesars Sportsbook", region: "US",     category: "US Tier 1", mono: "CZ", tint: "#C8A96A" },
  { id: "espn",    name: "ESPN Bet",           region: "US",     category: "US Tier 1", mono: "EB", tint: "#D00000" },
  { id: "fan",     name: "Fanatics",           region: "US",     category: "US Tier 1", mono: "FN", tint: "#E53238" },
  { id: "brv",     name: "BetRivers",          region: "US",     category: "US Tier 1", mono: "BR", tint: "#12B5F1" },
  { id: "hr",      name: "Hard Rock Bet",      region: "US",     category: "US Tier 1", mono: "HR", tint: "#F0B323" },

  // ── US Tier 2 — regional, boutique, casino-branded
  { id: "borg",    name: "Borgata",            region: "US",     category: "US Tier 2", mono: "BG", tint: "#C6A25A" },
  { id: "wyn",     name: "WynnBET",            region: "US",     category: "US Tier 2", mono: "WY", tint: "#B08A3E" },
  { id: "pts",     name: "PointsBet",          region: "US",     category: "US Tier 2", mono: "PB", tint: "#E60000" },
  { id: "si",      name: "SI Sportsbook",      region: "US",     category: "US Tier 2", mono: "SI", tint: "#9B1B30" },
  { id: "tipico",  name: "Tipico",             region: "US",     category: "US Tier 2", mono: "TP", tint: "#D41E1A" },
  { id: "betparx", name: "BetParx",            region: "US",     category: "US Tier 2", mono: "BP", tint: "#E2222A" },
  { id: "circa",   name: "Circa Sports",       region: "US",     category: "US Tier 2", mono: "CI", tint: "#E5AE31" },
  { id: "wg",      name: "Westgate SuperBook", region: "US",     category: "US Tier 2", mono: "WG", tint: "#1F6FB5" },
  { id: "stn",     name: "STN Sports",         region: "US",     category: "US Tier 2", mono: "ST", tint: "#6F2E82" },
  { id: "sp",      name: "South Point",        region: "US",     category: "US Tier 2", mono: "SP", tint: "#BF9A49" },
  { id: "wind",    name: "Wind Creek",         region: "US",     category: "US Tier 2", mono: "WC", tint: "#7EB05C" },
  { id: "tvg",     name: "TwinSpires",         region: "US",     category: "US Tier 2", mono: "TW", tint: "#C6162E" },
  { id: "sb-betr", name: "Betr Sportsbook",    region: "US",     category: "US Tier 2", mono: "BT", tint: "#FF3B5C", tag: "micro" },
  { id: "fliff",   name: "Fliff",              region: "US",     category: "US Tier 2", mono: "FL", tint: "#8E5CFF", tag: "sweeps" },

  // ── Global — major licensed operators outside the US
  { id: "b365",    name: "bet365",             region: "Global", category: "Global",    mono: "B3", tint: "#FFCC00" },
  { id: "wh",      name: "William Hill",       region: "Global", category: "Global",    mono: "WH", tint: "#0080C6" },
  { id: "uni",     name: "Unibet",             region: "Global", category: "Global",    mono: "UN", tint: "#14805E" },
  { id: "bwin",    name: "bwin",               region: "Global", category: "Global",    mono: "BW", tint: "#E9A30A" },
  { id: "ladb",    name: "Ladbrokes",          region: "Global", category: "Global",    mono: "LD", tint: "#B42029" },
  { id: "coral",   name: "Coral",              region: "Global", category: "Global",    mono: "CO", tint: "#0B62E6" },
  { id: "pwr",     name: "Paddy Power",        region: "Global", category: "Global",    mono: "PW", tint: "#00974D" },
  { id: "sky",     name: "Sky Bet",            region: "Global", category: "Global",    mono: "SK", tint: "#00A6EC" },
  { id: "bway",    name: "Betway",             region: "Global", category: "Global",    mono: "BY", tint: "#23A54A" },
  { id: "888",     name: "888 Sport",          region: "Global", category: "Global",    mono: "88", tint: "#EC2024" },
  { id: "betfred", name: "Betfred",            region: "Global", category: "Global",    mono: "BD", tint: "#1E5FA4" },
  { id: "tenbet",  name: "10bet",              region: "Global", category: "Global",    mono: "10", tint: "#FF7A00" },

  // ── Offshore — reduced-juice and sharp-friendly
  { id: "pin",     name: "Pinnacle",           region: "Global", category: "Offshore",  mono: "PN", tint: "#F3A014", tag: "sharp" },
  { id: "bol",     name: "BetOnline",          region: "Global", category: "Offshore",  mono: "BO", tint: "#E02531" },
  { id: "bov",     name: "Bovada",             region: "Global", category: "Offshore",  mono: "BV", tint: "#E52020" },
  { id: "mb",      name: "MyBookie",           region: "Global", category: "Offshore",  mono: "MB", tint: "#E8B030" },
  { id: "bkm",     name: "BookMaker",          region: "Global", category: "Offshore",  mono: "BK", tint: "#D63333" },
  { id: "bus",     name: "BetUS",              region: "Global", category: "Offshore",  mono: "BU", tint: "#EF3135" },
  { id: "her",     name: "Heritage Sports",    region: "Global", category: "Offshore",  mono: "HE", tint: "#8A2E2E" },
  { id: "1xb",     name: "1xBet",              region: "Global", category: "Offshore",  mono: "1X", tint: "#1A73E8" },

  // ── Exchanges — peer-to-peer / reduced-vig
  { id: "bfex",    name: "Betfair Exchange",   region: "Global", category: "Exchange",  mono: "BF", tint: "#FFB80C", tag: "sharp" },
  { id: "smk",     name: "Smarkets",           region: "Global", category: "Exchange",  mono: "SM", tint: "#4AB4E8" },
  { id: "mcb",     name: "Matchbook",          region: "Global", category: "Exchange",  mono: "MT", tint: "#2DBE60" },
  { id: "novig",   name: "NoVig",              region: "US",     category: "Exchange",  mono: "NV", tint: "#00FF88", tag: "sharp" },
  { id: "prox",    name: "Prophet Exchange",   region: "US",     category: "Exchange",  mono: "PX", tint: "#7C5CFF" },
  { id: "spt",     name: "Sporttrade",         region: "US",     category: "Exchange",  mono: "SX", tint: "#1493FF" },
];

/* -------------------------------------------------------------------------- */
/*  PREDICTION MARKETS                                                        */
/* -------------------------------------------------------------------------- */

export const PREDICTION_MARKETS: PredictionMarket[] = [
  { id: "kalshi",     name: "Kalshi",                 mono: "KL", tint: "#00C48C", badge: "CFTC",        volume24h: 18_420_000 },
  { id: "polymarket", name: "Polymarket",             mono: "PM", tint: "#2F6BFF", badge: "Blockchain",  volume24h: 42_110_000 },
  { id: "rh",         name: "Robinhood Predictions",  mono: "RH", tint: "#CDFF00", badge: "CFTC",        volume24h:  6_840_000 },
  { id: "fdp",        name: "FanDuel Predicts",       mono: "FP", tint: "#1493FF", badge: "CFTC",        volume24h:  4_210_000 },
  { id: "dkp",        name: "DraftKings Predictions", mono: "DP", tint: "#53D337", badge: "CFTC",        volume24h:  3_850_000 },
  { id: "og",         name: "OG.com",                 mono: "OG", tint: "#8A5CFF", badge: "Regulated",   volume24h:  2_310_000 },
  { id: "crp",        name: "Crypto.com Predictions", mono: "CR", tint: "#1199FA", badge: "Blockchain",  volume24h:    980_000 },
  { id: "cbp",        name: "Coinbase Predict",       mono: "CB", tint: "#0052FF", badge: "Blockchain",  volume24h:  1_640_000 },
  { id: "prx",        name: "ProphetX",               mono: "PR", tint: "#7C5CFF", badge: "Regulated",   volume24h:    720_000 },
  { id: "pit",        name: "PredictIt",              mono: "PI", tint: "#E2574C", badge: "Regulated",   volume24h:    340_000 },
  { id: "lim",        name: "Limitless",              mono: "LM", tint: "#B37CFF", badge: "Blockchain",  volume24h:    710_000 },
  { id: "drft",       name: "Drift Predict",          mono: "DR", tint: "#9370FF", badge: "Blockchain",  volume24h:    410_000 },
  { id: "mani",       name: "Manifold",               mono: "MN", tint: "#4E4ACB", badge: "Unregulated", volume24h:     95_000 },
  { id: "zg",         name: "Zeitgeist",              mono: "ZG", tint: "#F26A64", badge: "Blockchain",  volume24h:    125_000 },
  { id: "bfx",        name: "Betfair Exchange",       mono: "BX", tint: "#FFB80C", badge: "Exchange",    volume24h: 28_400_000 },
];

/* -------------------------------------------------------------------------- */
/*  FANTASY + DFS                                                             */
/* -------------------------------------------------------------------------- */

export const FANTASY_PLATFORMS: FantasyPlatform[] = [
  { id: "pp",     name: "PrizePicks",       mono: "PP", tint: "#7C5CFF", style: "Pick'em" },
  { id: "ud",     name: "Underdog Fantasy", mono: "UD", tint: "#F1C04A", style: "Pick'em" },
  { id: "sl",     name: "Sleeper",          mono: "SL", tint: "#FF6B2B", style: "Season" },
  { id: "db",     name: "Dabble",           mono: "DB", tint: "#00D1C1", style: "Pick'em" },
  { id: "pl",     name: "ParlayPlay",       mono: "PL", tint: "#39B3FF", style: "Pick'em" },
  { id: "bpp",    name: "Betr Picks",       mono: "BT", tint: "#FF3B5C", style: "Pick'em" },
  { id: "boom",   name: "Boom Fantasy",     mono: "BM", tint: "#FF4D14", style: "Pick'em" },
  { id: "ob",     name: "OwnersBox",        mono: "OB", tint: "#1F7FD9", style: "Draft" },
  { id: "splash", name: "Splash Sports",    mono: "SS", tint: "#14B8A6", style: "Draft" },
  { id: "sdft",   name: "SuperDraft",       mono: "SD", tint: "#E63946", style: "Pick'em" },
  { id: "vivid",  name: "Vivid Picks",      mono: "VP", tint: "#00D2C4", style: "Pick'em" },
  { id: "drft2",  name: "Drafters",         mono: "DF", tint: "#16A085", style: "Pick'em" },
  { id: "stake",  name: "Stake.us",         mono: "SU", tint: "#1EA75C", style: "Sweepstakes" },
  { id: "chm",    name: "Chumba Casino",    mono: "CH", tint: "#F1A22E", style: "Sweepstakes" },
  { id: "pulsz",  name: "Pulsz",            mono: "PZ", tint: "#FFB800", style: "Sweepstakes" },
];

/* -------------------------------------------------------------------------- */
/*  Helpers + aggregates                                                      */
/* -------------------------------------------------------------------------- */

export function formatVolume(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export const SPORTSBOOK_CATEGORIES: SportsbookCategory[] = [
  "US Tier 1",
  "US Tier 2",
  "Global",
  "Offshore",
  "Exchange",
];

export const FANTASY_CATEGORIES: FantasyCategory[] = [
  "Pick'em",
  "Draft",
  "Season",
  "Micro",
  "Sweepstakes",
];

export const PLATFORM_TOTAL =
  SPORTSBOOKS.length + PREDICTION_MARKETS.length + FANTASY_PLATFORMS.length;
