import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const API = 'https://api.elections.kalshi.com/trade-api/v2';

const TARGETED_SERIES: Record<string, string[]> = {
  nba: [
    'KXNBASPREAD', 'KXNBATOTAL',
    'KXNBAFINMVP', 'KXNBACUP', 'KXNBAMVP', 'KXNBACHAMP',
    'KXNBAEAST1SEED', 'KXNBAWEST1SEED',
    'KXTEAMSINNBAF', 'KXTEAMSINNBAEF',
    'KXNBAFINALSMVP', 'KXNBAROTY',
  ],
  nfl: [
    'KXNFLMVP', 'KXNFLPLAYOFF', 'KXNFLSBMVP', 'KXNFLPROBOWL',
    'KXNFLCHAMP', 'KXNFLDEFROTY', 'KXNFLOFFROTY',
  ],
  mlb: [
    'KXMLBALMVP', 'KXMLBNLMVP', 'KXMLBALROTY', 'KXMLBNLROTY',
    'KXMLBTOTAL', 'KXMLBSPREAD',
  ],
  nhl: [
    'KXNHLCHAMP', 'KXNHLMVP', 'KXNHLTOTAL', 'KXNHLSPREAD',
  ],
  soccer: [
    'KXPREMIERCHAMP', 'KXLALIGAGAME', 'KXUEFANLGAME',
  ],
  crypto: [
    'BITCOINMAXY', 'BTCMAXM', 'BTCATH', 'KXBTC2026200',
    'KXETHD', 'KXSOLMAXMON', 'KXDOGE', 'KXCOUNTRYBTC',
    'KXSOLNASDAQ', 'KXSOLFLIPETH', 'KXBTCVSGOLD', 'KXSOLE',
    'KXSOLTXCOUNT', 'KXTETHERPAUSE',
  ],
  politics: [
    'KXGOVTSHUTDOWN', 'KXFEDCHAIRCONFIRM', 'KXCRYPTOEXEMP',
    'PRESPARTYUT', 'PRESPARTYMA', 'PRESPARTYNV', 'PRESPARTYFL',
  ],
  economics: [
    'LCPIMAX', 'KXGDPYEAR', 'KXRATEHIKE', 'KXCPIFOOD',
    'FED', 'KXCPISHELTER', 'LCPIMIN', 'KXCHCPIYOY',
    'KXGDPW', 'KXGDPEU',
  ],
  financials: [
    'KXGOLDPRICE', 'DOLLARFED', 'KXRHSTOCKTOKEN',
  ],
  entertainment: [
    'KXTRUMPNOBEL', 'KXEMMYLIMITEDACTO', 'KXLATINGRAMMYSOTY',
    'OSCARNOMACTR', 'KXOSCARCOSTUME',
  ],
  companies: [
    'KXIPOCLUELY', 'KXIPOOURA', 'KXIPO', 'KXIPOGLEAN',
    'KXIPOANTHROPIC', 'KXIPOANDURIL', 'KXIPOBEASTINDUSTRIES',
    'KXFSDMARKET',
  ],
};

interface KalshiEvent {
  event_ticker: string;
  series_ticker?: string;
  title: string;
  sub_title?: string;
  category?: string;
  markets?: KalshiMarket[];
}

interface KalshiMarket {
  ticker: string;
  event_ticker?: string;
  title: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status?: string;
  close_time?: string;
  open_time?: string;
  market_type?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  liquidity_dollars?: string;
  volume_fp?: number;
  volume_24h_fp?: number;
  yes_bid_size_fp?: number;
  yes_ask_size_fp?: number;
}

async function fetchJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 429) {
    if (attempt >= 4) throw new Error(`429 after ${attempt} retries`);
    const delay = 1000 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, delay));
    return fetchJson<T>(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

async function fetchSeriesEvents(seriesTicker: string): Promise<KalshiEvent[]> {
  const q = new URLSearchParams({
    series_ticker: seriesTicker,
    status: 'open',
    limit: '100',
    with_nested_markets: 'true',
  });
  try {
    const data = await fetchJson<{ events: KalshiEvent[] }>(`${API}/events?${q}`);
    return data.events || [];
  } catch (e) {
    console.warn(`  ${seriesTicker}: ${(e as Error).message}`);
    return [];
  }
}

function parseDollar(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function computePhase(openIso?: string, closeIso?: string): MarketPhase {
  const now = Date.now();
  const open = openIso ? Date.parse(openIso) : NaN;
  const close = closeIso ? Date.parse(closeIso) : NaN;
  if (!Number.isNaN(close) && now > close) return 'closed';
  if (!Number.isNaN(open) && now > open) return 'live';
  if (!Number.isNaN(open) && open - now < 6 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function marketToSnapshot(m: KalshiMarket, sport: string, ts: string): MarketSnapshot | null {
  const yesBid = parseDollar(m.yes_bid_dollars);
  const yesAsk = parseDollar(m.yes_ask_dollars);
  const noBid = parseDollar(m.no_bid_dollars);
  const noAsk = parseDollar(m.no_ask_dollars);
  const last = parseDollar(m.last_price_dollars);
  const liquidity = parseDollar(m.liquidity_dollars);

  const yesLabel = m.yes_sub_title || 'Yes';
  const noLabel = m.no_sub_title || 'No';
  const outcomes = [
    { name: yesLabel, best_bid: yesBid, best_ask: yesAsk, last_price: last },
    { name: noLabel, best_bid: noBid, best_ask: noAsk, last_price: last != null ? 1 - last : null },
  ];
  const overround = computeOverround([yesAsk, noAsk]);
  const question = m.yes_sub_title && m.yes_sub_title !== m.title
    ? `${m.title} — ${m.yes_sub_title}`
    : m.title;

  return {
    platform: 'kalshi',
    platform_market_id: m.ticker,
    question,
    tags: [sport, m.event_ticker ?? ''].filter(Boolean),
    sport,
    outcomes,
    overround,
    volume_traded: m.volume_24h_fp ?? m.volume_fp ?? null,
    liquidity,
    starts_at: m.open_time,
    resolves_at: m.close_time,
    phase: computePhase(m.open_time, m.close_time),
    ts,
  };
}

export async function scrapeKalshi(opts: { delayMs?: number } = {}): Promise<MarketSnapshot[]> {
  const delay = opts.delayMs ?? 250;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  for (const [sport, seriesList] of Object.entries(TARGETED_SERIES)) {
    let sportCount = 0;
    for (const seriesTicker of seriesList) {
      await new Promise((r) => setTimeout(r, delay));
      const events = await fetchSeriesEvents(seriesTicker);
      for (const ev of events) {
        for (const m of ev.markets || []) {
          if (m.status !== 'active') continue;
          const snap = marketToSnapshot(m, sport, ts);
          if (snap) { all.push(snap); sportCount++; }
        }
      }
    }
    console.log(`  ${sport}: ${sportCount} active markets`);
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/kalshi');
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
    const vol = r.volume_traded != null ? String(Math.round(r.volume_traded)) : '—';
    console.log(`  ${or.padStart(7)}%  vol=${vol.padEnd(8)} [${r.sport}]  ${r.question.slice(0, 90)}`);
  }
}

async function main() {
  console.log('Scraping Kalshi (sports + crypto + politics + economics + entertainment + companies)...');
  const t0 = Date.now();
  const snapshots = await scrapeKalshi({ delayMs: 250 });
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
