import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');
const API = 'https://api.limitless.exchange';

interface LimitlessMarket {
  id: string;
  title: string;
  proxyTitle?: string;
  description?: string;
  expirationDate?: string;
  expirationTimestamp?: number;
  createdAt?: string;
  updatedAt?: string;
  categories?: string[];
  status?: string;
  expired?: boolean;
  hidden?: boolean;
  tags?: string[];
  volume?: string | number;
  volumeFormatted?: string;
  prices?: [number, number];
  collateralToken?: { symbol?: string; decimals?: number; address?: string } | string;
}

function inferSport(tags?: string[], categories?: string[]): string {
  const all = [...(tags ?? []), ...(categories ?? [])].map((s) => s.toLowerCase());
  if (all.some((t) => /btc|bitcoin/.test(t))) return 'bitcoin';
  if (all.some((t) => /eth|ethereum/.test(t))) return 'ethereum';
  if (all.some((t) => /\bsol\b|solana/.test(t))) return 'solana';
  if (all.some((t) => /crypto|defi|memecoin|altcoin|xrp|doge|ada/.test(t))) return 'crypto';
  if (all.some((t) => /nba|nfl|mlb|nhl|sport/.test(t))) return 'sports';
  if (all.some((t) => /politics|election/.test(t))) return 'politics';
  return all[0] || 'unknown';
}

// Limitless is an AMM market: `prices` are implied probabilities (Yes+No≈1.00),
// not an orderbook. We use them as best_ask; there is no distinct best_bid.
// overround will always be ~1.00 — Limitless is not useful for the overround
// ranker but is valuable for short-duration crypto exposure (Minute Markets).
function computePhase(endIso?: string): MarketPhase {
  const now = Date.now();
  const end = endIso ? Date.parse(endIso) : NaN;
  if (Number.isNaN(end)) return 'opening';
  const toEnd = end - now;
  if (toEnd <= 0) return 'closed';
  if (toEnd <= 3 * 60 * 60 * 1000) return 'live';
  if (toEnd <= 24 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function marketToSnapshot(m: LimitlessMarket, ts: string): MarketSnapshot | null {
  if (m.expired || m.hidden) return null;
  if (!Array.isArray(m.prices) || m.prices.length < 2) return null;
  // Limitless occasionally returns malformed prices (e.g. yes=50.0 on the
  // Gold/PAXG market) — anything outside [0,1] is invalid for an implied
  // probability and would overflow our numeric(6,5) price columns. Drop
  // the market entirely rather than ingesting a corrupted row.
  const sane = (p: number | null | undefined): boolean => p == null || (p >= 0 && p <= 1);
  if (!sane(m.prices[0]) || !sane(m.prices[1])) return null;
  const [yesPrice, noPrice] = m.prices;
  if (yesPrice == null && noPrice == null) return null;

  const sport = inferSport(m.tags, m.categories);
  const outcomes = [
    { name: 'Yes', best_bid: null, best_ask: yesPrice ?? null, last_price: yesPrice ?? null },
    { name: 'No', best_bid: null, best_ask: noPrice ?? null, last_price: noPrice ?? null },
  ];
  const overround = computeOverround([yesPrice ?? null, noPrice ?? null]);
  // Limitless reports `volume` in raw collateral-token base units (e.g. USDC
  // has 6 decimals → 652,968,808,000 raw = $652,968.81 actual). Without this
  // conversion, big rows overflow our numeric(14,2) volume_traded column.
  const ct = typeof m.collateralToken === 'object' ? m.collateralToken : null;
  const decimals = typeof ct?.decimals === 'number' ? ct.decimals : 6; // default USDC
  const volRaw = typeof m.volume === 'number' ? m.volume : m.volume ? parseFloat(String(m.volume)) : NaN;
  const volume = Number.isFinite(volRaw) ? volRaw / Math.pow(10, decimals) : null;

  // expirationDate is just "Apr 26, 2026" (no time) — useless for minute markets.
  // expirationTimestamp is epoch ms with full precision; convert that to ISO.
  const resolvesIso = typeof m.expirationTimestamp === 'number'
    ? new Date(m.expirationTimestamp).toISOString()
    : undefined;

  return {
    platform: 'limitless',
    platform_market_id: m.id,
    question: m.title || m.proxyTitle || '',
    tags: Array.from(new Set([sport, ...(m.tags ?? []), ...(m.categories ?? [])])).filter(Boolean) as string[],
    sport,
    outcomes,
    overround,
    volume_traded: volume,
    liquidity: null,
    starts_at: m.createdAt,
    resolves_at: resolvesIso,
    phase: computePhase(resolvesIso),
    ts,
  };
}

async function fetchPage(page: number, attempt = 0): Promise<{ data: LimitlessMarket[]; totalMarketsCount: number }> {
  const res = await fetch(`${API}/markets/active?limit=25&page=${page}`, {
    headers: { accept: 'application/json' },
  });
  if (res.status === 429) {
    if (attempt >= 4) throw new Error(`429 after ${attempt} retries on page ${page}`);
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    return fetchPage(page, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for /markets/active page=${page}`);
  return res.json() as Promise<{ data: LimitlessMarket[]; totalMarketsCount: number }>;
}

export async function scrapeLimitless(opts: { delayMs?: number; maxPages?: number } = {}): Promise<MarketSnapshot[]> {
  const delay = opts.delayMs ?? 250;
  const maxPages = opts.maxPages ?? 50;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await new Promise((r) => setTimeout(r, delay));
    let res;
    try {
      res = await fetchPage(page);
    } catch (e) {
      console.warn(`  page ${page}: ${(e as Error).message}`);
      break;
    }
    total = res.totalMarketsCount;
    if (!res.data.length) break;
    for (const m of res.data) {
      const s = marketToSnapshot(m, ts);
      if (s) all.push(s);
    }
    if (page * 25 >= total) break;
  }
  console.log(`  Limitless: ${all.length} active markets ingested (of ${total} listed)`);
  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/limitless');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`);
  const lines = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(file, lines, { flag: 'a' });
  return file;
}

function formatMinuteMarkets(snapshots: MarketSnapshot[], n = 15) {
  const rows = snapshots
    .filter((s) => s.resolves_at)
    .map((s) => ({ ...s, minLeft: (Date.parse(s.resolves_at!) - Date.now()) / 60000 }))
    .filter((s) => s.minLeft > 0 && s.minLeft <= 60)
    .sort((a, b) => a.minLeft - b.minLeft)
    .slice(0, n);
  if (!rows.length) {
    console.log('\nNo markets resolving within the next 60 minutes.');
    return;
  }
  console.log('\nMinute markets (closest expiry first):');
  for (const r of rows) {
    const yesAsk = r.outcomes[0]?.best_ask;
    const yes = yesAsk != null ? `yes=${yesAsk.toFixed(3)}` : 'yes=—';
    const vol = r.volume_traded != null ? `vol=$${Math.round(r.volume_traded).toLocaleString()}` : 'vol=—';
    console.log(`  ${r.minLeft.toFixed(1).padStart(5)}min  ${yes}  ${vol.padEnd(14)} [${r.sport}]  ${r.question.slice(0, 80)}`);
  }
}

async function main() {
  console.log('Scraping Limitless...');
  const t0 = Date.now();
  const snapshots = await scrapeLimitless();
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} markets scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);

  const { syncSnapshotsToDb } = await import('../utils/db-write.js');
  await syncSnapshotsToDb(snapshots);

  formatMinuteMarkets(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
