import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const GRAPHQL = 'https://api.novig.us/v1/graphql';
const BOOK_BATCH = 'https://api.novig.us/nbx/v1/markets/book/batch';

const DEFAULT_LEAGUES = ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'WNBA'];

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
  const token = process.env.NOVIG_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      'NOVIG_BEARER_TOKEN not set.\n' +
      '  pnpm token:set -- novig "eyJ..."\n' +
      '(Capture it from app.novig.us → DevTools → Network → any request → Authorization header.)'
    );
  }
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

async function graphql<T>(operationName: string, query: string, variables: unknown): Promise<T> {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`NoVig auth failed (${res.status}) — token expired. Capture a fresh JWT and run pnpm token:set -- novig "eyJ..."`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for GraphQL ${operationName}`);
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors) throw new Error(`GraphQL errors: ${JSON.stringify(body.errors).slice(0, 300)}`);
  if (!body.data) throw new Error(`GraphQL returned no data for ${operationName}`);
  return body.data;
}

async function fetchBookBatch(marketIds: string[]): Promise<BookBatchEntry[]> {
  if (marketIds.length === 0) return [];
  const url = `${BOOK_BATCH}?marketIds=${marketIds.join(',')}&currency=CASH`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`NoVig auth failed on book batch (${res.status})`);
  }
  if (!res.ok) throw new Error(`${res.status} for book batch`);
  return (await res.json()) as BookBatchEntry[];
}

interface LadderEntry { price: number; qty: number; outcomeId: string; isBid?: boolean; status?: string; currency?: string }
interface BookBatchEntry {
  market: { id: string; description: string; strike: number; type: string; isConsensus?: boolean };
  ladders: Record<string, { bids?: LadderEntry[]; asks?: LadderEntry[] }>;
}

interface NovigCompetitor { id?: string; symbol?: string; name?: string }
interface NovigOutcome {
  id: string;
  index: number;
  description?: string;
  available: number | null;
  altAvailable?: number | null;
  competitor?: NovigCompetitor;
}
interface NovigMarket {
  id: string;
  type: string;
  strike?: number;
  status?: string;
  volume?: number;
  description?: string;
  is_consensus?: boolean;
  player?: { id?: string; full_name?: string };
  competitor?: NovigCompetitor;
  outcomes?: NovigOutcome[];
}
interface NovigGame {
  id?: string;
  sport?: string;
  homeTeam?: NovigCompetitor;
  awayTeam?: NovigCompetitor;
  home_score?: number;
  away_score?: number;
  time_remaining?: string;
}
interface NovigEvent {
  id: string;
  type?: string;
  description?: string;
  status?: string;
  league?: string;
  scheduled_start?: string;
  game?: NovigGame | null;
  markets?: NovigMarket[];
}

const HOME_QUERY = /* GraphQL */ `
  query SneakersHome($where: event_bool_exp!, $orderBy: [event_order_by!], $limit: Int!) {
    event(where: $where, order_by: $orderBy, limit: $limit) {
      id
      type
      description
      status
      league
      scheduled_start
      game {
        id
        sport
        homeTeam { id symbol name }
        awayTeam { id symbol name }
      }
    }
  }
`;

const EVENT_MARKETS_QUERY = /* GraphQL */ `
  query SneakersEventMarkets($eventId: uuid!, $marketWhere: market_bool_exp!) {
    event(where: {id: {_eq: $eventId}}) {
      id
      description
      league
      status
      scheduled_start
      game {
        sport
        homeTeam { id symbol name }
        awayTeam { id symbol name }
        home_score
        away_score
        time_remaining
      }
      markets(where: $marketWhere) {
        id
        type
        strike
        status
        volume
        description
        is_consensus
        player { id full_name }
        competitor { id symbol name }
        outcomes {
          id
          index
          description
          available
          altAvailable
          competitor { id symbol name }
        }
      }
    }
  }
`;

async function fetchEvents(leagues: string[], limit: number): Promise<NovigEvent[]> {
  const where = {
    _and: [
      { league: { _in: leagues } },
      { _or: [
        { status: { _eq: 'OPEN_PREGAME' } },
        { status: { _eq: 'CLOSED_PREGAME' } },
        { status: { _eq: 'OPEN_INGAME' } },
        { status: { _eq: 'DELAYED' } },
      ] },
      { markets: { status: { _eq: 'OPEN' } } },
    ],
  };
  const data = await graphql<{ event: NovigEvent[] }>('SneakersHome', HOME_QUERY, {
    where,
    orderBy: [{ scheduled_start: 'asc' }],
    limit,
  });
  return data.event ?? [];
}

async function fetchEventMarkets(eventId: string): Promise<NovigEvent | null> {
  const marketWhere = {
    _and: [
      { status: { _eq: 'OPEN' } },
      { _or: [
        { is_consensus: { _eq: true } },
        { outcomes: { available: { _is_null: false } } },
      ] },
    ],
  };
  const data = await graphql<{ event: NovigEvent[] }>('SneakersEventMarkets', EVENT_MARKETS_QUERY, {
    eventId,
    marketWhere,
  });
  return data.event?.[0] ?? null;
}

function phaseFromStatus(eventStatus?: string, scheduledStart?: string): MarketPhase {
  if (eventStatus === 'OPEN_INGAME' || eventStatus === 'DELAYED') return 'live';
  if (!scheduledStart) return 'opening';
  const ms = Date.parse(scheduledStart);
  if (Number.isNaN(ms)) return 'opening';
  const now = Date.now();
  if (now > ms) return 'live';
  if (ms - now < 6 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function leagueToSport(league?: string): string | undefined {
  if (!league) return undefined;
  const l = league.toLowerCase();
  if (l === 'nba' || l === 'wnba' || l === 'ncaab' || l === 'ncaamb') return 'basketball';
  if (l === 'nfl' || l === 'ncaaf') return 'football';
  if (l === 'mlb') return 'baseball';
  if (l === 'nhl') return 'hockey';
  return l;
}

function eventLabel(event: NovigEvent): string {
  if (event.description) return event.description;
  const away = event.game?.awayTeam?.symbol ?? event.game?.awayTeam?.name;
  const home = event.game?.homeTeam?.symbol ?? event.game?.homeTeam?.name;
  if (away && home) return `${away} @ ${home}`;
  return event.id;
}

function outcomeLabel(o: NovigOutcome): string {
  if (o.description) return o.description;
  if (o.competitor?.symbol) return o.competitor.symbol;
  if (o.competitor?.name) return o.competitor.name;
  return `outcome_${o.index}`;
}

function marketLabel(m: NovigMarket): string {
  const base = m.description || m.type;
  const strikeIsMeaningful = m.strike != null && m.strike !== 0;
  const strikeAlreadyInBase = /\b\d+(\.\d+)?\b/.test(base);
  const typeNeedsNoStrike = m.type === 'MONEY' || m.type === 'SERIES_WINNER' || m.type === 'FUTURE';
  if (strikeIsMeaningful && !strikeAlreadyInBase && !typeNeedsNoStrike) return `${base} ${m.strike}`;
  return base;
}

function marketToSnapshot(
  market: NovigMarket,
  event: NovigEvent,
  sport: string | undefined,
  ts: string,
  book?: BookBatchEntry
): MarketSnapshot | null {
  const outcomes = market.outcomes ?? [];
  if (outcomes.length < 2) return null;
  const anyAsk = outcomes.some((o) => typeof o.available === 'number');
  if (!anyAsk && !book) return null;

  const snapOutcomes = outcomes.map((o) => {
    let bestBid: number | null = null;
    let bestAsk: number | null = typeof o.available === 'number' ? o.available : null;
    if (book) {
      const ladder = book.ladders[o.id];
      if (ladder?.asks?.length) bestAsk = Math.min(...ladder.asks.map((a) => a.price));
      if (ladder?.bids?.length) bestBid = Math.max(...ladder.bids.map((b) => b.price));
    }
    return {
      name: outcomeLabel(o),
      best_bid: bestBid,
      best_ask: bestAsk,
      last_price: null,
    };
  });

  if (snapOutcomes.length === 2) {
    if (snapOutcomes[0].best_bid == null && snapOutcomes[1].best_ask != null) {
      snapOutcomes[0].best_bid = 1 - snapOutcomes[1].best_ask;
    }
    if (snapOutcomes[1].best_bid == null && snapOutcomes[0].best_ask != null) {
      snapOutcomes[1].best_bid = 1 - snapOutcomes[0].best_ask;
    }
  }

  const askPrices = snapOutcomes.map((o) => o.best_ask);
  const overround = computeOverround(askPrices);

  let liquidity: number | null = null;
  if (book) {
    let totalQty = 0;
    for (const ladder of Object.values(book.ladders)) {
      for (const bid of ladder.bids ?? []) totalQty += bid.qty ?? 0;
      for (const ask of ladder.asks ?? []) totalQty += ask.qty ?? 0;
    }
    if (totalQty > 0) liquidity = totalQty;
  }

  const evLabel = eventLabel(event);
  const question = `${marketLabel(market)} — ${evLabel}`;

  return {
    platform: 'novig',
    platform_market_id: market.id,
    question,
    tags: [sport ?? '', event.league ?? '', market.type].filter(Boolean),
    sport,
    outcomes: snapOutcomes,
    overround,
    volume_traded: typeof market.volume === 'number' ? market.volume : null,
    liquidity,
    starts_at: event.scheduled_start,
    resolves_at: event.scheduled_start,
    phase: phaseFromStatus(event.status, event.scheduled_start),
    ts,
  };
}

export async function scrapeNovig(opts: {
  leagues?: string[];
  maxEvents?: number;
  withOrderbook?: boolean;
  delayMs?: number;
  bookBatchSize?: number;
} = {}): Promise<MarketSnapshot[]> {
  const leagues = opts.leagues ?? DEFAULT_LEAGUES;
  const maxEvents = opts.maxEvents ?? 50;
  const withOrderbook = opts.withOrderbook ?? true;
  const delay = opts.delayMs ?? 150;
  const bookBatchSize = opts.bookBatchSize ?? 25;
  const ts = new Date().toISOString();

  const events = await fetchEvents(leagues, maxEvents);
  console.log(`  ${events.length} events across leagues ${leagues.join(',')}`);

  const all: MarketSnapshot[] = [];
  const marketsToBook: { market: NovigMarket; event: NovigEvent }[] = [];

  const countsByLeague: Record<string, number> = {};
  for (const ev of events) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      const detail = await fetchEventMarkets(ev.id);
      if (!detail) continue;
      const sport = leagueToSport(detail.league);
      for (const m of detail.markets ?? []) {
        if (m.status !== 'OPEN') continue;
        if (withOrderbook && !m.is_consensus) {
          marketsToBook.push({ market: m, event: detail });
        } else {
          const snap = marketToSnapshot(m, detail, sport, ts);
          if (snap) {
            all.push(snap);
            countsByLeague[detail.league ?? '?'] = (countsByLeague[detail.league ?? '?'] ?? 0) + 1;
          }
        }
      }
    } catch (e) {
      console.warn(`    event ${ev.id}: ${(e as Error).message}`);
    }
  }

  if (withOrderbook && marketsToBook.length > 0) {
    console.log(`  fetching orderbook for ${marketsToBook.length} non-consensus markets...`);
    const byId = new Map<string, { market: NovigMarket; event: NovigEvent }>();
    for (const m of marketsToBook) byId.set(m.market.id, m);
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += bookBatchSize) {
      const batch = ids.slice(i, i + bookBatchSize);
      try {
        const books = await fetchBookBatch(batch);
        const booksById = new Map<string, BookBatchEntry>();
        for (const b of books) booksById.set(b.market.id, b);
        for (const id of batch) {
          const entry = byId.get(id);
          if (!entry) continue;
          const book = booksById.get(id);
          const sport = leagueToSport(entry.event.league);
          const snap = marketToSnapshot(entry.market, entry.event, sport, ts, book);
          if (snap) {
            all.push(snap);
            countsByLeague[entry.event.league ?? '?'] = (countsByLeague[entry.event.league ?? '?'] ?? 0) + 1;
          }
        }
      } catch (e) {
        console.warn(`    book batch: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  for (const [league, count] of Object.entries(countsByLeague)) {
    console.log(`  ${league}: ${count} markets`);
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/novig');
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
    console.log(`  ${fmtPct(r.overround).padStart(8)}  vol=${fmtMoney(r.volume_traded).padEnd(8)} liq=${fmtMoney(r.liquidity).padEnd(8)} [${r.sport}] ${r.question.slice(0, 90)}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const leaguesArg = args.find((a) => a.startsWith('--leagues='));
  const leagues = leaguesArg ? leaguesArg.slice('--leagues='.length).split(',') : undefined;
  const maxArg = args.find((a) => a.startsWith('--max-events='));
  const maxEvents = maxArg ? parseInt(maxArg.slice('--max-events='.length), 10) : 50;
  const withOrderbook = !args.includes('--no-orderbook');
  return { leagues, maxEvents, withOrderbook };
}

async function main() {
  loadEnvFile();
  const opts = parseArgs();
  const leaguesLabel = opts.leagues ? opts.leagues.join(',') : DEFAULT_LEAGUES.join(',');
  console.log(`Scraping NoVig: leagues=${leaguesLabel} max-events=${opts.maxEvents} orderbook=${opts.withOrderbook}`);
  const t0 = Date.now();
  const snapshots = await scrapeNovig(opts);
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} markets scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);
  formatTop(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
