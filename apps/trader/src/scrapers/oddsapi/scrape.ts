import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';
import { americanToImpliedProb } from '../utils/american-odds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const API_BASE = 'https://api.the-odds-api.com/v4';

const DEFAULT_SPORTS = [
  'basketball_nba',
  'icehockey_nhl',
  'baseball_mlb',
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'basketball_ncaab',
  'basketball_wnba',
];

const DEFAULT_BOOKMAKERS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'williamhill_us',
  'pointsbetus',
  'betrivers',
];

const DEFAULT_MARKETS = ['h2h', 'spreads', 'totals'];

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

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsApiMarket {
  key: 'h2h' | 'spreads' | 'totals' | string;
  last_update?: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsApiMarket[];
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

async function fetchSportOdds(sport: string, apiKey: string, bookmakers: string[], markets: string[]): Promise<{ events: OddsApiEvent[]; remaining: number | null; used: number | null }> {
  const url = new URL(`${API_BASE}/sports/${sport}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', markets.join(','));
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('bookmakers', bookmakers.join(','));

  const res = await fetch(url.toString());
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Odds API auth failed (${res.status}) — check ODDS_API_KEY at https://the-odds-api.com`);
  }
  if (res.status === 429) {
    throw new Error(`Odds API rate limited (429) — monthly quota exhausted. Check usage at https://the-odds-api.com/account/`);
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for sport ${sport}`);
  }
  const events = (await res.json()) as OddsApiEvent[];
  const remainingHeader = res.headers.get('x-requests-remaining');
  const usedHeader = res.headers.get('x-requests-used');
  return {
    events,
    remaining: remainingHeader ? parseInt(remainingHeader, 10) : null,
    used: usedHeader ? parseInt(usedHeader, 10) : null,
  };
}

function sportKeyToLabel(sportKey: string): string {
  if (sportKey.includes('basketball')) return 'basketball';
  if (sportKey.includes('americanfootball')) return 'football';
  if (sportKey.includes('icehockey')) return 'hockey';
  if (sportKey.includes('baseball')) return 'baseball';
  if (sportKey.includes('soccer')) return 'soccer';
  return sportKey.split('_')[0];
}

function phaseFromStart(start?: string): MarketPhase {
  if (!start) return 'opening';
  const ms = Date.parse(start);
  if (Number.isNaN(ms)) return 'opening';
  const now = Date.now();
  if (now > ms) return 'live';
  if (ms - now < 6 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function marketQuestion(event: OddsApiEvent, marketKey: string, point?: number): string {
  const matchup = `${event.away_team} @ ${event.home_team}`;
  if (marketKey === 'h2h') return `Moneyline — ${matchup}`;
  if (marketKey === 'spreads') return `Spread ${point != null ? (point > 0 ? '+' : '') + point : ''} — ${matchup}`.trim();
  if (marketKey === 'totals') return `Total ${point ?? ''} — ${matchup}`.trim();
  return `${marketKey} — ${matchup}`;
}

function outcomeLabel(market: OddsApiMarket, outcome: OddsApiOutcome): string {
  if (market.key === 'spreads' && outcome.point != null) {
    const sign = outcome.point > 0 ? '+' : '';
    return `${outcome.name} ${sign}${outcome.point}`;
  }
  if (market.key === 'totals' && outcome.point != null) {
    return `${outcome.name} ${outcome.point}`;
  }
  return outcome.name;
}

function buildSnapshot(
  event: OddsApiEvent,
  bookmaker: OddsApiBookmaker,
  market: OddsApiMarket,
  ts: string,
): MarketSnapshot | null {
  if (!market.outcomes || market.outcomes.length < 2) return null;

  const outcomes = market.outcomes.map((o) => {
    const impliedProb = americanToImpliedProb(o.price);
    return {
      name: outcomeLabel(market, o),
      best_bid: null as number | null,
      best_ask: Number.isFinite(impliedProb) ? impliedProb : null,
      last_price: null as number | null,
    };
  });

  const overround = computeOverround(outcomes.map((o) => o.best_ask));
  const sport = sportKeyToLabel(event.sport_key);
  const firstPoint = market.outcomes.find((o) => o.point != null)?.point;
  const lineSuffix = firstPoint != null ? `:${firstPoint}` : '';

  return {
    platform: bookmaker.key,
    platform_market_id: `${event.id}:${bookmaker.key}:${market.key}${lineSuffix}`,
    question: marketQuestion(event, market.key, firstPoint),
    tags: [sport, event.sport_title, market.key, bookmaker.key],
    sport,
    outcomes,
    overround,
    volume_traded: null,
    liquidity: null,
    starts_at: event.commence_time,
    resolves_at: event.commence_time,
    phase: phaseFromStart(event.commence_time),
    ts,
  };
}

export async function scrapeOddsApi(opts: {
  sports?: string[];
  bookmakers?: string[];
  markets?: string[];
  delayMs?: number;
} = {}): Promise<MarketSnapshot[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ODDS_API_KEY not set.\n' +
      '  1. Sign up at https://the-odds-api.com (free tier = 500 requests/month)\n' +
      '  2. pnpm token:set -- oddsapi "your-key-here"\n' +
      '  (or add ODDS_API_KEY=... to apps/trader/.env directly)'
    );
  }

  const sports = opts.sports ?? DEFAULT_SPORTS;
  const bookmakers = opts.bookmakers ?? DEFAULT_BOOKMAKERS;
  const markets = opts.markets ?? DEFAULT_MARKETS;
  const delay = opts.delayMs ?? 250;
  const ts = new Date().toISOString();

  const all: MarketSnapshot[] = [];
  let lastRemaining: number | null = null;
  let lastUsed: number | null = null;

  for (const sport of sports) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      const { events, remaining, used } = await fetchSportOdds(sport, apiKey, bookmakers, markets);
      if (remaining != null) lastRemaining = remaining;
      if (used != null) lastUsed = used;

      let sportSnapshots = 0;
      for (const event of events) {
        for (const bookmaker of event.bookmakers ?? []) {
          for (const market of bookmaker.markets ?? []) {
            const snap = buildSnapshot(event, bookmaker, market, ts);
            if (snap) {
              all.push(snap);
              sportSnapshots++;
            }
          }
        }
      }
      console.log(`  ${sport}: ${events.length} events → ${sportSnapshots} snapshots`);
    } catch (e) {
      console.warn(`    ${sport}: ${(e as Error).message}`);
    }
  }

  if (lastRemaining != null) {
    console.log(`\nOdds API quota: used=${lastUsed ?? '?'} remaining=${lastRemaining}`);
    const quotaDir = join(TRADER_ROOT, 'data/oddsapi');
    if (!existsSync(quotaDir)) mkdirSync(quotaDir, { recursive: true });
    const quotaFile = join(quotaDir, '.quota.jsonl');
    const quotaLine = JSON.stringify({
      ts,
      used: lastUsed,
      remaining: lastRemaining,
      snapshots: all.length,
      sports: sports.length,
    }) + '\n';
    writeFileSync(quotaFile, quotaLine, { flag: 'a' });
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/oddsapi');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`);
  const lines = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(file, lines, { flag: 'a' });
  return file;
}

function fmtPct(p: number | null): string { return p == null ? '—' : `${(p * 100).toFixed(2)}%`; }

function formatTop(snapshots: MarketSnapshot[], n = 15) {
  const rows = snapshots
    .filter((s) => s.overround !== null && s.outcomes.every((o) => o.best_ask != null))
    .sort((a, b) => (b.overround! - a.overround!))
    .slice(0, n);
  console.log('\nTop by overround (widest books):');
  for (const r of rows) {
    console.log(`  ${fmtPct(r.overround).padStart(8)}  [${r.platform.padEnd(14)}] ${r.question.slice(0, 90)}`);
  }
}

function summarizeByPlatform(snapshots: MarketSnapshot[]) {
  const counts: Record<string, number> = {};
  for (const s of snapshots) counts[s.platform] = (counts[s.platform] ?? 0) + 1;
  console.log('\nBy platform:');
  for (const [platform, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${platform.padEnd(18)} ${count}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const sportsArg = args.find((a) => a.startsWith('--sports='));
  const sports = sportsArg ? sportsArg.slice('--sports='.length).split(',') : undefined;
  const booksArg = args.find((a) => a.startsWith('--bookmakers='));
  const bookmakers = booksArg ? booksArg.slice('--bookmakers='.length).split(',') : undefined;
  const marketsArg = args.find((a) => a.startsWith('--markets='));
  const markets = marketsArg ? marketsArg.slice('--markets='.length).split(',') : undefined;
  return { sports, bookmakers, markets };
}

async function main() {
  loadEnvFile();
  const opts = parseArgs();
  const sportsLabel = (opts.sports ?? DEFAULT_SPORTS).join(',');
  const booksLabel = (opts.bookmakers ?? DEFAULT_BOOKMAKERS).join(',');
  const marketsLabel = (opts.markets ?? DEFAULT_MARKETS).join(',');
  console.log(`Scraping The Odds API`);
  console.log(`  sports=${sportsLabel}`);
  console.log(`  bookmakers=${booksLabel}`);
  console.log(`  markets=${marketsLabel}\n`);

  const t0 = Date.now();
  const snapshots = await scrapeOddsApi(opts);
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} snapshots scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);
  summarizeByPlatform(snapshots);
  formatTop(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
