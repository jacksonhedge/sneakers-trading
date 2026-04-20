/* -------------------------------------------------------------------------- */
/*  Sneakers Platform Catalog                                                 */
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
  logoUrl: string;
  /** US states where the platform is live (2-letter codes) */
  states: string[];
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
  logoUrl: string;
  /** US states where the platform is live ([] = US blocked or global-only) */
  states: string[];
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
  logoUrl: string;
  states: string[];
};

/* Logo helper — Google favicon service gives clean PNGs at any size */
function favicon(domain: string, sz = 32) {
  return `https://www.google.com/s2/favicons?sz=${sz}&domain=${domain}`;
}

/* -------------------------------------------------------------------------- */
/*  SPORTSBOOKS                                                                */
/* -------------------------------------------------------------------------- */

export const SPORTSBOOKS: Sportsbook[] = [
  // ── US Tier 1
  {
    id: "dk", name: "DraftKings", region: "US", category: "US Tier 1",
    mono: "DK", tint: "#53D337", logoUrl: favicon("draftkings.com"),
    states: ["AZ","AR","CO","CT","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MO","NH","NJ","NY","NC","OH","OR","PA","TN","VT","VA","WV","WY","DC"],
  },
  {
    id: "fd", name: "FanDuel", region: "US", category: "US Tier 1",
    mono: "FD", tint: "#1493FF", logoUrl: favicon("fanduel.com"),
    states: ["AR","AZ","CO","CT","IL","IN","IA","KS","KY","LA","MA","MD","MI","MO","NC","NJ","NY","OH","PA","TN","VA","VT","WV","WY","DC"],
  },
  {
    id: "mgm", name: "BetMGM", region: "US", category: "US Tier 1",
    mono: "MG", tint: "#C9A24C", logoUrl: favicon("betmgm.com"),
    states: ["AZ","CO","IL","IN","IA","KS","KY","LA","MD","MA","MI","MO","MS","NC","NV","NJ","NY","OH","PA","TN","VA","WV","WY","DC"],
  },
  {
    id: "czr", name: "Caesars Sportsbook", region: "US", category: "US Tier 1",
    mono: "CZ", tint: "#C8A96A", logoUrl: favicon("caesars.com"),
    states: ["AZ","CO","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MO","NJ","NY","NV","NC","OH","PA","TN","VA","WV","WY","DC"],
  },
  {
    id: "espn", name: "ESPN Bet", region: "US", category: "US Tier 1",
    mono: "EB", tint: "#D00000", logoUrl: favicon("espnbet.com"),
    states: ["AZ","CO","IL","IN","IA","KS","KY","LA","MD","MA","MI","NJ","NY","NC","OH","PA","TN","VA","WV","DC"],
  },
  {
    id: "fan", name: "Fanatics", region: "US", category: "US Tier 1",
    mono: "FN", tint: "#E53238", logoUrl: favicon("betfanatics.com"),
    states: ["AZ","CO","CT","IL","IN","IA","KS","KY","LA","MD","MA","MI","MO","NJ","NY","NC","OH","PA","TN","VT","VA","WV","WY","DC"],
  },
  {
    id: "brv", name: "BetRivers", region: "US", category: "US Tier 1",
    mono: "BR", tint: "#12B5F1", logoUrl: favicon("betrivers.com"),
    states: ["AZ","CO","DE","IL","IN","IA","LA","MD","MI","NJ","NY","OH","PA","VA","WV"],
  },
  {
    id: "hr", name: "Hard Rock Bet", region: "US", category: "US Tier 1",
    mono: "HR", tint: "#F0B323", logoUrl: favicon("hardrock.bet"),
    states: ["AZ","CO","FL","IL","IN","MI","NJ","OH","TN","VA"],
  },

  // ── US Tier 2
  {
    id: "borg", name: "Borgata", region: "US", category: "US Tier 2",
    mono: "BG", tint: "#C6A25A", logoUrl: favicon("borgataonline.com"),
    states: ["NJ","PA","WV"],
  },
  {
    id: "wyn", name: "WynnBET", region: "US", category: "US Tier 2",
    mono: "WY", tint: "#B08A3E", logoUrl: favicon("wynnbet.com"),
    states: ["AZ","CO","IN","LA","MA","MI","NJ","NY","TN","VA","WV"],
  },
  {
    id: "pts", name: "PointsBet", region: "US", category: "US Tier 2",
    mono: "PB", tint: "#E60000", logoUrl: favicon("pointsbet.com"),
    states: ["CO","IL","IN","IA","KS","LA","MD","MI","NJ","NY","OH","PA","VA","WV"],
  },
  {
    id: "si", name: "SI Sportsbook", region: "US", category: "US Tier 2",
    mono: "SI", tint: "#9B1B30", logoUrl: favicon("sisportsbook.com"),
    states: ["CO","IN","NJ","OH","VA"],
  },
  {
    id: "tipico", name: "Tipico", region: "US", category: "US Tier 2",
    mono: "TP", tint: "#D41E1A", logoUrl: favicon("tipico.com"),
    states: ["CO","NJ","OH"],
  },
  {
    id: "betparx", name: "BetParx", region: "US", category: "US Tier 2",
    mono: "BP", tint: "#E2222A", logoUrl: favicon("betparx.com"),
    states: ["MI","NJ","PA"],
  },
  {
    id: "circa", name: "Circa Sports", region: "US", category: "US Tier 2",
    mono: "CI", tint: "#E5AE31", logoUrl: favicon("circasports.com"),
    states: ["CO","IA","NV"],
  },
  {
    id: "wg", name: "Westgate SuperBook", region: "US", category: "US Tier 2",
    mono: "WG", tint: "#1F6FB5", logoUrl: favicon("westgatesuperbook.com"),
    states: ["CO","IA","NV"],
  },
  {
    id: "stn", name: "STN Sports", region: "US", category: "US Tier 2",
    mono: "ST", tint: "#6F2E82", logoUrl: favicon("stnsports.com"),
    states: ["NV"],
  },
  {
    id: "sp", name: "South Point", region: "US", category: "US Tier 2",
    mono: "SP", tint: "#BF9A49", logoUrl: favicon("southpointcasino.com"),
    states: ["NV"],
  },
  {
    id: "wind", name: "Wind Creek", region: "US", category: "US Tier 2",
    mono: "WC", tint: "#7EB05C", logoUrl: favicon("windcreekbets.com"),
    states: ["AL","PA"],
  },
  {
    id: "tvg", name: "TwinSpires", region: "US", category: "US Tier 2",
    mono: "TW", tint: "#C6162E", logoUrl: favicon("twinspires.com"),
    states: ["CO","IN","NJ","PA"],
  },
  {
    id: "sb-betr", name: "Betr Sportsbook", region: "US", category: "US Tier 2",
    mono: "BT", tint: "#FF3B5C", logoUrl: favicon("betr.app"), tag: "micro",
    states: ["OH"],
  },
  {
    id: "fliff", name: "Fliff", region: "US", category: "US Tier 2",
    mono: "FL", tint: "#8E5CFF", logoUrl: favicon("getfliff.com"), tag: "sweeps",
    states: ["AL","AK","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NM","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
  },

  // ── Global
  { id: "b365",    name: "bet365",             region: "Global", category: "Global",   mono: "B3", tint: "#FFCC00", logoUrl: favicon("bet365.com"),       states: [] },
  { id: "wh",      name: "William Hill",       region: "Global", category: "Global",   mono: "WH", tint: "#0080C6", logoUrl: favicon("williamhill.com"),   states: [] },
  { id: "uni",     name: "Unibet",             region: "Global", category: "Global",   mono: "UN", tint: "#14805E", logoUrl: favicon("unibet.com"),        states: [] },
  { id: "bwin",    name: "bwin",               region: "Global", category: "Global",   mono: "BW", tint: "#E9A30A", logoUrl: favicon("bwin.com"),          states: [] },
  { id: "ladb",    name: "Ladbrokes",          region: "Global", category: "Global",   mono: "LD", tint: "#B42029", logoUrl: favicon("ladbrokes.com"),     states: [] },
  { id: "coral",   name: "Coral",              region: "Global", category: "Global",   mono: "CO", tint: "#0B62E6", logoUrl: favicon("coral.co.uk"),       states: [] },
  { id: "pwr",     name: "Paddy Power",        region: "Global", category: "Global",   mono: "PW", tint: "#00974D", logoUrl: favicon("paddypower.com"),    states: [] },
  { id: "sky",     name: "Sky Bet",            region: "Global", category: "Global",   mono: "SK", tint: "#00A6EC", logoUrl: favicon("skybet.com"),        states: [] },
  { id: "bway",    name: "Betway",             region: "Global", category: "Global",   mono: "BY", tint: "#23A54A", logoUrl: favicon("betway.com"),        states: [] },
  { id: "888",     name: "888 Sport",          region: "Global", category: "Global",   mono: "88", tint: "#EC2024", logoUrl: favicon("888sport.com"),      states: [] },
  { id: "betfred", name: "Betfred",            region: "Global", category: "Global",   mono: "BD", tint: "#1E5FA4", logoUrl: favicon("betfred.com"),       states: [] },
  { id: "tenbet",  name: "10bet",              region: "Global", category: "Global",   mono: "10", tint: "#FF7A00", logoUrl: favicon("10bet.com"),         states: [] },

  // ── Offshore
  { id: "pin",  name: "Pinnacle",       region: "Global", category: "Offshore", mono: "PN", tint: "#F3A014", logoUrl: favicon("pinnacle.com"),     states: [], tag: "sharp" },
  { id: "bol",  name: "BetOnline",      region: "Global", category: "Offshore", mono: "BO", tint: "#E02531", logoUrl: favicon("betonline.ag"),     states: [] },
  { id: "bov",  name: "Bovada",         region: "Global", category: "Offshore", mono: "BV", tint: "#E52020", logoUrl: favicon("bovada.lv"),        states: [] },
  { id: "mb",   name: "MyBookie",       region: "Global", category: "Offshore", mono: "MB", tint: "#E8B030", logoUrl: favicon("mybookie.ag"),      states: [] },
  { id: "bkm",  name: "BookMaker",      region: "Global", category: "Offshore", mono: "BK", tint: "#D63333", logoUrl: favicon("bookmaker.eu"),     states: [] },
  { id: "bus",  name: "BetUS",          region: "Global", category: "Offshore", mono: "BU", tint: "#EF3135", logoUrl: favicon("betus.com.pa"),     states: [] },
  { id: "her",  name: "Heritage Sports", region: "Global", category: "Offshore", mono: "HE", tint: "#8A2E2E", logoUrl: favicon("heritagesports.eu"), states: [] },
  { id: "1xb",  name: "1xBet",          region: "Global", category: "Offshore", mono: "1X", tint: "#1A73E8", logoUrl: favicon("1xbet.com"),        states: [] },

  // ── Exchanges
  {
    id: "bfex", name: "Betfair Exchange", region: "Global", category: "Exchange",
    mono: "BF", tint: "#FFB80C", logoUrl: favicon("betfair.com"), states: [], tag: "sharp",
  },
  {
    id: "smk", name: "Smarkets", region: "Global", category: "Exchange",
    mono: "SM", tint: "#4AB4E8", logoUrl: favicon("smarkets.com"), states: [],
  },
  {
    id: "mcb", name: "Matchbook", region: "Global", category: "Exchange",
    mono: "MT", tint: "#2DBE60", logoUrl: favicon("matchbook.com"), states: [],
  },
  {
    id: "novig", name: "NoVig", region: "US", category: "Exchange",
    mono: "NV", tint: "#179BE7", logoUrl: favicon("novig.us"), tag: "sharp",
    states: ["AK","AL","AR","CA","CT","DE","FL","GA","HI","IL","IN","IA","KS","KY","MA","MD","ME","MI","MN","MS","MO","NE","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TX","UT","VA","VT","WA","WV","WI","WY","DC"],
  },
  {
    id: "prox", name: "Prophet Exchange", region: "US", category: "Exchange",
    mono: "PX", tint: "#7C5CFF", logoUrl: favicon("prophetx.co"),
    states: ["AK","AR","CA","CO","CT","DE","FL","GA","HI","IL","IN","IA","KS","KY","MA","MD","ME","MN","MS","MO","NE","NH","NM","NY","NC","ND","OK","OR","PA","RI","SC","SD","TX","UT","VA","VT","WA","WV","WI","WY","DC"],
  },
  {
    id: "spt", name: "Sporttrade", region: "US", category: "Exchange",
    mono: "SX", tint: "#00875B", logoUrl: favicon("sporttrade.com"),
    states: ["AZ","CO","IA","NJ","VA"],
  },
];

/* -------------------------------------------------------------------------- */
/*  PREDICTION MARKETS                                                        */
/* -------------------------------------------------------------------------- */

// Shared "all 50 + DC" array for CFTC-regulated platforms (non-sports contracts)
const ALL_US: string[] = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY",
  "LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
  "OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export const PREDICTION_MARKETS: PredictionMarket[] = [
  {
    id: "kalshi", name: "Kalshi", mono: "KL", tint: "#00C48C",
    badge: "CFTC", volume24h: 18_420_000, logoUrl: favicon("kalshi.com"),
    // All states for non-sports; sports blocked in MA, NV, NJ, AZ, OH, MI, MD, IL, CT
    states: ALL_US,
  },
  {
    id: "polymarket", name: "Polymarket", mono: "PM", tint: "#2F6BFF",
    badge: "Blockchain", volume24h: 42_110_000, logoUrl: favicon("polymarket.com"),
    states: [], // US broadly blocked (CFTC settlement 2022; invite-only waitlist Dec 2025)
  },
  {
    id: "rh", name: "Robinhood Predictions", mono: "RH", tint: "#CDFF00",
    badge: "CFTC", volume24h: 6_840_000, logoUrl: favicon("robinhood.com"),
    // All states for non-sports; sports restricted in MD, NJ, NV
    states: ALL_US,
  },
  {
    id: "fdp", name: "FanDuel Predicts", mono: "FP", tint: "#1493FF",
    badge: "CFTC", volume24h: 4_210_000, logoUrl: favicon("fanduel.com"),
    states: ALL_US, // All 50 + DC; sports only in 18 states without FanDuel Sportsbook
  },
  {
    id: "dkp", name: "DraftKings Predictions", mono: "DP", tint: "#53D337",
    badge: "CFTC", volume24h: 3_850_000, logoUrl: favicon("draftkings.com"),
    // Blocked in AZ, AR, IL, IA, ME, MT, NV, NH, OH, PA, TN, WA
    states: ["AL","AK","CA","CO","CT","DE","DC","FL","GA","HI","ID","IN","KS","KY","LA","MD","MA","MI","MN","MS","MO","NE","NJ","NM","NY","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","VA","WV","WI","WY"],
  },
  {
    id: "og", name: "OG.com", mono: "OG", tint: "#F04D67",
    badge: "CFTC", volume24h: 2_310_000, logoUrl: favicon("og.com"),
    // All except NY; AZ + NV restricted for sports contracts
    states: ALL_US.filter((s) => s !== "NY"),
  },
  {
    id: "crp", name: "Crypto.com Predict", mono: "CR", tint: "#1199FA",
    badge: "CFTC", volume24h: 980_000, logoUrl: favicon("crypto.com"),
    // Blocked in AZ and NY; same exchange as OG.com
    states: ALL_US.filter((s) => s !== "AZ" && s !== "NY"),
  },
  {
    id: "cbp", name: "Coinbase Predict", mono: "CB", tint: "#0052FF",
    badge: "CFTC", volume24h: 1_640_000, logoUrl: favicon("coinbase.com"),
    // Blocked in AZ and NY; routes through Kalshi
    states: ALL_US.filter((s) => s !== "AZ" && s !== "NY"),
  },
  {
    id: "prx", name: "ProphetX", mono: "PR", tint: "#7C5CFF",
    badge: "Regulated", volume24h: 720_000, logoUrl: favicon("prophetx.co"),
    // Sweepstakes model; blocked in AZ, ID, LA, MI, MT, NJ, NV, OH, TN, WA
    states: ["AK","AR","CA","CO","CT","DE","FL","GA","HI","IL","IN","IA","KS","KY","MA","MD","ME","MN","MS","MO","NE","NH","NM","NY","NC","ND","OK","OR","PA","RI","SC","SD","TX","UT","VA","VT","WV","WI","WY","DC"],
  },
  {
    id: "pit", name: "PredictIt", mono: "PI", tint: "#07A0BB",
    badge: "Regulated", volume24h: 340_000, logoUrl: favicon("predictit.org"),
    states: ALL_US, // All 50 + DC; CFTC no-action letter; politics/policy only; $3.5k cap
  },
  {
    id: "lim", name: "Limitless", mono: "LM", tint: "#B37CFF",
    badge: "Blockchain", volume24h: 710_000, logoUrl: favicon("limitless.exchange"),
    states: [], // Blockchain; regulatory grey zone for US users
  },
  {
    id: "drft", name: "Drift Predict", mono: "DR", tint: "#9370FF",
    badge: "Blockchain", volume24h: 410_000, logoUrl: favicon("drift.trade"),
    states: [], // Solana-based; no US regulatory approval
  },
  {
    id: "mani", name: "Manifold", mono: "MN", tint: "#4E4ACB",
    badge: "Unregulated", volume24h: 95_000, logoUrl: favicon("manifold.markets"),
    states: ALL_US, // Free play (no real money); open to all
  },
  {
    id: "zg", name: "Zeitgeist", mono: "ZG", tint: "#F26A64",
    badge: "Blockchain", volume24h: 125_000, logoUrl: favicon("zeitgeist.pm"),
    states: [], // Blockchain (Polkadot); US regulatory grey zone
  },
  {
    id: "bfx", name: "Betfair Exchange", mono: "BX", tint: "#FFB80C",
    badge: "Exchange", volume24h: 28_400_000, logoUrl: favicon("betfair.com"),
    states: [], // Not US-licensed; UK/EU market
  },
];

/* -------------------------------------------------------------------------- */
/*  FANTASY + DFS                                                             */
/* -------------------------------------------------------------------------- */

export const FANTASY_PLATFORMS: FantasyPlatform[] = [
  {
    id: "pp", name: "PrizePicks", mono: "PP", tint: "#7C5CFF",
    style: "Pick'em", logoUrl: favicon("prizepicks.com"),
    // Player Picks (real money) in ~36 states; blocked in CT, DE, HI, ID, IA, LA, ME, MD, MS, MO, MT, NV, NH, NJ, OH, PA, TN, WA, WV
    states: ["AK","AL","AR","AZ","CA","CO","FL","GA","IL","IN","KS","KY","MA","MI","MN","NE","NM","NC","ND","NY","OK","OR","RI","SC","SD","TX","UT","VT","VA","WI","WY","DC"],
  },
  {
    id: "ud", name: "Underdog Fantasy", mono: "UD", tint: "#F1C04A",
    style: "Pick'em", logoUrl: favicon("underdogfantasy.com"),
    // Full access ~29 states + DC; Pick'em unavailable in CT, IA, LA, NV, NJ, NY, MD, MI, OH, PA
    states: ["AK","AL","CA","FL","GA","IL","IN","KS","KY","MA","MN","MO","NE","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VA","WA","WV","WI","WY","DC"],
  },
  {
    id: "sl", name: "Sleeper", mono: "SL", tint: "#00FFF9",
    style: "Season", logoUrl: favicon("sleeper.com"),
    // Blocked in AZ, CO, CT, DE, HI, ID, IA, KY, LA, ME, MD, MI, MS, MT, NV, NJ, NY, OH, PA, WA
    states: ["AL","AK","AR","CA","FL","GA","IL","IN","KS","MA","MN","MO","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TN","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "db", name: "Dabble", mono: "DB", tint: "#00D1C1",
    style: "Pick'em", logoUrl: favicon("dabble.com"),
    // Blocked in PA, AZ, LA, IA, CO, NJ, OH, NY, MI
    states: ["AK","AR","CA","DC","FL","GA","IL","IN","KS","KY","MA","MN","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TN","TX","UT","VA","WV","WI","WY"],
  },
  {
    id: "pl", name: "ParlayPlay", mono: "PL", tint: "#39B3FF",
    style: "Pick'em", logoUrl: favicon("parlayplay.io"),
    // Blocked in AZ, CT, DE, HI, ID, IN, LA, ME, MD, MI, MS, MO, MT, NV, NH, NJ, NY, OH, PA, VA, WA, WV
    states: ["AL","AK","AR","CA","CO","DC","FL","GA","IL","IA","KS","KY","MA","MN","NE","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","WI","WY"],
  },
  {
    id: "bpp", name: "Betr Picks", mono: "BT", tint: "#FF3B5C",
    style: "Pick'em", logoUrl: favicon("betr.app"),
    // Available ~34 states
    states: ["AK","AL","AZ","AR","CA","CO","DE","DC","FL","GA","IL","IN","KS","KY","MA","MN","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TN","TX","UT","VT","VA","WV","WI","WY"],
  },
  {
    id: "boom", name: "Boom Fantasy", mono: "BM", tint: "#FF4D14",
    style: "Pick'em", logoUrl: favicon("boomfantasy.com"),
    states: ["AL","AK","AR","CA","CO","FL","GA","IL","IN","KS","KY","MA","MN","MO","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "ob", name: "OwnersBox", mono: "OB", tint: "#1F7FD9",
    style: "Draft", logoUrl: favicon("ownersbox.com"),
    states: ["AL","AK","AR","CA","FL","GA","IL","IN","KS","MA","MN","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "splash", name: "Splash Sports", mono: "SS", tint: "#14B8A6",
    style: "Draft", logoUrl: favicon("splashsports.com"),
    states: ["AL","AK","AR","CA","CO","FL","GA","IL","IN","KS","MA","MN","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "sdft", name: "SuperDraft", mono: "SD", tint: "#E63946",
    style: "Pick'em", logoUrl: favicon("superdraft.io"),
    states: ["AL","AK","AR","CA","CO","FL","GA","IL","IN","KS","KY","MA","MN","MO","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "vivid", name: "Vivid Picks", mono: "VP", tint: "#00D2C4",
    style: "Pick'em", logoUrl: favicon("vividpicks.com"),
    states: ["AL","AK","AR","CA","CO","FL","GA","IL","IN","KS","MA","MN","NE","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VA","WV","WI","WY","DC"],
  },
  {
    id: "drft2", name: "Drafters", mono: "DF", tint: "#16A085",
    style: "Pick'em", logoUrl: favicon("drafters.com"),
    states: ["AL","AK","AR","CA","FL","GA","IL","IN","KS","MA","MN","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "stake", name: "Stake.us", mono: "SU", tint: "#1EA75C",
    style: "Sweepstakes", logoUrl: favicon("stake.us"),
    // Sweepstakes; blocked in ID, KY, MI, NV, WA, and a few others
    states: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","IL","IN","IA","KS","LA","ME","MD","MA","MN","MS","MO","MT","NE","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "chm", name: "Chumba Casino", mono: "CH", tint: "#F1A22E",
    style: "Sweepstakes", logoUrl: favicon("chumbacasino.com"),
    states: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"],
  },
  {
    id: "pulsz", name: "Pulsz", mono: "PZ", tint: "#FFB800",
    style: "Sweepstakes", logoUrl: favicon("pulsz.com"),
    states: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"],
  },
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

/** Returns all platforms available in a given state */
export function platformsForState(stateCode: string) {
  return {
    sportsbooks: SPORTSBOOKS.filter((p) => p.states.includes(stateCode)),
    predictionMarkets: PREDICTION_MARKETS.filter((p) => p.states.includes(stateCode)),
    fantasy: FANTASY_PLATFORMS.filter((p) => p.states.includes(stateCode)),
  };
}
