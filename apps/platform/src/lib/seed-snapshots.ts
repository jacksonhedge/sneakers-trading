import type { MarketSnapshot } from './markets-data'

// Seed market data — fallback when both Timescale and JSONL return empty.
// Used to keep the dashboard visually populated on production while the real
// scraper-to-Timescale pipeline is still being wired up (see
// docs/prompts/railway-setup-scrapers.md). Remove this fallback once live
// data flows through to prod.
//
// Every row is a realistic snapshot shape (matches what scrapers emit). No
// made-up platforms; every market points at a venue we actually track so
// the trade buttons + wrapper logic still resolves.

const NOW = new Date().toISOString()
const IN_2H = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
const IN_6H = new Date(Date.now() + 6 * 3600 * 1000).toISOString()
const IN_24H = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
const IN_72H = new Date(Date.now() + 72 * 3600 * 1000).toISOString()

export const SEED_SNAPSHOTS: MarketSnapshot[] = [
  // ── Sports — moneylines
  {
    platform: 'novig',
    platform_market_id: 'seed-mlb-yanks-redsox',
    question: 'BOS — New York Yankees @ Boston Red Sox',
    tags: ['baseball', 'MLB', 'MONEY'],
    sport: 'baseball',
    outcomes: [
      { name: 'NYY', best_bid: 0.548, best_ask: 0.561, last_price: 0.555 },
      { name: 'BOS', best_bid: 0.439, best_ask: 0.452, last_price: 0.445 },
    ],
    overround: 1.013,
    volume_traded: 48230,
    liquidity: 15400,
    starts_at: IN_2H,
    resolves_at: IN_6H,
    phase: 'pre_game',
    ts: NOW,
    change24h: 0.018,
  },
  {
    platform: 'fanduel',
    platform_market_id: 'seed-fd-yanks-redsox',
    question: 'Moneyline — New York Yankees @ Boston Red Sox',
    tags: ['baseball', 'MLB', 'h2h', 'fanduel'],
    sport: 'baseball',
    outcomes: [
      { name: 'New York Yankees', best_bid: null, best_ask: 0.574, last_price: null },
      { name: 'Boston Red Sox', best_bid: null, best_ask: 0.463, last_price: null },
    ],
    overround: 1.037,
    volume_traded: null,
    liquidity: null,
    starts_at: IN_2H,
    resolves_at: IN_6H,
    phase: 'pre_game',
    ts: NOW,
    change24h: 0.022,
  },
  {
    platform: 'draftkings',
    platform_market_id: 'seed-dk-lakers-warriors',
    question: 'Moneyline — Los Angeles Lakers @ Golden State Warriors',
    tags: ['basketball', 'NBA', 'h2h', 'draftkings'],
    sport: 'basketball',
    outcomes: [
      { name: 'Los Angeles Lakers', best_bid: null, best_ask: 0.44, last_price: null },
      { name: 'Golden State Warriors', best_bid: null, best_ask: 0.595, last_price: null },
    ],
    overround: 1.035,
    volume_traded: null,
    liquidity: null,
    starts_at: IN_6H,
    resolves_at: IN_24H,
    phase: 'pre_game',
    ts: NOW,
    change24h: -0.034,
  },
  {
    platform: 'novig',
    platform_market_id: 'seed-nba-lakers-warriors',
    question: 'GSW — Los Angeles Lakers @ Golden State Warriors',
    tags: ['basketball', 'NBA', 'MONEY'],
    sport: 'basketball',
    outcomes: [
      { name: 'LAL', best_bid: 0.413, best_ask: 0.425, last_price: 0.419 },
      { name: 'GSW', best_bid: 0.571, best_ask: 0.584, last_price: 0.578 },
    ],
    overround: 1.009,
    volume_traded: 72400,
    liquidity: 22100,
    starts_at: IN_6H,
    resolves_at: IN_24H,
    phase: 'pre_game',
    ts: NOW,
    change24h: -0.041,
  },
  {
    platform: 'prophetx',
    platform_market_id: 'seed-nhl-rangers-bruins',
    question: 'Moneyline — New York Rangers at Boston Bruins',
    tags: ['ice_hockey', 'NHL', 'moneyline'],
    sport: 'ice_hockey',
    outcomes: [
      { name: 'Boston Bruins -145', best_bid: 0.58, best_ask: 0.594, last_price: 0.587 },
      { name: 'New York Rangers +130', best_bid: 0.428, best_ask: 0.441, last_price: 0.435 },
    ],
    overround: 1.035,
    volume_traded: 18900,
    liquidity: 7200,
    starts_at: IN_2H,
    resolves_at: IN_6H,
    phase: 'pre_game',
    ts: NOW,
    change24h: 0.011,
  },
  {
    platform: 'betmgm',
    platform_market_id: 'seed-betmgm-rangers-bruins',
    question: 'Moneyline — New York Rangers @ Boston Bruins',
    tags: ['ice_hockey', 'NHL', 'h2h', 'betmgm'],
    sport: 'ice_hockey',
    outcomes: [
      { name: 'Boston Bruins', best_bid: null, best_ask: 0.606, last_price: null },
      { name: 'New York Rangers', best_bid: null, best_ask: 0.455, last_price: null },
    ],
    overround: 1.061,
    volume_traded: null,
    liquidity: null,
    starts_at: IN_2H,
    resolves_at: IN_6H,
    phase: 'pre_game',
    ts: NOW,
    change24h: 0.014,
  },
  // Player props (NoVig)
  {
    platform: 'novig',
    platform_market_id: 'seed-prop-tatum',
    question: 'Jayson Tatum 27.5 POINTS — New York Knicks @ Boston Celtics',
    tags: ['basketball', 'NBA', 'POINTS'],
    sport: 'basketball',
    outcomes: [
      { name: 'Over 27.5', best_bid: 0.508, best_ask: 0.522, last_price: 0.515 },
      { name: 'Under 27.5', best_bid: 0.478, best_ask: 0.492, last_price: 0.485 },
    ],
    overround: 1.014,
    volume_traded: 31200,
    liquidity: 9800,
    starts_at: IN_6H,
    resolves_at: IN_24H,
    phase: 'pre_game',
    ts: NOW,
    change24h: 0.005,
  },

  // ── Prediction markets — politics, economics, crypto
  {
    platform: 'kalshi',
    platform_market_id: 'seed-kalshi-fedrate',
    question: 'Will the Fed cut rates by 25bps at the next meeting?',
    tags: ['economics', 'FED', 'rates'],
    sport: undefined,
    outcomes: [
      { name: 'Yes', best_bid: 0.68, best_ask: 0.7, last_price: 0.69 },
      { name: 'No', best_bid: 0.3, best_ask: 0.32, last_price: 0.31 },
    ],
    overround: 1.02,
    volume_traded: 184000,
    liquidity: 52000,
    starts_at: NOW,
    resolves_at: IN_72H,
    phase: 'live',
    ts: NOW,
    change24h: 0.082,
  },
  {
    platform: 'polymarket',
    platform_market_id: 'seed-poly-btc100k',
    question: 'Will Bitcoin close above $100k by end of month?',
    tags: ['crypto', 'bitcoin'],
    sport: 'crypto',
    outcomes: [
      { name: 'Yes', best_bid: 0.42, best_ask: 0.435, last_price: 0.428 },
      { name: 'No', best_bid: 0.565, best_ask: 0.58, last_price: 0.572 },
    ],
    overround: 1.015,
    volume_traded: 2450000,
    liquidity: 320000,
    starts_at: NOW,
    resolves_at: IN_72H,
    phase: 'live',
    ts: NOW,
    change24h: -0.058,
  },
  {
    platform: 'kalshi',
    platform_market_id: 'seed-kalshi-election',
    question: '2026 midterm senate control — Democrats',
    tags: ['politics', 'elections'],
    sport: undefined,
    outcomes: [
      { name: 'Yes', best_bid: 0.47, best_ask: 0.49, last_price: 0.48 },
      { name: 'No', best_bid: 0.51, best_ask: 0.53, last_price: 0.52 },
    ],
    overround: 1.02,
    volume_traded: 412000,
    liquidity: 88000,
    starts_at: NOW,
    resolves_at: IN_72H,
    phase: 'live',
    ts: NOW,
    change24h: 0.027,
  },
  {
    platform: 'kalshi',
    platform_market_id: 'seed-kalshi-ethereum',
    question: 'ETH price > $4000 at end of week?',
    tags: ['crypto', 'ethereum'],
    sport: 'crypto',
    outcomes: [
      { name: 'Yes', best_bid: 0.62, best_ask: 0.635, last_price: 0.627 },
      { name: 'No', best_bid: 0.365, best_ask: 0.38, last_price: 0.373 },
    ],
    overround: 1.015,
    volume_traded: 98000,
    liquidity: 41000,
    starts_at: NOW,
    resolves_at: IN_24H,
    phase: 'live',
    ts: NOW,
    change24h: 0.039,
  },
  {
    platform: 'polymarket',
    platform_market_id: 'seed-poly-apple-earnings',
    question: 'Will Apple report EPS above $2.15 this quarter?',
    tags: ['economics', 'companies', 'earnings'],
    sport: undefined,
    outcomes: [
      { name: 'Yes', best_bid: 0.755, best_ask: 0.77, last_price: 0.762 },
      { name: 'No', best_bid: 0.23, best_ask: 0.245, last_price: 0.238 },
    ],
    overround: 1.015,
    volume_traded: 67000,
    liquidity: 28000,
    starts_at: NOW,
    resolves_at: IN_72H,
    phase: 'live',
    ts: NOW,
    change24h: 0.012,
  },
  {
    platform: 'og',
    platform_market_id: 'seed-og-btc-week',
    question: 'BTC weekly close above $95k?',
    tags: ['crypto', 'bitcoin'],
    sport: 'crypto',
    outcomes: [
      { name: 'Yes', best_bid: 0.59, best_ask: 0.605, last_price: 0.597 },
      { name: 'No', best_bid: 0.395, best_ask: 0.41, last_price: 0.402 },
    ],
    overround: 1.015,
    volume_traded: 22000,
    liquidity: 11000,
    starts_at: NOW,
    resolves_at: IN_72H,
    phase: 'live',
    ts: NOW,
    change24h: -0.024,
  },
]

/**
 * Helper: returns seed snapshots if the primary data path came back empty AND
 * the SNEAKERS_ENABLE_SEED env flag is set. Call at the end of the loader
 * chain so real data is always preferred when it's available.
 */
export function seedFallback(real: MarketSnapshot[]): MarketSnapshot[] {
  if (real.length > 0) return real
  if (process.env.SNEAKERS_ENABLE_SEED !== '1') return real
  return SEED_SNAPSHOTS
}
