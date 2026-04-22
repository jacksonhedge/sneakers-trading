import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const API = 'https://api.prizepicks.com';

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
  const cookie = process.env.PRIZEPICKS_COOKIE;
  const deviceId = process.env.PRIZEPICKS_DEVICE_ID;
  if (!cookie || !deviceId) {
    throw new Error(
      'PRIZEPICKS_COOKIE and/or PRIZEPICKS_DEVICE_ID not set in apps/trader/.env.\n' +
      'Capture both from app.prizepicks.com logged-in session via DevTools.'
    );
  }
  const state = process.env.PRIZEPICKS_STATE_CODE ?? 'PA';
  return {
    cookie,
    'x-device-id': deviceId,
    'x-device-info': `anonymousId=,name=,os=mac,osVersion=10.15.7,platform=web,appVersion=,gameMode=pickem,stateCode=${state},fbp=`,
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    origin: 'https://app.prizepicks.com',
    referer: 'https://app.prizepicks.com/',
    'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  };
}

interface JsonApiRel { data?: { type: string; id: string } | null }
interface JsonApiEntity {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, JsonApiRel>;
}

interface ProjectionAttributes {
  line_score?: number;
  description?: string;
  stat_type?: string;
  stat_display_name?: string;
  projection_type?: string;
  odds_type?: string;
  status?: string;
  board_time?: string;
  start_time?: string;
  end_time?: string;
  is_live?: boolean;
  in_game?: boolean;
  today?: boolean;
}

async function fetchJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 429) {
    if (attempt >= 3) throw new Error(`429 rate-limited after ${attempt} retries on ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
    return fetchJson<T>(url, attempt + 1);
  }
  if (res.status === 403) {
    const body = await res.text();
    if (body.includes('captcha') || body.includes('PXZ')) {
      throw new Error('PrizePicks PerimeterX captcha — cookies stale or anti-bot triggered. Re-capture from browser.');
    }
    throw new Error(`403 ${res.statusText} for ${url}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

interface LeaguesResponse { data: JsonApiEntity[] }

async function fetchLeagues(): Promise<Array<{ id: string; name: string; sport?: string }>> {
  const data = await fetchJson<LeaguesResponse>(
    `${API}/leagues?game_mode=pickem&state_code=${process.env.PRIZEPICKS_STATE_CODE ?? 'PA'}`
  );
  return (data.data ?? []).map((l) => ({
    id: l.id,
    name: String(l.attributes?.name ?? ''),
    sport: typeof l.attributes?.league_icon_url === 'string' ? undefined : undefined,
  })).filter((l) => l.name);
}

interface ProjectionsResponse {
  data: Array<JsonApiEntity & { attributes?: ProjectionAttributes }>;
  included?: JsonApiEntity[];
  links?: { next?: string | null };
}

async function fetchProjections(leagueId: string, stateCode: string): Promise<ProjectionsResponse> {
  const q = new URLSearchParams({
    league_id: leagueId,
    per_page: '250',
    single_stat: 'true',
    in_game: 'true',
    state_code: stateCode,
    game_mode: 'pickem',
  });
  return fetchJson<ProjectionsResponse>(`${API}/projections?${q}`);
}

function americanToImplied(american: number): number {
  return american < 0 ? Math.abs(american) / (Math.abs(american) + 100) : 100 / (american + 100);
}

// PrizePicks default "standard" pick pricing is roughly -118 on each side.
// Demon / goblin picks have different implied odds baked into their multipliers.
function oddsTypeToImpliedProb(oddsType: string | undefined): number {
  switch (oddsType) {
    case 'demon': return americanToImplied(-200);  // harder; ~-200 implied
    case 'goblin': return americanToImplied(-140); // easier; ~-140 implied
    case 'standard':
    default: return americanToImplied(-118);       // standard pick; ~-118
  }
}

function leagueToSport(name: string): string | undefined {
  const n = name.toLowerCase();
  if (/nba|wnba|basketball/.test(n)) return 'basketball';
  if (/nfl|football/.test(n)) return 'football';
  if (/mlb|baseball/.test(n)) return 'baseball';
  if (/nhl|hockey/.test(n)) return 'hockey';
  if (/soccer|premier|liga|uefa|mls|serie\s?a|bundes|ligue/.test(n)) return 'soccer';
  if (/tennis|atp|wta/.test(n)) return 'tennis';
  if (/golf|pga|liv|masters/.test(n)) return 'golf';
  if (/ufc|mma|boxing/.test(n)) return 'mma';
  if (/ncaam|ncaaf|college/.test(n)) return n.includes('baseball') ? 'baseball' : n.includes('football') ? 'football' : 'basketball';
  if (/esport|cs|lol|valorant|dota/.test(n)) return 'esports';
  return undefined;
}

function computePhase(startIso?: string, endIso?: string, isLive?: boolean): MarketPhase {
  if (isLive) return 'live';
  const now = Date.now();
  const start = startIso ? Date.parse(startIso) : NaN;
  const end = endIso ? Date.parse(endIso) : NaN;
  if (!Number.isNaN(end) && now > end) return 'closed';
  if (!Number.isNaN(start) && now > start) return 'live';
  if (!Number.isNaN(start) && start - now < 6 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function snapshotFromProjection(
  proj: JsonApiEntity & { attributes?: ProjectionAttributes },
  includedById: Map<string, JsonApiEntity>,
  leagueName: string,
  ts: string
): MarketSnapshot | null {
  const a = proj.attributes;
  if (!a || typeof a.line_score !== 'number') return null;

  const playerId = proj.relationships?.new_player?.data?.id;
  const player = playerId ? includedById.get(`new_player:${playerId}`) : undefined;
  const playerName = String(player?.attributes?.display_name ?? player?.attributes?.name ?? a.description ?? '');

  const statDisplay = a.stat_display_name || a.stat_type || '';
  const line = a.line_score;
  const oddsType = a.odds_type || 'standard';
  const impliedAsk = oddsTypeToImpliedProb(oddsType);
  const sport = leagueToSport(leagueName);

  const outcomes = [
    { name: `Over ${line}`, best_bid: null as number | null, best_ask: impliedAsk, last_price: null as number | null },
    { name: `Under ${line}`, best_bid: null as number | null, best_ask: impliedAsk, last_price: null as number | null },
  ];
  const overround = computeOverround([impliedAsk, impliedAsk]);

  const question = [playerName, statDisplay, line].filter(Boolean).join(' ').trim()
    || `PrizePicks ${leagueName} ${a.description ?? ''}`.trim();

  return {
    platform: 'prizepicks',
    platform_market_id: String(proj.id),
    question,
    tags: [sport ?? '', leagueName, statDisplay, oddsType, a.projection_type ?? ''].filter(Boolean) as string[],
    sport,
    outcomes,
    overround,
    volume_traded: null,
    liquidity: null,
    starts_at: a.start_time,
    resolves_at: a.end_time ?? a.start_time,
    phase: computePhase(a.start_time, a.end_time, a.is_live),
    ts,
  };
}

export async function scrapePrizePicks(opts: {
  leagueIds?: string[];
  delayMs?: number;
} = {}): Promise<MarketSnapshot[]> {
  const stateCode = process.env.PRIZEPICKS_STATE_CODE ?? 'PA';
  const delay = opts.delayMs ?? 300;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  let leagues: Array<{ id: string; name: string }> = [];
  try {
    leagues = await fetchLeagues();
    console.log(`  ${leagues.length} leagues from /leagues`);
  } catch (e) {
    console.warn(`  fetchLeagues failed — ${(e as Error).message}; falling back to hardcoded NBA+MLB+NHL+NFL+PGA`);
    leagues = [
      { id: '7', name: 'NBA' },
      { id: '2', name: 'NFL' },
      { id: '3', name: 'MLB' },
      { id: '8', name: 'MLB' },
      { id: '6', name: 'NHL' },
      { id: '9', name: 'PGA' },
    ];
  }
  if (opts.leagueIds) leagues = leagues.filter((l) => opts.leagueIds!.includes(l.id));

  for (const league of leagues) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      const resp = await fetchProjections(league.id, stateCode);
      const includedById = new Map<string, JsonApiEntity>();
      for (const e of resp.included ?? []) includedById.set(`${e.type}:${e.id}`, e);
      let count = 0;
      for (const proj of resp.data ?? []) {
        const snap = snapshotFromProjection(proj, includedById, league.name, ts);
        if (snap) { all.push(snap); count++; }
      }
      console.log(`  league ${league.id} (${league.name}): ${count} projections`);
    } catch (e) {
      console.warn(`  league ${league.id} (${league.name}): ${(e as Error).message}`);
    }
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/prizepicks');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`);
  const lines = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(file, lines, { flag: 'a' });
  return file;
}

function formatTop(snapshots: MarketSnapshot[], n = 15) {
  const byOddsType: Record<string, number> = {};
  for (const s of snapshots) {
    const t = (s.tags.find((x) => x === 'demon' || x === 'goblin' || x === 'standard')) ?? 'standard';
    byOddsType[t] = (byOddsType[t] ?? 0) + 1;
  }
  console.log('\nBy odds_type:', byOddsType);
  console.log('\nSample projections:');
  for (const s of snapshots.slice(0, n)) {
    console.log(`  [${s.sport}] ${s.question} — ${s.tags.join(' | ')}`);
  }
}

async function main() {
  loadEnvFile();
  console.log(`Scraping PrizePicks (state=${process.env.PRIZEPICKS_STATE_CODE ?? 'PA'})`);
  const t0 = Date.now();
  const snapshots = await scrapePrizePicks();
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} projections scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);
  formatTop(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
