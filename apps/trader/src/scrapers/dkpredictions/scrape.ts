import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

// =============================================================================
// SCAFFOLD — incomplete until API capture lands
// =============================================================================
//
// DraftKings Predictions (Railbird-backed CFTC DCM, launched Dec 2025).
// Distinct product from DK Sportsbook. Web entry: predictions.draftkings.com
//
// The site is a SPA — the markets API is hardcoded inside minified JS bundles
// and only reachable from a logged-in session. To finish this scraper:
//
//   1. Run docs/prompts/capture-dk-predictions-api.md against Claude Chrome.
//   2. It returns: API_BASE URL, markets-list endpoint shape, single response
//      sample, and the auth header pattern (likely a Bearer JWT).
//   3. Fill in the TODO sections below with those captures.
//   4. Drop the captured token into apps/trader/.env:
//        DKPREDICTIONS_BEARER_TOKEN=eyJ...
//   5. Run `pnpm scrape:dkpredictions` to verify.
//
// Reference shape: prophetx/scrape.ts is the closest analog (also CFTC DCM
// CLOB, JWT auth captured from browser session).
//
// =============================================================================

// TODO(capture): replace with the real API base captured from the Network tab.
const BASE = 'https://api.draftkings.com'; // PLACEHOLDER — likely something like predictions-api.draftkings.com or a regional CDN

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

function authHeaders(): Record<string, string> {
  const token = process.env.DKPREDICTIONS_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      'DKPREDICTIONS_BEARER_TOKEN not set.\n' +
      'Capture the token via docs/prompts/capture-dk-predictions-api.md, then:\n' +
      '  pnpm token:set -- dkpredictions "eyJ..."\n' +
      '(or add DKPREDICTIONS_BEARER_TOKEN=... to apps/trader/.env directly)',
    );
  }
  // TODO(capture): Add any extra headers the captured cURL has (X-Client-Version,
  // X-Region, etc.). DK SPAs usually require a few — copy them verbatim.
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`DK Predictions auth failed (${res.status}) — token expired. Re-capture from a logged-in session.`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

// TODO(capture): Replace these with the actual response shape from the captured
// API. Fields here are EDUCATED GUESSES based on typical CFTC DCM CLOB shapes
// (kalshi/polymarket/og). Adjust to match the real response.
interface DkpEvent {
  id: string;
  title: string;
  category?: string;
  scheduled?: string; // event start
  closes_at?: string; // resolution / payout time
  status?: string;
  markets?: DkpMarket[];
}

interface DkpMarket {
  id: string;
  event_id?: string;
  title: string;
  outcomes?: DkpOutcome[];
  volume?: number | string;
  liquidity?: number | string;
  status?: string;
}

interface DkpOutcome {
  id: string;
  name: string;
  yes_ask?: number;
  yes_bid?: number;
  no_ask?: number;
  no_bid?: number;
  last_price?: number;
}

function computePhase(scheduledIso?: string): MarketPhase {
  if (!scheduledIso) return 'opening';
  const now = Date.now();
  const start = Date.parse(scheduledIso);
  if (Number.isNaN(start)) return 'opening';
  if (now > start + 4 * 60 * 60 * 1000) return 'closed';
  if (now > start) return 'live';
  if (start - now < 6 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function inferSport(title: string, category?: string): string {
  const haystack = `${category ?? ''} ${title}`.toLowerCase();
  if (/nba|basketball/.test(haystack)) return 'basketball';
  if (/nfl|football/.test(haystack)) return 'football';
  if (/mlb|baseball/.test(haystack)) return 'baseball';
  if (/nhl|hockey/.test(haystack)) return 'hockey';
  if (/btc|bitcoin|eth|ethereum|sol|solana|crypto/.test(haystack)) return 'crypto';
  if (/election|politics|congress|president/.test(haystack)) return 'politics';
  if (/cpi|gdp|fed|jobs|economy|economics/.test(haystack)) return 'economics';
  return category?.toLowerCase() ?? 'unknown';
}

function marketToSnapshot(event: DkpEvent, market: DkpMarket, ts: string): MarketSnapshot | null {
  if (market.status && market.status !== 'active' && market.status !== 'open') return null;
  const sides = market.outcomes ?? [];
  if (sides.length < 2) return null;

  // TODO(capture): The captured response will reveal whether outcomes carry
  // both yes_ask AND no_ask, OR just one side with the inverse implied. Most
  // CFTC DCM CLOBs (kalshi, polymarket) carry both explicitly. Adjust if not.
  const outcomes = sides.map((o) => ({
    name: o.name,
    best_bid: o.yes_bid ?? null,
    best_ask: o.yes_ask ?? null,
    last_price: o.last_price ?? null,
  }));

  const overround = computeOverround(outcomes.map((o) => o.best_ask));
  const sport = inferSport(market.title || event.title, event.category);

  return {
    platform: 'dkpredictions',
    platform_market_id: market.id,
    question: market.title || event.title,
    tags: [sport, event.category ?? ''].filter(Boolean) as string[],
    sport,
    outcomes,
    overround,
    volume_traded: typeof market.volume === 'number' ? market.volume : market.volume ? parseFloat(String(market.volume)) : null,
    liquidity: typeof market.liquidity === 'number' ? market.liquidity : market.liquidity ? parseFloat(String(market.liquidity)) : null,
    starts_at: event.scheduled,
    resolves_at: event.closes_at,
    phase: computePhase(event.scheduled),
    ts,
  };
}

export async function scrapeDkPredictions(opts: { delayMs?: number } = {}): Promise<MarketSnapshot[]> {
  const delay = opts.delayMs ?? 250;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  // TODO(capture): replace `/PATH/TO/EVENTS` and `/PATH/TO/MARKETS` with the
  // actual captured paths. Likely shape: GET /events?status=open returns a
  // list with embedded markets, OR GET /events then a per-event GET /markets.
  // Use the kalshi/og pattern — series-list → events-per-series → markets.
  throw new Error(
    'DK Predictions scraper is incomplete — API endpoints not yet captured. ' +
      'Run docs/prompts/capture-dk-predictions-api.md against Claude Chrome to capture the cURL, ' +
      'then fill in the TODO sections in this file.',
  );

  // Once endpoints are known, replace the above with something like:
  //
  // const events = await fetchJson<{ events: DkpEvent[] }>(`${BASE}/events?status=open&limit=500`);
  // for (const ev of events.events ?? []) {
  //   await new Promise((r) => setTimeout(r, delay));
  //   const detail = await fetchJson<{ markets: DkpMarket[] }>(`${BASE}/events/${ev.id}/markets`);
  //   for (const m of detail.markets ?? []) {
  //     const snap = marketToSnapshot(ev, m, ts);
  //     if (snap) all.push(snap);
  //   }
  // }
  // return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/dkpredictions');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`);
  const lines = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(file, lines, { flag: 'a' });
  return file;
}

async function main() {
  loadEnvFile();
  console.log('Scraping DraftKings Predictions...');
  const t0 = Date.now();
  const snapshots = await scrapeDkPredictions({ delayMs: 250 });
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} markets scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);

  const { syncSnapshotsToDb } = await import('../utils/db-write.js');
  await syncSnapshotsToDb(snapshots);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
