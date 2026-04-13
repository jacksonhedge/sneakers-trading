// Market Correlation Analyzer
// Finds markets that behave similarly over time horizons.
// Uses the SQLite snapshot time-series to detect:
//   1. Cross-asset price correlation (do BTC and ETH markets move together?)
//   2. Time-of-day patterns (are certain hours more predictable?)
//   3. Platform divergence (does Limitless price differently than Crypto.com?)
//   4. Momentum clusters (do groups of markets trend the same way near expiry?)
//   5. Contagion patterns (when one market flips, do others follow?)

import { db, DB_PATH } from './db.js';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

// ─── Types ───────────────────────────────────────────────────────────────────

interface PriceSeries {
  market_id: string;
  asset: string;
  platform: string;
  category: string;
  points: { t: number; p: number }[];  // timestamp, probability
}

interface CorrelationPair {
  market_a: string;
  market_b: string;
  asset_a: string;
  asset_b: string;
  correlation: number;        // -1 to 1 (Pearson)
  overlap_points: number;     // how many matching timestamps
  direction: 'positive' | 'negative' | 'none';
  strength: 'strong' | 'moderate' | 'weak';
}

interface HourPattern {
  hour_utc: number;
  total_markets: number;
  resolved: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_probability: number;
  avg_volume: number;
}

interface MomentumCluster {
  cluster_id: number;
  markets: string[];
  assets: string[];
  avg_momentum: number;       // avg price change in final 5 min
  direction: 'up' | 'down' | 'flat';
  outcome_rate: number;       // win rate for this cluster
  size: number;
}

interface PlatformDivergence {
  asset: string;
  limitless_avg_prob: number;
  crypto_com_avg_prob: number;
  divergence: number;         // absolute difference
  limitless_win_rate: number;
  crypto_com_win_rate: number;
  better_platform: string;
}

// ─── Pearson Correlation ─────────────────────────────────────────────────────

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// ─── Main Class ──────────────────────────────────────────────────────────────

class MarketCorrelationAnalyzer {

  // ─── 1. Cross-Asset Correlation ────────────────────────────────────────

  findCorrelatedMarkets(windowMinutes: number = 60): CorrelationPair[] {
    // Get all markets with enough snapshots in the time window
    const cutoff = Date.now() - windowMinutes * 60 * 1000;

    const markets = db.prepare(`
      SELECT market_id, asset, platform, category
      FROM market_snapshots
      WHERE observed_at > @cutoff
      GROUP BY market_id
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `).all({ cutoff }) as any[];

    // Build price series for each market
    const seriesMap = new Map<string, PriceSeries>();
    for (const m of markets) {
      const points = db.prepare(`
        SELECT observed_at as t, probability as p
        FROM market_snapshots
        WHERE market_id = @market_id AND observed_at > @cutoff
        ORDER BY observed_at
      `).all({ market_id: m.market_id, cutoff }) as any[];

      seriesMap.set(m.market_id, {
        market_id: m.market_id,
        asset: m.asset,
        platform: m.platform,
        category: m.category,
        points,
      });
    }

    // Compute pairwise correlations (only between different assets — same-asset is obvious)
    const pairs: CorrelationPair[] = [];
    const marketIds = Array.from(seriesMap.keys());

    for (let i = 0; i < marketIds.length; i++) {
      for (let j = i + 1; j < marketIds.length; j++) {
        const a = seriesMap.get(marketIds[i])!;
        const b = seriesMap.get(marketIds[j])!;

        // Align time series: find overlapping timestamps (within 10s tolerance)
        const alignedA: number[] = [];
        const alignedB: number[] = [];

        for (const pa of a.points) {
          const match = b.points.find((pb) => Math.abs(pa.t - pb.t) < 10000);
          if (match) {
            alignedA.push(pa.p);
            alignedB.push(match.p);
          }
        }

        if (alignedA.length < 5) continue;

        const corr = pearsonCorrelation(alignedA, alignedB);
        const absCorr = Math.abs(corr);
        if (absCorr < 0.3) continue; // skip weak correlations

        pairs.push({
          market_a: a.market_id,
          market_b: b.market_id,
          asset_a: a.asset,
          asset_b: b.asset,
          correlation: parseFloat(corr.toFixed(3)),
          overlap_points: alignedA.length,
          direction: corr > 0.1 ? 'positive' : corr < -0.1 ? 'negative' : 'none',
          strength: absCorr >= 0.7 ? 'strong' : absCorr >= 0.5 ? 'moderate' : 'weak',
        });
      }
    }

    return pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  // ─── 2. Time-of-Day Patterns ──────────────────────────────────────────

  analyzeHourlyPatterns(): HourPattern[] {
    const rows = db.prepare(`
      SELECT
        CAST((expiry_time / 3600000) % 24 AS INTEGER)           AS hour_utc,
        COUNT(*)                                                  AS total_markets,
        SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END)      AS resolved,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END)          AS wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END)         AS losses,
        AVG(probability)                                          AS avg_probability,
        AVG(volume)                                               AS avg_volume
      FROM market_outcomes
      WHERE probability >= 0.95
      GROUP BY hour_utc
      ORDER BY hour_utc
    `).all() as any[];

    return rows.map((r) => ({
      hour_utc: r.hour_utc,
      total_markets: r.total_markets,
      resolved: r.resolved || 0,
      wins: r.wins || 0,
      losses: r.losses || 0,
      win_rate: r.resolved > 0 ? parseFloat(((r.wins / r.resolved) * 100).toFixed(1)) : 0,
      avg_probability: parseFloat((r.avg_probability || 0).toFixed(3)),
      avg_volume: parseFloat((r.avg_volume || 0).toFixed(0)),
    }));
  }

  // ─── 3. Platform Divergence ───────────────────────────────────────────

  analyzePlatformDivergence(): PlatformDivergence[] {
    const assets = db.prepare(`
      SELECT DISTINCT asset FROM market_outcomes
      WHERE probability >= 0.95 AND asset != 'OTHER'
      GROUP BY asset HAVING COUNT(DISTINCT platform) > 1
    `).all() as any[];

    return assets.map((row: any) => {
      const limitless = db.prepare(`
        SELECT AVG(probability) as avg_prob,
               SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved
        FROM market_outcomes
        WHERE asset = @asset AND platform = 'Limitless' AND probability >= 0.95
      `).get({ asset: row.asset }) as any;

      const cdc = db.prepare(`
        SELECT AVG(probability) as avg_prob,
               SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved
        FROM market_outcomes
        WHERE asset = @asset AND platform = 'Crypto.com' AND probability >= 0.95
      `).get({ asset: row.asset }) as any;

      const lAvg = limitless?.avg_prob || 0;
      const cAvg = cdc?.avg_prob || 0;
      const lWR = limitless?.resolved > 0 ? (limitless.wins / limitless.resolved) * 100 : 0;
      const cWR = cdc?.resolved > 0 ? (cdc.wins / cdc.resolved) * 100 : 0;

      return {
        asset: row.asset,
        limitless_avg_prob: parseFloat((lAvg * 100).toFixed(1)),
        crypto_com_avg_prob: parseFloat((cAvg * 100).toFixed(1)),
        divergence: parseFloat(Math.abs(lAvg - cAvg).toFixed(3)),
        limitless_win_rate: parseFloat(lWR.toFixed(1)),
        crypto_com_win_rate: parseFloat(cWR.toFixed(1)),
        better_platform: lWR >= cWR ? 'Limitless' : 'Crypto.com',
      };
    });
  }

  // ─── 4. Momentum Clustering ───────────────────────────────────────────

  findMomentumClusters(): MomentumCluster[] {
    // For each market, calculate price change in final 5 minutes
    const markets = db.prepare(`
      SELECT DISTINCT market_id, asset FROM market_snapshots
      WHERE seconds_to_expiry <= 300
      GROUP BY market_id
      HAVING COUNT(*) >= 3
    `).all() as any[];

    interface MomentumEntry {
      market_id: string;
      asset: string;
      momentum: number;
    }

    const momentums: MomentumEntry[] = [];

    for (const m of markets) {
      const points = db.prepare(`
        SELECT probability, seconds_to_expiry
        FROM market_snapshots
        WHERE market_id = @market_id AND seconds_to_expiry <= 300
        ORDER BY seconds_to_expiry DESC
      `).all({ market_id: m.market_id }) as any[];

      if (points.length < 2) continue;

      const first = points[0].probability;
      const last = points[points.length - 1].probability;
      const momentum = last - first; // positive = price went up toward expiry

      momentums.push({ market_id: m.market_id, asset: m.asset, momentum });
    }

    if (momentums.length === 0) return [];

    // Simple clustering: group by momentum direction and magnitude
    const clusters: MomentumCluster[] = [];
    const buckets = [
      { id: 1, label: 'strong_up', min: 0.02, max: Infinity },
      { id: 2, label: 'mild_up', min: 0.005, max: 0.02 },
      { id: 3, label: 'flat', min: -0.005, max: 0.005 },
      { id: 4, label: 'mild_down', min: -0.02, max: -0.005 },
      { id: 5, label: 'strong_down', min: -Infinity, max: -0.02 },
    ];

    for (const bucket of buckets) {
      const members = momentums.filter(
        (m) => m.momentum >= bucket.min && m.momentum < bucket.max
      );
      if (members.length === 0) continue;

      const marketIds = members.map((m) => m.market_id);
      const avgMomentum = members.reduce((s, m) => s + m.momentum, 0) / members.length;

      // Check outcomes for this cluster
      const placeholders = marketIds.map(() => '?').join(',');
      const outcomes = db.prepare(`
        SELECT
          SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved
        FROM market_outcomes
        WHERE market_id IN (${placeholders})
      `).get(...marketIds) as any;

      clusters.push({
        cluster_id: bucket.id,
        markets: marketIds.slice(0, 10), // cap display
        assets: [...new Set(members.map((m) => m.asset))],
        avg_momentum: parseFloat(avgMomentum.toFixed(4)),
        direction: avgMomentum > 0.005 ? 'up' : avgMomentum < -0.005 ? 'down' : 'flat',
        outcome_rate: outcomes?.resolved > 0
          ? parseFloat(((outcomes.wins / outcomes.resolved) * 100).toFixed(1))
          : 0,
        size: members.length,
      });
    }

    return clusters;
  }

  // ─── 5. Contagion / Lead-Lag Detection ────────────────────────────────

  findLeadLagRelationships(): Array<{
    leader: string; follower: string;
    leader_asset: string; follower_asset: string;
    lag_seconds: number; correlation: number;
  }> {
    const results: any[] = [];
    const cutoff = Date.now() - 3600000; // last hour

    // Get markets with enough data
    const markets = db.prepare(`
      SELECT market_id, asset FROM market_snapshots
      WHERE observed_at > @cutoff
      GROUP BY market_id HAVING COUNT(*) >= 8
      LIMIT 30
    `).all({ cutoff }) as any[];

    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const a = markets[i];
        const b = markets[j];

        const seriesA = db.prepare(`
          SELECT observed_at as t, probability as p FROM market_snapshots
          WHERE market_id = @mid AND observed_at > @cutoff ORDER BY observed_at
        `).all({ mid: a.market_id, cutoff }) as any[];

        const seriesB = db.prepare(`
          SELECT observed_at as t, probability as p FROM market_snapshots
          WHERE market_id = @mid AND observed_at > @cutoff ORDER BY observed_at
        `).all({ mid: b.market_id, cutoff }) as any[];

        if (seriesA.length < 5 || seriesB.length < 5) continue;

        // Compute changes (deltas)
        const deltasA = seriesA.slice(1).map((p: any, i: number) => ({
          t: p.t, d: p.p - seriesA[i].p,
        }));
        const deltasB = seriesB.slice(1).map((p: any, i: number) => ({
          t: p.t, d: p.p - seriesB[i].p,
        }));

        // Try different lags: does A's movement predict B's movement N seconds later?
        for (const lagMs of [15000, 30000, 60000]) {
          const alignedA: number[] = [];
          const alignedB: number[] = [];

          for (const da of deltasA) {
            const match = deltasB.find((db: any) => Math.abs((db.t - lagMs) - da.t) < 10000);
            if (match) {
              alignedA.push(da.d);
              alignedB.push(match.d);
            }
          }

          if (alignedA.length < 5) continue;

          const corr = pearsonCorrelation(alignedA, alignedB);
          if (Math.abs(corr) >= 0.5) {
            results.push({
              leader: a.market_id,
              follower: b.market_id,
              leader_asset: a.asset,
              follower_asset: b.asset,
              lag_seconds: lagMs / 1000,
              correlation: parseFloat(corr.toFixed(3)),
            });
          }
        }
      }
    }

    return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 20);
  }

  // ─── 6. Regime Detection (probability trajectory shapes) ──────────────

  classifyTrajectories(): Array<{
    shape: string;
    count: number;
    win_rate: number;
    avg_final_prob: number;
    description: string;
  }> {
    // For each market, classify how probability evolved in the last 10 min
    const markets = db.prepare(`
      SELECT DISTINCT market_id FROM market_snapshots
      WHERE seconds_to_expiry <= 600
      GROUP BY market_id HAVING COUNT(*) >= 4
    `).all() as any[];

    const shapes: Record<string, { markets: string[]; finals: number[] }> = {
      steady_high: { markets: [], finals: [] },
      climbing: { markets: [], finals: [] },
      falling: { markets: [], finals: [] },
      volatile: { markets: [], finals: [] },
      late_surge: { markets: [], finals: [] },
      late_collapse: { markets: [], finals: [] },
    };

    for (const m of markets) {
      const points = db.prepare(`
        SELECT probability, seconds_to_expiry FROM market_snapshots
        WHERE market_id = @mid AND seconds_to_expiry <= 600
        ORDER BY seconds_to_expiry DESC
      `).all({ mid: m.market_id }) as any[];

      if (points.length < 4) continue;

      const probs = points.map((p: any) => p.probability);
      const first = probs[0];
      const last = probs[probs.length - 1];
      const mid = probs[Math.floor(probs.length / 2)];
      const change = last - first;
      const midChange = mid - first;
      const variance = probs.reduce((s, p) => s + (p - (first + last) / 2) ** 2, 0) / probs.length;

      let shape: string;
      if (Math.abs(change) < 0.005 && variance < 0.0001) {
        shape = 'steady_high';
      } else if (change > 0.01 && midChange > 0) {
        shape = 'climbing';
      } else if (change < -0.01 && midChange < 0) {
        shape = 'falling';
      } else if (variance > 0.001) {
        shape = 'volatile';
      } else if (change > 0.01 && midChange <= 0) {
        shape = 'late_surge';
      } else if (change < -0.01 && midChange >= 0) {
        shape = 'late_collapse';
      } else {
        shape = 'steady_high'; // default for small moves
      }

      shapes[shape].markets.push(m.market_id);
      shapes[shape].finals.push(last);
    }

    const descriptions: Record<string, string> = {
      steady_high: 'Probability stayed flat near extreme — confident market',
      climbing: 'Probability rose steadily toward expiry — building consensus',
      falling: 'Probability dropped toward expiry — market doubt emerging',
      volatile: 'Price swung back and forth — uncertain/contested',
      late_surge: 'Started weak but surged right before expiry',
      late_collapse: 'Started strong but collapsed right before expiry',
    };

    return Object.entries(shapes)
      .filter(([_, v]) => v.markets.length > 0)
      .map(([shape, data]) => {
        const marketIds = data.markets;
        const placeholders = marketIds.map(() => '?').join(',');
        const outcomes = marketIds.length > 0 ? db.prepare(`
          SELECT
            SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved
          FROM market_outcomes WHERE market_id IN (${placeholders})
        `).get(...marketIds) as any : { wins: 0, resolved: 0 };

        const avgFinal = data.finals.length > 0
          ? data.finals.reduce((a, b) => a + b, 0) / data.finals.length
          : 0;

        return {
          shape,
          count: marketIds.length,
          win_rate: outcomes?.resolved > 0
            ? parseFloat(((outcomes.wins / outcomes.resolved) * 100).toFixed(1))
            : 0,
          avg_final_prob: parseFloat((avgFinal * 100).toFixed(1)),
          description: descriptions[shape] || shape,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  // ─── Display ─────────────────────────────────────────────────────────────

  display(): void {
    console.clear();
    console.log(`\n  MARKET CORRELATION ANALYZER — ${new Date().toLocaleTimeString()}`);
    console.log(`  DB: ${DB_PATH}\n`);
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════\n');

    // 1. Cross-asset correlations
    console.log('  1. CROSS-MARKET CORRELATIONS (last 60 min)\n');
    const correlations = this.findCorrelatedMarkets(60);
    if (correlations.length === 0) {
      console.log('     No significant correlations found yet (need more snapshot data)\n');
    } else {
      correlations.slice(0, 10).forEach((c) => {
        const dir = c.direction === 'positive' ? '+' : c.direction === 'negative' ? '-' : '~';
        console.log(`     ${dir} ${c.asset_a} <-> ${c.asset_b}  r=${c.correlation}  (${c.strength}, ${c.overlap_points} points)`);
      });
      console.log('');
    }

    // 2. Hourly patterns
    console.log('  2. TIME-OF-DAY PATTERNS (which hours are most predictable?)\n');
    const hourly = this.analyzeHourlyPatterns();
    if (hourly.length === 0) {
      console.log('     No hourly data yet\n');
    } else {
      console.log('     Hour(UTC) | Markets | Resolved | Win%   | Avg Prob | Avg Volume');
      console.log('     ──────────┼─────────┼──────────┼────────┼─────────┼───────────');
      hourly.forEach((h) => {
        const hr = String(h.hour_utc).padStart(2, '0') + ':00';
        const wr = h.resolved > 0 ? `${h.win_rate}%` : 'N/A';
        console.log(`     ${hr.padEnd(10)}| ${String(h.total_markets).padStart(7)} | ${String(h.resolved).padStart(8)} | ${wr.padStart(6)} | ${(h.avg_probability * 100).toFixed(1).padStart(7)}% | $${h.avg_volume}`);
      });
      const bestHour = hourly.filter((h) => h.resolved >= 3).sort((a, b) => b.win_rate - a.win_rate)[0];
      if (bestHour) {
        console.log(`\n     BEST HOUR: ${String(bestHour.hour_utc).padStart(2, '0')}:00 UTC — ${bestHour.win_rate}% win rate (n=${bestHour.resolved})`);
      }
      console.log('');
    }

    // 3. Platform divergence
    console.log('  3. PLATFORM DIVERGENCE (Limitless vs Crypto.com pricing)\n');
    const divergence = this.analyzePlatformDivergence();
    if (divergence.length === 0) {
      console.log('     Need data from both platforms to compare\n');
    } else {
      divergence.forEach((d) => {
        console.log(`     ${d.asset}: Limitless ${d.limitless_avg_prob}% vs Crypto.com ${d.crypto_com_avg_prob}% (gap: ${(d.divergence * 100).toFixed(1)}%)`);
        if (d.limitless_win_rate > 0 || d.crypto_com_win_rate > 0) {
          console.log(`       Win rates: Limitless ${d.limitless_win_rate}% | Crypto.com ${d.crypto_com_win_rate}% -> ${d.better_platform} is better`);
        }
      });
      console.log('');
    }

    // 4. Momentum clusters
    console.log('  4. MOMENTUM CLUSTERS (how markets move in final 5 min)\n');
    const clusters = this.findMomentumClusters();
    if (clusters.length === 0) {
      console.log('     No momentum data yet (need snapshots within 5 min of expiry)\n');
    } else {
      clusters.forEach((c) => {
        const arrow = c.direction === 'up' ? '^' : c.direction === 'down' ? 'v' : '~';
        const wr = c.outcome_rate > 0 ? `${c.outcome_rate}% win rate` : 'no outcomes yet';
        console.log(`     ${arrow} ${c.direction.toUpperCase().padEnd(5)} | ${c.size} markets | momentum: ${(c.avg_momentum * 100).toFixed(2)}% | ${wr}`);
        console.log(`       Assets: ${c.assets.join(', ')}`);
      });
      console.log('');
    }

    // 5. Lead-lag relationships
    console.log('  5. LEAD-LAG RELATIONSHIPS (does one market predict another?)\n');
    const leadLag = this.findLeadLagRelationships();
    if (leadLag.length === 0) {
      console.log('     No lead-lag patterns detected yet\n');
    } else {
      leadLag.slice(0, 8).forEach((ll) => {
        const dir = ll.correlation > 0 ? 'same dir' : 'opposite';
        console.log(`     ${ll.leader_asset} -> ${ll.follower_asset} (${ll.lag_seconds}s lag, r=${ll.correlation}, ${dir})`);
      });
      console.log('');
    }

    // 6. Trajectory shapes
    console.log('  6. PROBABILITY TRAJECTORY SHAPES (how does price evolve before expiry?)\n');
    const trajectories = this.classifyTrajectories();
    if (trajectories.length === 0) {
      console.log('     No trajectory data yet\n');
    } else {
      trajectories.forEach((t) => {
        const wr = t.win_rate > 0 ? `${t.win_rate}% win rate` : 'no outcomes';
        console.log(`     ${t.shape.padEnd(16)} | ${String(t.count).padStart(3)} markets | avg final: ${t.avg_final_prob}% | ${wr}`);
        console.log(`       ${t.description}`);
      });

      // Key insight: which trajectory is safest?
      const withOutcomes = trajectories.filter((t) => t.win_rate > 0);
      if (withOutcomes.length > 0) {
        const safest = withOutcomes.reduce((a, b) => b.win_rate > a.win_rate ? b : a);
        console.log(`\n     SAFEST PATTERN: "${safest.shape}" — ${safest.win_rate}% win rate`);
        const riskiest = withOutcomes.reduce((a, b) => b.win_rate < a.win_rate ? b : a);
        if (riskiest.shape !== safest.shape) {
          console.log(`     RISKIEST PATTERN: "${riskiest.shape}" — ${riskiest.win_rate}% win rate`);
        }
      }
      console.log('');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
    const snapCount = (db.prepare('SELECT COUNT(*) as c FROM market_snapshots').get() as any).c;
    const outCount = (db.prepare('SELECT COUNT(*) as c FROM market_outcomes').get() as any).c;
    console.log(`\n  Data: ${snapCount} snapshots, ${outCount} outcomes | DB: ${DB_PATH}`);
    console.log('  More data = better correlations. Keep the calibration scanner running.\n');
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const analyzer = new MarketCorrelationAnalyzer();

(async () => {
  console.log('  Starting Market Correlation Analyzer');
  console.log(`  Database: ${DB_PATH}\n`);

  // Display immediately
  analyzer.display();

  // Refresh every 30 seconds
  setInterval(() => {
    analyzer.display();
  }, 30000);
})();

export default MarketCorrelationAnalyzer;
