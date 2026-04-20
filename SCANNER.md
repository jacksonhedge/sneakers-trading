# Opportunity Scanner — Pipeline & Teaching Notes

> Last updated: 2026-04-20. Source: `src/services/opportunity-scanner.ts`. API: `GET /v1/opportunities`. Frontend: `web/app/page.tsx` — Live Edge panel in Medium mode.

## What it does

Ingests `NormalizedMarket[]` (from the scraper layer) and emits ranked `Opportunity[]` of two kinds:

- **Arbitrage** — same event priced differently on two platforms. Buy the cheap side + the opposite-named side on the other platform → locked profit net of fees. No model required; the edge is empirical.
- **Value (Smart EV)** — market priced materially away from a fair-probability estimate. Our fair estimate in v1 is the cross-platform median. Model-dependent — the better the fair signal, the sharper the call.

## The pipeline

Five pure functions, each a swap-in unit:

1. **`normalizeTitle(title)`** → canonical token array (lowercase, stopwords removed, numbers unit-folded, sorted)
2. **`clusterMarkets(markets)`** → groups markets across platforms by token-set similarity **plus** close-time proximity (± 30 days)
3. **`detectArbitrage(cluster, cfg)`** → pairs YES on platform A with NO on platform B; flags when sum < 100 − fees
4. **`detectValue(cluster, cfg)`** → requires ≥ 3 members; computes median YES and flags outliers ≥ 3¢ off
5. **`scanOpportunities(markets, cfg)`** → orchestrates the above, sorts by score × edge, truncates to `maxResults`

Each stage has a clear contract. When you want to upgrade matching to sentence embeddings, or swap median-consensus for a real model (SOFR for Fed, poll averages for elections), you replace **one function**.

## Scoring + ranking

- **Arbitrage confidence**: 0.85 baseline — matched titles are usually real
- **Value confidence**: 0.55 baseline — depends on the fair-price heuristic
- **Score**: `edgeBps / 1000` for arb, `edgeBps / 1500` for value, clamped 0–1
- **Freshness**: `hot` if closing within 24h (arb) or 48h (value); otherwise `aging`

Default thresholds (see `DEFAULT_SCAN_CONFIG`):
- `minEdgeBps: 150` (1.5%)
- `assumedFeesBps: 200` (2%)
- `minMsToClose: 30 min` — skip markets about to resolve

## Known weak spots — open for PRs

### 1. Matching is too strict for real-world titles
Kalshi uses `KXNFLGAME-26JAN26KCPHI-KC` flavored tickers with multivariate parlay titles; Polymarket uses full sentences ("Will the Chiefs beat the Eagles?"). **Jaccard of 0.55 misses 90% of real pairs.** First test against live data: the scanner returned **0 opportunities** across 13,000 markets.

Fixes to try, in order of effort:
- **Cheap win:** extract key entities (team names, dates, dollar thresholds) and match on those rather than the full title.
- **Medium:** normalize against a shared taxonomy (e.g. `{event: "NFL SB LX", outcome: "KC win"}`).
- **Proper:** sentence embeddings (OpenAI `text-embedding-3-small`, Voyage, or local MiniLM) + cosine similarity. Cache per-market; re-embed only on title change.

### 2. Value model is a toy
Median-of-platforms conflates "where the crowd is" with "fair." If both Kalshi and Polymarket are wrong the same direction, we see 0 edge when there's actually 10%. Stronger fair-price signals:
- Macro: SOFR futures, Fed Funds futures → implied Fed-cut probabilities
- Elections: 538, Silver Bulletin, polling averages
- Sports: sharp offshore book (Pinnacle) as the "real" line
- Internal: the existing `opportunity-hunter` LOCK/HAMMER/GOOD tiers

### 3. Leg sizing is missing
We emit the edge but not the dollar stake. A trader sees "3.2% arb" and still has to calculate how much to put on each leg to neutralize. Add a `suggestedStakes: { legIndex, amount }[]` computed from the cluster's min liquidity.

### 4. Fee assumptions are hardcoded
`assumedFeesBps: 200` for every platform. Real fees vary wildly (Kalshi 0.25% / lot, Polymarket 0%, sportsbooks baked into the spread). Per-platform fee model → more accurate net edge.

### 5. No latency model
The biggest open question you (the user) called out: **by the time we surface an edge, it's decayed.** The scanner currently has:
- 5-second server cache
- 5-second frontend poll
- Tier-gated delay: Free (hidden), Pro (5s delay), Elite (real-time)

That's the stopgap. The right system is push-based: scanner → Redis stream → per-user WS channel filtered by tier + O'Toole settings. Elite + Fast Execution add-on users would also trigger automated execution via O'Toole before the push fires.

## User-facing UX — the "too late" problem

The user framed this well: when we show a retail user an opportunity, the smart money has already taken it. Three responses:

1. **Be honest about the delay.** The Live Edge panel on Free shows an upsell banner literally saying *"Opportunities are delayed on Free. By the time you see them, the edge is gone."* Better to tell the truth than fake urgency.
2. **Tier the latency.** Free = blocked. Pro = 5s delay. Elite = real-time. Elite + Fast Execution add-on = O'Toole auto-trades before the notification even surfaces.
3. **Show decay.** Every opp has a `discoveredAt`. A small "aging" indicator (hot → aging → stale color ramp) tells the user *how fresh* the edge is, so they don't chase a 30-second-old arb.

## API

```
GET /v1/opportunities
  ?kind=arbitrage|value     (optional)
  &min_edge_bps=200          (optional)
  &limit=25                  (optional, default 25)

Response:
{
  opportunities: Opportunity[],
  total: number,
  arbitrageCount: number,
  valueCount: number,
  generatedAt: number
}
```

Opportunity shape (see `src/services/opportunity-scanner.ts`):
```ts
{
  id, kind, title, edgeBps, confidence, score,
  timeToCloseMs, discoveredAt, freshness,
  legs: [{ marketId, platformId, platformName, side, action, priceCents, ... }],
  explanation, rationale, platforms
}
```

Server caches the result for 5 seconds, then rescans. Cheap enough that 200 concurrent users hit the same cached data, expensive enough that we don't rescan on every poll.

## How to extend the scanner (onboarding)

1. **Better matching**: replace `clusterMarkets` body with your matcher (embeddings, entity-match, whatever). Contract stays the same — takes `NormalizedMarket[]`, returns `MarketCluster[]`.
2. **Better fair-price**: add a new `detectValueExt(cluster, externalSignals)` alongside `detectValue`. Orchestrator merges results.
3. **New opportunity kinds**: add to the `OpportunityKind` union (e.g. `"momentum"`, `"divergence"`), write a detector, call from `scanOpportunities`.
4. **Notification delivery**: not built yet. Suggested: Redis pub/sub for inter-process, WS channel per user for live push, with channel filters derived from O'Toole settings. Slack/push/email are just extra sinks.

## Known-0 state today

With Kalshi + Polymarket only and the current matcher, expect `0` opportunities most of the time. Not a bug — the matcher's too strict. Fix before adding more scrapers, or you'll be flooded with false positives.
