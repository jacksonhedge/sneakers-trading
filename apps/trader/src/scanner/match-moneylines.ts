import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot } from '../scrapers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../..');
const DATA_DIR = join(TRADER_ROOT, 'data');

// Directories this matcher reads. Each directory's JSONL rows already carry
// the right `platform` field per row — OddsAPI in particular fans multiple
// bookmakers (fanduel, draftkings, betmgm, betrivers) out of a single
// directory, so we group on m.platform, not on the directory name.
const SOURCE_DIRS = ['novig', 'prophetx', 'oddsapi'];

// Team canonicalization. Empirically every book uses the full team name; the
// one collision found in today's data is MLB's Athletics (some books write
// "Oakland Athletics", others drop the city). Add more entries here as new
// mismatches surface — prefer the shortest form that still uniquely identifies
// the team within its sport.
const TEAM_ALIASES: Record<string, string> = {
  oaklandathletics: 'athletics',
};

function canonTeam(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
  return TEAM_ALIASES[base] ?? base;
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
  football: 'football',
  american_football: 'football',
  soccer: 'soccer',
};

function sportKey(s: string | undefined): string {
  const raw = (s ?? '').toLowerCase();
  return SPORT_ALIAS[raw] ?? raw;
}

type ParsedMoneyline = {
  away: string;
  home: string;
  homeAsk: number | null;
  homeBid: number | null;
  awayAsk: number | null;
  awayBid: number | null;
};

// NoVig MONEY: question is "{HOME_CODE} — {AWAY_FULL} @ {HOME_FULL}"; outcomes
// are 3-letter codes. Home bet is whichever outcome name matches HOME_CODE.
function parseNovig(s: MarketSnapshot): ParsedMoneyline | null {
  const lastTag = s.tags[s.tags.length - 1] ?? '';
  if (lastTag !== 'MONEY') return null;
  const dashIdx = s.question.indexOf(' — ');
  if (dashIdx < 0) return null;
  const homeCode = s.question.slice(0, dashIdx).trim().toUpperCase();
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
    if (code === homeCode) {
      homeAsk = o.best_ask;
      homeBid = o.best_bid;
    } else {
      awayAsk = o.best_ask;
      awayBid = o.best_bid;
    }
  }
  return { away, home, homeAsk, homeBid, awayAsk, awayBid };
}

// ProphetX: "Moneyline — {AWAY} at {HOME}" or "Moneyline (2 Way) — {AWAY} at {HOME}".
// Outcomes are "{FULL_TEAM_NAME} {american_odds}" — strip trailing odds.
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
  return matchOutcomesByCanon(s, away, home, (n) => n.replace(oddsRe, '').trim());
}

// OddsAPI (h2h): "Moneyline — {AWAY} @ {HOME}" with outcomes as full team
// names (no trailing odds). Bookmaker is m.platform (fanduel/draftkings/etc.)
// and the h2h tag sits at tags[-2].
function parseOddsApiH2H(s: MarketSnapshot): ParsedMoneyline | null {
  const tagMarket = s.tags[s.tags.length - 2] ?? '';
  if (tagMarket !== 'h2h') return null;
  const prefix = 'Moneyline — ';
  if (!s.question.startsWith(prefix)) return null;
  const rest = s.question.slice(prefix.length);
  const atIdx = rest.indexOf(' @ ');
  if (atIdx < 0) return null;
  const away = rest.slice(0, atIdx).trim();
  const home = rest.slice(atIdx + 3).trim();
  return matchOutcomesByCanon(s, away, home, (n) => n.trim());
}

function matchOutcomesByCanon(
  s: MarketSnapshot,
  away: string,
  home: string,
  strip: (n: string) => string,
): ParsedMoneyline {
  let homeAsk: number | null = null;
  let homeBid: number | null = null;
  let awayAsk: number | null = null;
  let awayBid: number | null = null;
  const homeC = canonTeam(home);
  const awayC = canonTeam(away);
  for (const o of s.outcomes) {
    const name = strip(o.name);
    const c = canonTeam(name);
    if (c === homeC) {
      homeAsk = o.best_ask;
      homeBid = o.best_bid;
    } else if (c === awayC) {
      awayAsk = o.best_ask;
      awayBid = o.best_bid;
    }
  }
  return { away, home, homeAsk, homeBid, awayAsk, awayBid };
}

function parseAny(s: MarketSnapshot): ParsedMoneyline | null {
  switch (s.platform) {
    case 'novig':
      return parseNovig(s);
    case 'prophetx':
      return parseProphet(s);
    case 'fanduel':
    case 'draftkings':
    case 'betmgm':
    case 'betrivers':
    case 'caesars':
    case 'pointsbet':
    case 'unibet':
    case 'barstool':
    case 'wynnbet':
      return parseOddsApiH2H(s);
    default:
      return null;
  }
}

function loadLatest(dir: string): MarketSnapshot[] {
  const path = join(DATA_DIR, dir);
  let files: string[];
  try {
    files = readdirSync(path).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }
  if (!files.length) return [];
  const text = readFileSync(join(path, files[files.length - 1]), 'utf8');
  const all: MarketSnapshot[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      all.push(JSON.parse(line));
    } catch {
      // partial write mid-scrape — skip
    }
  }
  // Dedupe to latest snapshot per (platform, market_id). The platform field
  // may not equal the directory (OddsAPI emits multiple platforms into one
  // dir), so include it in the key.
  const latest = new Map<string, MarketSnapshot>();
  for (const s of all) {
    const key = `${s.platform}|${s.platform_market_id}`;
    const prev = latest.get(key);
    if (!prev || s.ts > prev.ts) latest.set(key, s);
  }
  return [...latest.values()];
}

type BookQuote = {
  platform: string;
  homeAsk: number | null;
  homeBid: number | null;
  awayAsk: number | null;
  awayBid: number | null;
  phase: string;
  ts: string;
};

type Game = {
  sport: string;
  away: string;
  home: string;
  startsAt: string;
  quotes: BookQuote[];
};

// Max allowed spread between the freshest and stalest quote on a game, in
// minutes. Two books quoted 30 min apart on a live market produce fake arbs;
// within 10 min prices haven't moved much even live.
const MAX_QUOTE_AGE_SKEW_MIN = 10;

function main(): void {
  const allSnaps: MarketSnapshot[] = [];
  for (const dir of SOURCE_DIRS) allSnaps.push(...loadLatest(dir));

  // Index: game key -> Game. First-wins for teams + startsAt display; we
  // canonicalize for grouping, but keep one human-readable version.
  const games = new Map<string, Game>();
  let parsed = 0;
  let missingStarts = 0;
  const perBook = new Map<string, number>();
  for (const s of allSnaps) {
    const p = parseAny(s);
    if (!p) continue;
    if (!s.starts_at) {
      missingStarts++;
      continue;
    }
    parsed++;
    perBook.set(s.platform, (perBook.get(s.platform) ?? 0) + 1);

    const sport = sportKey(s.sport);
    const key = `${sport}|${canonTeam(p.away)}|${canonTeam(p.home)}|${bucketHour(s.starts_at)}`;
    let g = games.get(key);
    if (!g) {
      g = { sport, away: p.away, home: p.home, startsAt: s.starts_at, quotes: [] };
      games.set(key, g);
    }
    // Replace if same book already quoted (keep latest); otherwise append.
    const existingIdx = g.quotes.findIndex((q) => q.platform === s.platform);
    const q: BookQuote = {
      platform: s.platform,
      homeAsk: p.homeAsk,
      homeBid: p.homeBid,
      awayAsk: p.awayAsk,
      awayBid: p.awayBid,
      phase: s.phase,
      ts: s.ts,
    };
    if (existingIdx >= 0) g.quotes[existingIdx] = q;
    else g.quotes.push(q);
  }

  // For each multi-book game, compute the cheapest ask on each side.
  type Row = {
    game: Game;
    cheapestHomeAsk: number | null;
    cheapestHomeBook: string | null;
    cheapestAwayAsk: number | null;
    cheapestAwayBook: string | null;
    bestSum: number | null;
  };
  const rows: Row[] = [];
  let skippedLive = 0;
  let skippedStale = 0;
  for (const g of games.values()) {
    if (g.quotes.length < 2) continue;

    // Pre-game only. Any non-pregame quote on this game contaminates the
    // compare — live prices move minute-to-minute and books update at
    // different cadences, which produces fake arbs. Allowlisted rather than
    // denylisted so an unexpected phase value (e.g. 'suspended') is treated
    // as unsafe.
    if (g.quotes.some((q) => q.phase !== 'opening' && q.phase !== 'pre_game')) {
      skippedLive++;
      continue;
    }

    // Stale-quote guard: even pre-game, if one book's snapshot is much older
    // than another's, the line has likely moved between them. Skip if the ts
    // spread exceeds MAX_QUOTE_AGE_SKEW_MIN.
    const tsMs = g.quotes.map((q) => new Date(q.ts).getTime());
    const spread = Math.max(...tsMs) - Math.min(...tsMs);
    if (spread > MAX_QUOTE_AGE_SKEW_MIN * 60_000) {
      skippedStale++;
      continue;
    }

    let chHome: number | null = null,
      chHomeBk: string | null = null;
    let chAway: number | null = null,
      chAwayBk: string | null = null;
    for (const q of g.quotes) {
      if (q.homeAsk != null && (chHome == null || q.homeAsk < chHome)) {
        chHome = q.homeAsk;
        chHomeBk = q.platform;
      }
      if (q.awayAsk != null && (chAway == null || q.awayAsk < chAway)) {
        chAway = q.awayAsk;
        chAwayBk = q.platform;
      }
    }
    const bestSum = chHome != null && chAway != null ? chHome + chAway : null;
    rows.push({
      game: g,
      cheapestHomeAsk: chHome,
      cheapestHomeBook: chHomeBk,
      cheapestAwayAsk: chAway,
      cheapestAwayBook: chAwayBk,
      bestSum,
    });
  }

  rows.sort((a, b) => (a.bestSum ?? Infinity) - (b.bestSum ?? Infinity));
  const arbs = rows.filter((r) => r.bestSum != null && r.bestSum < 1.0);

  const totalSnaps = allSnaps.length;
  console.log('--- intake ---');
  console.log(`snapshots loaded:     ${totalSnaps}`);
  console.log(`moneylines parsed:    ${parsed}`);
  console.log(`missing starts_at:    ${missingStarts}`);
  for (const [bk, n] of [...perBook.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bk.padEnd(12)}  ${n}`);
  }
  console.log('');
  console.log('--- matching ---');
  console.log(`distinct games seen:  ${games.size}`);
  console.log(`skipped (any live):   ${skippedLive}`);
  console.log(`skipped (stale skew): ${skippedStale}`);
  console.log(`multi-book games:     ${rows.length}`);
  console.log(`ARBS (sum < 1.00):    ${arbs.length}`);
  console.log('');

  const fmt = (n: number | null) => (n == null ? '    —' : n.toFixed(4));

  const printRow = (r: Row, banner: string) => {
    const edge = r.bestSum != null ? `${((1 - r.bestSum) * 100).toFixed(2)}pp` : '—';
    console.log(
      `${banner}  [${r.game.sport}]  ${r.game.away} @ ${r.game.home}   ${r.game.startsAt.slice(0, 16)}`,
    );
    for (const q of r.game.quotes) {
      console.log(
        `    ${q.platform.padEnd(12)}  home_ask=${fmt(q.homeAsk)}  away_ask=${fmt(q.awayAsk)}  [${q.phase} @ ${q.ts.slice(11, 19)}]`,
      );
    }
    console.log(
      `    cheapest HOME  @ ${r.cheapestHomeBook ?? '—'}: ${fmt(r.cheapestHomeAsk)}`,
    );
    console.log(
      `    cheapest AWAY  @ ${r.cheapestAwayBook ?? '—'}: ${fmt(r.cheapestAwayAsk)}`,
    );
    console.log(`    bestSum=${fmt(r.bestSum)}   edge=${edge}`);
    console.log('');
  };

  console.log('=== Top 20 tightest cross-book sums ===');
  for (const r of rows.slice(0, 20)) printRow(r, '   ');

  if (arbs.length > 0) {
    console.log('');
    console.log(`=== ${arbs.length} REAL ARB${arbs.length === 1 ? '' : 'S'} ===`);
    for (const r of arbs) printRow(r, '!!!');
  }
}

main();
