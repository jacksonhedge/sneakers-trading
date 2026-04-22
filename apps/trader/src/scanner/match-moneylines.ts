import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot } from '../scrapers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../..');
const DATA_DIR = join(TRADER_ROOT, 'data');

type ParsedMoneyline = {
  away: string;
  home: string;
  homeAsk: number | null;
  homeBid: number | null;
  awayAsk: number | null;
  awayBid: number | null;
};

function loadLatest(platform: string): MarketSnapshot[] {
  const dir = join(DATA_DIR, platform);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }
  if (!files.length) return [];
  const text = readFileSync(join(dir, files[files.length - 1]), 'utf8');
  const all: MarketSnapshot[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      all.push(JSON.parse(line));
    } catch {
      // partial write mid-scrape — skip
    }
  }
  const latest = new Map<string, MarketSnapshot>();
  for (const s of all) {
    const prev = latest.get(s.platform_market_id);
    if (!prev || s.ts > prev.ts) latest.set(s.platform_market_id, s);
  }
  return [...latest.values()];
}

function canonTeam(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

function bucketHour(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(Math.floor(t / 3_600_000) * 3_600_000).toISOString();
}

const SPORT_ALIAS: Record<string, string> = {
  hockey: 'hockey',
  ice_hockey: 'hockey',
  baseball: 'baseball',
  basketball: 'basketball',
};

function sportKey(s: string | undefined): string {
  const raw = (s ?? '').toLowerCase();
  return SPORT_ALIAS[raw] ?? raw;
}

// NoVig MONEY: question is "{HOME_CODE} — {AWAY_FULL} @ {HOME_FULL}"
// Outcomes are the 3-letter codes; the one matching HOME_CODE is the home bet.
function parseNovig(s: MarketSnapshot): ParsedMoneyline | null {
  const lastTag = s.tags[s.tags.length - 1] ?? '';
  if (lastTag !== 'MONEY') return null;
  const dashIdx = s.question.indexOf(' — ');
  if (dashIdx < 0) return null;
  const homeCode = s.question.slice(0, dashIdx).trim();
  const rest = s.question.slice(dashIdx + 3);
  const atIdx = rest.indexOf(' @ ');
  if (atIdx < 0) return null;
  const away = rest.slice(0, atIdx).trim();
  const home = rest.slice(atIdx + 3).trim();
  let homeAsk: number | null = null;
  let homeBid: number | null = null;
  let awayAsk: number | null = null;
  let awayBid: number | null = null;
  for (const o of s.outcomes) {
    const code = o.name.trim().toUpperCase();
    if (code === homeCode.toUpperCase()) {
      homeAsk = o.best_ask;
      homeBid = o.best_bid;
    } else {
      awayAsk = o.best_ask;
      awayBid = o.best_bid;
    }
  }
  return { away, home, homeAsk, homeBid, awayAsk, awayBid };
}

// ProphetX moneyline: question is "Moneyline — {AWAY} at {HOME}" (or "Moneyline (2 Way) — ...").
// Outcomes are "{FULL_TEAM_NAME} {american_odds}" — strip the trailing odds.
function parseProphet(s: MarketSnapshot): ParsedMoneyline | null {
  const q = s.question;
  let prefix: string | null = null;
  for (const p of ['Moneyline — ', 'Moneyline (2 Way) — ']) {
    if (q.startsWith(p)) {
      prefix = p;
      break;
    }
  }
  if (!prefix) return null;
  const rest = q.slice(prefix.length);
  const atIdx = rest.indexOf(' at ');
  if (atIdx < 0) return null;
  const away = rest.slice(0, atIdx).trim();
  const home = rest.slice(atIdx + 4).trim();
  const oddsRe = /\s[+-]\d+$/;
  let homeAsk: number | null = null;
  let homeBid: number | null = null;
  let awayAsk: number | null = null;
  let awayBid: number | null = null;
  const homeCanon = canonTeam(home);
  const awayCanon = canonTeam(away);
  for (const o of s.outcomes) {
    const nameOnly = o.name.replace(oddsRe, '').trim();
    const c = canonTeam(nameOnly);
    if (c === homeCanon) {
      homeAsk = o.best_ask;
      homeBid = o.best_bid;
    } else if (c === awayCanon) {
      awayAsk = o.best_ask;
      awayBid = o.best_bid;
    }
  }
  return { away, home, homeAsk, homeBid, awayAsk, awayBid };
}

type MatchRow = {
  sport: string;
  away: string;
  home: string;
  startsAt: string;
  novig: ParsedMoneyline;
  prophet: ParsedMoneyline;
  // Sum of asks across books, one side on each — a single-ticket arb exists
  // when this is < 1.00.
  sumNovigHomeVsProphetAway: number | null;
  sumNovigAwayVsProphetHome: number | null;
  bestSum: number | null;
  bestSide: 'novigHome+prophetAway' | 'novigAwayVsProphetHome' | null;
};

function main(): void {
  const novigAll = loadLatest('novig');
  const prophetAll = loadLatest('prophetx');

  const novigByKey = new Map<string, { snap: MarketSnapshot; parsed: ParsedMoneyline }>();
  let novigParsed = 0;
  for (const s of novigAll) {
    const p = parseNovig(s);
    if (!p || !s.starts_at) continue;
    novigParsed++;
    const key = `${sportKey(s.sport)}|${canonTeam(p.away)}|${canonTeam(p.home)}|${bucketHour(s.starts_at)}`;
    novigByKey.set(key, { snap: s, parsed: p });
  }

  const rows: MatchRow[] = [];
  let prophetParsed = 0;
  for (const s of prophetAll) {
    const p = parseProphet(s);
    if (!p || !s.starts_at) continue;
    prophetParsed++;
    const key = `${sportKey(s.sport)}|${canonTeam(p.away)}|${canonTeam(p.home)}|${bucketHour(s.starts_at)}`;
    const n = novigByKey.get(key);
    if (!n) continue;
    const sumA =
      n.parsed.homeAsk != null && p.awayAsk != null ? n.parsed.homeAsk + p.awayAsk : null;
    const sumB =
      n.parsed.awayAsk != null && p.homeAsk != null ? n.parsed.awayAsk + p.homeAsk : null;
    let bestSum: number | null = null;
    let bestSide: MatchRow['bestSide'] = null;
    if (sumA != null && (bestSum == null || sumA < bestSum)) {
      bestSum = sumA;
      bestSide = 'novigHome+prophetAway';
    }
    if (sumB != null && (bestSum == null || sumB < bestSum)) {
      bestSum = sumB;
      bestSide = 'novigAwayVsProphetHome';
    }
    rows.push({
      sport: sportKey(s.sport),
      away: p.away,
      home: p.home,
      startsAt: s.starts_at,
      novig: n.parsed,
      prophet: p,
      sumNovigHomeVsProphetAway: sumA,
      sumNovigAwayVsProphetHome: sumB,
      bestSum,
      bestSide,
    });
  }

  rows.sort((a, b) => (a.bestSum ?? Infinity) - (b.bestSum ?? Infinity));

  const arbs = rows.filter((r) => r.bestSum != null && r.bestSum < 1.0);

  console.log(`NoVig moneylines parsed:    ${novigParsed}`);
  console.log(`ProphetX moneylines parsed: ${prophetParsed}`);
  console.log(`Matched games:              ${rows.length}`);
  console.log(`Sub-1.00 sums (real arbs):  ${arbs.length}`);
  console.log('');

  const fmt = (n: number | null): string => (n == null ? '    —' : n.toFixed(4));

  const showRow = (r: MatchRow, label: string) => {
    const edge = r.bestSum != null ? `${((1 - r.bestSum) * 100).toFixed(2)}pp` : '—';
    console.log(`${label}  [${r.sport}]  ${r.away} @ ${r.home}   ${r.startsAt.slice(0, 16)}`);
    console.log(
      `    NoVig:    home_ask=${fmt(r.novig.homeAsk)}  away_ask=${fmt(r.novig.awayAsk)}`,
    );
    console.log(
      `    ProphetX: home_ask=${fmt(r.prophet.homeAsk)}  away_ask=${fmt(r.prophet.awayAsk)}`,
    );
    console.log(
      `    NoVig-home+ProphetX-away=${fmt(r.sumNovigHomeVsProphetAway)}   NoVig-away+ProphetX-home=${fmt(
        r.sumNovigAwayVsProphetHome,
      )}`,
    );
    console.log(`    best=${fmt(r.bestSum)}  edge=${edge}  side=${r.bestSide ?? '—'}`);
    console.log('');
  };

  console.log(`=== Top 20 tightest cross-book sums ===`);
  for (const r of rows.slice(0, 20)) showRow(r, '   ');

  if (arbs.length > 0) {
    console.log(`=== ${arbs.length} ARB${arbs.length === 1 ? '' : 'S'} (sum < 1.00) ===`);
    for (const r of arbs) showRow(r, '!!!');
  }
}

main();
