export type ArbRow = {
  id: string;
  event: string;
  league: "NBA" | "NFL" | "MLB" | "NHL" | "MMA" | "SOC" | "TEN" | "PRED";
  platformA: { name: string; odds: string; side: string };
  platformB: { name: string; odds: string; side: string };
  edgeBps: number; // basis points, e.g. 185 = 1.85%
  windowSec: number;
};

export const MOCK_ARB_FEED: ArbRow[] = [
  {
    id: "arb-001",
    event: "LAL @ BOS · ML",
    league: "NBA",
    platformA: { name: "Pinnacle", odds: "+118", side: "LAL" },
    platformB: { name: "DraftKings", odds: "-102", side: "BOS" },
    edgeBps: 214,
    windowSec: 42,
  },
  {
    id: "arb-002",
    event: "Chiefs -3.5 · Spread",
    league: "NFL",
    platformA: { name: "bet365", odds: "-108", side: "KC -3.5" },
    platformB: { name: "Caesars", odds: "+112", side: "PHI +3.5" },
    edgeBps: 186,
    windowSec: 18,
  },
  {
    id: "arb-003",
    event: "Kalshi: Fed cuts 25bps May",
    league: "PRED",
    platformA: { name: "Kalshi", odds: "62¢", side: "YES" },
    platformB: { name: "Polymarket", odds: "41¢", side: "NO" },
    edgeBps: 298,
    windowSec: 120,
  },
];

export const LIVE_STATS = {
  markets: 142,
  platforms: 18,
  arbOpps: 23,
  pnlToday: 482.37,
  pnlPct: 3.24,
  engineLatencyMs: 84,
};

/* ------------------------------------------------------------------ */
/*  Left panel — bankroll + connected books                           */
/* ------------------------------------------------------------------ */

export const BANKROLL = {
  total: 4280.5,
  todayPnl: 142.3,
  todayPct: 3.44,
};

export type ConnectedBook = {
  platformId: string;  // matches lib/platforms.ts id
  name: string;
  tint: string;
  mono: string;
  balance: number;
};

export const CONNECTED_BOOKS: ConnectedBook[] = [
  { platformId: "dk",         name: "DraftKings",  tint: "#53D337", mono: "DK", balance: 1200.0 },
  { platformId: "fd",         name: "FanDuel",     tint: "#1493FF", mono: "FD", balance: 850.0 },
  { platformId: "kalshi",     name: "Kalshi",      tint: "#00C48C", mono: "KL", balance: 980.5 },
  { platformId: "polymarket", name: "Polymarket",  tint: "#2F6BFF", mono: "PM", balance: 1250.0 },
];

// Which platform IDs are "connected" — drives the green/gray dot in the mega menu
export const CONNECTED_PLATFORM_IDS = new Set(
  CONNECTED_BOOKS.map((b) => b.platformId).concat(["pin", "bfex", "rh"]),
);

/* ------------------------------------------------------------------ */
/*  Watchlist / Tracking                                              */
/* ------------------------------------------------------------------ */

export type WatchItem = {
  id: string;
  name: string;
  platform: string;
  lastCents: number;
  edgeCents: number; // signed
};

export const WATCHLIST: WatchItem[] = [
  { id: "w1", name: "Lakers ML Tonight",   platform: "Kalshi",     lastCents: 62, edgeCents:  4.3 },
  { id: "w2", name: "Fed Rate Cut May",    platform: "Polymarket", lastCents: 58, edgeCents:  2.1 },
  { id: "w3", name: "BTC >70k Friday",     platform: "Polymarket", lastCents: 41, edgeCents: -1.2 },
  { id: "w4", name: "Chiefs -3.5 Sunday",  platform: "DraftKings", lastCents: 71, edgeCents:  3.8 },
  { id: "w5", name: "UFC 308 Topuria ML",  platform: "Pinnacle",   lastCents: 64, edgeCents:  1.6 },
  { id: "w6", name: "Alcaraz Over 2.5 Sets", platform: "bet365",   lastCents: 52, edgeCents:  0.9 },
];

/* ------------------------------------------------------------------ */
/*  Selected market — drives the center chart panel                   */
/* ------------------------------------------------------------------ */

export type Candle = {
  time: number;  // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const SELECTED_MARKET = {
  id: "lakers-ml-tonight",
  question: "Will the Lakers win tonight?",
  platform: "KALSHI",
  side: "YES",
  last: 62.4,
  change: 3.2,
  changePct: 5.4,
  volume24h: 84_320,
  liquidity: 12_400,
  open: 58.0,
  high: 65.0,
  low: 54.0,
  close: 62.4,
};

export const CROSS_PLATFORM_PRICES: {
  platform: string;
  mono: string;
  tint: string;
  priceCents: number;
}[] = [
  { platform: "Kalshi",     mono: "KL", tint: "#00C48C", priceCents: 62.4 },
  { platform: "Polymarket", mono: "PM", tint: "#2F6BFF", priceCents: 58.1 },
  { platform: "Robinhood",  mono: "RH", tint: "#CDFF00", priceCents: 61.0 },
  { platform: "DK Predict", mono: "DP", tint: "#53D337", priceCents: 60.2 },
];

/* ------------------------------------------------------------------ */
/*  Deterministic candle series — server & client must agree          */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a deterministic OHLCV candle series so SSR and client hydration
 * render identical values — no Math.random() drift.
 */
export function buildCandles(count = 180, startPrice = 58, seed = 1337): Candle[] {
  const rand = mulberry32(seed);
  const out: Candle[] = [];
  let price = startPrice;
  const now = 1_745_000_000; // fixed anchor so SSR/CSR match
  const stepSec = 60; // 1-minute candles

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.48) * 1.6;
    const vol = 0.9 + rand() * 1.2;
    const open = price;
    const close = Math.max(1, Math.min(99, open + drift));
    const hi = Math.max(open, close) + rand() * vol;
    const lo = Math.min(open, close) - rand() * vol;
    const volume = Math.round(200 + rand() * 1800);
    out.push({
      time: now - (count - i) * stepSec,
      open: round2(open),
      high: round2(Math.min(99, hi)),
      low: round2(Math.max(1, lo)),
      close: round2(close),
      volume,
    });
    price = close;
  }
  return out;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  Right panel — order book + recent trades + positions              */
/* ------------------------------------------------------------------ */

export type OrderBookLevel = { priceCents: number; size: number };

export const ORDER_BOOK: { bids: OrderBookLevel[]; asks: OrderBookLevel[] } = {
  bids: [
    { priceCents: 62.3, size: 1240 },
    { priceCents: 62.1, size: 2400 },
    { priceCents: 61.9, size: 3150 },
    { priceCents: 61.5, size: 4820 },
    { priceCents: 60.8, size: 6100 },
    { priceCents: 60.0, size: 8900 },
  ],
  asks: [
    { priceCents: 62.5, size: 980 },
    { priceCents: 62.7, size: 1640 },
    { priceCents: 63.0, size: 2840 },
    { priceCents: 63.4, size: 3620 },
    { priceCents: 64.1, size: 5200 },
    { priceCents: 65.0, size: 7400 },
  ],
};

export type Trade = {
  id: string;
  priceCents: number;
  size: number;
  side: "BUY" | "SELL";
  ts: string;
};

export const RECENT_TRADES: Trade[] = [
  { id: "t1", priceCents: 62.4, size:  480, side: "BUY",  ts: "14:02:18" },
  { id: "t2", priceCents: 62.3, size:  240, side: "SELL", ts: "14:02:11" },
  { id: "t3", priceCents: 62.4, size: 1200, side: "BUY",  ts: "14:02:02" },
  { id: "t4", priceCents: 62.5, size:  860, side: "BUY",  ts: "14:01:54" },
  { id: "t5", priceCents: 62.2, size:  310, side: "SELL", ts: "14:01:47" },
  { id: "t6", priceCents: 62.4, size:  640, side: "BUY",  ts: "14:01:33" },
  { id: "t7", priceCents: 62.1, size:  180, side: "SELL", ts: "14:01:20" },
  { id: "t8", priceCents: 62.4, size:  920, side: "BUY",  ts: "14:01:08" },
  { id: "t9", priceCents: 62.3, size:  420, side: "SELL", ts: "14:00:54" },
  { id: "t10", priceCents: 62.5, size: 1580, side: "BUY",  ts: "14:00:41" },
];

export type Position = {
  id: string;
  market: string;
  side: "YES" | "NO";
  size: number;
  entry: number;
  last: number;
};

export const OPEN_POSITIONS: Position[] = [
  { id: "p1", market: "Lakers ML Tonight",  side: "YES", size: 400, entry: 58.1, last: 62.4 },
  { id: "p2", market: "Fed Cut May 25bps",  side: "YES", size: 250, entry: 55.0, last: 58.0 },
  { id: "p3", market: "Chiefs -3.5 Sunday", side: "YES", size: 300, entry: 74.2, last: 71.0 },
];

export function formatUsd(n: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  const s =
    abs >= 1000
      ? abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : abs.toFixed(2);
  return `${n < 0 ? "-" : sign}$${s}`;
}
