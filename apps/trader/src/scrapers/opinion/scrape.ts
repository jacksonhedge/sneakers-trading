import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

// Opinion.trade is a CLOB-based prediction market on BNB Chain. Shape mirrors
// Polymarket (binary YES/NO tokens + orderbook per token), but each market
// exposes yesTokenId / noTokenId separately rather than an outcomes array.
// Auth is via an `apikey` header; keys are approval-based (contact Opinion
// Labs). Public rate limit is 15 req/s per key; page size caps at 20.
const API_BASE = 'https://proxy.opinion.trade:8443/openapi';
const PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 10; // 200 markets/run by default
const REQUEST_DELAY_MS = 80; // ~12 req/s, under the 15 ceiling

function loadEnvFile() {
  const envPath = join(TRADER_ROOT, '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] == null) {
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[m[1]] = val;
    }
  }
}

interface OpinionMarket {
  marketId: string;
  marketTitle: string;
  status?: string;
  statusEnum?: string | number;
  yesTokenId: string;
  noTokenId: string;
  volume?: string | number;
  volume24h?: string | number;
  endDate?: string;
  startDate?: string;
}

interface OpinionOrderLevel { price: string | number; size: string | number; }
interface OpinionOrderBook {
  market?: string;
  tokenId?: string;
  timestamp?: number;
  bids?: OpinionOrderLevel[];
  asks?: OpinionOrderLevel[];
}

interface ApiEnvelope<T> { code?: number; msg?: string; result: T; }

async function fetchJson<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', apikey: apiKey },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Opinion auth failed (${res.status}) — check OPINION_API_KEY (apply at https://docs.opinion.trade)`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

async function fetchMarketPage(page: number, apiKey: string): Promise<OpinionMarket[]> {
  const url = `${API_BASE}/market?status=open&sortBy=volume24h&limit=${PAGE_SIZE}&page=${page}`;
  const env = await fetchJson<ApiEnvelope<{ total?: number; list?: OpinionMarket[] }>>(url, apiKey);
  return env.result?.list ?? [];
}

async function fetchOrderBook(tokenId: string, apiKey: string): Promise<OpinionOrderBook | null> {
  try {
    const url = `${API_BASE}/token/orderbook?token_id=${encodeURIComponent(tokenId)}`;
    const env = await fetchJson<ApiEnvelope<OpinionOrderBook>>(url, apiKey);
    return env.result ?? null;
  } catch { return null; }
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function bestBid(ob: OpinionOrderBook | null): number | null {
  if (!ob?.bids?.length) return null;
  const ps = ob.bids.map((l) => toNum(l.price)).filter((n): n is number => n !== null);
  return ps.length ? Math.max(...ps) : null;
}

function bestAsk(ob: OpinionOrderBook | null): number | null {
  if (!ob?.asks?.length) return null;
  const ps = ob.asks.map((l) => toNum(l.price)).filter((n): n is number => n !== null);
  return ps.length ? Math.min(...ps) : null;
}

function computePhase(status: string | undefined, endIso: string | undefined): MarketPhase {
  const s = (status ?? '').toLowerCase();
  if (s === 'closed' || s === 'resolved' || s === 'settled') return 'closed';
  const end = endIso ? Date.parse(endIso) : NaN;
  if (!Number.isNaN(end) && Date.now() > end) return 'closed';
  return 'live';
}

async function scrapeMarket(m: OpinionMarket, apiKey: string, ts: string): Promise<MarketSnapshot | null> {
  if (!m.yesTokenId || !m.noTokenId) return null;

  const [yesOb, noOb] = await Promise.all([
    fetchOrderBook(m.yesTokenId, apiKey),
    fetchOrderBook(m.noTokenId, apiKey),
  ]);

  const yesBid = bestBid(yesOb);
  const yesAsk = bestAsk(yesOb);
  const noBid = bestBid(noOb);
  const noAsk = bestAsk(noOb);

  const outcomes = [
    { name: 'Yes', best_bid: yesBid, best_ask: yesAsk, last_price: yesAsk ?? yesBid },
    { name: 'No', best_bid: noBid, best_ask: noAsk, last_price: noAsk ?? noBid },
  ];

  const overround = computeOverround([yesAsk, noAsk]);

  return {
    platform: 'opinion',
    platform_market_id: String(m.marketId),
    question: m.marketTitle,
    tags: [],
    outcomes,
    overround,
    volume_traded: toNum(m.volume24h ?? m.volume ?? null),
    liquidity: null,
    starts_at: m.startDate,
    resolves_at: m.endDate,
    phase: computePhase(m.status, m.endDate),
    ts,
  };
}

export async function scrapeOpinion(opts: { maxPages?: number } = {}): Promise<MarketSnapshot[]> {
  loadEnvFile();
  const apiKey = process.env.OPINION_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPINION_API_KEY not set.\n' +
      '  1. Apply for access at https://docs.opinion.trade/developer-guide/opinion-open-api\n' +
      '  2. pnpm token:set -- opinion "your-key-here"\n' +
      '  (or add OPINION_API_KEY=... to apps/trader/.env directly)'
    );
  }

  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  for (let page = 1; page <= maxPages; page++) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    let markets: OpinionMarket[] = [];
    try {
      markets = await fetchMarketPage(page, apiKey);
    } catch (e) {
      console.warn(`  page ${page}: ${(e as Error).message}`);
      break;
    }
    if (markets.length === 0) break;

    let pageSnaps = 0;
    for (const m of markets) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      const snap = await scrapeMarket(m, apiKey, ts);
      if (snap) { all.push(snap); pageSnaps++; }
    }
    console.log(`  page ${page}: ${markets.length} markets → ${pageSnaps} snapshots`);

    if (markets.length < PAGE_SIZE) break; // last page
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/opinion');
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
    console.log(`  ${or.padStart(7)}%  vol24=${vol.padEnd(12)}  ${r.question.slice(0, 80)}`);
  }
}

function parseArgs(): { maxPages: number } {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const p = args.find((a) => a.startsWith('--pages='));
  const maxPages = p ? parseInt(p.slice('--pages='.length), 10) : DEFAULT_MAX_PAGES;
  return { maxPages };
}

async function main() {
  const { maxPages } = parseArgs();
  console.log(`Scraping Opinion.trade: maxPages=${maxPages}`);
  const t0 = Date.now();
  const snapshots = await scrapeOpinion({ maxPages });
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
