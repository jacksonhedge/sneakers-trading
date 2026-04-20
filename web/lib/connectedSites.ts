export type SiteCategory = "prediction" | "sportsbook" | "fantasy" | "exchange";

function favicon(domain: string, sz = 32) {
  return `https://www.google.com/s2/favicons?sz=${sz}&domain=${domain}`;
}

export interface ConnectableSite {
  id: string;
  name: string;
  emoji: string;
  logoUrl: string;
  signupUrl: string;
  category: SiteCategory;
  /** US states where this site is live ([] = US blocked or global) */
  states: string[];
}

const ALL_US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

/** Shown in the sidebar Connected Sites group (prediction markets). */
export const CONNECTABLE_SITES: ConnectableSite[] = [
  {
    id: "kalshi", name: "Kalshi", emoji: "🟢",
    logoUrl: favicon("kalshi.com"),
    signupUrl: "https://kalshi.com/sign-up", category: "prediction",
    states: ALL_US_STATES, // Sports blocked in MA, NV, NJ, AZ, OH, MI, MD, IL, CT
  },
  {
    id: "polymarket", name: "Polymarket", emoji: "🔵",
    logoUrl: favicon("polymarket.com"),
    signupUrl: "https://polymarket.com", category: "prediction",
    states: [], // US broadly blocked (CFTC settlement 2022)
  },
  {
    id: "coinbase", name: "Coinbase Predict", emoji: "🟠",
    logoUrl: favicon("coinbase.com"),
    signupUrl: "https://www.coinbase.com/signup", category: "prediction",
    states: ALL_US_STATES.filter((s) => s !== "AZ" && s !== "NY"),
  },
  {
    id: "robinhood", name: "Robinhood", emoji: "🟡",
    logoUrl: favicon("robinhood.com"),
    signupUrl: "https://robinhood.com/us/en/about/prediction-markets/", category: "prediction",
    states: ALL_US_STATES, // Sports restricted in MD, NJ, NV
  },
  {
    id: "fdp", name: "FanDuel Predicts", emoji: "🔷",
    logoUrl: favicon("fanduel.com"),
    signupUrl: "https://www.fanduel.com/predicts", category: "prediction",
    states: ALL_US_STATES,
  },
  {
    id: "dkp", name: "DK Predictions", emoji: "🟩",
    logoUrl: favicon("draftkings.com"),
    signupUrl: "https://sportsbook.draftkings.com", category: "prediction",
    states: ["AL","AK","CA","CO","CT","DE","DC","FL","GA","HI","ID","IN","KS","KY","LA","MD","MA","MI","MN","MS","MO","NE","NJ","NM","NY","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","VA","WV","WI","WY"],
  },
  {
    id: "prophetx", name: "ProphetX", emoji: "🟣",
    logoUrl: favicon("prophetx.co"),
    signupUrl: "https://www.prophetx.co", category: "prediction",
    states: ["AK","AR","CA","CO","CT","DE","FL","GA","HI","IL","IN","IA","KS","KY","MA","MD","ME","MN","MS","MO","NE","NH","NM","NY","NC","ND","OK","OR","PA","RI","SC","SD","TX","UT","VA","VT","WA","WV","WI","WY","DC"],
  },
  {
    id: "predictit", name: "PredictIt", emoji: "🔴",
    logoUrl: favicon("predictit.org"),
    signupUrl: "https://www.predictit.org", category: "prediction",
    states: ALL_US_STATES, // All states; politics/policy only; $3.5k cap
  },
  {
    id: "og", name: "OG.com", emoji: "⚫",
    logoUrl: favicon("og.com"),
    signupUrl: "https://og.bet", category: "prediction",
    states: ALL_US_STATES.filter((s) => s !== "NY"),
  },
  {
    id: "limitless", name: "Limitless", emoji: "🟤",
    logoUrl: favicon("limitless.exchange"),
    signupUrl: "https://limitless.exchange", category: "prediction",
    states: [], // Blockchain; regulatory grey zone for US users
  },
  {
    id: "cryptocom", name: "Crypto.com Predict", emoji: "💠",
    logoUrl: favicon("crypto.com"),
    signupUrl: "https://crypto.com/predict", category: "prediction",
    states: ALL_US_STATES.filter((s) => s !== "AZ" && s !== "NY"),
  },
  {
    id: "metamask", name: "MetaMask Pred.", emoji: "🦊",
    logoUrl: favicon("metamask.io"),
    signupUrl: "https://metamask.io", category: "prediction",
    states: [], // No regulatory approval; US grey zone
  },
];

/** Shown in the Sports modal — DFS, sportsbooks, and sports-focused exchanges. */
export const SPORTS_SITES: ConnectableSite[] = [
  // Exchanges
  {
    id: "novig", name: "NoVig", emoji: "⚖️",
    logoUrl: favicon("novig.us"),
    signupUrl: "https://novig.us", category: "exchange",
    states: ["AK","AL","AR","CA","CT","DE","FL","GA","HI","IL","IN","IA","KS","KY","MA","MD","ME","MI","MN","MS","MO","NE","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TX","UT","VA","VT","WA","WV","WI","WY","DC"],
  },
  {
    id: "sporttrade", name: "Sporttrade", emoji: "📊",
    logoUrl: favicon("sporttrade.com"),
    signupUrl: "https://sporttrade.com", category: "exchange",
    states: ["AZ","CO","IA","NJ","VA"],
  },

  // DFS / Pick'em / Fantasy
  {
    id: "prizepicks", name: "PrizePicks", emoji: "🏅",
    logoUrl: favicon("prizepicks.com"),
    signupUrl: "https://prizepicks.com", category: "fantasy",
    states: ["AK","AL","AR","AZ","CA","CO","FL","GA","IL","IN","KS","KY","MA","MI","MN","NE","NM","NC","ND","NY","OK","OR","RI","SC","SD","TX","UT","VT","VA","WI","WY","DC"],
  },
  {
    id: "underdog", name: "Underdog", emoji: "🐕",
    logoUrl: favicon("underdogfantasy.com"),
    signupUrl: "https://underdogfantasy.com", category: "fantasy",
    states: ["AK","AL","CA","FL","GA","IL","IN","KS","KY","MA","MN","MO","NE","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VA","WA","WV","WI","WY","DC"],
  },
  {
    id: "sleeper", name: "Sleeper", emoji: "💤",
    logoUrl: favicon("sleeper.com"),
    signupUrl: "https://sleeper.com", category: "fantasy",
    states: ["AL","AK","AR","CA","FL","GA","IL","IN","KS","MA","MN","MO","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TN","TX","UT","VT","VA","WV","WI","WY","DC"],
  },
  {
    id: "betr", name: "Betr Picks", emoji: "⚡",
    logoUrl: favicon("betr.app"),
    signupUrl: "https://www.betr.app", category: "fantasy",
    states: ["AK","AL","AZ","AR","CA","CO","DE","DC","FL","GA","IL","IN","KS","KY","MA","MN","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TN","TX","UT","VT","VA","WV","WI","WY"],
  },
  {
    id: "dabble", name: "Dabble", emoji: "🎯",
    logoUrl: favicon("dabble.com"),
    signupUrl: "https://dabble.com", category: "fantasy",
    states: ["AK","AR","CA","DC","FL","GA","IL","IN","KS","KY","MA","MN","NE","NH","NM","NC","ND","OK","OR","RI","SC","SD","TN","TX","UT","VA","WV","WI","WY"],
  },
  {
    id: "parlayplay", name: "ParlayPlay", emoji: "🧩",
    logoUrl: favicon("parlayplay.io"),
    signupUrl: "https://parlayplay.com", category: "fantasy",
    states: ["AL","AK","AR","CA","CO","DC","FL","GA","IL","IA","KS","KY","MA","MN","NE","NM","NC","ND","OK","OR","RI","SC","SD","TX","UT","VT","WI","WY"],
  },
  {
    id: "dk-pick6", name: "DK Pick6", emoji: "6️⃣",
    logoUrl: favicon("draftkings.com"),
    signupUrl: "https://pick6.draftkings.com", category: "fantasy",
    states: ["AZ","AR","CO","CT","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MO","NH","NJ","NY","NC","OH","OR","PA","TN","VT","VA","WV","WY","DC"],
  },

  // Sportsbooks
  {
    id: "dk", name: "DraftKings", emoji: "👑",
    logoUrl: favicon("draftkings.com"),
    signupUrl: "https://sportsbook.draftkings.com", category: "sportsbook",
    states: ["AZ","AR","CO","CT","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MO","NH","NJ","NY","NC","OH","OR","PA","TN","VT","VA","WV","WY","DC"],
  },
  {
    id: "fd", name: "FanDuel", emoji: "🐎",
    logoUrl: favicon("fanduel.com"),
    signupUrl: "https://sportsbook.fanduel.com", category: "sportsbook",
    states: ["AR","AZ","CO","CT","IL","IN","IA","KS","KY","LA","MA","MD","MI","MO","NC","NJ","NY","OH","PA","TN","VA","VT","WV","WY","DC"],
  },
  {
    id: "fanatics", name: "Fanatics", emoji: "🏆",
    logoUrl: favicon("betfanatics.com"),
    signupUrl: "https://sportsbook.fanatics.com", category: "sportsbook",
    states: ["AZ","CO","CT","IL","IN","IA","KS","KY","LA","MD","MA","MI","MO","NJ","NY","NC","OH","PA","TN","VT","VA","WV","WY","DC"],
  },
  {
    id: "mgm", name: "BetMGM", emoji: "🦁",
    logoUrl: favicon("betmgm.com"),
    signupUrl: "https://sports.betmgm.com", category: "sportsbook",
    states: ["AZ","CO","IL","IN","IA","KS","KY","LA","MD","MA","MI","MO","MS","NC","NV","NJ","NY","OH","PA","TN","VA","WV","WY","DC"],
  },
  {
    id: "czr", name: "Caesars", emoji: "🏛️",
    logoUrl: favicon("caesars.com"),
    signupUrl: "https://sportsbook.caesars.com", category: "sportsbook",
    states: ["AZ","CO","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MO","NJ","NY","NV","NC","OH","PA","TN","VA","WV","WY","DC"],
  },
  {
    id: "espnbet", name: "ESPN Bet", emoji: "📺",
    logoUrl: favicon("espnbet.com"),
    signupUrl: "https://espnbet.com", category: "sportsbook",
    states: ["AZ","CO","IL","IN","IA","KS","KY","LA","MD","MA","MI","NJ","NY","NC","OH","PA","TN","VA","WV","DC"],
  },
  {
    id: "betrivers", name: "BetRivers", emoji: "🌊",
    logoUrl: favicon("betrivers.com"),
    signupUrl: "https://www.betrivers.com", category: "sportsbook",
    states: ["AZ","CO","DE","IL","IN","IA","LA","MD","MI","NJ","NY","OH","PA","VA","WV"],
  },
  {
    id: "hardrock", name: "Hard Rock Bet", emoji: "🎸",
    logoUrl: favicon("hardrock.bet"),
    signupUrl: "https://www.hardrock.bet", category: "sportsbook",
    states: ["AZ","CO","FL","IL","IN","MI","NJ","OH","TN","VA"],
  },
  {
    id: "fliff", name: "Fliff", emoji: "🟪",
    logoUrl: favicon("getfliff.com"),
    signupUrl: "https://www.getfliff.com", category: "sportsbook",
    states: ["AL","AK","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NM","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
  },
  {
    id: "bet365", name: "bet365", emoji: "🎰",
    logoUrl: favicon("bet365.com"),
    signupUrl: "https://www.bet365.com", category: "sportsbook",
    states: ["CO","NJ","OH","VA"],
  },
  {
    id: "pinnacle", name: "Pinnacle", emoji: "⛰️",
    logoUrl: favicon("pinnacle.com"),
    signupUrl: "https://www.pinnacle.com", category: "sportsbook",
    states: [], // Not US-licensed
  },
];

/** Every site we know about, for lookup by id regardless of UI placement. */
export const ALL_SITES: ConnectableSite[] = [...CONNECTABLE_SITES, ...SPORTS_SITES];

export function findSite(id: string): ConnectableSite | undefined {
  return ALL_SITES.find((s) => s.id === id);
}

const STORAGE_KEY = "otoole:connections:v1";

export interface Connection { username?: string; connectedAt: number }

export function loadConnections(): Record<string, Connection> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveConnection(siteId: string, username?: string) {
  if (typeof window === "undefined") return;
  const conns = loadConnections();
  conns[siteId] = { username, connectedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}

export function removeConnection(siteId: string) {
  if (typeof window === "undefined") return;
  const conns = loadConnections();
  delete conns[siteId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}
