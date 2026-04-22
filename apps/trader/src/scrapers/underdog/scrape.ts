import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';
import { americanToImpliedProb } from '../utils/american-odds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const API = 'https://api.underdogfantasy.com';
const PRODUCT_EXP_FANTASY = '018e1234-5678-9abc-def0-123456789001';

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
  const token = process.env.UNDERDOG_BEARER_TOKEN;
  const deviceId = process.env.UNDERDOG_DEVICE_ID;
  if (!token || !deviceId) {
    throw new Error(
      'UNDERDOG_BEARER_TOKEN and/or UNDERDOG_DEVICE_ID not set in apps/trader/.env.\n' +
      'Underdog JWTs are short-lived (~10 min). Re-capture from app.underdogfantasy.com Network tab when scrapes start 401ing.'
    );
  }
  return {
    authorization: `Bearer ${token}`,
    'client-type': 'web',
    'client-version': process.env.UNDERDOG_CLIENT_VERSION ?? '20260417153820',
    'client-device-id': deviceId,
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    origin: 'https://app.underdogfantasy.com',
    referer: 'https://app.underdogfantasy.com/',
    'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  };
}

interface UDOption {
  id: string;
  american_price: string;
  choice: 'higher' | 'lower' | string;
  choice_display?: string;
  choice_display_name_shorter?: string;
  selection_header?: string;
  selection_subheader?: string;
  payout_multiplier?: string;
  status?: string;
  appearance_id?: string | null;
  over_under_line_id?: string;
}

interface UDOverUnderLine {
  id: string;
  over_under_id?: string;
  over_under?: { id?: string; appearance_stat?: { stat?: string; display_stat?: string }; appearance?: { match_id?: number } };
  stat_value?: string | number | null;
  line_type?: string;
  live_event?: boolean;
  status?: string;
  updated_at?: string;
  options?: UDOption[];
}

interface UDAppearance {
  id: string;
  match_id?: number;
  player_id?: string;
  team_id?: string;
  type?: string;
}

interface UDGame {
  id: number;
  abbreviated_title?: string;
  full_team_names_title?: string;
  home_team_id?: string;
  away_team_id?: string;
  scheduled_at?: string;
  match_progress?: string;
}

interface UDPlayer {
  id: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
}

interface UDResponse {
  over_under_lines?: UDOverUnderLine[];
  appearances?: UDAppearance[];
  games?: UDGame[];
  players?: UDPlayer[];
  solo_games?: unknown[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Underdog auth failed (${res.status}) — JWT expired (~10-min lifespan). ` +
      `Re-capture from app.underdogfantasy.com DevTools and update UNDERDOG_BEARER_TOKEN in .env.`
    );
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

async function fetchOverUnderLines(sportId: string): Promise<UDResponse> {
  const stateConfigId = process.env.UNDERDOG_STATE_CONFIG_ID ?? 'a7f7fc53-3ed7-4598-938b-3ec4137b45d3';
  const q = new URLSearchParams({
    product: 'fantasy',
    product_experience_id: PRODUCT_EXP_FANTASY,
    state_config_id: stateConfigId,
    sport_id: sportId,
  });
  return fetchJson<UDResponse>(`${API}/v2/over_under_lines?${q}`);
}

function sportIdToSport(sportId: string): string {
  const s = sportId.toUpperCase();
  if (s === 'NBA' || s === 'WNBA' || s === 'NCAAMB') return 'basketball';
  if (s === 'NFL' || s === 'NCAAF') return 'football';
  if (s === 'MLB') return 'baseball';
  if (s === 'NHL') return 'hockey';
  if (s === 'UFC' || s === 'MMA') return 'mma';
  if (s === 'PGA' || s === 'GOLF') return 'golf';
  if (s === 'TENNIS') return 'tennis';
  if (s === 'SOCCER' || s === 'EPL' || s === 'UCL') return 'soccer';
  return sportId.toLowerCase();
}

function extractStatFromSubheader(subheader?: string): { stat: string; line: number | null } {
  if (!subheader) return { stat: '', line: null };
  // "Higher 20.5 Points" / "Lower 7.5 Rebounds"
  const m = subheader.match(/^(?:Higher|Lower)\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (m) return { stat: m[2].trim(), line: parseFloat(m[1]) };
  // Sometimes "20.5 Points" alone
  const m2 = subheader.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (m2) return { stat: m2[2].trim(), line: parseFloat(m2[1]) };
  return { stat: subheader, line: null };
}

function computePhase(scheduledIso?: string, isLive?: boolean): MarketPhase {
  if (isLive) return 'live';
  if (!scheduledIso) return 'opening';
  const now = Date.now();
  const start = Date.parse(scheduledIso);
  if (Number.isNaN(start)) return 'opening';
  if (now > start + 4 * 60 * 60 * 1000) return 'closed';
  if (now > start) return 'live';
  if (start - now < 6 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function snapshotFromLine(
  line: UDOverUnderLine,
  appearanceById: Map<string, UDAppearance>,
  playerById: Map<string, UDPlayer>,
  gameById: Map<number, UDGame>,
  sport: string,
  sportId: string,
  ts: string
): MarketSnapshot | null {
  const opts = line.options ?? [];
  if (opts.length < 2) return null;
  const higher = opts.find((o) => o.choice === 'higher') ?? opts[0];
  const lower = opts.find((o) => o.choice === 'lower') ?? opts[1];
  if (!higher || !lower) return null;

  const higherAmerican = parseFloat(higher.american_price);
  const lowerAmerican = parseFloat(lower.american_price);
  if (!Number.isFinite(higherAmerican) || !Number.isFinite(lowerAmerican)) return null;

  const higherAsk = americanToImpliedProb(higherAmerican);
  const lowerAsk = americanToImpliedProb(lowerAmerican);

  // Try to recover stat name + line from subheader; fall back to stat_value.
  const parsed = extractStatFromSubheader(higher.selection_subheader);
  const playerName = higher.selection_header ?? '';
  const statDisplay = parsed.stat;
  const lineNum = parsed.line ?? (line.stat_value != null ? parseFloat(String(line.stat_value)) : null);

  // Attempt to pull game context via appearance → game relationship.
  let gameLabel = '';
  const appearanceId = higher.appearance_id ?? lower.appearance_id;
  if (appearanceId) {
    const app = appearanceById.get(appearanceId);
    if (app?.match_id != null) {
      const game = gameById.get(app.match_id);
      if (game) gameLabel = game.abbreviated_title ?? game.full_team_names_title ?? '';
    }
  }

  const outcomes = [
    { name: `Higher ${lineNum ?? ''} ${statDisplay}`.trim(), best_bid: null as number | null, best_ask: higherAsk, last_price: null as number | null },
    { name: `Lower ${lineNum ?? ''} ${statDisplay}`.trim(), best_bid: null as number | null, best_ask: lowerAsk, last_price: null as number | null },
  ];
  const overround = computeOverround([higherAsk, lowerAsk]);

  const question = [playerName, statDisplay, lineNum != null ? String(lineNum) : '', gameLabel ? `(${gameLabel})` : ''].filter(Boolean).join(' ').trim();

  // Find scheduled time + liveness from game
  let scheduledIso: string | undefined;
  let isLive = line.live_event ?? false;
  if (appearanceId) {
    const app = appearanceById.get(appearanceId);
    if (app?.match_id != null) {
      const game = gameById.get(app.match_id);
      if (game?.scheduled_at) scheduledIso = game.scheduled_at;
    }
  }

  return {
    platform: 'underdog',
    platform_market_id: line.id,
    question: question || `underdog:${line.id}`,
    tags: [sport, sportId, statDisplay, line.line_type ?? '', gameLabel].filter(Boolean) as string[],
    sport,
    outcomes,
    overround,
    volume_traded: null,
    liquidity: null,
    starts_at: scheduledIso,
    resolves_at: scheduledIso,
    phase: computePhase(scheduledIso, isLive),
    ts,
  };
}

export async function scrapeUnderdog(opts: {
  sports?: string[];
  delayMs?: number;
} = {}): Promise<MarketSnapshot[]> {
  const sports = opts.sports ?? ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAMB', 'NCAAF', 'PGA', 'TENNIS', 'UFC', 'SOCCER', 'WNBA'];
  const delay = opts.delayMs ?? 300;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  for (const sportId of sports) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      const resp = await fetchOverUnderLines(sportId);
      const lines = resp.over_under_lines ?? [];
      const appearances = resp.appearances ?? [];
      const players = resp.players ?? [];
      const games = resp.games ?? [];

      const appearanceById = new Map<string, UDAppearance>();
      for (const a of appearances) appearanceById.set(a.id, a);
      const playerById = new Map<string, UDPlayer>();
      for (const p of players) playerById.set(p.id, p);
      const gameById = new Map<number, UDGame>();
      for (const g of games) gameById.set(g.id, g);

      const sport = sportIdToSport(sportId);
      let count = 0;
      for (const line of lines) {
        const snap = snapshotFromLine(line, appearanceById, playerById, gameById, sport, sportId, ts);
        if (snap) { all.push(snap); count++; }
      }
      console.log(`  ${sportId}: ${lines.length} lines → ${count} snapshots (${games.length} games)`);
    } catch (e) {
      console.warn(`  ${sportId}: ${(e as Error).message}`);
      // Bail on first auth error — no point hitting other sports with a dead token.
      if (/auth failed/i.test((e as Error).message)) break;
    }
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/underdog');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${day}.jsonl`);
  const lines = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(file, lines, { flag: 'a' });
  return file;
}

function fmtPct(p: number | null): string { return p == null ? '—' : `${(p * 100).toFixed(2)}%`; }

function formatTop(snapshots: MarketSnapshot[], n = 15) {
  const rows = snapshots
    .filter((s) => s.overround != null)
    .sort((a, b) => (b.overround! - a.overround!))
    .slice(0, n);
  console.log('\nTop by overround:');
  for (const r of rows) {
    console.log(`  ${fmtPct(r.overround).padStart(8)}  [${r.sport}]  ${r.question.slice(0, 95)}`);
  }
}

async function main() {
  loadEnvFile();
  console.log('Scraping Underdog Fantasy over/under lines across sports');
  const t0 = Date.now();
  const snapshots = await scrapeUnderdog();
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} lines scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);
  formatTop(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
