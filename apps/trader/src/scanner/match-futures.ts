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
  // Capturing the No side too so we can do the real cross-book arb test
  // (buy YES on book A + buy NO on book B; profit if a + b < 1.00). Without
  // an explicit no_ask we'd have to synthesize from yes_bid, which depends
  // on yes-side liquidity and is unreliable on AMM/illiquid books.
  no_ask: number | null;
  no_bid: number | null;
  overround: number | null;
  volume: number | null;
  liquidity: number | null;
  phase: string;
  question: string;
}

const PLAYER_AWARD_TYPES = new Set(['reg_mvp', 'finals_mvp', 'roty', 'dpoy', 'sixth_man', 'mip']);

function normalize(snap: MarketSnapshot): NormalizedMarket | null {
  const mt = classifyMarketType(snap.question);
  if (!mt) return null;
  let subject: string | null;
  // Both platforms now extract subject from the question text. Don't use
  // outcomes[0].name for Kalshi: after the Kalshi-label disambiguation fix,
  // every binary contract has name="Yes"/"No", which collapses every Kalshi
  // binary into one fake subject="yes" group and produces phantom intra-book
  // arbs (yes=0.01, no=0.03 on the same market — looks like a 96pp edge but
  // it's just two unrelated rows clustered under "yes").
  if (snap.platform === 'polymarket' || snap.platform === 'kalshi') {
    subject = extractPolymarketSubject(snap.question);
  } else {
    subject = null;
  }
  if (!subject) return null;
  // Drop noise: 1-2 char subjects (MLB MVP regex pulls "a", "ab", etc. as alphabet suffixes).
  if (subject.replace(/\s/g, '').length <= 2) return null;
  // Belt-and-suspenders: reject the literal "yes"/"no"/"the" tokens if the
  // regex degenerates somehow.
  if (subject === 'yes' || subject === 'no' || subject === 'the') return null;
  // Drop team-named subjects on player-award markets (regex over-matches e.g. "Will Raptors win MVP...")
  if (PLAYER_AWARD_TYPES.has(mt) && TEAM_ALIASES[subject] !== undefined) return null;

  // Find Yes and No explicitly. Polymarket + Kalshi both name outcomes "Yes"/"No"
  // (post-Kalshi-label-fix). Fall back to positional [0]=yes, [1]=no for safety.
  const findOutcome = (predicate: (name: string) => boolean) =>
    snap.outcomes.find((o) => predicate(o.name.toLowerCase()));
  const yes =
    findOutcome((n) => n === 'yes' || n.startsWith('yes ')) ?? snap.outcomes[0];
  const no =
    findOutcome((n) => n === 'no' || n.startsWith('no ')) ?? snap.outcomes[1];

  return {
    platform: snap.platform,
    market_id: snap.platform_market_id,
    sport: snap.sport,
    market_type: mt,
    subject,
    yes_ask: yes?.best_ask ?? null,
    yes_bid: yes?.best_bid ?? null,
    yes_last: yes?.last_price ?? null,
    no_ask: no?.best_ask ?? null,
    no_bid: no?.best_bid ?? null,
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

// Real cross-book arb test per scanner-design principle #2:
//   buy YES on the platform with the cheapest yes_ask
//   buy NO  on the platform with the cheapest no_ask
//   if (cheapest_yes_ask + cheapest_no_ask) < 1.00, that's a guaranteed-profit arb.
//   edge = 1.00 - (sum). Margin doesn't matter for the boolean — even 0.1pp is profit.
//
// Caveats this DOESN'T model (yet):
//   • Trading fees / gas / withdrawal costs (Polymarket has 0% fees but
//     gas-paid deposits; Kalshi takes a small fee; figure ~1pp friction).
//   • Slippage from limited orderbook depth — yes_ask is best-ask only.
//   • Settlement risk if a book delists or freezes after the trade.
//   • Single-book (intra-platform) arbs are also flagged: if one platform
//     has yes_ask + no_ask < 1.00 (rare but happens on illiquid AMMs).
interface ArbSignal {
  yesPlatform: string;
  yesAsk: number;
  noPlatform: string;
  noAsk: number;
  sum: number;
  edge: number; // 1.00 - sum; positive = arb
  intraBook: boolean; // true if both legs are on the same platform
}

function findBestArb(matches: NormalizedMarket[]): ArbSignal | null {
  // Only consider markets where overround is reasonable. A book with
  // overround=147% is publishing wide stale spreads on both sides; pairing
  // its quotes with another book's would produce phantom arbs.
  const tight = matches.filter(
    (m) => m.overround != null && m.overround > 0 && m.overround <= 1.10,
  );
  const yesQuotes = tight
    .filter((m) => m.yes_ask != null && m.yes_ask > 0 && m.yes_ask < 1)
    .map((m) => ({ platform: m.platform, price: m.yes_ask as number }));
  const noQuotes = tight
    .filter((m) => m.no_ask != null && m.no_ask > 0 && m.no_ask < 1)
    .map((m) => ({ platform: m.platform, price: m.no_ask as number }));
  if (yesQuotes.length === 0 || noQuotes.length === 0) return null;

  yesQuotes.sort((a, b) => a.price - b.price);
  noQuotes.sort((a, b) => a.price - b.price);
  const cheapYes = yesQuotes[0];
  const cheapNo = noQuotes[0];
  const sum = cheapYes.price + cheapNo.price;
  return {
    yesPlatform: cheapYes.platform,
    yesAsk: cheapYes.price,
    noPlatform: cheapNo.platform,
    noAsk: cheapNo.price,
    sum,
    edge: 1 - sum,
    intraBook: cheapYes.platform === cheapNo.platform,
  };
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

  // Two-pass output: collect arbs, sort by edge desc, then print everything.
  // Arb-positive groups print at the top in their own banner section so they're
  // not lost in the noise of close-but-not-arb groups below.
  type EnrichedGroup = { key: string; matches: NormalizedMarket[]; arb: ArbSignal | null };
  const enriched: EnrichedGroup[] = multi.map(([key, matches]) => ({
    key,
    matches,
    arb: findBestArb(matches),
  }));

  const arbsHit = enriched.filter((g) => g.arb && g.arb.edge > 0);
  arbsHit.sort((a, b) => (b.arb!.edge - a.arb!.edge));

  if (arbsHit.length === 0) {
    console.log('No cross-book arbs found in the current snapshot (sum(best_ask) ≥ 1.00 on every matched group, or no eligible quotes).\n');
  } else {
    console.log(`\n=== ${arbsHit.length} CROSS-BOOK ARB${arbsHit.length === 1 ? '' : 'S'} (edge > 0) ===\n`);
    for (const g of arbsHit) {
      const [sport, mt, subj] = g.key.split('|');
      const a = g.arb!;
      const tag = a.intraBook ? 'INTRA-BOOK' : 'CROSS-BOOK';
      console.log(`★ [${sport}] ${mt} — ${subj}`);
      console.log(
        `  ${tag} ARB · edge=${(a.edge * 100).toFixed(2)}pp · sum=${(a.sum * 100).toFixed(2)}%`,
      );
      console.log(
        `    BUY YES @ ${a.yesPlatform.padEnd(10)} $${a.yesAsk.toFixed(3)}    +    BUY NO @ ${a.noPlatform.padEnd(10)} $${a.noAsk.toFixed(3)}    =  $${a.sum.toFixed(3)}`,
      );
      // Also dump the per-platform context so the operator can see liquidity / phase.
      for (const m of g.matches) {
        const yes = m.yes_ask != null ? `yes=${fmtPrice(m.yes_ask)}` : 'yes=—';
        const no = m.no_ask != null ? `no=${fmtPrice(m.no_ask)}` : 'no=—';
        const vol = m.volume != null ? `vol=${m.volume < 100 ? m.volume : Math.round(m.volume).toLocaleString()}` : '';
        const or = m.overround != null ? `or=${fmtPercent(m.overround)}` : '';
        console.log(`    · ${m.platform.padEnd(10)} ${yes}  ${no}  ${or.padEnd(10)} ${vol.padEnd(14)} ${m.phase}`);
      }
      console.log('');
    }
  }

  // All groups (arbs + non-arbs) — full context. Sorted by edge desc so anything
  // close-but-not-arb is at the top of the non-arb section.
  console.log(`\n=== ALL ${enriched.length} CROSS-BOOK MATCHES ===`);
  enriched.sort((a, b) => {
    const aEdge = a.arb?.edge ?? -Infinity;
    const bEdge = b.arb?.edge ?? -Infinity;
    return bEdge - aEdge;
  });

  for (const g of enriched) {
    const [sport, mt, subj] = g.key.split('|');
    console.log(`\n[${sport}] ${mt} — ${subj}`);
    for (const m of g.matches) {
      const yes = m.yes_ask != null ? `yes=${fmtPrice(m.yes_ask)}` : 'yes=—';
      const no = m.no_ask != null ? `no=${fmtPrice(m.no_ask)}` : 'no=—';
      const vol = m.volume != null ? `vol=${m.volume < 100 ? m.volume : Math.round(m.volume).toLocaleString()}` : '';
      const or = m.overround != null ? `or=${fmtPercent(m.overround)}` : '';
      console.log(`  ${m.platform.padEnd(10)} ${yes}  ${no}  ${or.padEnd(10)} ${vol.padEnd(14)} ${m.phase}`);
    }
    if (g.arb) {
      const a = g.arb;
      const sign = a.edge > 0 ? '★ ARB' : '·';
      console.log(
        `  ${sign} cheapest YES @ ${a.yesPlatform} ${a.yesAsk.toFixed(3)} + cheapest NO @ ${a.noPlatform} ${a.noAsk.toFixed(3)} = ${a.sum.toFixed(3)} (edge ${(a.edge * 100).toFixed(2)}pp)`,
      );
    } else if (g.matches.some((m) => m.overround != null && m.overround > 1.10)) {
      console.log(`  · wide on ≥1 book (overround >110%) — arb test skipped`);
    } else {
      console.log(`  · missing yes_ask or no_ask on every quote — can't test arb`);
    }
  }
}

main();
