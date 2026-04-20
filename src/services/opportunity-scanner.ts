/* -------------------------------------------------------------------------- */
/*  Opportunity Scanner                                                       */
/*                                                                            */
/*  Ingests `NormalizedMarket[]` from the scraper layer and emits ranked      */
/*  `Opportunity[]` of two kinds:                                             */
/*                                                                            */
/*    1. ARBITRAGE — same event, same outcome, priced differently on two+     */
/*       platforms. Buying one leg + (optionally) selling the other locks in  */
/*       a risk-free profit net of fees. This is the "easy" case — the edge   */
/*       is empirical, not model-dependent.                                   */
/*                                                                            */
/*    2. VALUE (a.k.a. Smart EV) — a market's price diverges from a "fair"    */
/*       estimate we compute. Our fair estimate for v1 is the cross-platform  */
/*       consensus (median price across matched markets). Value is model-     */
/*       dependent — the better the fair-price signal, the sharper the edge.  */
/*                                                                            */
/*  Pipeline (pure functions, easy to unit test or swap):                     */
/*                                                                            */
/*     normalize   → takes a market's title + metadata, returns a stable key  */
/*     cluster     → groups markets across platforms by similarity            */
/*     detectArb   → within a cluster, find priced-divergence opportunities   */
/*     detectValue → within a cluster, compare each leg to consensus          */
/*     score       → weights edge%, size, freshness, confidence               */
/*     filter      → applies user thresholds (min edge, tier, strategy)       */
/*                                                                            */
/*  WHY A PIPELINE?                                                           */
/*    Each stage is a clear contract — when we want to upgrade matching from  */
/*    token-bag similarity to sentence embeddings, or swap consensus with a   */
/*    proper model (SOFR for Fed markets, poll averages for elections), we    */
/*    replace one function without touching the rest.                         */
/* -------------------------------------------------------------------------- */

import type { NormalizedMarket, NormalizedOutcome } from "../scrapers/types.js";

export type OpportunityKind = "arbitrage" | "value";
export type OppFreshness = "hot" | "aging" | "stale";
export type LegAction = "buy" | "sell";
export type LegSide = "yes" | "no";

export interface OpportunityLeg {
  marketId: string;
  platformId: string;
  platformName: string;
  marketTitle: string;
  side: LegSide;
  action: LegAction;
  priceCents: number;        // 0-100
  impliedProb: number;       // 0-1
  /** Platform-native URL so the frontend can deep-link. */
  platformUrl?: string;
}

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  title: string;                 // human-readable event title
  /** Basis points of expected edge (100 bps = 1%). */
  edgeBps: number;
  /** 0-1 — how confident we are the match is real + the edge holds. */
  confidence: number;
  /** How many ms until the earliest leg closes. */
  timeToCloseMs: number;
  discoveredAt: number;
  /** UI hint — hot (fresh + sharp), aging (still actionable), stale (decayed). */
  freshness: OppFreshness;
  /** Composite score (0-1) used for default ranking. */
  score: number;
  legs: OpportunityLeg[];
  /** One-line explanation, always. Longer reasoning in `rationale`. */
  explanation: string;
  rationale?: string;
  platforms: string[];          // distinct platform ids across legs
}

export interface ScanConfig {
  /** Minimum basis points of edge to even consider. Default 150 (1.5%). */
  minEdgeBps: number;
  /** Assumed round-trip cost (platform fee + spread) in bps. Default 200. */
  assumedFeesBps: number;
  /** Don't include markets closing sooner than this. Default 30 minutes. */
  minMsToClose: number;
  /** Max number of opportunities returned per scan. Default 50. */
  maxResults: number;
}

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  minEdgeBps: 150,
  assumedFeesBps: 200,
  minMsToClose: 30 * 60 * 1000,
  maxResults: 50,
};

/* -------------------------------------------------------------------------- */
/*  Stage 1 — NORMALIZE                                                       */
/*                                                                            */
/*  Turn a market's title into a canonical bag-of-tokens key. Two markets     */
/*  with the same key are almost certainly the same question, even if one    */
/*  says "Will X?" and the other says "X happens".                           */
/* -------------------------------------------------------------------------- */

const STOPWORDS = new Set([
  "a","an","the","to","of","in","on","at","by","for","with","and","or","be","is",
  "are","will","does","do","did","has","have","had","been","before","after","this","that",
]);

/** Lowercase, strip punctuation, drop stopwords, normalize numbers. */
export function normalizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s$%.-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map((t) => t.replace(/^\$(\d)/, "$1"))    // "$150k" → "150k"
    .map((t) => t.replace(/^(\d+)%$/, "$1pct")) // "5%" → "5pct"
    .sort();
}

/** Stable string key from tokens. */
export function tokenKey(tokens: string[]): string {
  return tokens.join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Stage 2 — CLUSTER                                                         */
/*                                                                            */
/*  Group markets across platforms that likely refer to the same underlying  */
/*  event. Two signals:                                                       */
/*     (a) Token-set Jaccard similarity ≥ MATCH_THRESHOLD                     */
/*     (b) Close times within MATCH_TIME_WINDOW_MS of each other              */
/*                                                                            */
/*  This is deliberately lossy. We'd rather miss ambiguous pairs than false- */
/*  positive, because a bad arb signal loses money.                          */
/* -------------------------------------------------------------------------- */

const MATCH_THRESHOLD = 0.55;
const MATCH_TIME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface MarketCluster {
  id: string;
  title: string;              // canonical display title (longest)
  tokens: string[];
  members: NormalizedMarket[];
}

/** Jaccard similarity between two sorted token arrays. */
export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersect = 0;
  for (const t of setA) if (setB.has(t)) intersect++;
  const union = setA.size + setB.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export function clusterMarkets(markets: NormalizedMarket[]): MarketCluster[] {
  /* Index by normalized token key first — cheap exact-match collapse. */
  const byKey = new Map<string, NormalizedMarket[]>();
  const enriched = markets.map((m) => ({ market: m, tokens: normalizeTitle(m.event.name) }));
  for (const { market, tokens } of enriched) {
    const k = tokenKey(tokens);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(market);
  }

  const clusters: MarketCluster[] = [];
  const used = new Set<string>(); // market ids already placed

  /* Exact-match clusters — cheap win. */
  for (const [k, members] of byKey) {
    if (members.length <= 1) continue;
    const title = members.reduce((a, b) => (a.event.name.length > b.event.name.length ? a : b)).event.name;
    clusters.push({
      id: `c-${simpleHash(k)}`,
      title,
      tokens: normalizeTitle(title),
      members,
    });
    for (const m of members) used.add(m.id);
  }

  /* Fuzzy pass — for everything not already clustered, O(n^2) Jaccard. */
  const pool = enriched.filter(({ market }) => !used.has(market.id));
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (used.has(a.market.id)) continue;

    const group: NormalizedMarket[] = [a.market];
    const groupTokens = [a.tokens];
    used.add(a.market.id);

    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j];
      if (used.has(b.market.id)) continue;
      if (b.market.platformId === a.market.platformId) continue;
      if (Math.abs(a.market.event.startTime - b.market.event.startTime) > MATCH_TIME_WINDOW_MS) continue;
      if (jaccard(a.tokens, b.tokens) < MATCH_THRESHOLD) continue;
      group.push(b.market);
      groupTokens.push(b.tokens);
      used.add(b.market.id);
    }

    if (group.length > 1) {
      clusters.push({
        id: `c-${simpleHash(a.market.id + group.length)}`,
        title: a.market.event.name,
        tokens: a.tokens,
        members: group,
      });
    }
  }

  return clusters;
}

/* -------------------------------------------------------------------------- */
/*  Stage 3 — DETECT ARBITRAGE                                                */
/*                                                                            */
/*  For each cluster, consider YES legs across platforms. If best-YES-price  */
/*  on platform A is materially different from best-NO-price on platform B  */
/*  (which is the SAME exposure), we have an arb.                            */
/*                                                                            */
/*  Formal: if YES_A + NO_B < 100 - fees, buy both legs → guaranteed payout. */
/* -------------------------------------------------------------------------- */

function outcomeBySide(m: NormalizedMarket, side: LegSide): NormalizedOutcome | undefined {
  return m.outcomes.find((o) => o.side === side);
}

function cents(o: NormalizedOutcome | undefined): number | null {
  if (!o || o.priceCents == null) return null;
  return o.priceCents;
}

export function detectArbitrage(cluster: MarketCluster, cfg: ScanConfig): Opportunity[] {
  const opps: Opportunity[] = [];
  const members = cluster.members;
  if (members.length < 2) return opps;

  /* Check every pair of different-platform markets within the cluster. */
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      if (a.platformId === b.platformId) continue;

      const yesA = cents(outcomeBySide(a, "yes"));
      const noA  = cents(outcomeBySide(a, "no"));
      const yesB = cents(outcomeBySide(b, "yes"));
      const noB  = cents(outcomeBySide(b, "no"));

      // Edge = 100 - (YES on cheapest side + NO on other side), minus fees.
      const candidates: Array<{ buy: NormalizedMarket; buySide: LegSide; buyPrice: number;
                                sell: NormalizedMarket; sellSide: LegSide; sellPrice: number }> = [];

      if (yesA != null && noB != null && yesA + noB < 100) {
        candidates.push({ buy: a, buySide: "yes", buyPrice: yesA, sell: b, sellSide: "no", sellPrice: noB });
      }
      if (yesB != null && noA != null && yesB + noA < 100) {
        candidates.push({ buy: b, buySide: "yes", buyPrice: yesB, sell: a, sellSide: "no", sellPrice: noA });
      }

      for (const c of candidates) {
        const grossEdge = 100 - (c.buyPrice + c.sellPrice); // cents of edge per $1 stake pair
        const edgeBps = (grossEdge / 100) * 10000;           // convert cents/100 → bps
        const netEdgeBps = edgeBps - cfg.assumedFeesBps;
        if (netEdgeBps < cfg.minEdgeBps) continue;

        const timeToClose = Math.min(a.event.startTime, b.event.startTime) - Date.now();
        if (timeToClose < cfg.minMsToClose) continue;

        opps.push({
          id: `arb-${simpleHash(a.id + b.id)}`,
          kind: "arbitrage",
          title: cluster.title,
          edgeBps: Math.round(netEdgeBps),
          confidence: 0.85,                            // arb matches are mostly real if titles line up
          timeToCloseMs: timeToClose,
          discoveredAt: Date.now(),
          freshness: timeToClose < 24 * 3600_000 ? "hot" : "aging",
          score: clampScore(netEdgeBps / 1000),         // heuristic — stronger = higher
          legs: [
            {
              marketId: c.buy.id, platformId: c.buy.platformId, platformName: c.buy.platformName,
              marketTitle: c.buy.event.name, side: c.buySide, action: "buy",
              priceCents: c.buyPrice, impliedProb: c.buyPrice / 100,
            },
            {
              marketId: c.sell.id, platformId: c.sell.platformId, platformName: c.sell.platformName,
              marketTitle: c.sell.event.name, side: c.sellSide, action: "buy",
              priceCents: c.sellPrice, impliedProb: c.sellPrice / 100,
            },
          ],
          explanation:
            `Buy ${c.buySide.toUpperCase()} ${c.buyPrice}¢ on ${c.buy.platformName}` +
            ` + buy ${c.sellSide.toUpperCase()} ${c.sellPrice}¢ on ${c.sell.platformName}` +
            ` = ${grossEdge}¢ guaranteed (before fees).`,
          rationale:
            `Same event priced on two platforms. YES+NO across platforms sums to ${c.buyPrice + c.sellPrice}¢, ` +
            `leaving a ${grossEdge}¢ (${((grossEdge/100)*100).toFixed(2)}%) gross edge. ` +
            `After an assumed ${cfg.assumedFeesBps} bps in fees/spread, net edge is ${netEdgeBps.toFixed(0)} bps.`,
          platforms: [a.platformId, b.platformId],
        });
      }
    }
  }

  return opps;
}

/* -------------------------------------------------------------------------- */
/*  Stage 4 — DETECT VALUE (Smart EV)                                         */
/*                                                                            */
/*  Within a multi-member cluster, compute the median YES-price (our "fair"  */
/*  estimate). Any leg priced materially below median → YES undervalued      */
/*  there. Any leg priced materially above median → NO undervalued there.    */
/*                                                                            */
/*  CAVEATS:                                                                  */
/*   - Median-of-peers is a *very* weak model. Better signals: calibrated    */
/*     opportunity hunter output, external futures prices for macro markets, */
/*     poll averages for elections, ensemble of internal models.             */
/*   - We flag value only when the cluster has ≥ 3 members — 2 markets of   */
/*     different price is ambiguous (either could be wrong).                 */
/* -------------------------------------------------------------------------- */

export function detectValue(cluster: MarketCluster, cfg: ScanConfig): Opportunity[] {
  if (cluster.members.length < 3) return [];

  const yesPrices = cluster.members
    .map((m) => ({ m, yes: cents(outcomeBySide(m, "yes")) }))
    .filter((x): x is { m: NormalizedMarket; yes: number } => x.yes != null);
  if (yesPrices.length < 3) return [];

  const sorted = yesPrices.map((x) => x.yes).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const opps: Opportunity[] = [];
  for (const { m, yes } of yesPrices) {
    const divergenceCents = median - yes;
    if (Math.abs(divergenceCents) < 3) continue; // <3 cents is noise

    const edgeBps = (Math.abs(divergenceCents) / 100) * 10000 - cfg.assumedFeesBps;
    if (edgeBps < cfg.minEdgeBps) continue;

    const timeToClose = m.event.startTime - Date.now();
    if (timeToClose < cfg.minMsToClose) continue;

    const side: LegSide = divergenceCents > 0 ? "yes" : "no";
    const priceForSide = divergenceCents > 0 ? yes : 100 - yes;

    opps.push({
      id: `val-${simpleHash(m.id + median)}`,
      kind: "value",
      title: cluster.title,
      edgeBps: Math.round(edgeBps),
      confidence: 0.55,   // lower than arb — depends on our fair-price model
      timeToCloseMs: timeToClose,
      discoveredAt: Date.now(),
      freshness: timeToClose < 48 * 3600_000 ? "hot" : "aging",
      score: clampScore(edgeBps / 1500),
      legs: [{
        marketId: m.id, platformId: m.platformId, platformName: m.platformName,
        marketTitle: m.event.name, side, action: "buy",
        priceCents: priceForSide, impliedProb: priceForSide / 100,
      }],
      explanation:
        `${side.toUpperCase()} priced at ${yes}¢ on ${m.platformName} vs. ${median}¢ cross-platform median.`,
      rationale:
        `${cluster.members.length}-market cluster. Platform median YES = ${median}¢. ` +
        `This leg is ${divergenceCents > 0 ? "under" : "over"}-priced by ${Math.abs(divergenceCents)}¢ ` +
        `(${edgeBps.toFixed(0)} bps net). Buy ${side.toUpperCase()} if you believe the median is closer to fair.`,
      platforms: [m.platformId],
    });
  }

  return opps;
}

/* -------------------------------------------------------------------------- */
/*  Stage 5 — ORCHESTRATOR                                                    */
/* -------------------------------------------------------------------------- */

export function scanOpportunities(
  markets: NormalizedMarket[],
  cfg: Partial<ScanConfig> = {},
): Opportunity[] {
  const config: ScanConfig = { ...DEFAULT_SCAN_CONFIG, ...cfg };
  const clusters = clusterMarkets(markets);

  const opps: Opportunity[] = [];
  for (const cluster of clusters) {
    opps.push(...detectArbitrage(cluster, config));
    opps.push(...detectValue(cluster, config));
  }

  /* Rank by score desc, then edge desc. Keep top N. */
  opps.sort((a, b) => (b.score - a.score) || (b.edgeBps - a.edgeBps));
  return opps.slice(0, config.maxResults);
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function clampScore(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
