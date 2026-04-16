# Sneakers Roadmap

Last updated: 2026-04-16

Goal: Ship a Bloomberg-caliber web terminal for sports betting odds + prediction markets to **20 serious beta bettors**, backed by the existing Sneakers trading bot (hunter, logger, momentum, calibration, executors).

---

## Status

**Backend (`src/`) — shipped**
- Opportunity hunter (97%+ probability LOCK/HAMMER/GOOD tiers)
- Market data logger → SQLite snapshots (`src/db.ts`, `src/db/schema.sql`)
- Outcome analyzer, momentum analyzer, calibration analyzer, correlation analyzer
- Platform scanners: Limitless, Crypto.com, Coinbase Predict
- Executors: Limitless (automated), Crypto.com (manual)
- Dashboard server: Express + WebSocket on :3333 with `/api/markets` and broadcast feed
- Arbitrage finder + bot

**Web terminal (`web/`) — Phase 1 scaffolded**
- Next.js 14 App Router + Tailwind, Robinhood Legend 3-column layout
- Top chrome: tabs, "All Platforms" mega-menu (16 sportsbooks / 10 prediction markets / 6 fantasy), live engine dot, overnight toggle
- Left: bankroll, connected books, tracking watchlist (click-to-load)
- Center: lightweight-charts candlestick chart with volume + last-price pill, OHLCV, BUY YES/NO, cross-platform comparison
- Right: tabbed Order Book / Trades / Positions
- Currently powered by deterministic mock data in `web/lib/mockData.ts`
- `npm run web:dev` at repo root boots it on :3030

---

## Phase 2 — Backend → UI data pipe (1–2 weeks)

**Outcome:** terminal replaces all mock data with live feeds from the existing bot.

- [ ] Add CORS + auth middleware to `src/dashboard-server.ts` (env-gated API key for the web app)
- [ ] Formalize REST contract in `src/api/` — stable response shapes for:
  - `GET /api/markets?platform=*` (list, filterable)
  - `GET /api/markets/:id` (single market + OHLCV)
  - `GET /api/markets/:id/candles?tf=1m|5m|15m|1h&from=&to=` (from SQLite snapshots)
  - `GET /api/markets/:id/orderbook` (where available)
  - `GET /api/opportunities` (hunter output, LOCK/HAMMER/GOOD)
  - `GET /api/bankroll` + `GET /api/positions`
- [ ] WebSocket channels: `market:{id}`, `opportunities`, `bankroll`
- [ ] Write `web/lib/api.ts` — typed fetchers + SWR/react-query cache layer
- [ ] Write `web/lib/ws.ts` — single WS connection, fan out to hooks
- [ ] Replace `mockData.ts` consumers one panel at a time (left → center → right)

**Risk:** existing dashboard-server was written to serve its own static UI. Avoid breaking it while we extend. Gate behind a feature flag or version-prefix the new routes (`/api/v2/*`).

## Phase 3 — Real chart data + watchlist persistence (3–5 days)

- [ ] Backfill candles from `market_snapshots` table (aggregate minute-level snapshots into OHLCV per timeframe)
- [ ] `web/components/PriceChart.tsx` subscribes to `market:{id}` WS and appends candles live
- [ ] Add `watchlists` table (user_id, market_id, added_at) + CRUD endpoints
- [ ] Persist user watchlist across reloads

## Phase 4 — Cross-platform arbitrage integration (1 week)

- [ ] Stream `src/arbitrage-finder.ts` output into `/api/opportunities?kind=arb`
- [ ] Swap the mock arb feed / cross-platform comparison strip in `CenterPanel` for live data
- [ ] Add an "Arbitrage" tab view (full-page list, sortable by edge bps, window, platforms)
- [ ] One-click "Hedge both sides" flow → opens order entry pre-filled for each leg

## Phase 5 — Order execution (1–2 weeks)

- [ ] Wire BUY YES / BUY NO buttons to `limitless-executor.ts` for Limitless markets
- [ ] Manual-confirm flow for Crypto.com (links to their UI with pre-filled payload)
- [ ] Add order confirmation modal — size, price, max slippage, estimated payout
- [ ] Persist orders in new `orders` table; render in right panel "Orders" tab (new)
- [ ] Position P&L computed from fill price + current mark

## Phase 6 — Connected platforms + bankroll truth (1 week)

- [ ] OAuth / API-key onboarding flow for: Kalshi, Polymarket, Crypto.com, Robinhood Predictions
- [ ] Per-book balance polling → `CONNECTED_BOOKS` becomes live
- [ ] Deposit/Withdraw buttons → platform-specific deep links for now (no money movement in v1)
- [ ] Global bankroll = sum of connected balances + open position mark-to-market

## Phase 7 — Sportsbook odds integration (2 weeks)

Prediction markets are the anchor. Sportsbooks come next.

- [ ] Odds aggregation service in `src/sports/` (The Odds API or similar to start)
- [ ] "Sports Betting" tab becomes functional — same 3-column layout, swap candles for live odds ladders
- [ ] Arb detection across sportsbook ↔ prediction market (e.g. KC -3.5 on DK vs Kalshi "Chiefs win" contract)

## Phase 8 — Auth, deploy, beta (1 week)

- [ ] Supabase auth (magic link) — single `users` table, email-gated access
- [ ] Deploy web to Vercel, API to Railway/Fly (keep SQLite on volume mount until we outgrow it)
- [ ] `@sneakers.trade` email for invite codes
- [ ] Onboard 20 beta testers in two waves of 10; collect feedback in Linear

## Phase 9 — Hardening + v1 polish

- [ ] Mobile layout (responsive, not mobile-first — terminal is desktop-primary)
- [ ] Keyboard shortcuts (`/` to search markets, `b`/`s` to buy/sell, `1`-`4` to switch tabs)
- [ ] Alert rules (notify when any watchlist market crosses a threshold)
- [ ] Performance budget: p50 market update latency < 200ms from source to UI

---

## Dependencies & decisions to lock in before Phase 2

1. **Auth model** — Supabase vs custom? (Supabase, consistent with other Hedge projects.)
2. **WebSocket protocol** — stick with `ws` server, or move to Server-Sent Events for one-way streams? (SSE simpler for market data; WS only where we need client → server.)
3. **Candle storage** — raw snapshots in SQLite + aggregate on read, or precomputed 1m candles? (Start with on-read aggregation, precompute only if p99 > 300ms.)
4. **Deploy target** — Vercel web + Railway API + hosted SQLite backup to S3? Or move SQLite → Postgres before beta? (SQLite is fine for 20 testers.)

---

## Quick reference — what the web terminal currently expects

When Phase 2 lands, swap these mock exports in `web/lib/mockData.ts` for live endpoints:

| Mock export          | Live source                         |
|----------------------|-------------------------------------|
| `SELECTED_MARKET`    | `GET /api/markets/:id`              |
| `buildCandles()`     | `GET /api/markets/:id/candles`      |
| `CROSS_PLATFORM_PRICES` | `GET /api/markets/:id/cross`     |
| `ORDER_BOOK`         | `GET /api/markets/:id/orderbook` + WS |
| `RECENT_TRADES`      | `GET /api/markets/:id/trades` + WS  |
| `OPEN_POSITIONS`     | `GET /api/positions`                |
| `BANKROLL`           | `GET /api/bankroll`                 |
| `CONNECTED_BOOKS`    | `GET /api/connections`              |
| `WATCHLIST`          | `GET /api/watchlist`                |
| `LIVE_STATS`         | WS `stats` channel                  |

Keep `platforms.ts` static — it's the platform catalog, not live data.
