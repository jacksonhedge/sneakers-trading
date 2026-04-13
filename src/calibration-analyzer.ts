// Calibration Analyzer - Historical analysis of 95%+ markets across all platforms
// Now backed by SQLite for fast analytical queries and persistent storage.

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import {
  db,
  DB_PATH,
  insertSnapshotBatch,
  upsertOutcomeBatch,
  resolveOutcome,
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

// ─── Types (for API parsing only — storage is in SQLite) ─────────────────────

interface ParsedMarket {
  market_id: string;
  platform: string;
  category: string;
  asset: string;
  title: string;
  yes_price: number;
  no_price: number;
  probability: number;
  side: string;
  volume: number;
  liquidity: number;
  spread: number;
  seconds_to_expiry: number;
  expiry_time: number;
  observed_at: number;
}

interface BucketRow {
  label: string;
  total: number;
  resolved: number;
  wins: number;
  losses: number;
  win_rate: number;
  expected_rate: number;
  calibration_error: number;
  avg_volume: number;
  avg_seconds_to_expiry: number;
  profit_per_500: number;
}

// ─── Main Class ──────────────────────────────────────────────────────────────

class CalibrationAnalyzer {
  private limitlessUrl = 'https://api.limitless.exchange';
  private limitlessKey = process.env.LIMITLESS_API_KEY;
  private cdcEventDurationsUrl =
    'https://web.crypto.com/api/proxy/private/knock-out/predictions/api/v1/event-durations';
  private cdcContractsUrl =
    'https://web.crypto.com/api/proxy/public/knock-out/predictions/public/api/v2/contracts';

  private scanCount = 0;
  private lastScanTime = 0;

  // ─── Data Collection: Limitless ──────────────────────────────────────────

  async collectLimitlessMarkets(): Promise<number> {
    const batch: ParsedMarket[] = [];
    try {
      const response = await fetch(`${this.limitlessUrl}/markets/active`, {
        headers: { 'X-API-Key': this.limitlessKey, 'Content-Type': 'application/json' },
      });
      if (!response.ok) return 0;

      const data = (await response.json()) as any;
      const markets = data.data || [];
      const now = Date.now();

      for (const m of markets) {
        if (!Array.isArray(m.prices) || m.prices.length < 2) continue;
        const yesPrice = m.prices[0];
        const noPrice = m.prices[1];
        const title = m.title || '';
        const titleLower = title.toLowerCase();

        const expiryMatch = title.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/);
        if (!expiryMatch) continue;
        const [, month, day, hour, min] = expiryMatch;
        const expiryDate = new Date(`2026-${month} ${day} ${hour}:${min}:00 UTC`);
        const secondsLeft = (expiryDate.getTime() - now) / 1000;
        if (secondsLeft <= 0 || secondsLeft > 3600) continue;

        let category = 'crypto';
        if (m.tags?.some((t: string) => /sport|nba|nfl|mlb|soccer|tennis/i.test(t))) category = 'sports';
        else if (m.tags?.some((t: string) => /politic|election|trump|biden/i.test(t))) category = 'politics';
        else if (secondsLeft < 600) category = 'quick';

        let asset = 'OTHER';
        if (titleLower.includes('btc')) asset = 'BTC';
        else if (titleLower.includes('eth')) asset = 'ETH';
        else if (titleLower.includes('sol')) asset = 'SOL';
        else if (titleLower.includes('xrp')) asset = 'XRP';
        else if (titleLower.includes('doge')) asset = 'DOGE';

        const volume = parseFloat(m.volume || '0');
        const liquidity = parseFloat(m.liquidity || m.open_interest || '0');

        if (yesPrice >= 0.95) {
          batch.push({
            market_id: String(m.id), platform: 'Limitless', category, asset,
            title: title.substring(0, 80), yes_price: yesPrice, no_price: noPrice,
            probability: yesPrice, side: 'YES', volume, liquidity,
            spread: Math.abs(yesPrice - (1 - noPrice)),
            seconds_to_expiry: secondsLeft, expiry_time: expiryDate.getTime(), observed_at: now,
          });
        }
        if (noPrice >= 0.95) {
          batch.push({
            market_id: `${m.id}-no`, platform: 'Limitless', category, asset,
            title: title.substring(0, 80), yes_price: yesPrice, no_price: noPrice,
            probability: noPrice, side: 'NO', volume, liquidity,
            spread: Math.abs(noPrice - (1 - yesPrice)),
            seconds_to_expiry: secondsLeft, expiry_time: expiryDate.getTime(), observed_at: now,
          });
        }
      }
    } catch { /* continue */ }

    if (batch.length > 0) {
      insertSnapshotBatch(batch);
      upsertOutcomeBatch(batch);
    }
    return batch.length;
  }

  // ─── Data Collection: Crypto.com ─────────────────────────────────────────

  async collectCryptoComMarkets(): Promise<number> {
    const batch: ParsedMarket[] = [];
    try {
      const assets = ['BTC', 'ETH', 'LTC', 'BCH', 'DOGE', 'AVAX', 'LINK', 'DOT', 'SHIB'];
      const eventIds: string[] = [];
      for (const asset of assets) {
        try {
          const r = await fetch(`${this.cdcEventDurationsUrl}?event_kind=${asset}`,
            { headers: { 'Content-Type': 'application/json' } });
          if (r.ok) {
            const d = (await r.json()) as any;
            if (d.data && Array.isArray(d.data))
              d.data.forEach((e: any) => { if (e.event_id) eventIds.push(e.event_id); });
          }
        } catch { continue; }
      }
      if (eventIds.length === 0) return 0;

      const response = await fetch(`${this.cdcContractsUrl}?event_id=${eventIds.join(',')}`,
        { headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) return 0;

      const data = (await response.json()) as any;
      const contracts = data.data || data.contracts || data || [];
      const items = Array.isArray(contracts) ? contracts : [];
      const now = Date.now();

      for (const contract of items) {
        try {
          const title = contract.label || contract.title || contract.name || '';
          const assetMatch = title.match(/BTC|ETH|LTC|BCH|DOGE|AVAX|LINK|DOT|SHIB/);
          const asset = assetMatch ? assetMatch[0] : 'OTHER';
          const expiryTime = contract.settlement_time || contract.expiry_time || contract.end_time;
          if (!expiryTime) continue;
          const expiryDate = new Date(expiryTime);
          const secondsLeft = (expiryDate.getTime() - now) / 1000;
          if (secondsLeft <= 0 || secondsLeft > 3600) continue;

          let yesProb = contract.yes_price || contract.yes_probability || 0;
          let noProb = contract.no_price || contract.no_probability || 0;
          if (yesProb > 1) yesProb /= 100;
          if (noProb > 1) noProb /= 100;

          const volume = parseFloat(contract.volume || contract.total_volume || '0');
          const liquidity = parseFloat(contract.liquidity || contract.open_interest || '0');
          const bid = parseFloat(contract.bid || '0');
          const ask = parseFloat(contract.ask || '0');
          const spread = bid > 0 ? ((ask - bid) / bid) * 100 : 0;
          const marketId = contract.id?.toString() || contract.contract_id?.toString() ||
            `cdc-${asset}-${Math.floor(expiryDate.getTime() / 1000)}`;
          const category = secondsLeft < 600 ? 'quick' : 'crypto';

          if (yesProb >= 0.95) {
            batch.push({
              market_id: marketId, platform: 'Crypto.com', category, asset,
              title: title.substring(0, 80), yes_price: yesProb, no_price: noProb,
              probability: yesProb, side: 'YES', volume, liquidity, spread,
              seconds_to_expiry: secondsLeft, expiry_time: expiryDate.getTime(), observed_at: now,
            });
          }
          if (noProb >= 0.95) {
            batch.push({
              market_id: `${marketId}-no`, platform: 'Crypto.com', category, asset,
              title: title.substring(0, 80), yes_price: yesProb, no_price: noProb,
              probability: noProb, side: 'NO', volume, liquidity, spread,
              seconds_to_expiry: secondsLeft, expiry_time: expiryDate.getTime(), observed_at: now,
            });
          }
        } catch { continue; }
      }
    } catch { /* continue */ }

    if (batch.length > 0) {
      insertSnapshotBatch(batch);
      upsertOutcomeBatch(batch);
    }
    return batch.length;
  }

  // ─── Resolution ──────────────────────────────────────────────────────────

  async checkResolutions(): Promise<number> {
    let count = 0;
    const now = Date.now();

    // Import from legacy JSON files
    this.importLocalOutcomes();

    // Auto-resolve expired Limitless markets
    const unresolvedLimitless = db.prepare(`
      SELECT market_id, side, probability FROM market_outcomes
      WHERE actual_outcome IS NULL AND platform = 'Limitless' AND expiry_time < ?
    `).all(now) as any[];

    if (unresolvedLimitless.length > 0) {
      try {
        const response = await fetch(`${this.limitlessUrl}/markets/active`, {
          headers: { 'X-API-Key': this.limitlessKey, 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          const activeIds = new Set((data.data || []).map((m: any) => String(m.id)));
          for (const row of unresolvedLimitless) {
            const baseId = row.market_id.replace(/-no$/, '');
            if (!activeIds.has(baseId) && row.probability >= 0.99) {
              resolveOutcome.run({
                market_id: row.market_id, side: row.side,
                actual_outcome: row.side, result: 'WIN', resolved_at: now,
              });
              count++;
            }
          }
        }
      } catch { /* continue */ }
    }

    // Auto-resolve expired Crypto.com markets
    const unresolvedCdc = db.prepare(`
      SELECT market_id, side, probability FROM market_outcomes
      WHERE actual_outcome IS NULL AND platform = 'Crypto.com' AND expiry_time < ?
    `).all(now) as any[];

    for (const row of unresolvedCdc) {
      if (row.probability >= 0.99) {
        resolveOutcome.run({
          market_id: row.market_id, side: row.side,
          actual_outcome: row.side, result: 'WIN', resolved_at: now,
        });
        count++;
      }
    }

    return count;
  }

  private importLocalOutcomes(): void {
    const files = [
      path.join(__dirname, '../logs', 'market-outcomes.json'),
      path.join(__dirname, '../logs', 'crypto-com-market-outcomes.json'),
    ];
    for (const filePath of files) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const outcomes = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        for (const o of outcomes) {
          if (!o.actual_outcome) continue;
          resolveOutcome.run({
            market_id: o.market_id,
            side: o.predicted_side || 'YES',
            actual_outcome: o.actual_outcome,
            result: (o.predicted_side || 'YES') === o.actual_outcome ? 'WIN' : 'LOSS',
            resolved_at: o.checked_time || Date.now(),
          });
        }
      } catch { continue; }
    }
  }

  // ─── SQL-Driven Analysis ─────────────────────────────────────────────────

  private queryBucket(label: string, where: string, params: any, expectedRate?: number): BucketRow {
    const row = db.prepare(`
      SELECT
        COUNT(*)                                              AS total,
        SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END)  AS resolved,
        SUM(CASE WHEN result = 'WIN'  THEN 1 ELSE 0 END)     AS wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END)     AS losses,
        AVG(volume)                                           AS avg_volume,
        AVG(seconds_to_expiry)                                AS avg_tte,
        AVG(probability)                                      AS avg_prob
      FROM market_outcomes
      WHERE probability >= 0.95 ${where}
    `).get(params) as any;

    const total = row.total || 0;
    const resolved = row.resolved || 0;
    const wins = row.wins || 0;
    const losses = row.losses || 0;
    const winRate = resolved > 0 ? (wins / resolved) * 100 : 0;
    const expected = expectedRate ?? ((row.avg_prob || 0) * 100);
    const profitPer500 = resolved > 0 ? ((wins * 500 - losses * 500) / resolved) : 0;

    return {
      label,
      total,
      resolved,
      wins,
      losses,
      win_rate: parseFloat(winRate.toFixed(1)),
      expected_rate: parseFloat(expected.toFixed(1)),
      calibration_error: parseFloat(Math.abs(winRate - expected).toFixed(1)),
      avg_volume: parseFloat((row.avg_volume || 0).toFixed(0)),
      avg_seconds_to_expiry: parseFloat((row.avg_tte || 0).toFixed(0)),
      profit_per_500: parseFloat(profitPer500.toFixed(2)),
    };
  }

  generateReport() {
    const stats = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved
      FROM market_outcomes WHERE probability >= 0.95
    `).get() as any;

    const snapCount = (db.prepare('SELECT COUNT(*) as c FROM market_snapshots').get() as any).c;

    // By probability
    const probBands = [
      { min: 0.99, max: 1.001, label: '99-100% (LOCKS)', expected: 99.5 },
      { min: 0.98, max: 0.99,  label: '98-99% (HAMMERS)', expected: 98.5 },
      { min: 0.97, max: 0.98,  label: '97-98% (GOOD)', expected: 97.5 },
      { min: 0.96, max: 0.97,  label: '96-97%', expected: 96.5 },
      { min: 0.95, max: 0.96,  label: '95-96%', expected: 95.5 },
    ];
    const byProbability = probBands.map((b) =>
      this.queryBucket(b.label, 'AND probability >= @min AND probability < @max', { min: b.min, max: b.max }, b.expected)
    );

    // By time to expiry
    const tteBands = [
      { min: 0, max: 60,   label: '<1 min (last second)' },
      { min: 60, max: 120,  label: '1-2 min (critical)' },
      { min: 120, max: 300, label: '2-5 min (urgent)' },
      { min: 300, max: 600, label: '5-10 min (standard)' },
      { min: 600, max: 1800, label: '10-30 min (early)' },
      { min: 1800, max: 3600, label: '30-60 min (very early)' },
    ];
    const byTimeToExpiry = tteBands.map((b) =>
      this.queryBucket(b.label, 'AND seconds_to_expiry >= @min AND seconds_to_expiry < @max', { min: b.min, max: b.max })
    );

    // By liquidity
    const liqBands = [
      { min: 0, max: 100, label: '<$100 (thin)' },
      { min: 100, max: 1000, label: '$100-$1K (light)' },
      { min: 1000, max: 10000, label: '$1K-$10K (normal)' },
      { min: 10000, max: 100000, label: '$10K-$100K (deep)' },
      { min: 100000, max: 1e12, label: '$100K+ (very deep)' },
    ];
    const byLiquidity = liqBands.map((b) =>
      this.queryBucket(b.label, 'AND volume >= @min AND volume < @max', { min: b.min, max: b.max })
    );

    // By category
    const byCategory = ['crypto', 'sports', 'politics', 'quick', 'other'].map((cat) =>
      this.queryBucket(cat.toUpperCase(), "AND category = @cat", { cat })
    );

    // By platform
    const byPlatform = ['Limitless', 'Crypto.com'].map((plat) =>
      this.queryBucket(plat, "AND platform = @plat", { plat })
    );

    // By asset (top 8)
    const assetRows = db.prepare(`
      SELECT asset, COUNT(*) as cnt FROM market_outcomes
      WHERE probability >= 0.95 GROUP BY asset ORDER BY cnt DESC LIMIT 8
    `).all() as any[];
    const byAsset = assetRows.map((r: any) =>
      this.queryBucket(r.asset, "AND asset = @asset", { asset: r.asset })
    );

    // Recommendations
    const recommendations = this.generateRecommendations(byProbability, byTimeToExpiry, byLiquidity, byCategory);

    return {
      generated_at: new Date().toISOString(),
      total_snapshots: snapCount,
      total_markets_tracked: stats.total || 0,
      total_resolved: stats.resolved || 0,
      by_probability: byProbability,
      by_time_to_expiry: byTimeToExpiry,
      by_liquidity: byLiquidity,
      by_category: byCategory,
      by_platform: byPlatform,
      by_asset: byAsset,
      recommendations,
    };
  }

  private generateRecommendations(
    byProb: BucketRow[], byTTE: BucketRow[], byLiq: BucketRow[], byCat: BucketRow[]
  ): string[] {
    const recs: string[] = [];

    const resolvedProb = byProb.filter((b) => b.resolved >= 5);
    if (resolvedProb.length > 0) {
      const best = resolvedProb.reduce((a, b) => b.profit_per_500 > a.profit_per_500 ? b : a);
      recs.push(`BEST PROBABILITY BAND: ${best.label} — ${best.win_rate}% win rate, $${best.profit_per_500}/trade (n=${best.resolved})`);
      resolvedProb.filter((b) => b.win_rate < b.expected_rate - 5).forEach((b) => {
        recs.push(`WARNING: ${b.label} underperforms by ${b.calibration_error}% — actual ${b.win_rate}% vs expected ${b.expected_rate}%`);
      });
    }

    const resolvedTTE = byTTE.filter((b) => b.resolved >= 5);
    if (resolvedTTE.length > 0) {
      const best = resolvedTTE.reduce((a, b) => b.profit_per_500 > a.profit_per_500 ? b : a);
      recs.push(`BEST TIME WINDOW: ${best.label} — ${best.win_rate}% win rate (n=${best.resolved})`);
    }

    const resolvedLiq = byLiq.filter((b) => b.resolved >= 5);
    if (resolvedLiq.length > 0) {
      const best = resolvedLiq.reduce((a, b) => b.profit_per_500 > a.profit_per_500 ? b : a);
      recs.push(`BEST LIQUIDITY: ${best.label} — ${best.win_rate}% win rate (n=${best.resolved})`);
    }

    byCat.filter((b) => b.resolved >= 3).forEach((b) => {
      recs.push(`${b.label}: ${b.win_rate}% win rate across ${b.resolved} resolved markets`);
    });

    const allResolved = byProb.reduce((s, b) => s + b.resolved, 0);
    const allWins = byProb.reduce((s, b) => s + b.wins, 0);
    if (allResolved >= 10) {
      recs.push(`OVERALL: ${((allWins / allResolved) * 100).toFixed(1)}% win rate across ${allResolved} resolved 95%+ markets`);
      const safe = resolvedProb.filter((b) => b.win_rate >= b.expected_rate - 2);
      if (safe.length > 0) {
        const s = safe[safe.length - 1];
        recs.push(`SAFE TARGET: ${s.label} is well-calibrated (${s.win_rate}% actual vs ${s.expected_rate}% expected)`);
      }
    } else {
      recs.push(`NEED MORE DATA: Only ${allResolved} resolved — need 10+ for reliable analysis. Keep scanner running.`);
    }

    return recs;
  }

  // ─── Display ─────────────────────────────────────────────────────────────

  displayReport(report: any): void {
    console.clear();
    console.log(`\n  CALIBRATION ANALYZER — ${new Date().toLocaleTimeString()} (scan #${this.scanCount})`);
    console.log(`  DB: ${DB_PATH}`);
    console.log(`  Snapshots: ${report.total_snapshots} | Outcomes: ${report.total_markets_tracked} | Resolved: ${report.total_resolved}\n`);
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');

    console.log('  BY PROBABILITY BAND\n');
    this.displayTable(report.by_probability);

    console.log('\n  BY TIME TO EXPIRY\n');
    this.displayTable(report.by_time_to_expiry);

    console.log('\n  BY LIQUIDITY / VOLUME\n');
    this.displayTable(report.by_liquidity);

    console.log('\n  BY CATEGORY\n');
    this.displayTable(report.by_category.filter((b: any) => b.total > 0));

    console.log('\n  BY PLATFORM\n');
    this.displayTable(report.by_platform.filter((b: any) => b.total > 0));

    if (report.by_asset.length > 0) {
      console.log('\n  BY ASSET\n');
      this.displayTable(report.by_asset);
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════════════');
    console.log('\n  RECOMMENDATIONS\n');
    report.recommendations.forEach((rec: string, i: number) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
    console.log('');
  }

  private displayTable(buckets: BucketRow[]): void {
    console.log('  Band                    | Total | Resolved | Wins | Losses | Win%   | Expected | CalErr  | $/trade');
    console.log('  ────────────────────────┼───────┼──────────┼──────┼────────┼────────┼──────────┼─────────┼────────');
    buckets.forEach((b) => {
      const label = b.label.padEnd(24);
      const total = String(b.total).padStart(5);
      const resolved = String(b.resolved).padStart(8);
      const wins = String(b.wins).padStart(4);
      const losses = String(b.losses).padStart(6);
      const wr = b.resolved > 0 ? `${b.win_rate}%`.padStart(6) : '   N/A';
      const er = `${b.expected_rate}%`.padStart(8);
      const ce = b.resolved > 0 ? `${b.calibration_error}%`.padStart(7) : '    N/A';
      const pf = b.resolved > 0 ? `$${b.profit_per_500}`.padStart(7) : '    N/A';
      console.log(`  ${label} | ${total} | ${resolved} | ${wins} | ${losses} | ${wr} | ${er} | ${ce} | ${pf}`);
    });
  }

  // ─── Main Loop ───────────────────────────────────────────────────────────

  async scan(): Promise<void> {
    this.scanCount++;
    this.lastScanTime = Date.now();

    await Promise.all([
      this.collectLimitlessMarkets(),
      this.collectCryptoComMarkets(),
    ]);

    await this.checkResolutions();

    const report = this.generateReport();
    this.displayReport(report);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const analyzer = new CalibrationAnalyzer();

(async () => {
  console.log('  Starting Calibration Analyzer (SQLite-backed)');
  console.log(`  Database: ${DB_PATH}`);
  console.log('  Collecting: Limitless + Crypto.com Predict | 95%+ probability | <1hr to expiry\n');

  await analyzer.scan();

  setInterval(async () => {
    await analyzer.scan();
  }, 15000);
})();

export default CalibrationAnalyzer;
