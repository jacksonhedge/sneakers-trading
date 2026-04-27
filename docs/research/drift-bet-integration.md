# Drift BET — Integration Research

_Last updated: 2026-04-21_

Drift BET ("Bullish on Everything") is Drift Protocol's prediction-market product, built directly on top of Drift V2 perp infrastructure on Solana mainnet-beta. Prediction markets are not a separate product — they are perp markets with `contract_type = Prediction`. That single fact drives most of the integration decisions below.

---

## 1. Status (April 2026)

- **Live since:** August 2024 (announced by co-founder Cindy Leow). Has been in production for ~20 months by 2026-04-21.
- **Type:** Permissioned (Drift team gates which markets are listed; not user-permissionless yet — see drift-labs Discussion #631).
- **Outcome shape:** **Binary YES/NO**. Each market settles to exactly `1` (YES wins) or `0` (NO wins). Quoted price ∈ `[0, 1]` represents the probability of YES — same convention as Polymarket/Kalshi but on a 0–1 scale, not 0–100¢.
- **Categories:** Politics, sports, crypto, economics, pop culture (e.g., Formula 1 was called out at launch).
- **Liquidity:** $3.5M order-book liquidity reported in the first 24h post-launch; taps into Drift's broader ~$500M cross-margin pool. Live volume varies per market — query `/contracts` at runtime to know. DefiLlama tracks Drift TVL/volume in aggregate.
- **Scale:** Tens of active markets at any given time (not hundreds). Dramatically smaller catalog than Polymarket.
- **Hedge advantage:** Same account can hold a perp + a BET position, so a sneaker/shoe/sports book hedger can do both in one cross-margin account. Not directly relevant for the scraper, but interesting for the trader product.

---

## 2. Recommended Access Path

**Primary: `dlob.drift.trade` (HTTP) + `data.api.drift.trade` (HTTP). No SDK, no RPC needed for read-only scraping.**

### Why this beats the SDK

- **No Solana RPC needed.** Drift runs the indexer/DLOB server for you. Free, no API key, no signed transactions for reads.
- **Already-aggregated L2 book** including vAMM and indicative MM quotes — exactly what `MarketSnapshot` wants.
- The TS SDK (`@drift-labs/sdk`) is heavier: needs `Connection`, a wallet (even a dummy one), and you reimplement what dlob-server already does. Use it only if you outgrow rate limits.

### Hosts

| Purpose | URL |
|---|---|
| DLOB L2/L3 orderbook (mainnet-beta) | `https://dlob.drift.trade` |
| DLOB WebSocket (mainnet-beta) | `wss://dlob.drift.trade/ws` |
| Data API (markets, contracts, volume, trades) | `https://data.api.drift.trade` |
| Devnet equivalent | `https://master.dlob.drift.trade` / `wss://master.dlob.drift.trade/ws` |

### Why the user got 503 from `dlob.drift.trade`

Hitting the bare host returns no body/health check on most paths — you must include a route + valid `marketName` query param. Use `/l2?marketName=<MARKET>&depth=10`. A bare `GET /` will look "down" but isn't.

### Endpoints we'll use

1. **`GET https://data.api.drift.trade/contracts`**
   Returns one row per market with funding rate, open interest, `contract_type`, ticker. **Filter `contract_type === "Prediction"`** to get the BET catalog. This is the source of truth for "currently active" markets, market names, and 24h volume / OI.

2. **`GET https://dlob.drift.trade/l2?marketName=<NAME>&depth=5&includeVamm=true&includeIndicative=true`**
   Returns L2 (price-aggregated levels) for one market. `bids[0].price` and `asks[0].price` give best bid/ask. Prices come back as BigInt strings in `PRICE_PRECISION = 1e6`; divide by `1e6` to get the 0–1 probability.

3. **`GET https://data.api.drift.trade/trades?marketName=<NAME>&...`** (optional)
   For `last_price`, recent trade prints. Volume24h often available on `/contracts` directly.

---

## 3. Code Snippet — Node.js / TypeScript

Zero dependencies beyond `node-fetch` (or built-in `fetch` on Node 18+):

```ts
// drift-bet-scraper.ts
const DLOB = 'https://dlob.drift.trade';
const DATA = 'https://data.api.drift.trade';
const PRICE_PRECISION = 1_000_000; // 1e6 — price field scaling
const BASE_PRECISION  = 1_000_000_000; // 1e9 — size field scaling

type Contract = {
  ticker_id: string;          // e.g. "TRUMP-WIN-2024-PERP"
  contract_index: number;     // marketIndex
  contract_type: 'Perpetual' | 'Prediction' | 'Spot';
  base_currency: string;
  quote_currency: string;
  last_price: string;         // 0..1 for prediction, scaled
  base_volume: string;        // 24h
  quote_volume: string;       // 24h USD
  funding_rate: string;
  open_interest: string;
  product_type?: string;
};

type L2Level = { price: string; size: string };
type L2Book = { bids: L2Level[]; asks: L2Level[]; ts?: number };

async function listPredictionMarkets(): Promise<Contract[]> {
  const res = await fetch(`${DATA}/contracts`);
  if (!res.ok) throw new Error(`contracts ${res.status}`);
  const { contracts }: { contracts: Contract[] } = await res.json();
  return contracts.filter(c => c.contract_type === 'Prediction');
}

async function getOrderbook(marketName: string): Promise<L2Book> {
  const url = `${DLOB}/l2?marketName=${encodeURIComponent(marketName)}`
            + `&depth=5&includeVamm=true&includeIndicative=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`l2 ${marketName} ${res.status}`);
  return res.json();
}

const toNum = (raw: string, prec: number) => Number(BigInt(raw)) / prec;

async function buildSnapshots() {
  const markets = await listPredictionMarkets();
  const ts = new Date().toISOString();
  const out = [];

  for (const m of markets) {
    let book: L2Book = { bids: [], asks: [] };
    try { book = await getOrderbook(m.ticker_id); } catch {}

    const yesBid = book.bids[0] ? toNum(book.bids[0].price, PRICE_PRECISION) : null;
    const yesAsk = book.asks[0] ? toNum(book.asks[0].price, PRICE_PRECISION) : null;
    const last   = m.last_price ? toNum(m.last_price, PRICE_PRECISION) : null;

    // Drift BET is YES-side priced. NO = 1 - YES.
    const noBid = yesAsk != null ? 1 - yesAsk : null;
    const noAsk = yesBid != null ? 1 - yesBid : null;

    out.push({
      platform: 'driftbet',
      platform_market_id: String(m.contract_index),
      question: m.ticker_id.replace(/-PERP$/, '').replace(/-/g, ' '),
      tags: [m.product_type ?? 'prediction'],
      outcomes: [
        { name: 'YES', best_bid: yesBid, best_ask: yesAsk, last_price: last },
        { name: 'NO',  best_bid: noBid,  best_ask: noAsk,  last_price: last != null ? 1 - last : null },
      ],
      overround: (yesAsk != null && noAsk != null) ? (yesAsk + noAsk) - 1 : null,
      volume_traded: m.quote_volume ? Number(m.quote_volume) : null,
      liquidity: m.open_interest ? Number(m.open_interest) : null,
      phase: 'live' as const,
      ts,
    });
  }
  return out;
}
```

**Throttle note:** loop with `await new Promise(r => setTimeout(r, 75))` between markets to stay polite — a 30-market sweep at 75ms = ~2.3s, well under your 30–60s budget.

---

## 4. Auth / Cost

| Resource | Cost |
|---|---|
| `dlob.drift.trade` HTTP/WS | Free, no key |
| `data.api.drift.trade` HTTP | Free, no key |
| Solana RPC | **Not required for the recommended path** |
| Helius free tier (if you ever switch to direct on-chain reads) | 1M credits/mo, 10 RPS — covers 30k req/day with 5x headroom |
| Helius paid | $49/mo Developer plan if you need more |

For 30k req/day against Drift's hosted services there is currently no published rate limit, but treat 5–10 req/s as a safe ceiling. Add a basic backoff on 429/503 and a circuit breaker.

---

## 5. Watch-outs

1. **Price scale is 1e6, not 100.** `price = "523000"` means `0.523` (52.3% YES), not `$5.23`. Divide by `PRICE_PRECISION`. Internal MarketSnapshot already uses 0–1 floats, so no conversion problem — just don't multiply by 100 anywhere.

2. **Markets are perps, not separate accounts.** They live in the perp-market PDA list. `contract_type` is the only field separating them from regular SOL-PERP / BTC-PERP. Filter every fetch on this — otherwise you'll snapshot 50+ irrelevant perps.

3. **Resolution is two-step.** When the event ends, Drift first sets the oracle to `0` or `1`, then sets `expiry_ts`. Between those two events the market is in **reduce-only** mode (no new entries). Map that state to `phase: 'closed'` for your snapshot, or add a new `'settling'` enum value.

4. **`resolves_at` is fuzzy.** There is no on-chain "scheduled close" timestamp like Kalshi's. Markets close when the Drift team flips the oracle. Use `expiry_ts` (set after resolution) for `resolves_at`; before resolution, leave it null or stuff a soft estimate from the question text.

5. **Not a strict price-time CLOB.** Drift docs explicitly say the orderbook does not enforce strict price-time priority — it parallelizes for Solana throughput and uses keepers/JIT auctions to match. The L2 dump is still correct for "what's the best bid/ask right now" but consecutive snapshots can show order *reorderings* that wouldn't happen on Kalshi/Polymarket. Don't assume FIFO when reasoning about fills.

6. **Indicative quotes in the book.** With `includeIndicative=true` the L2 includes off-chain MM quotes that haven't been signed/posted on-chain yet. Great for tighter mid-price estimates, but they can vanish in a single block. Mark these as soft if you ever expose them downstream — for now, accept them since competitors' books also include MM-only depth.

7. **Permissioned listings.** New BET markets appear/disappear at Drift team's discretion. Re-pull `/contracts` every snapshot loop — don't cache the market list across hours.

8. **vAMM blends with the book.** `includeVamm=true` adds AMM liquidity into the L2 levels. For prediction markets the vAMM is small/disabled on most contracts, but check the response — if you see oddly deep, perfectly-shaped levels, that's vAMM, not real MM depth. Volume_traded from `/contracts` already excludes vAMM so it's safe.

9. **WebSocket is available** (`wss://dlob.drift.trade/ws`) and would let you go event-driven instead of polling. Worth doing in v2 if you want sub-second snapshots; for the 30–60s scraper cadence, plain HTTP is simpler and cheaper.

10. **Program ID for direct on-chain reads** (only if you go SDK route): `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH`. Anchor IDL ships inside `@drift-labs/sdk` and `protocol-v2` repo. Prediction markets don't have a separate program — same `dRifty...` ID.

---

## Sources

- [Drift Protocol — Introduction to Prediction Markets](https://docs.drift.trade/prediction-markets/prediction-markets-intro)
- [Drift Protocol — Data API](https://docs.drift.trade/developers/data-api)
- [Drift Protocol — DLOB SDK](https://docs.drift.trade/developers/drift-sdk/dlob)
- [Drift v2-teacher API reference](https://drift-labs.github.io/v2-teacher/)
- [Drift Data API Playground](https://data.api.drift.trade/playground)
- [@drift-labs/sdk on npm](https://www.npmjs.com/package/@drift-labs/sdk)
- [drift-labs/protocol-v2 GitHub](https://github.com/drift-labs/protocol-v2)
- [drift-labs/gateway GitHub](https://github.com/drift-labs/gateway)
- [The Block — Drift launches prediction market](https://www.theblock.co/post/311888/solana-based-drift-protocol-launches-prediction-market)
- [CryptoSlate — Drift's BET platform](https://cryptoslate.com/drifts-bet-platform-brings-prediction-markets-to-solana-blockchain/)
- [Helius pricing](https://www.helius.dev/pricing)
- [drift-labs Discussion #631 — permissionless prediction markets](https://github.com/orgs/drift-labs/discussions/631)
