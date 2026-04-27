# Minute Markets / Short-Duration Prediction Markets — Ecosystem Map

**Date:** 2026-04-21
**Audience:** Sneakers Terminal scraper-fleet roadmap
**Scope:** Platforms offering sub-hour binary markets (5min, 15min, hourly, EOD) — crypto direction, sports moneyline, novelty.

---

## 1. Executive Summary

- **Five-minute markets are now a mass-retail product, not a niche.** Polymarket 5M and Limitless 5/30/60-min markets have been joined by Kalshi 15-min crypto (~50% of Kalshi crypto flow as of early 2026), with 5-min BTC bets reportedly hitting ~$70M daily volume across Polymarket+Kalshi. (Benzinga, MEXC News)
- **The Big-4 sportsbook crossover is now real.** As of Apr 2026: DraftKings Predictions (live, via Railbird acquisition), FanDuel Predicts (live in all 50 states via CME partnership, Dec 2025), Fanatics Markets (live in 24 states via Paragon acquisition + Crypto.com partnership, Dec 2025), and Crypto.com's standalone OG.com (live Feb 2026, now CDNA-backed margin trading). All four are CFTC-regulated DCM/FCM stacks. None of these are in the Sneakers scraper fleet yet.
- **Truly minute-grained crypto markets** are concentrated on: Polymarket (5M), Limitless (CLOB, 30/60min, 5/10/15 min planned), Kalshi (15-min BTC/ETH/SOL/XRP up-down), OKX Event Contracts (15-min minimums), Hedgehog (Solana, on-chain protocol-fee binary options). Of these, only Limitless+Kalshi+Polymarket are in the existing fleet.
- **The biggest underserved coverage gap** for Sneakers vs OddsJam-class competitors is the *sportsbook-aliased* prediction markets: DK Predictions, FanDuel Predicts, Fanatics Markets, OG.com. These have material liquidity, different odds vs the sportsbook side, and CFTC pricing arbitrage potential.
- **DeFi/on-chain minute-market ecosystem is fragmented but growing fast.** Drift BET (Solana, CLOB, $3.5M day-1 liquidity), Hedgehog (Solana, protocol-fee binary options, $3M TVL in Jan 2026), Hyperliquid HIP-4 outcome contracts (testnet Feb 2026, mainnet expected mid-2026), Jupiter→Polymarket bridge (Solana, Feb 2026). RPC-readable.
- **Centralized-exchange entry is new and material.** OKX launched Event Contracts on April 20, 2026 (15-min to daily, BTC/ETH only at launch); Binance announced same week. These are NOT yet US-available but will be the largest non-US minute-market venues.
- **Wrapper proliferation is a real trap.** Robinhood Predictions, Phantom Predictions, Coinbase Predict, PrizePicks Team/Culture Picks, Sleeper Markets, Underdog Predict are all *Kalshi or Crypto.com (CDNA) order routers.* Scraping them duplicates the same orderbook. The unique data is on the underlying DCM (Kalshi, CDNA) — wrappers add only UX surface.
- **Sweepstakes-model "social books" (Fliff, Thrillzz, Rebet, ProphetX) are not true minute markets** — they list game-level events and lack hourly crypto/macro. Low priority unless the user wants CFTC-vs-state-sweeps arbitrage.
- **CFTC is in active rulemaking.** Feb 2026 it withdrew the proposed sports event-contract ban; Mar 2026 MoU with MLB. New DCMs likely to launch in 2026 (Sporttrade applied Feb 2026 for DCM+DCO).
- **Differentiation thesis:** OddsJam doesn't cover prediction markets, sweeps, or DeFi outcome contracts. Sneakers' edge is exactly the cross-venue overround/arb scan across {Kalshi/Polymarket/Limitless/OG/DK Predicts/FanDuel Predicts/Fanatics/Underdog}. Adding the 4 sportsbook-aliased books is the highest-EV next move.

---

## 2. Categorized Platform Inventory

### 2A. CFTC-Regulated DCM/FCM Exchanges (US-onshore)

#### Kalshi
1. **URL:** https://kalshi.com
2. **Mechanic:** CLOB; binary yes/no contracts $0.01–$0.99
3. **Resolution windows:** 15-min crypto up/down (BTC/ETH/SOL/XRP), hourly crypto, daily, weekly, monthly. No 5-min yet.
4. **Asset coverage:** Crypto direction, sports moneyline (NFL/NBA/NHL/MLB/CFB/soccer/tennis), politics, economics (CPI/jobs/Fed), pop culture, weather.
5. **Regulatory:** CFTC DCM. National.
6. **API:** Public REST + WebSocket (well-documented). Already in fleet.
7. **Liquidity:** Largest US prediction market by sports volume; valued ~$11B (Coinbase round, Dec 2025).
8. **Notable:** Acts as the underlying exchange for Robinhood Predict, Coinbase Predict, Phantom, Sleeper, PrizePicks Team/Culture Picks. Already covered.
9. **Scraper difficulty:** **1** — public unauthenticated API.

#### Crypto.com Derivatives North America (CDNA) / OG.com
1. **URL:** https://og.com (consumer); CDNA is the licensed exchange backend
2. **Mechanic:** CLOB binary contracts; OG plans first-ever margin prediction contracts via Crypto.com FCM
3. **Resolution windows:** Sports event resolution (game-level, ~hours-days); financial daily; political event-based. Not currently advertising sub-hour windows but margin product opens that door.
4. **Asset coverage:** Sports event contracts (NFL/NBA/NHL/MLB/CFB/soccer/tennis), financial, political, cultural, entertainment.
5. **Regulatory:** CDNA = CFTC-registered DCM since Dec 2024 (first to launch sports event contracts).
6. **API:** Partner-gated. CDNA wholesales to DraftKings, Underdog, Fanatics, OG. No public API yet documented.
7. **Liquidity:** Crypto.com reported 40x weekly growth in prediction market business over 6 months pre-launch (Feb 2026). $17B monthly volumes cited.
8. **Notable:** OG is Crypto.com's standalone consumer brand; CDNA is the wholesale licensing entity. Same orderbook surfaced via DK Predictions and Underdog Predict.
9. **Scraper difficulty:** **3–4** — likely needs reverse-engineering the OG/Underdog/DK app private APIs since CDNA itself is partner-only. (Sources: crypto.com company-news, theblock.co, sbcamericas.com)

#### DraftKings Predictions (Railbird)
1. **URL:** https://predictions.draftkings.com
2. **Mechanic:** CLOB event contracts via Railbird (DK acquired Dec 2025). Player props from CDNA partnership (Feb 2026).
3. **Resolution windows:** Game-resolution sports; daily/intraday financial; political. No advertised 5/15-min crypto.
4. **Asset coverage:** Sports (initially), finance, expanding to entertainment + culture.
5. **Regulatory:** CFTC DCM via Railbird. 38 states at launch including CA/TX/FL/GA (where DK Sportsbook is illegal — strategic).
6. **API:** Mobile app private API; no public docs.
7. **Liquidity:** New (Dec 2025). Heavy DK marketing; strategic cross-sell.
8. **Notable:** Distinct app from DK Sportsbook; Yahoo Finance piece (Dec 2025) calls it major investment-thesis change for DKNG.
9. **Scraper difficulty:** **3** — mitm-proxy iOS/Android app or reverse-engineer headers; likely doable.

#### FanDuel Predicts
1. **URL:** https://www.fanduel.com/predicts
2. **Mechanic:** CME-partnered event contracts ($0.01–$0.99 CLOB).
3. **Resolution windows:** Daily macro (S&P, Nasdaq, oil/gas, gold, crypto, GDP, CPI); per-game sports. No sub-hour advertised at launch.
4. **Asset coverage:** Financial (50 states), sports (18 states where online sportsbook isn't legal), economics, culture.
5. **Regulatory:** CFTC DCM via CME Group partnership. Launched Dec 22, 2025; nationwide rollout complete Q1 2026.
6. **API:** Mobile-first; private.
7. **Liquidity:** Brand-new; piggybacks on FanDuel's ~12M MAU.
8. **Notable:** Uses FanDuel KYC; CME settlement — very different counterparty profile from CDNA-backed competitors.
9. **Scraper difficulty:** **3** — same as DK Predictions, mobile app reverse-engineering.

#### Fanatics Markets
1. **URL:** Fanatics Markets app (in-app, fanaticsinc.com press)
2. **Mechanic:** CLOB binary; "Combos" feature (Apr 2026) lets users build parlay-style combined predictions — first of its kind in regulated event contracts.
3. **Resolution windows:** Sports per-game, daily finance, political event-based. Phase 2 (early 2026) added crypto/stocks/IPOs/climate/AI/movies/music.
4. **Asset coverage:** Sports/finance/culture/economics/politics; Phase 2 added crypto/stocks/IPOs/weather/AI/entertainment.
5. **Regulatory:** CFTC. Operates via Paragon Global Markets acquisition (July 2025) + Crypto.com partnership for clearing. 24 states at launch.
6. **API:** Private.
7. **Liquidity:** New (Dec 3, 2025). Fanatics user base ≈100M e-commerce customers — large addressable.
8. **Notable:** Launched parlay "Combos" feature April 2026 — competitive distinguisher; Fanatics simultaneously exited AGA, signaling positioning AWAY from gambling label.
9. **Scraper difficulty:** **3–4** — newest app, smallest API surface known.

#### Sporttrade (pending)
1. **URL:** https://sporttrade.com
2. **Mechanic:** Currently exchange-style sports betting (state-licensed); applied Feb 2026 to be CFTC DCM + DCO.
3. **Resolution windows:** Live in-play sports (sub-minute price moves on game state).
4. **Asset coverage:** Sports — moneylines/spreads/totals only.
5. **Regulatory:** AZ/CO/IA/NJ/VA state licenses; DCM application pending.
6. **API:** Reportedly partner-only.
7. **Liquidity:** Small but growing.
8. **Notable:** If approved as DCM+DCO it would be the first sports-only federally-regulated exchange and clearinghouse.
9. **Scraper difficulty:** **3** — state apps available, mobile reverse-engineer.

### 2B. Wrappers / Order Routers (Same liquidity as upstream — DO NOT scrape independently)

| Wrapper | Routes to | Notes |
|---|---|---|
| **Robinhood Predictions** | Kalshi (Robinhood Derivatives is FCM) | Daily/weekly stock direction; sports markets via Kalshi. Same orderbook. |
| **Coinbase Predict** | Kalshi | Live in 50 states Jan 2026. In-app, not standalone. |
| **Phantom Predictions** | Kalshi | Solana-wallet integration Dec 2025; pays in SOL/USDC but trades resolve on Kalshi. |
| **Sleeper Markets** | Kalshi | Team Picks live Feb 2026; FCM-registered. |
| **PrizePicks Team Picks** | Kalshi | Live 30 states + DC, Nov 2025. |
| **PrizePicks Culture Picks** | Polymarket (announced Q1 2026) | Live 48 states. Different upstream. |
| **Underdog Predict** | CDNA (Crypto.com) | Live 33 states + DC. Already in fleet. |
| **DraftKings Player Props** (Predictions tab) | CDNA | Feb 2026 partnership for player-prop event contracts. |

**Implication:** Scraping all wrappers ≠ new data. Useful only for *spread-vs-upstream* arbitrage if a wrapper has its own pricing layer or fee curve.

### 2C. DeFi / On-Chain Prediction Protocols

#### Polymarket
1. **URL:** https://polymarket.com
2. **Mechanic:** CLOB on Polygon; Solana access via Jupiter integration (Feb 2026).
3. **Resolution windows:** 5-min, 15-min, hourly crypto direction. Long-tail event markets up to multi-year.
4. **Asset coverage:** Crypto, politics, sports, culture, weather, novelty.
5. **Regulatory:** Offshore historically; resumed US access via QCEX acquisition (separate development; reportedly compliant).
6. **API:** Public Gamma API + CLOB API, no auth required for read. Already in fleet.
7. **Liquidity:** $7.66B Jan 2026 monthly volume.
8. **Notable:** Industry leader for long-tail novelty + canonical 5M crypto market.
9. **Scraper difficulty:** **1**.

#### Limitless Exchange
1. **URL:** https://limitless.exchange
2. **Mechanic:** CLOB on Base; instant settlement, no liquidations.
3. **Resolution windows:** 30-min, 60-min live; 1/5/10/15-min on roadmap. Hourly + daily for stocks/crypto.
4. **Asset coverage:** Crypto prices, stock prices (live), planned macros.
5. **Regulatory:** DeFi/permissionless on Base.
6. **API:** Public REST + WebSocket; TS + Python SDKs (Mar 2026 refresh). Already in fleet.
7. **Liquidity:** $500M+ cumulative; Coinbase listed LMTS token Mar 2026.
8. **Notable:** Canonical "minute market" platform; CLOB-on-AMM-chain hybrid.
9. **Scraper difficulty:** **1**.

#### Drift BET (Solana)
1. **URL:** https://drift.trade (BET tab)
2. **Mechanic:** CLOB integrated with Drift's perp engine. Cross-collateral with 30+ assets; YES/NO at 0/1.
3. **Resolution windows:** Mixed — most current markets are event-resolution, not strict timed; plans to add timed crypto/sports.
4. **Asset coverage:** Crypto, expanding to sports + economics.
5. **Regulatory:** DeFi/permissionless on Solana.
6. **API:** Public Solana RPC + Drift TypeScript SDK.
7. **Liquidity:** $3.5M order-book day-1 (mid-2025). Growing.
8. **Notable:** Earns yield on collateral while position held — unique capital efficiency.
9. **Scraper difficulty:** **2** — Solana RPC + Anchor IDL.

#### Hedgehog Markets (Solana)
1. **URL:** https://hedgehog.markets / https://thehedgehog.io
2. **Mechanic:** Decentralized binary options on protocol-fee metrics, funding rates, base fees.
3. **Resolution windows:** Short, recurring time intervals (hourly + daily for fee/rate metrics).
4. **Asset coverage:** On-chain expense metrics — base fees, priority fees, funding rates, gas. NICHE but truly minute-grain.
5. **Regulatory:** DeFi on Solana (expanding to Eclipse + others).
6. **API:** Public Solana RPC + GitHub SDK.
7. **Liquidity:** $3M+ TVL Jan 2026, V1 launched.
8. **Notable:** Only platform offering tradeable on-chain-cost markets — no direct competitor.
9. **Scraper difficulty:** **2**.

#### Hyperliquid HIP-4 Outcomes (mainnet pending)
1. **URL:** https://hyperliquid.xyz
2. **Mechanic:** Outcome contracts — fully collateralized, expiry-based settle 0 or 1. Builders stake 1M HYPE to launch.
3. **Resolution windows:** Builder-defined; spec supports any timeframe.
4. **Asset coverage:** Open — depends on Builders.
5. **Regulatory:** DeFi/permissionless.
6. **API:** Public Hyperliquid info-endpoint + WebSocket.
7. **Liquidity:** Testnet only as of Feb 2026; mainnet expected mid-2026.
8. **Notable:** First DEX to natively combine spot + perps + outcomes on one execution layer.
9. **Scraper difficulty:** **2** when live; pre-launch monitoring is **1**.

#### Jupiter (Solana — Polymarket bridge)
- Not a separate orderbook. Routes Solana users to Polymarket; same data.

### 2D. Centralized-Exchange Event Contracts (mostly non-US)

#### OKX Event Contracts
1. **URL:** https://www.okx.com/learn/okx-event-contracts
2. **Mechanic:** Binary contracts $0.01–$0.99 USDT, no leverage; full-margin.
3. **Resolution windows:** **15-min minimum** to daily — true minute markets.
4. **Asset coverage:** BTC, ETH at launch (Apr 20, 2026); more pairs planned.
5. **Regulatory:** Asia/LatAm/CIS only at launch; not US-available.
6. **API:** OKX has full public REST/WS API; event contracts likely surfaced through it (verify).
7. **Liquidity:** New; OKX has massive crypto user base.
8. **Notable:** Same week as Binance launch. CEX category entry is structurally important.
9. **Scraper difficulty:** **1–2** — OKX has public docs; geographic filters may apply.

#### Binance Event Contracts
1. **URL:** binance.com (no canonical event-contracts landing yet found)
2. **Mechanic:** Binary contracts (announced same week as OKX).
3. **Resolution windows:** Reportedly similar to OKX (15-min+).
4. **Asset coverage:** Crypto direction.
5. **Regulatory:** Non-US.
6. **API:** Binance public API; verify event-contract endpoints.
7. **Liquidity:** Largest crypto exchange; expect quick scaling.
8. **Notable:** Same product genre as OKX — confirms CEX entry is the trend.
9. **Scraper difficulty:** **1–2**.

### 2E. Sweepstakes Social Books (NOT true minute markets)

| Platform | URL | Markets | Notes |
|---|---|---|---|
| **Fliff** | getfliff.com | Game-level sports, no crypto/macro | Sweeps model; 48 states. No sub-hour. |
| **Thrillzz** | thrillzz.com | Sports picks + casino | Sweeps. No minute markets. |
| **Rebet** | rebet.app | 60+ sports | Sweeps; 35+ states. |
| **Stake.us** | stake.us | Sports + casino | Sweeps. No event-contract structure. |
| **McLuck / High 5 / Chumba / Pulsz** | various | Casino-first | Not prediction markets at all. |
| **ProphetX** | prophetx.co | Sports peer-to-peer exchange | Sweeps model; CFTC DCM/DCO applied Nov 2025. Already in fleet. |
| **NoVig** | novig.us | Sports peer-to-peer | Sweeps; small base. Already in fleet. |

**Recommendation:** Skip the casino-first sweeps. ProphetX/NoVig already covered. No incremental minute-market value here.

### 2F. International Exchanges

| Platform | URL | Mechanic | Minute markets? | API |
|---|---|---|---|---|
| **Betfair Exchange** | developer.betfair.com | Order book exchange | In-play sports prices update sub-second; no explicit binary 5/15-min | Public, but app-key application required |
| **Smarkets** | docs.smarkets.com | Order book exchange | In-play; no explicit binary timed markets | Public free API |
| **Matchbook / Betdaq** | various | Order book | Similar | Various |

**Note:** UK exchanges have always had sub-minute price discovery via in-play but their unit is the contract for the *whole match*, not a 5-minute window. Different from the new prediction-market category. Useful for sports pricing comparisons but not minute markets per se.

---

## 3. Coverage Gap Matrix

| Platform | Mechanic | Sub-hour markets | Already in Sneakers fleet? | Adds NEW data? | Priority |
|---|---|---|---|---|---|
| Limitless | CLOB / Base | YES (30/60min, 5/10/15 planned) | YES | — | — |
| Polymarket | CLOB / Polygon+Solana | YES (5/15/60min) | YES | — | — |
| Kalshi | CLOB / CFTC | YES (15min crypto) | YES | — | — |
| ProphetX | Sweeps exchange | NO (game-level) | YES | — | — |
| NoVig | Sweeps exchange | NO | YES | — | — |
| Underdog Predict | CDNA wrapper | NO | YES | — | — |
| PrizePicks | Kalshi+Polymarket wrapper | inherits | YES | — | — |
| OG.com | CDNA standalone | likely (margin) | NO | YES — Crypto.com flagship | **HIGH** |
| DraftKings Predictions | Railbird DCM | TBD | NO | YES — own orderbook | **HIGH** |
| FanDuel Predicts | CME DCM | macro daily | NO | YES — CME-cleared, distinct | **HIGH** |
| Fanatics Markets | Paragon DCM | per-game + Combos | NO | YES — unique parlay surface | **HIGH** |
| Sporttrade | exchange (DCM pending) | in-play sports | NO | YES (sports only) | MEDIUM |
| Drift BET | Solana CLOB | partial | NO | YES — Solana liquidity | MEDIUM |
| Hedgehog | Solana on-chain | YES (gas/funding) | NO | YES — only protocol-fee markets | MEDIUM (niche) |
| Hyperliquid HIP-4 | Hyperliquid | TBD | NO (mainnet pending) | YES (when live) | MONITOR |
| OKX Event Contracts | CEX binary | YES (15min+) | NO | YES (non-US) | MEDIUM |
| Binance Event Contracts | CEX binary | YES likely | NO | YES (non-US) | MEDIUM |
| Robinhood Predict | Kalshi wrapper | inherits | NO | NO | LOW |
| Coinbase Predict | Kalshi wrapper | inherits | NO | NO | LOW |
| Phantom Predict | Kalshi wrapper | inherits | NO | NO | LOW |
| Sleeper Markets | Kalshi wrapper | inherits | NO | NO | LOW |
| Fliff/Thrillzz/Rebet/Stake.us | sweeps | NO | NO | maybe (state-coverage map) | LOW |
| Betfair / Smarkets | exchange | in-play sports only | NO | partial (UK sports) | LOW |

---

## 4. Recommended Scraper Buildout Order

Weighting = (liquidity × differentiation × ease).

### #1 — OG.com (Crypto.com Predictions / CDNA)
- **Why:** Crypto.com claimed 40x weekly growth. Underlies Underdog (already in fleet) and DK Player Props. Becoming the second-largest US prediction venue after Kalshi. Margin product launch is unique.
- **Path:** Reverse-engineer the OG.com mobile app; reuse any CDNA endpoints already discovered for Underdog. Likely shared backend.
- **Effort:** 1–2 weeks.
- **Differentiator:** Zero competitors (incl OddsJam) cover OG.

### #2 — DraftKings Predictions
- **Why:** Strategic brand, 38 states including CA/TX/FL/GA where DK Sportsbook is *illegal* — meaning prices may *diverge meaningfully* from sportsbook odds (state-availability arbitrage). Distinct orderbook (Railbird).
- **Path:** mitm DK Predictions iOS/Android. Likely Apollo-style GraphQL or REST.
- **Effort:** 1–2 weeks.

### #3 — FanDuel Predicts
- **Why:** All 50 states, CME-cleared (different counterparty), macro coverage (S&P/Nasdaq/oil/gold/CPI/GDP). Macro-event arb against Kalshi is a real opportunity.
- **Path:** mitm FanDuel Predicts mobile.
- **Effort:** 1–2 weeks.

### #4 — Fanatics Markets
- **Why:** "Combos" parlay feature is a unique surface no other DCM has. Phase 2 added crypto/IPOs/AI/movies — wide novelty surface.
- **Path:** Reverse-engineer Fanatics Markets app.
- **Effort:** 2 weeks (newest app, least mapped).

### #5 — Drift BET (Solana)
- **Why:** Public Solana RPC + Drift SDK = trivial scraper. First DeFi entry for Sneakers. Cross-collateral makes pricing structurally different from Polymarket.
- **Path:** Drift TS SDK; subscribe to BET program logs.
- **Effort:** ~1 week.

### Additional MONITOR-tier (no immediate scrape, but watch):
- **Hyperliquid HIP-4 mainnet** — when builders stake, scrape outcomes via info endpoint. Low cost when ready.
- **Sporttrade DCM approval** — if granted, becomes the first sports-only DCM and warrants priority bump.
- **OKX/Binance event contracts** — non-US so geographically less useful, but could matter for crypto cross-venue overround scans (especially BTC/ETH 15-min).
- **Hedgehog** — niche but unique; scrape if a customer cares about gas/funding-rate hedging.

---

## 5. Open Questions / Things I Couldn't Verify

- **OG.com sub-hour windows.** Marketing emphasizes "comprehensive sports event contracts" + margin trading; haven't confirmed whether they list 15-min crypto. Worth a 5-minute manual app inspection.
- **DK Predictions / FanDuel Predicts crypto resolution windows.** Both list "crypto" but I couldn't find evidence of true 15-min markets vs daily. Phase 2 expansions may add these.
- **CDNA public API.** I couldn't find a public docs site for CDNA the way Kalshi has one. Strongly suspect everything routes via partners' apps.
- **Hyperliquid HIP-4 mainnet date.** Testnet Feb 2026; rumored mainnet mid-2026 but not pinned.
- **Binance Event Contracts product spec.** Same-week launch as OKX; the spec docs were thinner. Confirm timeframes and pairs before committing scraper time.
- **Polymarket → US reentry status.** They acquired QCEX (a CFTC-licensed exchange) — operational status of US Polymarket users in April 2026 needs verification.
- **Robinhood "live sports contract hub"** — they list a sports hub, but couldn't confirm whether routing is purely Kalshi or has Robinhood-specific pricing layer.
- **Vector Reserve / Reactor** — name is real but I found no operational prediction-market product as of April 2026. May be vaporware or pre-launch. Tokens exist; product unclear.
- **Newer 2026 DeFi launches I may have missed.** The space is shipping monthly. Worth a quarterly re-survey.

---

## Source URLs

### DraftKings Predictions
- https://bettorsinsider.com/predictions/reviews/draftkings-predictions/
- https://www.coindesk.com/markets/2025/12/19/draftkings-enters-prediction-markets-with-cftc-approved-app-for-real-world-events
- https://www.draftkings.com/draftkings-debuts-predictions-app-entering-prediction-markets
- https://sbcamericas.com/2026/02/09/draftkings-cryptocom-predictions/
- https://finance.yahoo.com/news/draftkings-cftc-regulated-predictions-platform-010834448.html

### Fanatics Markets
- https://www.fanaticsinc.com/press-releases/fanatics-launches-fanatics-markets-the-first-prediction-market-at-the-intersection-of-sports-finance-and-culture
- https://www.cnbc.com/2025/12/03/fanatics-launches-prediction-market.html
- https://www.coindesk.com/markets/2025/12/03/fanatics-enters-prediction-markets-with-app-live-in-10-states
- https://www.covers.com/industry/fanatics-markets-ups-the-ante-with-combos-predictions-feature-april-16-2026

### Crypto.com / OG / CDNA
- https://crypto.com/en/company-news/cryptocom-launches-og-a-new-prediction-market-experience
- https://www.theblock.co/post/388292/crypto-com-og-prediction-markets-app-monthly-volumes-17-billion-super-bowl
- https://www.bloomberg.com/news/articles/2026-02-03/crypto-com-launches-predictions-only-platform-before-super-bowl
- https://crypto.com/en/company-news/underdog-crypto-com

### FanDuel Predicts
- https://www.cmegroup.com/media-room/press-releases/2025/12/22/fanduel-and-cme-group-launch-fanduel-predicts.html
- https://www.fanduel.com/predicts
- https://sports.yahoo.com/articles/fanduel-predicts-goes-live-50-162000885.html

### Limitless / Polymarket / Kalshi minute markets
- https://limitless.exchange/
- https://polymarket.com/crypto/5M
- https://polymarket.com/crypto/15M
- https://kalshi.com/category/crypto/frequency/fifteen_min
- https://www.mexc.com/news/923042
- https://www.benzinga.com/crypto/cryptocurrency/26/03/51250409/5-minute-bitcoin-bets-hit-70m-daily-volume-as-traders-lean-into-ai
- https://goodmoneyguide.com/usa/kalshi-takes-on-crypto-options-trading-with-launch-of-15-minute-crypto-prediction-markets/

### Coinbase / Robinhood / Phantom / Sleeper / PrizePicks / Underdog (wrappers)
- https://www.coindesk.com/markets/2026/01/27/coinbase-rolls-out-prediction-market-to-u-s-customers
- https://defirate.com/news/coinbase-launches-nationwide-prediction-markets/
- https://robinhood.com/us/en/prediction-markets/
- https://news.kalshi.com/p/kalshi-phantom-crypto-prediction-market-integration
- https://defirate.com/news/sleeper-adds-kalshi-prediction-markets-days-before-super-bowl/
- https://www.prizepicks.com/press-news/prizepicks-launches-prediction-markets-offering-with-kalshi
- https://www.prizepicks.com/press-news/prizepicks-partners-with-polymarket-for-prediction-markets-expansion
- https://www.underdogfantasy.com/news/underdog-and-crypto-com-derivatives-north-america-announce-first-prediction-market-exchange-offered-on-major-sports-gaming-operator-app

### DeFi / on-chain
- https://docs.drift.trade/prediction-markets/prediction-markets-intro
- https://www.theblock.co/post/311888/solana-based-drift-protocol-launches-prediction-market
- https://www.hedgehog.markets/
- https://thehedgehog.io/
- https://www.coingecko.com/learn/hyperliquid-hip3-hip4-tokenized-stocks-and-prediction-markets
- https://blog.quicknode.com/hip4-hyperliquid-outcome-contracts/
- https://thedefiant.io/news/defi/hyperliquid-to-launch-prediction-market-outcome-trading
- https://www.coindesk.com/markets/2026/02/02/jupiter-brings-polymarket-to-solana-and-lands-usd35-million-investment-deal

### CEX event contracts
- https://news.bitcoin.com/okx-launches-simplified-event-contracts-for-bitcoin-and-ether-price-predictions/
- https://blog.1token.tech/binance-and-okx-launch-prediction-market-contracts/
- https://www.okx.com/en-us/learn/okx-event-contracts

### Sweepstakes / sports social
- https://thrillzz.com/
- https://www.getfliff.com/sports-prediction-rules
- https://www.sportico.com/business/sports-betting/2025/prophetx-prediction-market-cftc-sweepstakes-1234876170/

### Sporttrade / CFTC
- https://www.ingame.com/sporttrade-prediction-market-application-cftc/
- https://www.cftc.gov/LearnandProtect/PredictionMarkets
- https://www.nortonrosefulbright.com/en-us/knowledge/publications/fed865b0/cftc-advances-regulatory-framework-for-prediction-markets

### International exchanges
- https://developer.betfair.com/exchange-api/
- https://docs.smarkets.com/

### Aggregators / context
- https://medium.com/@samuel.tinnerholm/the-top-prediction-market-apis-in-2026-ecb02baae641
- https://defirate.com/prediction-markets/crypto/
- https://next.io/prediction-markets/
