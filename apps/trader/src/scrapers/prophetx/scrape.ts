import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';
import { americanToImpliedProb } from '../utils/american-odds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const BASE = 'https://www.prophetx.co';

const SPORT_ID_TO_SLUG: Record<number, string> = {
  1: 'soccer',
  2: 'basketball',
  3: 'baseball',
  4: 'ice_hockey',
  5: 'football',
  6: 'tennis',
  7: 'golf',
  8: 'mma',
  9: 'boxing',
  10: 'motorsport',
};

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
  const token = process.env.PROPHETX_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      'PROPHETX_BEARER_TOKEN not set.\n' +
      'Drop the JWT into apps/trader/.env like:\n' +
      '  PROPHETX_BEARER_TOKEN=eyJ...\n' +
      '(Capture it from your ProphetX session, Network tab, any request\'s Authorization header.)'
    );
  }
  return {
    accept: 'application/json, text/plain, */*',
    __source: 'web',
    'X-Currency': 'cash',
    authorization: `Bearer ${token}`,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`ProphetX auth failed (${res.status}) — token expired. Re-capture a fresh JWT from the browser.`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

interface ProphetXEventListItem {
  id: number;
  name: string;
  sport?: { id: number; name: string };
  tournament?: { id: number; name: string };
  scheduled?: string;
  status?: string;
}

interface ProphetXSelection {
  id: number;
  name?: string;
  displayName?: string;
  competitorId?: number;
  odds: number;
  line: number;
  displayOdds?: string;
  value?: number;
  stake?: number;
  lineID?: string;
  abbreviatedName?: string;
}

interface ProphetXMarket {
  id: number;
  name: string;
  status?: string;
  type?: string;
  subType?: string;
  categoryID?: number;
  categoryName?: string;
  sportEventId?: number;
  totalStake?: number;
  selections?: Array<ProphetXSelection[] | null>;
  outcomes?: Array<{ id: number; name?: string; competitorId?: number; lineID?: string }>;
}

interface ProphetXEventDetail {
  sport?: { id: number; name: string };
  category?: { id: number; name: string };
  tournament?: { id: number; name: string };
  sportEvent?: {
    id: number;
    name: string;
    scheduled?: string;
    status?: string;
    competitors?: Array<{ id: number; name: string; abbreviation?: string; seq?: number }>;
  };
}

async function listEvents(sportId: number | null, maxEvents: number, maxPages = 50): Promise<ProphetXEventListItem[]> {
  const seen = new Set<number>();
  const all: ProphetXEventListItem[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < maxPages; i++) {
    // ProphetX caps /events at 500 per call and disables pagination (no `next`),
    // so one large request is the full accessible population (~172 events in practice).
    const q = new URLSearchParams({ limit: '500' });
    if (sportId != null) q.set('sport_id', String(sportId));
    if (cursor != null) q.set('from', String(cursor));
    const data = await fetchJson<{ data?: ProphetXEventListItem[]; next?: number; len?: number }>(
      `${BASE}/trade/public/api/v1/events?${q}`
    );
    const batch = data.data ?? [];
    let added = 0;
    for (const ev of batch) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      all.push(ev);
      added++;
      if (all.length >= maxEvents) return all;
    }
    if (!data.next || batch.length === 0 || added === 0) break;
    cursor = data.next;
  }
  return all;
}

async function getEventDetail(eventId: number): Promise<ProphetXEventDetail> {
  const data = await fetchJson<{ data: ProphetXEventDetail }>(`${BASE}/trade/public/api/v1/events/${eventId}`);
  return data.data;
}

async function getEventMarkets(eventId: number): Promise<ProphetXMarket[]> {
  const data = await fetchJson<{ data: { markets: ProphetXMarket[] } }>(`${BASE}/trade/public/api/v2/events/${eventId}/markets`);
  return data.data?.markets ?? [];
}

function sportSlug(sportId?: number, sportName?: string): string {
  if (sportId != null && SPORT_ID_TO_SLUG[sportId]) return SPORT_ID_TO_SLUG[sportId];
  if (sportName) return sportName.toLowerCase().replace(/\s+/g, '_');
  return 'unknown';
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

function bestSelection(side: ProphetXSelection[] | null | undefined): ProphetXSelection | null {
  if (!Array.isArray(side) || side.length === 0) return null;
  return side.reduce((best, cur) => {
    const bP = americanToImpliedProb(best.odds);
    const cP = americanToImpliedProb(cur.odds);
    return cP < bP ? cur : best;
  });
}

function marketToSnapshot(
  market: ProphetXMarket,
  event: ProphetXEventDetail,
  ts: string
): MarketSnapshot | null {
  if (market.status !== 'active') return null;
  const sides = market.selections ?? [];
  if (sides.length < 2) return null;

  const competitors = event.sportEvent?.competitors ?? [];
  const sideOutcomes = sides.map((side, idx) => {
    const best = bestSelection(side);
    const ask = best ? americanToImpliedProb(best.odds) : null;
    const rawName = best?.displayName || best?.name || market.outcomes?.[idx]?.name;
    const name = rawName ?? competitors[idx]?.name ?? `side_${idx}`;
    const stakeSum = Array.isArray(side) ? side.reduce((s, x) => s + (x.stake ?? 0), 0) : 0;
    return { name, best_ask: ask, best_bid: null as number | null, last_price: null as number | null, _depthStake: stakeSum };
  });

  const anyAsk = sideOutcomes.some((o) => o.best_ask != null);
  if (!anyAsk) return null;

  if (sideOutcomes.length === 2) {
    sideOutcomes[0].best_bid = sideOutcomes[1].best_ask != null ? 1 - sideOutcomes[1].best_ask : null;
    sideOutcomes[1].best_bid = sideOutcomes[0].best_ask != null ? 1 - sideOutcomes[0].best_ask : null;
  }

  const outcomes = sideOutcomes.map(({ _depthStake: _, ...rest }) => rest);
  const askPrices = outcomes.map((o) => o.best_ask);
  const overround = computeOverround(askPrices);

  const liquidity = sideOutcomes.reduce((s, o) => s + o._depthStake, 0) || null;

  const sport = sportSlug(event.sport?.id, event.sport?.name);
  const eventName = event.sportEvent?.name ?? '';
  const tournament = event.tournament?.name ?? '';
  const question = [market.name, eventName].filter(Boolean).join(' — ');

  return {
    platform: 'prophetx',
    platform_market_id: String(market.id),
    question,
    tags: [sport, tournament, market.type ?? ''].filter(Boolean),
    sport,
    outcomes,
    overround,
    volume_traded: market.totalStake ?? null,
    liquidity,
    starts_at: event.sportEvent?.scheduled,
    resolves_at: event.sportEvent?.scheduled,
    phase: computePhase(event.sportEvent?.scheduled),
    ts,
  };
}

export async function scrapeProphetX(opts: {
  sportIds?: number[] | null;
  maxEvents?: number;
  maxEventsPerSport?: number;
  delayMs?: number;
} = {}): Promise<MarketSnapshot[]> {
  // Default: sweep all sports in one pass (ProphetX's sport_id filter isn't
  // strict — sport_id=2 returns MLB+soccer+NBA+NHL+golf mixed — so a single
  // unfiltered walk gets broader coverage than per-sport iteration).
  const sportIds = opts.sportIds ?? null;
  const maxEvents = opts.maxEvents ?? 2000;
  const maxPerSport = opts.maxEventsPerSport ?? 150;
  const delay = opts.delayMs ?? 150;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  const sportList = sportIds && sportIds.length > 0 ? sportIds : [null];
  for (const sportId of sportList) {
    const slug = sportId == null ? 'all-sports' : (SPORT_ID_TO_SLUG[sportId] ?? `sport_${sportId}`);
    let events: ProphetXEventListItem[] = [];
    try {
      events = await listEvents(sportId, sportId == null ? maxEvents : maxPerSport);
    } catch (e) {
      console.warn(`  ${slug}: listEvents failed — ${(e as Error).message}`);
      continue;
    }
    console.log(`  ${slug}: ${events.length} events queued (cap was ${sportId == null ? maxEvents : maxPerSport})`);
    let sportCount = 0;
    let skippedInactive = 0;
    for (const ev of events) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        const [detail, markets] = await Promise.all([
          getEventDetail(ev.id),
          getEventMarkets(ev.id),
        ]);
        const seenKeys = new Set<string>();
        for (const m of markets) {
          const key = `${ev.id}:${m.id}:${m.name}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const snap = marketToSnapshot(m, detail, ts);
          if (snap) { all.push(snap); sportCount++; }
          else skippedInactive++;
        }
      } catch (e) {
        console.warn(`    event ${ev.id}: ${(e as Error).message}`);
      }
    }
    console.log(`  ${slug} (id=${sportId}): ${events.length} events → ${sportCount} markets (skipped ${skippedInactive} inactive/one-sided)`);
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/prophetx');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`);
  const lines = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(file, lines, { flag: 'a' });
  return file;
}

function fmtPct(p: number | null): string { return p == null ? '—' : `${(p * 100).toFixed(2)}%`; }
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  if (!Number.isFinite(v)) return '—';
  return v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
}

function formatTop(snapshots: MarketSnapshot[], n = 15) {
  const rows = snapshots
    .filter((s) => s.overround !== null && s.outcomes.every((o) => o.best_ask != null))
    .sort((a, b) => (b.overround! - a.overround!))
    .slice(0, n);
  console.log('\nTop by overround:');
  for (const r of rows) {
    console.log(`  ${fmtPct(r.overround).padStart(8)}  vol=${fmtMoney(r.volume_traded).padEnd(8)} liq=${fmtMoney(r.liquidity).padEnd(8)} [${r.sport}]  ${r.question.slice(0, 90)}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const sportsArg = args.find((a) => a.startsWith('--sports='));
  const sports = sportsArg ? sportsArg.slice('--sports='.length).split(',').map((s) => parseInt(s, 10)) : undefined;
  const maxArg = args.find((a) => a.startsWith('--max-events='));
  const maxEventsPerSport = maxArg ? parseInt(maxArg.slice('--max-events='.length), 10) : 50;
  return { sportIds: sports, maxEventsPerSport };
}

async function main() {
  loadEnvFile();
  const opts = parseArgs();
  const sportLabel = opts.sportIds ? opts.sportIds.join(',') : 'basketball,baseball,hockey,football';
  console.log(`Scraping ProphetX: sports=${sportLabel} max-events/sport=${opts.maxEventsPerSport}`);
  const t0 = Date.now();
  const snapshots = await scrapeProphetX(opts);
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} markets scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);

  const { syncSnapshotsToDb } = await import('../utils/db-write.js');
  await syncSnapshotsToDb(snapshots);

  formatTop(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
