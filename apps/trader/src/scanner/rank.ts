import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketSnapshot } from '../scrapers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TRADER_ROOT = resolve(__dirname, '../..');
export const DATA_DIR = join(TRADER_ROOT, 'data');

export interface LiquidityGate {
  minVolume?: number;
  minLiquidity?: number;
  requireTwoSided?: boolean;
  maxSpreadPerSide?: number;
}

export const DEFAULT_GATE: LiquidityGate = {
  minVolume: 500,
  minLiquidity: 0,
  requireTwoSided: true,
  maxSpreadPerSide: 0.15,
};

function toNum(v: unknown): number {
  if (v == null) return NaN;
  return typeof v === 'number' ? v : parseFloat(String(v));
}

export function passesGate(s: MarketSnapshot, gate: LiquidityGate = DEFAULT_GATE): boolean {
  if (gate.requireTwoSided) {
    const hasBothSides = s.outcomes.every(
      (o) => o.best_bid != null && o.best_ask != null && o.best_bid > 0 && o.best_ask > 0
    );
    if (!hasBothSides) return false;
  }
  if (gate.maxSpreadPerSide != null) {
    for (const o of s.outcomes) {
      if (o.best_bid == null || o.best_ask == null) continue;
      const spread = o.best_ask - o.best_bid;
      if (spread > gate.maxSpreadPerSide) return false;
    }
  }
  const vol = toNum(s.volume_traded);
  const liq = toNum(s.liquidity);
  const minVol = gate.minVolume ?? 0;
  const minLiq = gate.minLiquidity ?? 0;
  if (minVol > 0 && !(Number.isFinite(vol) && vol >= minVol)) return false;
  if (minLiq > 0 && !(Number.isFinite(liq) && liq >= minLiq)) return false;
  return true;
}

export function rankByOverround(
  snapshots: MarketSnapshot[],
  opts: { limit?: number; gate?: LiquidityGate } = {}
): MarketSnapshot[] {
  const gate = opts.gate ?? DEFAULT_GATE;
  return snapshots
    .filter((s) => s.overround !== null && passesGate(s, gate))
    .sort((a, b) => (b.overround! - a.overround!))
    .slice(0, opts.limit ?? 25);
}

export function loadLatestJsonl(platform: string): MarketSnapshot[] {
  const dir = join(DATA_DIR, platform);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  if (!files.length) return [];
  const latest = files[files.length - 1];
  return readFileSync(join(dir, latest), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as MarketSnapshot; } catch { return null; } })
    .filter((x): x is MarketSnapshot => x !== null);
}

export function listPlatforms(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter((d) => {
    const dirPath = join(DATA_DIR, d);
    try { return readdirSync(dirPath).some((f) => f.endsWith('.jsonl')); } catch { return false; }
  });
}

function fmtPct(p: number | null | undefined): string {
  return p == null ? '—' : `${(p * 100).toFixed(2)}%`;
}
function fmtMoney(n: number | null | undefined | string): string {
  if (n == null) return '—';
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  if (!Number.isFinite(v)) return '—';
  return v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
}

export function printOverroundTable(snapshots: MarketSnapshot[], n = 20) {
  console.log('overround'.padStart(9), 'vol'.padStart(8), 'liq'.padStart(8), 'platform'.padEnd(11), 'sport'.padEnd(7), 'market');
  console.log('-'.repeat(110));
  for (const s of snapshots.slice(0, n)) {
    console.log(
      fmtPct(s.overround).padStart(9),
      fmtMoney(s.volume_traded).padStart(8),
      fmtMoney(s.liquidity).padStart(8),
      s.platform.padEnd(11),
      (s.sport ?? '').padEnd(7),
      s.question.slice(0, 75)
    );
  }
}

function parseArgs(): LiquidityGate & { limit: number; noGate: boolean } {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const get = (k: string, def: number) => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    return a ? parseInt(a.slice(k.length + 3), 10) : def;
  };
  return {
    limit: get('limit', 25),
    minVolume: get('min-volume', 100),
    minLiquidity: get('min-liquidity', 100),
    requireTwoSided: !args.includes('--no-two-sided'),
    noGate: args.includes('--no-gate'),
  };
}

function main() {
  const opts = parseArgs();
  const platforms = listPlatforms();
  if (!platforms.length) { console.log('No scraped data yet. Run pnpm scrape:polymarket / scrape:kalshi first.'); return; }
  const all: MarketSnapshot[] = [];
  for (const p of platforms) {
    const rows = loadLatestJsonl(p);
    all.push(...rows);
    console.log(`  loaded ${rows.length} from ${p}`);
  }
  console.log(`\nTotal: ${all.length} snapshots across ${platforms.length} platforms`);

  const gate = opts.noGate ? { minVolume: 0, minLiquidity: 0, requireTwoSided: false, maxSpreadPerSide: 1 } : {
    minVolume: opts.minVolume,
    minLiquidity: opts.minLiquidity,
    requireTwoSided: opts.requireTwoSided,
    maxSpreadPerSide: 0.15,
  };
  const gated = rankByOverround(all, { limit: opts.limit, gate });
  const label = opts.noGate ? 'no gate' : `vol≥${opts.minVolume}, both-sided, per-side spread ≤15pp`;
  console.log(`\nTop ${opts.limit} by overround  (gate: ${label})\n`);
  printOverroundTable(gated, opts.limit);

  if (!opts.noGate) {
    const ungated = rankByOverround(all, { limit: opts.limit, gate: { minVolume: 0, minLiquidity: 0, requireTwoSided: false } });
    const gatedIds = new Set(gated.map((g) => `${g.platform}:${g.platform_market_id}`));
    const filteredOut = ungated.filter((u) => !gatedIds.has(`${u.platform}:${u.platform_market_id}`)).length;
    console.log(`\n(gate filtered out ${filteredOut} noisy high-overround rows — run with --no-gate to see them)`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main();
}
