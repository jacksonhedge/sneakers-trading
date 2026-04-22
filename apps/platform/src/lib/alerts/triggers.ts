import type { MarketSnapshot, MarketHistory } from '../markets-data'
import { representativeProb } from '../market-stats'
import { findCrossBookPairs } from '../arb-scanner'
import type {
  ArbAppearanceConfig,
  MarketFilter,
  OverroundThresholdConfig,
  PriceMovementConfig,
  PriceThresholdConfig,
  TriggerResult,
} from './types'
import { categoryOf } from '../market-stats'

// Pure-function trigger evaluators. No DB writes, no side effects, no
// network. Each takes the rule's filtered data slice and returns either
// null (didn't fire) or a TriggerResult describing what fired.
//
// Per the brief: when multiple markets match, return the SINGLE
// most-extreme match (so the rule fires once per cooldown window with the
// best example, rather than spamming N events at once).
//
// "Crossing" semantics for threshold/overround triggers: fires when the
// LATEST snapshot satisfies the condition AND the PREVIOUS snapshot
// (closest prior in history) did not. This requires history; without
// history we fall back to "current satisfies" alone (cooldown handles
// re-fire suppression).

function marketKey(s: MarketSnapshot): string {
  return `${s.platform}:${s.platform_market_id}`
}

export function applyMarketFilter(
  snapshots: MarketSnapshot[],
  filter: MarketFilter,
): MarketSnapshot[] {
  return snapshots.filter((s) => {
    if (filter.platform && s.platform !== filter.platform) return false
    if (filter.sport && s.sport !== filter.sport) return false
    if (filter.category && categoryOf(s) !== filter.category) return false
    if (filter.market_key && marketKey(s) !== filter.market_key) return false
    return true
  })
}

/**
 * Find the snapshot in `history.snapshots` immediately before `latest`.
 * Used for cross-detection on threshold/overround triggers.
 */
function priorSnapshot(history: MarketHistory | undefined, latest: MarketSnapshot): MarketSnapshot | null {
  if (!history) return null
  const latestT = new Date(latest.ts).getTime()
  let prior: MarketSnapshot | null = null
  let priorT = -Infinity
  for (const s of history.snapshots) {
    const t = new Date(s.ts).getTime()
    if (t < latestT && t > priorT) {
      prior = s
      priorT = t
    }
  }
  return prior
}

function meetsDirection(value: number, direction: 'above' | 'below', threshold: number): boolean {
  return direction === 'above' ? value >= threshold : value <= threshold
}

function crossedDirection(
  current: number,
  prior: number | null,
  direction: 'above' | 'below',
  threshold: number,
): boolean {
  if (!meetsDirection(current, direction, threshold)) return false
  if (prior === null) return true // no history → treat as crossed (cooldown prevents re-spam)
  // Crossed means prior was on the opposite side.
  return direction === 'above' ? prior < threshold : prior > threshold
}

/**
 * Fires when representative probability has just crossed the threshold.
 * Most-extreme = furthest beyond threshold in the direction.
 */
export function evaluatePriceThreshold(
  config: PriceThresholdConfig,
  matchingMarkets: MarketSnapshot[],
  historyByKey: Map<string, MarketHistory>,
): TriggerResult {
  let best: { snap: MarketSnapshot; current: number; prior: number | null; extremity: number } | null = null
  for (const snap of matchingMarkets) {
    const current = representativeProb(snap)
    if (current === null) continue
    const history = historyByKey.get(marketKey(snap))
    const prior = history ? representativeProb(priorSnapshot(history, snap) ?? snap) : null
    const priorIsSelf = prior === current && history === undefined
    const priorValue = priorIsSelf ? null : prior
    if (!crossedDirection(current, priorValue, config.direction, config.threshold)) continue
    const extremity = config.direction === 'above'
      ? current - config.threshold
      : config.threshold - current
    if (!best || extremity > best.extremity) {
      best = { snap, current, prior: priorValue, extremity }
    }
  }
  if (!best) return null
  return {
    market_key: marketKey(best.snap),
    trigger_snapshot: {
      kind: 'price_threshold',
      direction: config.direction,
      threshold: config.threshold,
      current_prob: best.current,
      prior_prob: best.prior,
      question: best.snap.question,
      platform: best.snap.platform,
      ts: best.snap.ts,
    },
  }
}

/**
 * Fires when representative probability moved at least delta_pp within
 * the look-back window. Most-extreme = largest absolute movement.
 */
export function evaluatePriceMovement(
  config: PriceMovementConfig,
  matchingMarkets: MarketSnapshot[],
  historyByKey: Map<string, MarketHistory>,
): TriggerResult {
  const cutoffMs = Date.now() - config.window_minutes * 60_000
  const deltaThreshold = config.delta_pp / 100 // pp → 0..1
  let best: {
    snap: MarketSnapshot
    current: number
    earliest: number
    delta: number
    earliestTs: string
  } | null = null
  for (const snap of matchingMarkets) {
    const current = representativeProb(snap)
    if (current === null) continue
    const history = historyByKey.get(marketKey(snap))
    if (!history || history.snapshots.length === 0) continue
    // Earliest snapshot still within the window.
    let earliest: MarketSnapshot | null = null
    let earliestT = Infinity
    for (const s of history.snapshots) {
      const t = new Date(s.ts).getTime()
      if (t < cutoffMs) continue
      if (t < earliestT) {
        earliest = s
        earliestT = t
      }
    }
    if (!earliest) continue
    const earliestProb = representativeProb(earliest)
    if (earliestProb === null) continue
    const delta = Math.abs(current - earliestProb)
    if (delta < deltaThreshold) continue
    if (!best || delta > best.delta) {
      best = { snap, current, earliest: earliestProb, delta, earliestTs: earliest.ts }
    }
  }
  if (!best) return null
  return {
    market_key: marketKey(best.snap),
    trigger_snapshot: {
      kind: 'price_movement',
      delta_pp: config.delta_pp,
      window_minutes: config.window_minutes,
      current_prob: best.current,
      earliest_prob: best.earliest,
      delta: best.delta,
      earliest_ts: best.earliestTs,
      question: best.snap.question,
      platform: best.snap.platform,
      ts: best.snap.ts,
    },
  }
}

/**
 * Fires when overround crosses the threshold (book widening or tightening).
 */
export function evaluateOverround(
  config: OverroundThresholdConfig,
  matchingMarkets: MarketSnapshot[],
  historyByKey: Map<string, MarketHistory>,
): TriggerResult {
  let best: { snap: MarketSnapshot; current: number; prior: number | null; extremity: number } | null = null
  for (const snap of matchingMarkets) {
    const current = snap.overround
    if (current === null) continue
    const history = historyByKey.get(marketKey(snap))
    const prev = history ? priorSnapshot(history, snap) : null
    const prior = prev?.overround ?? null
    if (!crossedDirection(current, prior, config.direction, config.threshold)) continue
    const extremity = config.direction === 'above'
      ? current - config.threshold
      : config.threshold - current
    if (!best || extremity > best.extremity) {
      best = { snap, current, prior, extremity }
    }
  }
  if (!best) return null
  return {
    market_key: marketKey(best.snap),
    trigger_snapshot: {
      kind: 'overround_threshold',
      direction: config.direction,
      threshold: config.threshold,
      current_overround: best.current,
      prior_overround: best.prior,
      question: best.snap.question,
      platform: best.snap.platform,
      ts: best.snap.ts,
    },
  }
}

/**
 * Fires when a cross-book arbitrage pair appears with edge >= min_edge_pp.
 * "Most-extreme" = largest edge. Uses the existing cross-book matcher in
 * lib/arb-scanner.ts (sport-specific, MONEY-line markets only for v1).
 */
export function evaluateArbAppearance(
  config: ArbAppearanceConfig,
  matchingMarkets: MarketSnapshot[],
): TriggerResult {
  const minEdge = (config.min_edge_pp ?? 0) / 100
  const pairs = findCrossBookPairs(matchingMarkets, { limit: 50 })
  let best: { pair: typeof pairs[number]; edge: number } | null = null
  for (const pair of pairs) {
    if (!pair.isArb) continue
    if (pair.bestSum === null) continue
    const edge = 1 - pair.bestSum
    if (edge < minEdge) continue
    if (!best || edge > best.edge) {
      best = { pair, edge }
    }
  }
  if (!best) return null
  const p = best.pair
  return {
    market_key: `arb:${p.sport}:${p.away}:${p.home}`,
    trigger_snapshot: {
      kind: 'arb_appearance',
      sport: p.sport,
      away: p.away,
      home: p.home,
      starts_at: p.startsAt,
      best_sum: p.bestSum,
      edge_pp: best.edge * 100,
      cheapest_home: p.cheapestHome,
      cheapest_away: p.cheapestAway,
      books: p.quotes.map((q) => q.platform),
    },
  }
}
