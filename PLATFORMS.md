# Sneakers Platform Integration Matrix

Last updated: 2026-04-19

Authoritative catalog lives in `web/lib/platforms.ts` (76 platforms across 3 categories). This doc maps each platform to a **scraping strategy**, **feasibility**, and **current coverage status**.

## Integration Tiers

| Tier | Meaning | Effort |
|------|---------|--------|
| **T1 — Public API**       | Official API, no key or free key, read-only endpoints we can call. | Low |
| **T2 — Keyed API**        | Official API, requires key or signed request, but stable contract. | Low-Med |
| **T3 — RE'd Endpoint**    | Undocumented JSON endpoint the site's own client uses. Works until they change it. | Med |
| **T4 — Headless Browser** | Playwright/Puppeteer against the product UI. DOM-dependent, flaky. | High |
| **T5 — Blocked/Skip**     | Heavily bot-protected (Akamai/Cloudflare/Imperva), geo-locked w/o VPN, or not worth it. | Very High / skip |

Status key: **✅ shipped** · **🟡 partial** · **⬜ not started** · **❌ skip**

---

## Priority Order (build next in this sequence)

1. **Kalshi** (T1) — Public `/markets` endpoint, no auth for reads
2. **Polymarket** (T1) — Public Gamma + CLOB APIs, no auth for reads
3. **Coinbase Predict** (T2) — Existing code in `src/coinbase-predict-scraper.ts`, needs port to `BaseScraper`
4. **Robinhood Predictions** (T2) — Existing code in `src/services/robinhood-markets.ts`, needs port
5. **BetMGM** (T3) — Same reverse-engineered pattern as DK
6. **Caesars** (T3) — Same
7. **ESPN Bet / Fanatics / BetRivers / Hard Rock** (T3) — Next-tier sportsbooks
8. **OG.com** (T2-ish) — Need to verify API surface
9. **ProphetX / Sporttrade / Novig** (T2/T3) — US exchanges, smaller books but sharp lines
10. **Pinnacle** (T3) — Gold-standard sharp lines; partner-feed-only but client endpoints leak
11. **Pick'em DFS** (T3) — PrizePicks, Underdog, Sleeper props
12. **Sweepstakes** (T3) — Stake.us, Fliff (done), Chumba, Pulsz
13. **International sportsbooks** (T3/T4) — bet365, William Hill, Unibet, etc.
14. **Offshore** (T3) — Pinnacle (see #10), BetOnline, Bovada
15. **Exchanges** (T2) — Betfair Exchange (official API key), Smarkets, Matchbook

---

## Sportsbooks — 46 platforms

### US Tier 1 (8)
| ID | Name | Tier | Status | API / Endpoint | Notes |
|----|------|------|--------|----------------|-------|
| dk    | DraftKings         | T3 | ✅ | `sportsbook-nash.draftkings.com/sites/US-SB/api/v5/eventgroups/{id}` | Geo-gated |
| fd    | FanDuel            | T3 | ✅ | `sbapi.ny.sportsbook.fanduel.com` | Geo-gated |
| mgm   | BetMGM             | T3 | ⬜ | `sports.betmgm.com/cds-api/bettingoffer/fixtures` | |
| czr   | Caesars Sportsbook | T3 | ⬜ | `sportsbook.caesars.com/api/sportsbook/v2` | |
| espn  | ESPN Bet           | T3 | ⬜ | `api.betmgm.pennsylvania.com` (shares MGM backend) | |
| fan   | Fanatics           | T3 | ⬜ | `api.sportsbook.fanatics.com` | Amelco platform |
| brv   | BetRivers          | T3 | ⬜ | `c6-ce-mobile.betrivers.com` | Kambi platform |
| hr    | Hard Rock Bet      | T3 | ⬜ | Also Kambi | |

### US Tier 2 (14)
| ID | Name | Tier | Status | Notes |
|----|------|------|--------|-------|
| borg, wyn, pts, si, tipico, betparx, circa, wg, stn, sp, wind, tvg | (various) | T3-T4 | ⬜ | Kambi/SBTech/custom mix; lower priority |
| sb-betr | Betr Sportsbook | T3 | ⬜ | Micro-betting, niche |
| fliff | Fliff | T3 | ✅ | Sweepstakes sportsbook |

### Global (12)
| ID | Name | Tier | Status | Notes |
|----|------|------|--------|-------|
| b365 | bet365 | T4 | ⬜ | Hardest target; aggressive bot protection |
| wh, uni, bwin, ladb, coral, pwr, sky, bway, 888, betfred, tenbet | (various) | T3 | ⬜ | Most use Playtech/OpenBet — shared approach |

### Offshore (8)
| ID | Name | Tier | Status | Notes |
|----|------|------|--------|-------|
| pin | Pinnacle | T2 | ⬜ | **Sharpest lines anywhere.** Paid API ($500/mo) or RE client endpoints. High priority for arb. |
| bol, bov, mb, bkm, bus, her | BetOnline, Bovada, etc. | T3 | ⬜ | Digital Gaming Corp / Bovada share backend |
| 1xb | 1xBet | T3 | ⬜ | Massive coverage, grey-market |

### Exchanges (6)
| ID | Name | Tier | Status | Notes |
|----|------|------|--------|-------|
| bfex | Betfair Exchange | T2 | ⬜ | Official API, app key + session token, excellent docs |
| smk  | Smarkets         | T2 | ⬜ | Official REST API |
| mcb  | Matchbook        | T2 | ⬜ | Official API |
| novig | NoVig           | T3 | ⬜ | US P2P exchange |
| prox | Prophet Exchange | T3 | ⬜ | US exchange (NJ-only currently) |
| spt  | Sporttrade       | T3 | ⬜ | US exchange |

---

## Prediction Markets — 15 platforms

| ID | Name | Tier | Status | API / Endpoint | Notes |
|----|------|------|--------|----------------|-------|
| kalshi      | Kalshi              | **T1** | 🟡 → ✅ | `api.elections.kalshi.com/trade-api/v2/markets` | CFTC-regulated DCM. Public reads, no auth. **Building now.** |
| polymarket  | Polymarket          | **T1** | 🟡 → ✅ | `gamma-api.polymarket.com/markets` + `clob.polymarket.com` | Blockchain. Public reads. **Building now.** |
| rh          | Robinhood Predict   | T2 | 🟡 | Existing scanner in `src/services/robinhood-markets.ts` | Uses Kalshi contracts via partnership; some RH-only |
| fdp         | FanDuel Predicts    | T3 | 🟡 | Existing `fanduel-predict.ts` | Event contracts under CFTC |
| dkp         | DraftKings Predict  | T3 | 🟡 | Existing `draftkings-predict.ts` | Event contracts |
| og          | OG.com              | T3 | ⬜ | Verify API surface — confirm operational status | |
| crp         | Crypto.com Predict  | T2 | 🟡 | Existing `crypto-com-prediction-scanner.ts` | Needs port to `BaseScraper` |
| cbp         | Coinbase Predict    | T2 | 🟡 | Existing `coinbase-predict-scraper.ts` | Needs port |
| prx         | ProphetX            | T3 | ⬜ | | |
| pit         | PredictIt           | T1 | ⬜ | `predictit.org/api/marketdata/all/` | Public JSON, very simple |
| lim         | Limitless           | T2 | 🟡 | Existing `limitless-market-viewer.ts` etc. | On-chain |
| drft        | Drift Predict       | T3 | ⬜ | Solana-based, needs on-chain reads |
| mani        | Manifold            | T1 | ⬜ | `api.manifold.markets/v0/markets` | Play money — skip for production bankroll, keep for sentiment |
| zg          | Zeitgeist           | T3 | ⬜ | Polkadot, niche volume |
| bfx         | Betfair Exchange    | T2 | ⬜ | Already in sportsbooks section — same API covers both |

### Additional prediction markets to add to catalog
- **ForecastEx** — T2, CFTC-regulated, owned by Interactive Brokers. REST + FIX API (IBKR credentials).
- **Azuro Protocol** — T3, on-chain aggregator across chains.
- **Overtime Markets** — T3, Optimism-based sports prediction.
- **Myriad Markets** — T3, multi-chain.
- **Hedgehog Markets** — T3, Solana.
- **SX Bet (SX Network)** — T2, own API.
- **Augur v2** — T4, on-chain + slow; low volume, probably skip.
- **Metaculus / Good Judgment Open** — T1, no money, keep for sentiment only.

---

## Fantasy / DFS — 15 platforms

| ID | Name | Tier | Status | Notes |
|----|------|------|--------|-------|
| pp     | PrizePicks       | T3 | ⬜ | `api.prizepicks.com/projections` (public but rate-limited) |
| ud     | Underdog Fantasy | T3 | ⬜ | Reverse-engineer mobile API |
| sl     | Sleeper          | T1 | ⬜ | Has official public API docs |
| db     | Dabble           | T3 | ⬜ | |
| pl     | ParlayPlay       | T3 | ⬜ | |
| bpp    | Betr Picks       | T3 | ⬜ | |
| boom   | Boom Fantasy     | T3 | ⬜ | |
| ob     | OwnersBox        | T3 | ⬜ | |
| splash | Splash Sports    | T3 | ⬜ | |
| sdft   | SuperDraft       | T3 | ⬜ | |
| vivid  | Vivid Picks      | T3 | ⬜ | |
| drft2  | Drafters         | T3 | ⬜ | |
| stake  | Stake.us         | T3 | ⬜ | Sweepstakes casino, has sportsbook too |
| chm    | Chumba Casino    | ❌ | — | Casino only, no sports/prediction |
| pulsz  | Pulsz            | ❌ | — | Casino only |

### Additional DFS to add
- **DraftKings Pick6** — T3, sister product to DK Sportsbook
- **FanDuel Faceoff / Picks** — T3, sister product to FD
- **Thrive Fantasy** — T3
- **Chalkboard** — T3

---

## Coverage Summary

| Category | Total | Shipped | In progress | Not started | Skip |
|----------|-------|---------|-------------|-------------|------|
| Sportsbooks    | 46 | 3 (DK, FD, Fliff)          | 0        | 41 | 2 |
| Prediction     | 15 | 0                          | 6 (partial) | 7  | 2 |
| Fantasy/DFS    | 15 | 0                          | 0        | 13 | 2 |
| **Total**      | **76** | **3** | **6 (partial)** | **61** | **6** |

After Kalshi + Polymarket ship: **5 fully shipped**, **4 partial**, moving from ~4% to ~7% coverage — but covering the two **highest-volume non-sportsbook platforms** on the internet.

---

## Open questions for you

1. **OG.com** — is this [OG Casino/Sportsbook](https://og.bet/)? Confirm so I build the right integration.
2. **Pinnacle** — willing to pay for their official data feed (~$500/mo)? Would give us the sharpest line anchor for arbitrage.
3. **International books** (bet365, Paddy Power, etc.) — US-only beta first, or include from day 1? Affects proxy infra we need.
4. **Stake.us / offshore** — legal/compliance preference? Showing lines ≠ placing bets but worth confirming.
