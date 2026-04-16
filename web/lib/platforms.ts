export type Region = "US" | "Global";

export type Sportsbook = {
  id: string;
  name: string;
  region: Region;
  /** Two-letter monogram used as a logo placeholder */
  mono: string;
  /** Brand accent used by the tiny logo chip */
  tint: string;
  /** Optional qualifier like "sharp" */
  tag?: "sharp";
};

export type PredictionMarket = {
  id: string;
  name: string;
  mono: string;
  tint: string;
  /** Regulatory / venue badge */
  badge: "CFTC" | "Blockchain" | "Regulated" | "Sportsbook" | "Exchange" | "Unregulated";
  /** 24h volume in USD for display — `null` renders a placeholder */
  volume24h: number | null;
};

export type FantasyPlatform = {
  id: string;
  name: string;
  mono: string;
  tint: string;
  /** DFS style — pick'em, draft, sleeper-style fantasy, etc. */
  style: "Pick'em" | "Draft" | "Season" | "Micro";
};

export const SPORTSBOOKS: Sportsbook[] = [
  { id: "dk", name: "DraftKings", region: "US", mono: "DK", tint: "#53D337" },
  { id: "fd", name: "FanDuel", region: "US", mono: "FD", tint: "#1493FF" },
  { id: "mgm", name: "BetMGM", region: "US", mono: "MG", tint: "#C9A24C" },
  { id: "czr", name: "Caesars Sportsbook", region: "US", mono: "CZ", tint: "#C8A96A" },
  { id: "b365", name: "bet365", region: "Global", mono: "B3", tint: "#FFCC00" },
  { id: "fan", name: "Fanatics", region: "US", mono: "FN", tint: "#E53238" },
  { id: "brv", name: "BetRivers", region: "US", mono: "BR", tint: "#12B5F1" },
  { id: "pts", name: "PointsBet", region: "US", mono: "PB", tint: "#E60000" },
  { id: "wyn", name: "WynnBET", region: "US", mono: "WY", tint: "#B08A3E" },
  { id: "espn", name: "ESPN Bet", region: "US", mono: "EB", tint: "#D00000" },
  { id: "hr", name: "Hard Rock Bet", region: "US", mono: "HR", tint: "#F0B323" },
  { id: "borg", name: "Borgata", region: "US", mono: "BG", tint: "#C6A25A" },
  { id: "pin", name: "Pinnacle", region: "Global", mono: "PN", tint: "#F3A014", tag: "sharp" },
  { id: "bfex", name: "Betfair Exchange", region: "Global", mono: "BF", tint: "#FFB80C", tag: "sharp" },
  { id: "wh", name: "William Hill", region: "Global", mono: "WH", tint: "#0080C6" },
  { id: "uni", name: "Unibet", region: "Global", mono: "UN", tint: "#14805E" },
  { id: "1xb", name: "1xBet", region: "Global", mono: "1X", tint: "#1A73E8" },
];

export const PREDICTION_MARKETS: PredictionMarket[] = [
  { id: "kalshi", name: "Kalshi", mono: "KL", tint: "#00C48C", badge: "CFTC", volume24h: 18_420_000 },
  { id: "polymarket", name: "Polymarket", mono: "PM", tint: "#2F6BFF", badge: "Blockchain", volume24h: 42_110_000 },
  { id: "rh", name: "Robinhood Predictions", mono: "RH", tint: "#CDFF00", badge: "CFTC", volume24h: 6_840_000 },
  { id: "og", name: "OG.com", mono: "OG", tint: "#8A5CFF", badge: "Regulated", volume24h: 2_310_000 },
  { id: "dkp", name: "DraftKings Predictions", mono: "DP", tint: "#53D337", badge: "CFTC", volume24h: null },
  { id: "fdp", name: "FanDuel Predicts", mono: "FP", tint: "#1493FF", badge: "CFTC", volume24h: null },
  { id: "crp", name: "Crypto.com Predictions", mono: "CR", tint: "#1199FA", badge: "Blockchain", volume24h: 980_000 },
  { id: "pit", name: "PredictIt", mono: "PI", tint: "#E2574C", badge: "Regulated", volume24h: 340_000 },
  { id: "lim", name: "Limitless", mono: "LM", tint: "#B37CFF", badge: "Blockchain", volume24h: 710_000 },
  { id: "bfx", name: "Betfair Exchange", mono: "BX", tint: "#FFB80C", badge: "Exchange", volume24h: 28_400_000 },
];

export const FANTASY_PLATFORMS: FantasyPlatform[] = [
  { id: "pp", name: "PrizePicks", mono: "PP", tint: "#7C5CFF", style: "Pick'em" },
  { id: "ud", name: "Underdog Fantasy", mono: "UD", tint: "#F1C04A", style: "Pick'em" },
  { id: "sl", name: "Sleeper", mono: "SL", tint: "#FF6B2B", style: "Season" },
  { id: "db", name: "Dabble", mono: "DB", tint: "#00D1C1", style: "Pick'em" },
  { id: "pl", name: "ParlayPlay", mono: "PL", tint: "#39B3FF", style: "Pick'em" },
  { id: "btr", name: "Betr", mono: "BT", tint: "#FF3B5C", style: "Micro" },
];

export function formatVolume(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}
