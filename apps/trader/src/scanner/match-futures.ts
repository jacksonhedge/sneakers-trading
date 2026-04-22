import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot } from '../scrapers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../..');
const DATA_DIR = join(TRADER_ROOT, 'data');

const TEAM_ALIASES: Record<string, string[]> = {
  'thunder': ['thunder', 'oklahoma city', 'oklahoma city thunder', 'okc'],
  'lakers': ['lakers', 'los angeles lakers', 'la lakers', 'lal'],
  'celtics': ['celtics', 'boston celtics', 'bos'],
  'nuggets': ['nuggets', 'denver nuggets', 'den'],
  'timberwolves': ['timberwolves', 'wolves', 'minnesota timberwolves', 'min'],
  'suns': ['suns', 'phoenix suns', 'phx'],
  'rockets': ['rockets', 'houston rockets', 'hou'],
  'mavericks': ['mavericks', 'mavs', 'dallas mavericks', 'dal'],
  'warriors': ['warriors', 'golden state warriors', 'gsw'],
  'clippers': ['clippers', 'los angeles clippers', 'la clippers', 'lac'],
  'pistons': ['pistons', 'detroit pistons', 'det'],
  'magic': ['magic', 'orlando magic', 'orl'],
  'raptors': ['raptors', 'toronto raptors', 'tor'],
  'cavaliers': ['cavaliers', 'cavs', 'cleveland cavaliers', 'cle'],
  'knicks': ['knicks', 'new york knicks', 'nyk'],
  'hawks': ['hawks', 'atlanta hawks', 'atl'],
  'heat': ['heat', 'miami heat', 'mia'],
  'bucks': ['bucks', 'milwaukee bucks', 'mil'],
  '76ers': ['76ers', 'sixers', 'philadelphia 76ers', 'phi'],
  'grizzlies': ['grizzlies', 'memphis grizzlies', 'mem'],
  'spurs': ['spurs', 'san antonio spurs', 'sas'],
  'kings': ['kings', 'sacramento kings', 'sac'],
  'pelicans': ['pelicans', 'new orleans pelicans', 'nop'],
  'trail blazers': ['trail blazers', 'blazers', 'portland trail blazers', 'por'],
  'jazz': ['jazz', 'utah jazz', 'uta'],
  'bulls': ['bulls', 'chicago bulls', 'chi'],
  'hornets': ['hornets', 'charlotte hornets', 'cha'],
  'pacers': ['pacers', 'indiana pacers', 'ind'],
  'nets': ['nets', 'brooklyn nets', 'bkn'],
  'wizards': ['wizards', 'washington wizards', 'was'],
};

function normalizeSubject(raw: string): string {
  const s = raw.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    if (aliases.some((a) => s === a || s.includes(a))) return canonical;
  }
  return s.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function classifyMarketType(question: string): string | null {
  const q = question.toLowerCase();
  if (q.includes('finals mvp')) return 'finals_mvp';
  if (q.includes('rookie of the year') || q.includes('roty')) return 'roty';
  if (q.includes('western conference finals')) return 'west_conf';
  if (q.includes('eastern conference finals')) return 'east_conf';
  if (q.includes('nba finals') || q.includes('nba championship')) return 'finals';
  if (q.match(/\bmvp\b/)) return 'reg_mvp';
  if (q.includes('defensive player')) return 'dpoy';
  if (q.includes('sixth man')) return 'sixth_man';
  if (q.includes('most improved')) return 'mip';
  return null;
}

function extractPolymarketSubject(question: string): string | null {
  const q = question.toLowerCase();
  let m = q.match(/will the ([a-z\s]+?) win/);
  if (m) return normalizeSubject(m[1]);
  m = q.match(/will ([a-z\s\-'.áéíóúñ]+?) win/i);
  if (m) return normalizeSubject(m[1]);
  return null;
}

interface NormalizedMarket {
  platform: string;
  market_id: string;
  sport?: string;
  market_type: string;
  subject: string;
  yes_ask: number | null;
  yes_bid: number | null;
  yes_last: number | null;
  overround: number | null;
  volume: number | null;
  liquidity: number | null;
  phase: string;
  question: string;
}

function normalize(snap: MarketSnapshot): NormalizedMarket | null {
  const mt = classifyMarketType(snap.question);
  if (!mt) return null;
  let subject: string | null;
  if (snap.platform === 'polymarket') {
    subject = extractPolymarketSubject(snap.question);
  } else if (snap.platform === 'kalshi') {
    subject = normalizeSubject(snap.outcomes[0]?.name ?? '');
  } else {
    subject = null;
  }
  if (!subject) return null;

  const yes = snap.outcomes[0];
  return {
    platform: snap.platform,
    market_id: snap.platform_market_id,
    sport: snap.sport,
    market_type: mt,
    subject,
    yes_ask: yes?.best_ask ?? null,
    yes_bid: yes?.best_bid ?? null,
    yes_last: yes?.last_price ?? null,
    overround: snap.overround,
    volume: snap.volume_traded,
    liquidity: snap.liquidity,
    phase: snap.phase,
    question: snap.question,
  };
}

function loadLatestJsonl(platform: string): MarketSnapshot[] {
  const dir = join(DATA_DIR, platform);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  if (!files.length) return [];
  const latest = files[files.length - 1];
  const content = readFileSync(join(dir, latest), 'utf8');
  return content.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) as MarketSnapshot; } catch { return null; }
  }).filter((x): x is MarketSnapshot => x !== null);
}

function dedupeByPlatformMarket(rows: NormalizedMarket[]): NormalizedMarket[] {
  const seen = new Map<string, NormalizedMarket>();
  for (const r of rows) {
    const k = `${r.platform}:${r.market_id}`;
    const existing = seen.get(k);
    if (!existing) { seen.set(k, r); continue; }
    const existingHasAsk = existing.yes_ask != null;
    const newHasAsk = r.yes_ask != null;
    if (newHasAsk && !existingHasAsk) seen.set(k, r);
  }
  return [...seen.values()];
}

function fmtPrice(p: number | null): string {
  return p == null ? '   —  ' : (p).toFixed(3);
}

function fmtPercent(p: number | null): string {
  return p == null ? '   —  ' : `${(p * 100).toFixed(1)}%`;
}

function main() {
  const poly = loadLatestJsonl('polymarket').map(normalize).filter((x): x is NormalizedMarket => x !== null);
  const kalshi = loadLatestJsonl('kalshi').map(normalize).filter((x): x is NormalizedMarket => x !== null);
  const rows = dedupeByPlatformMarket([...poly, ...kalshi]);

  console.log(`Loaded ${poly.length} Polymarket + ${kalshi.length} Kalshi normalized markets (${rows.length} after dedupe)`);

  const groups = new Map<string, NormalizedMarket[]>();
  for (const r of rows) {
    const k = `${r.sport ?? '?'}|${r.market_type}|${r.subject}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  const multi = [...groups.entries()].filter(([, v]) => v.length >= 2);
  console.log(`\n${multi.length} cross-book matches found (same sport + market_type + subject on ≥2 platforms)\n`);

  multi.sort((a, b) => {
    const aPrice = Math.max(...a[1].map((r) => r.yes_ask ?? r.yes_last ?? 0));
    const bPrice = Math.max(...b[1].map((r) => r.yes_ask ?? r.yes_last ?? 0));
    return bPrice - aPrice;
  });

  for (const [key, matches] of multi) {
    const [sport, mt, subj] = key.split('|');
    console.log(`\n[${sport}] ${mt} — ${subj}`);
    for (const m of matches) {
      const ask = m.yes_ask != null ? `ask ${fmtPrice(m.yes_ask)}` : `last ${fmtPrice(m.yes_last)}`;
      const bid = m.yes_bid != null ? `bid ${fmtPrice(m.yes_bid)}` : '';
      const vol = m.volume != null ? `vol=${m.volume < 100 ? m.volume : Math.round(m.volume).toLocaleString()}` : '';
      const or = m.overround != null ? `or=${fmtPercent(m.overround)}` : '';
      console.log(`  ${m.platform.padEnd(10)} ${ask}  ${bid}  ${or.padEnd(10)} ${vol.padEnd(14)} ${m.phase}`);
    }
    // arb check — sum of YES asks across platforms, for same subject:
    // if any platform's YES ask + any other platform's NO ask < 1, there's an arb.
    // For now just show the max-min spread on yes_ask as a rough signal.
    const asks = matches.map((m) => m.yes_ask ?? m.yes_last).filter((x): x is number => x != null);
    if (asks.length >= 2) {
      const spread = Math.max(...asks) - Math.min(...asks);
      if (spread > 0.02) console.log(`  * spread ${(spread * 100).toFixed(1)}pp — candidate worth checking`);
    }
  }
}

main();
