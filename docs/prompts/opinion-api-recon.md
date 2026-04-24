# Opinion.trade recon — API + economics

Open https://docs.opinion.trade/ plus the Open API section at
https://docs.opinion.trade/developer-guide/opinion-open-api, the Opinion
Labs homepage at https://opinion.trade, any "Docs / Litepaper / Tokenomics"
pages you find, plus the `OPN` token page on CoinGecko / CoinMarketCap and
DeFiLlama if present. Work through everything and report back the following.

Quote exact URLs, field names, percentages, and dollar figures verbatim.
Do **not** infer — if a fact isn't stated anywhere, write "not stated" under
that line instead of guessing. Where a number depends on a tier / plan /
chain, give the full matrix, not just one value.

Target length: thorough. I'd rather have 4000 words of raw facts than a
tidy 500-word summary. The goal is that I can paste this back into our
scraper + dashboard code without re-reading the docs, and that I understand
the platform's economics well enough to decide whether it's worth adding
Opinion as a first-class venue in our product tier.

---

## PART 1 — API recon (what the scraper needs)

### 1.1 Key acquisition

- Exact application form URL (the one linked from the Overview page).
- Is approval self-serve, email-based, or KYC-gated? What info do they
  ask for on the form (company? use-case? projected volume?)?
- Typical turnaround time if mentioned.
- Is there a public sandbox / test key / demo endpoint that works before
  approval? If so, give the base URL.
- Is the same key used for both read (market data) and write (trading /
  order placement), or are they separate credentials?
- Is a wallet signature required in addition to the API key for any
  endpoints? Which ones?

### 1.2 Rate limits + API pricing

- Per-second and per-minute rate limits on the `apikey` header.
- Any monthly / daily request quota? Free-tier limits vs. paid tiers, if
  tiered API pricing exists.
- Do they publish pricing for higher API tiers, or is that on request?
- Response headers that expose current usage (e.g. `X-RateLimit-Remaining`,
  `X-RateLimit-Reset`).
- Do they 429 or soft-throttle on limit hit? Any IP-level limits on top of
  the per-key limits?

### 1.3 Market data endpoints — exact response shapes

For each endpoint below, capture the **full JSON response shape** (every
field name, type, nullability, and any enum values):

- `GET /market` — list. Note the filter params (`status`, `sortBy`, etc.)
  and valid values for each.
- `GET /market/{marketId}` — detail.
- `GET /token/latest-price?token_id=…`
- `GET /token/orderbook?token_id=…`
- `GET /token/price-history?token_id=…&interval=…` — valid intervals
  (1m/5m/1h/1d?) and max lookback.
- `GET /quoteToken` — what currencies / stablecoins are supported?

Particularly interesting:
- Does `/market` include `volume`, `volume24h`, or both? Units (USD? USDT?
  native token)? Is it in the quote token, or USD-normalized?
- Does `marketTitle` include category / tags anywhere? How does Opinion
  classify markets (sports / crypto / macro / politics)?
- Any fields indicating a market's outcome resolution source
  (oracle / AI-resolved / manual)?

### 1.4 Token model (NOT the same as OPN — this is prediction outcome tokens)

- Is it strictly binary (yes/no), or can a market have >2 tokens (e.g.
  multi-outcome)?
- Price range — 0–1 like Polymarket, or 0–100 cents?
- Minimum order size / tick size?
- Are outcome tokens ERC-20 / BEP-20 on BNB chain? Transferable / tradable
  outside the Opinion CLOB, or purely in-venue?
- On-chain contract addresses for an example market's yes/no tokens.

### 1.5 Historical + real-time data

- How far back does `/token/price-history` go per token?
- Any bulk / dump endpoint for historical fills / trades?
- Is there a WebSocket stream for live orderbook or trade data? If so,
  URL + auth pattern + message shape.

### 1.6 Categorization

- List the top-level market categories / tags that Opinion uses. We need
  this to map Opinion markets into our sport / crypto / politics / macro
  buckets on the dashboard.

### 1.7 Gotchas

- Timezone of timestamps (UTC assumed — confirm).
- Do `yesTokenId` / `noTokenId` stay stable over a market's lifetime, or
  can they rotate?
- Any soft-deprecation notices / "v1 → v2 migration" banners?

---

## PART 2 — Economics of the prediction market itself

I need to understand who pays what, who earns what, and how Opinion Labs
(the company) makes money. This decides whether we surface Opinion to users
as a **tradable destination** (we send users there via affiliate / white-label
links) or just an **aggregated price source** (we read their data for our
arb scanner but don't route users).

### 2.1 Trading fees

- **Maker fee** — percentage or bps on resting limit orders that get hit.
  Is it zero, negative (rebate), or positive?
- **Taker fee** — percentage or bps on orders that cross the book.
- Is the fee charged on notional (cents × size) or on the filled token
  amount? Currency of the fee (quote token vs. OPN)?
- Are fees different per market / per category / per account tier (VIP,
  high-volume)? List the full tier matrix if it exists.
- Any fee discounts for paying / staking in OPN?
- How does this compare to Polymarket (2% maker/taker capped at some
  amount) and Kalshi (flat 1% settlement)? Name the concrete comparable
  numbers if the docs mention them.

### 2.2 Settlement + resolution fees

- Who pays the oracle / resolution cost when a market settles?
- Is there a fee taken by Opinion Labs at settlement (skimmed from
  winners' payouts)?
- If the oracle is AI-driven (they mention AI-powered oracle), who
  runs the inference, and who pays for it?
- Is there a dispute / appeal window, and what does challenging a
  resolution cost?

### 2.3 Deposit / withdrawal / gas economics

- What's the collateral token for trading? (USDT-BSC? USDC? BUSD? Native
  OPN?) Can users deposit from non-BNB chains via a bridge? If so, name the
  bridge partner.
- Deposit fees — percentage or flat.
- Withdrawal fees — percentage or flat, and are withdrawals same-chain
  BEP-20 only, or do they support ETH / Polygon / Base etc.?
- On-chain gas cost per order placement / cancellation / settlement on
  BNB chain (rough BNB amount or USD equivalent).
- Is matching off-chain (CLOB) with only settlement on-chain, or is every
  action on-chain? How does this affect total per-trade cost to a user?

### 2.4 Market creation economics

- Can anyone create a market, or is it permissioned (Opinion Labs only)?
- If permissioned, is there a whitelist / "verified creator" program?
- If permissionless, what's the cost to create a market (bond in OPN?
  stablecoin deposit? gas only)?
- Does a market creator earn a cut of the fees from trades on markets
  they created? If so, what percentage?

### 2.5 Liquidity provision / market making

- Is there an LP / market-maker incentive program?
- Rebates paid to makers — flat or volume-tiered?
- Any liquidity-mining program paying out in OPN tokens? If so, current
  APR / daily emission rate.
- Are there designated market makers with exclusive privileges
  (e.g. spread commitments in exchange for fee rebates)?
- Per the docs' mention of a "Builders Program" — summarize: who it's
  for, what builders get paid, what they have to build or commit to.

### 2.6 OPN token economics (the platform's native token)

- Total supply / circulating supply / emission schedule.
- Token contract address on BNB chain.
- What does OPN actually *do*? Governance? Fee discounts? Staking for
  yield? Collateral for trading? All of the above?
- Is OPN required to trade, or is it optional (stablecoin-only trading
  works without touching OPN)?
- Current price / market cap / FDV if listed on CoinGecko/CMC.
- Airdrop history — has there been one? Any ongoing "points" program
  that implies a future airdrop?
- Vesting cliffs / unlocks coming up in the next 6 months.

### 2.7 Revenue + volume stats

- Self-reported all-time volume — dollar figure.
- 24h / 30d volume if visible anywhere (their site, DeFiLlama, Dune
  dashboards).
- Approximate number of users / wallets.
- "Third-largest prediction market by volume" claim — can you verify this
  from DeFiLlama or a third-party source, and against which #1 and #2?
- Fee revenue disclosed anywhere? (Usually you have to compute it from
  volume × taker fee.)

### 2.8 Referral / affiliate / revenue-share program

- Does Opinion run a referral program where a third party (us) can send
  traders and earn a cut of their fees?
- If yes — percentage cut, payout cadence, payout token (OPN? stablecoin?),
  minimum payout, tracking mechanism (link + code vs. wallet-signature
  attribution).
- Is there a separate "integration partner" tier for aggregators / terminals
  that embed Opinion markets? Any exclusive deal terms published?
- Is there a white-label / "powered by Opinion" program, or is that the
  Builders Program?

### 2.9 Regulatory posture

- Jurisdictions where Opinion is available vs. geo-blocked. (Particularly:
  US? UK? EU? India? Is it KYC-gated or purely wallet-based?)
- Are there disclaimers about being unavailable to US persons?
- Any licensing claims (CFTC? Offshore? "Decentralized, not an exchange"
  framing)?
- Does this matter for us — if we refer US-based users there, is that an
  affiliate-compliance issue on our end?

### 2.10 Treasury / funding / team

- Funding history and lead investors.
- Named team members from the site (founder + CTO at minimum).
- Treasury address if published, and rough treasury size.
- Any signals about runway / revenue health.

---

## Output format

Reply in a single Markdown doc organized under the **exact same headers** as
above (Part 1 §1.1 through Part 2 §2.10). Under each bullet, answer in one
or two sentences or a data table — whichever is clearer. If a fact isn't
stated, write "not stated" under that bullet. Don't skip bullets.

At the very end, add a final section:

## Executive take — is this a first-class venue for us?

Five bullets max. Given what you learned, argue whether we should:
(a) treat Opinion as a full trade-destination venue (put it on the
tier-buttons row next to Polymarket / Kalshi, with an affiliate link), or
(b) treat it as a read-only price source (show it in the cross-venue
comparison table but don't route users), or
(c) skip it for now.

Cite the specific facts from above that drive the recommendation. Don't be
diplomatic — pick one.
