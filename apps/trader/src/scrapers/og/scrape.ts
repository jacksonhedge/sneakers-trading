import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot, MarketPhase } from '../types.js';
import { computeOverround } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../../..');

const API = 'https://og.com/api/proxy/public/knock-out/og/public/api/v1';

const DEFAULT_GROUPS = [
  'pro-basketball',
  'baseball',
  'hockey',
  'golf',
  'mma',
  'crypto',
  'financials',
  'politics',
  'culture',
  'companies',
  'economics',
];

const HEADERS = { accept: 'application/json' } as const;

interface OgEvent {
  id: string;
  event_kind?: string;
  event_kind_slug?: string;
  event_type?: string;
  title: string;
  event_date?: string;
  payout_date?: string;
  status?: string;
  slug?: string;
}

interface OgContract {
  id: string;
  team_name?: string;
  contract_title: string;
  participant_name?: string;
  yes?: string;
  no?: string;
  chance?: string;
  no_chance?: string;
  status?: string;
  symbol?: string;
  exchange_fee?: string;
  technology_fee?: string;
  market_type_config?: { name?: string; title?: string; period?: string };
}

interface OgContractsGroup {
  event_id: string;
  event_type?: string;
  event_status?: string;
  event_kind?: string;
  contracts?: OgContract[];
}

async function fetchJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 429) {
    if (attempt >= 3) throw new Error(`429 after ${attempt} retries for ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    return fetchJson<T>(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}

async function fetchGroupEvents(groupSlug: string, limitPerPage = 50, maxPages = 4): Promise<OgEvent[]> {
  const all: OgEvent[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({
      status: 'active',
      limit: String(limitPerPage),
      event_kind_groups: groupSlug,
      upcoming: 'true',
      pinned: 'false',
    });
    if (cursor) q.set('starting_after', cursor);
    const data = await fetchJson<{ data?: { data?: OgEvent[]; has_more?: boolean } }>(
      `${API}/events?${q}`
    );
    const page = data.data?.data ?? [];
    if (page.length === 0) break;
    all.push(...page);
    if (!data.data?.has_more) break;
    cursor = page[page.length - 1]?.id;
    if (!cursor) break;
  }
  return all;
}

async function fetchContractsBatch(eventIds: string[]): Promise<OgContractsGroup[]> {
  if (eventIds.length === 0) return [];
  const q = new URLSearchParams({ event_id: eventIds.join(',') });
  const data = await fetchJson<{ data?: { data?: OgContractsGroup[] } }>(
    `${API}/contracts?${q}`
  );
  return data.data?.data ?? [];
}

function parsePrice(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSport(eventKind?: string, groupSlug?: string): string | undefined {
  const k = (eventKind || '').toUpperCase();
  const g = (groupSlug || '').toLowerCase();
  if (k === 'NBA' || k === 'WNBA' || g === 'pro-basketball') return 'basketball';
  if (k === 'NFL' || g === 'football') return 'football';
  if (k === 'MLB' || g === 'baseball') return 'baseball';
  if (k === 'NHL' || g === 'hockey') return 'hockey';
  if (k === 'UFC' || k === 'MMA' || g === 'mma') return 'mma';
  if (k === 'GOLF' || g === 'golf') return 'golf';
  const cryptoKinds = new Set([
    'CRYPT', 'BTC', 'ETH', 'LTC', 'BCH', 'DOGE', 'AVAX', 'LINK', 'DOT',
    'SHIB', 'XLM', 'HBAR', 'CRO', 'SOL', 'ADA', 'XRP',
  ]);
  if (cryptoKinds.has(k) || g === 'crypto') return 'crypto';
  if (g === 'financials') return 'financials';
  if (g === 'politics' || k === 'ELECT') return 'politics';
  if (g === 'culture' || k === 'CUL') return 'culture';
  if (g === 'companies') return 'companies';
  if (g === 'economics' || k === 'EC') return 'economics';
  return g || eventKind?.toLowerCase();
}

function computePhase(startIso?: string, endIso?: string): MarketPhase {
  const now = Date.now();
  const start = startIso ? Date.parse(startIso) : NaN;
  const end = endIso ? Date.parse(endIso) : NaN;
  if (!Number.isNaN(end) && now > end) return 'closed';
  if (!Number.isNaN(start) && now > start) return 'live';
  if (!Number.isNaN(start) && start - now < 6 * 60 * 60 * 1000) return 'pre_game';
  return 'opening';
}

function contractToSnapshot(
  c: OgContract,
  group: OgContractsGroup,
  event: OgEvent,
  groupSlug: string,
  ts: string
): MarketSnapshot | null {
  if (c.status && c.status !== 'active') return null;
  const yesAsk = parsePrice(c.yes);
  const noAsk = parsePrice(c.no);
  if (yesAsk == null && noAsk == null) return null;

  const outcomes = [
    { name: `YES ${c.contract_title}`, best_bid: null as number | null, best_ask: yesAsk, last_price: null as number | null },
    { name: `NO ${c.contract_title}`, best_bid: null as number | null, best_ask: noAsk, last_price: null as number | null },
  ];
  if (yesAsk != null) outcomes[1].best_bid = 1 - yesAsk;
  if (noAsk != null) outcomes[0].best_bid = 1 - noAsk;
  const overround = computeOverround([yesAsk, noAsk]);

  const sport = normalizeSport(group.event_kind ?? event.event_kind, groupSlug);
  const mtyp = c.market_type_config?.name;
  const question = `${event.title} — ${c.contract_title}`;

  return {
    platform: 'og',
    platform_market_id: c.symbol || c.id,
    question,
    tags: [sport ?? '', group.event_kind ?? '', groupSlug, mtyp ?? ''].filter(Boolean) as string[],
    sport,
    outcomes,
    overround,
    volume_traded: null,
    liquidity: null,
    starts_at: event.event_date,
    resolves_at: event.payout_date,
    phase: computePhase(event.event_date, event.payout_date),
    ts,
  };
}

export async function scrapeOg(opts: {
  groups?: string[];
  maxEventsPerGroup?: number;
  batchSize?: number;
  delayMs?: number;
} = {}): Promise<MarketSnapshot[]> {
  const groups = opts.groups ?? DEFAULT_GROUPS;
  const maxEventsPerGroup = opts.maxEventsPerGroup ?? 40;
  const batchSize = opts.batchSize ?? 20;
  const delay = opts.delayMs ?? 200;
  const ts = new Date().toISOString();
  const all: MarketSnapshot[] = [];

  for (const g of groups) {
    let events: OgEvent[] = [];
    try {
      events = (await fetchGroupEvents(g)).slice(0, maxEventsPerGroup);
    } catch (e) {
      console.warn(`  ${g}: events fetch failed — ${(e as Error).message}`);
      continue;
    }
    if (events.length === 0) { console.log(`  ${g}: 0 events`); continue; }

    const eventById = new Map<string, OgEvent>();
    for (const e of events) eventById.set(e.id, e);

    let groupCount = 0;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const ids = batch.map((e) => e.id);
      await new Promise((r) => setTimeout(r, delay));
      try {
        const groups_resp = await fetchContractsBatch(ids);
        for (const grp of groups_resp) {
          const ev = eventById.get(grp.event_id);
          if (!ev) continue;
          for (const c of grp.contracts ?? []) {
            const snap = contractToSnapshot(c, grp, ev, g, ts);
            if (snap) { all.push(snap); groupCount++; }
          }
        }
      } catch (e) {
        console.warn(`    ${g} batch: ${(e as Error).message}`);
      }
    }
    console.log(`  ${g}: ${events.length} events → ${groupCount} contracts`);
  }

  return all;
}

function writeJsonl(snapshots: MarketSnapshot[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TRADER_ROOT, 'data/og');
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
  console.log('\nTop by overround:');
  for (const r of rows) {
    console.log(`  ${fmtPct(r.overround).padStart(8)}  [${r.sport}]  ${r.question.slice(0, 95)}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const groupsArg = args.find((a) => a.startsWith('--groups='));
  const groups = groupsArg ? groupsArg.slice('--groups='.length).split(',') : undefined;
  const maxArg = args.find((a) => a.startsWith('--max-events='));
  const maxEventsPerGroup = maxArg ? parseInt(maxArg.slice('--max-events='.length), 10) : 40;
  return { groups, maxEventsPerGroup };
}

async function main() {
  const opts = parseArgs();
  const label = opts.groups ? opts.groups.join(',') : DEFAULT_GROUPS.join(',');
  console.log(`Scraping OG (CDNA/Nadex stack): groups=${label} max-events/group=${opts.maxEventsPerGroup}`);
  const t0 = Date.now();
  const snapshots = await scrapeOg(opts);
  const ms = Date.now() - t0;
  const file = writeJsonl(snapshots);
  console.log(`\n${snapshots.length} contracts scraped in ${(ms / 1000).toFixed(1)}s`);
  console.log(`Wrote ${file}`);
  formatTop(snapshots, 15);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
