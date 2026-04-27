import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';

const SPORT_TAG_SLUGS = ['nba', 'nfl', 'mlb', 'nhl', 'ncaab', 'ncaaf', 'soccer', 'tennis', 'ufc', 'mma', 'boxing', 'golf'];
const NON_SPORT_TAG_SLUGS = ['crypto', 'bitcoin', 'ethereum', 'solana', 'politics', 'elections', 'economics'];
const DEFAULT_TAG_SLUGS = [...SPORT_TAG_SLUGS, ...NON_SPORT_TAG_SLUGS];

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  tags?: Array<{ slug: string; label: string }>;
  markets?: GammaMarket[];
}

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  volume?: string;
  volume24hr?: number;
  liquidity?: string;
  liquidityNum?: number;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  startDate?: string;
  endDate?: string;
}

interface OrderBookLevel { price: string; size: string; }
interface OrderBook { bids?: OrderBookLevel[]; asks?: OrderBookLevel[]; }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

function parseJsonField<T>(s: string | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

async function fetchOrderBook(tokenId: string): Promise<OrderBook | null> {
  try {
    return await fetchJson<OrderBook>(`${CLOB_BASE}/book?token_id=${tokenId}`);
  } catch { return null; }
}

function bestBid(ob: OrderBook | null): number | null {
  if (!ob?.bids?.length) return null;
  const p = ob.bids.map((l) => parseFloat(l.price)).filter((x) => !Number.isNaN(x));
  return p.length ? Math.max(...p) : null;
}

function bestAsk(ob: OrderBook | null): number | null {
  if (!ob?.asks?.length) return null;
  const p = ob.asks.map((l) => parseFloat(l.price)).filter((x) => !Number.isNaN(x));
  return p.length ? Math.min(...p) : null;
}

// Same bug as Kalshi had: Gamma's `startDate` is the market's trading-open,
// not the underlying event's start — so `now > start` is true for virtually
// every active market and tagging those `live` is wrong. Derive phase from
// time-to-end instead. `endDate` is the resolution deadline.
function computePhase(_startIso: string | undefined, endIso: string | undefined): MarketPhase {
  const now = Date.now();
  const end = endIso ? Date.parse(endIso) : NaN;
  if (Number.isNaN(end)) return 'opening';
  const toEnd = end - now;
  if (toEnd <= 0) return 'closed';
  if (toEnd <= 3 * 60 * 60 * 1000) return 'live';
  if (toEnd <= 24 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

async function fetchEventsForSport(sportSlug: string, limit: number): Promise<GammaEvent[]> {
  const url = `${GAMMA_BASE}/events?tag_slug=${sportSlug}&active=true&closed=false&archived=false&limit=${limit}`;
  return fetchJson<GammaEvent[]>(url);
}

async function scrapeMarket(m: GammaMarket, sport: string, withOrderbook: boolean, ts: string): Promise<MarketSnapshot | null> {
  const outcomes = parseJsonField<string[]>(m.outcomes) ?? [];
  const prices = parseJsonField<string[]>(m.outcomePrices) ?? [];
  const tokenIds = parseJsonField<string[]>(m.clobTokenIds) ?? [];
  if (outcomes.length < 2) return null;

  const outcomeRows = await Promise.all(
    outcomes.map(async (name, i) => {
      const last = parseFloat(prices[i] ?? '');
      const lastPrice = Number.isNaN(last) ? null : last;
      if (!withOrderbook || !tokenIds[i]) {
        return { name, best_bid: null, best_ask: null, last_price: lastPrice };
      }
      const ob = await fetchOrderBook(tokenIds[i]);
      return { name, best_bid: bestBid(ob), best_ask: bestAsk(ob), last_price: lastPrice };
    })
  );

  const askPrices = outcomeRows.map((o) => o.best_ask ?? o.last_price);
  const overround = computeOverround(askPrices);

  return {
    platform: 'polymarket',
    platform_market_id: String(m.id),
    question: m.question,
    tags: [sport],
    sport,
    outcomes: outcomeRows,
    overround,
    volume_traded: m.volume24hr ?? (m.volume ? parseFloat(m.volume) : null),
    liquidity: m.liquidityNum ?? (m.liquidity ? parseFloat(m.liquidity) : null),
    starts_at: m.startDate,
    resolves_at: m.endDate,
    phase: computePhase(m.startDate, m.endDate),
    ts,
  };
}

export async function scrapePolymarket(opts: {
  sports?: string[];
  limit?: number;
  withOrderbook?: boolean;
  maxMarketsPerEvent?: number;
} = {}): Promise<MarketSnapshot[]> {
  const sports = opts.sports ?? DEFAULT_TAG_SLUGS;
  const limit = opts.limit ?? 50;
  const withOrderbook = opts.withOrderbook ?? true;
  const maxPerEvent = opts.maxMarketsPerEvent ?? 40;

  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  for (const sport of sports) {
    let events: GammaEvent[] = [];
    try {
      events = await fetchEventsForSport(sport, limit);
    } catch (e) {
      console.warn(`  ${sport}: fetch failed — ${(e as Error).message}`);
      continue;
    }
    let sportCount = 0;
    for (const ev of events) {
      const mks = (ev.markets ?? []).slice(0, maxPerEvent);
      for (const m of mks) {
        if (m.closed || m.archived) continue;
        const snap = await scrapeMarket(m, sport, withOrderbook, ts);
        if (snap) { all.push(snap); sportCount++; }
      }
    }
    console.log(`  ${sport}: ${events.length} events → ${sportCount} markets`);
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/polymarket');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`);
  const lines = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(file, lines, { flag: 'a' });
  return file;
}

function formatTopByOverround(snapshots: MarketSnapshot[], n = 15) {
  const rows = snapshots
    .filter((s) => s.overround !== null)
    .sort((a, b) => (b.overround! - a.overround!))
    .slice(0, n);
  console.log('\nTop by overround (scanner "look here" signal):');
  for (const r of rows) {
    const or = (r.overround! * 100).toFixed(2);
    const vol = r.volume_traded != null ? `$${Math.round(r.volume_traded).toLocaleString()}` : '—';
    console.log(`  ${or.padStart(7)}%  vol24=${vol.padEnd(12)}  [${r.sport}]  ${r.question.slice(0, 80)}`);
  }
}

function parseArgs(): { limit: number; sports?: string[]; withOrderbook: boolean } {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const withOrderbook = !args.includes('--no-orderbook');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 50;
  const sportsArg = args.find((a) => a.startsWith('--sports='));
  const sports = sportsArg ? sportsArg.slice('--sports='.length).split(',') : undefined;
  return { limit, sports, withOrderbook };
}

async function main() {
  const { limit, sports, withOrderbook } = parseArgs();
  const sportsLabel = sports ? sports.join(',') : 'all';
  console.log(`Scraping Polymarket: sports=${sportsLabel} limit=${limit} orderbook=${withOrderbook}`);
  const t0 = Date.now();
  const snapshots = await scrapePolymarket({ sports, limit, withOrderbook });
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} markets scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);

  const { syncSnapshotsToDb } = await import('../utils/db-write.js');
  await syncSnapshotsToDb(snapshots);

  const withOr = snapshots.filter((s) => s.overround !== null).length;
  console.log(`${withOr} markets have computable overround`);
  formatTopByOverround(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
