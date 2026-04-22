# Platform Endpoints — cURL Capture Checklist

One-time-per-platform reverse-engineering work. Run through this list on a machine where you're logged into each platform, capture the JSON-returning XHR requests from Chrome DevTools → Network → Fetch/XHR, and paste the cURL into this doc (or directly into a PR).

The goal is to turn each platform into a direct-HTTP recipe at `apps/trader/src/scrapers/<platform>/scrape.ts` that emits `MarketSnapshot[]` to `apps/trader/data/<platform>/<date>.jsonl`.

## DevTools capture recipe

1. Open **Chrome → DevTools → Network tab → filter: Fetch/XHR**. Clear the log.
2. Load the platform's **NBA markets page** (or whichever sport is most active now — during playoffs: NBA; regular season: mix).
3. Watch which requests return JSON. Ignore:
   - analytics beacons (Segment, Mixpanel, Datadog)
   - auth refresh calls
   - static catalog calls that don't contain live prices
4. The juicy request usually has names like `/events`, `/markets`, `/book`, `/quotes`, `/prices`, `/odds`, `/lines`, `/contracts`.
5. **Right-click → Copy → Copy as cURL.** Paste into the capture block below for that platform.
6. Also open **one specific market** and capture the per-market detail request (orderbook / bid-ask depth).

### What to note beyond the cURL

- **Auth shape:** Bearer token in header? Session cookie? CSRF header? Custom app-key header?
- **Geo-gate:** Does the endpoint check your state via a `X-Location` header or require a geo-verification cookie? Relevant because some products are state-restricted.
- **Freshness:** Is it a plain REST fetch on an interval, or is there a WebSocket stream driving live updates? If WS, note the URL (`wss://…`).
- **Fee/rate flags:** Some APIs respond differently for authenticated vs unauthenticated sessions (e.g., show extra precision for logged-in users).

---

## Tier-1 priority (biggest pricing diversity vs what we already have)

### ProphetX — exchange, game-level & player-prop with L3 orderbook

- **URL to load:** `https://app.prophetx.co/` → log in → navigate to tonight's NBA game (e.g., Orlando at Detroit — ORL/DET spread)
- **Expected endpoint shape:** `/v2/mm/*` (market-maker namespace). Look for one call that returns all 164 markets on the game page in a single response. Individual orderbook calls per market ticker.
- **Auth:** session cookie (Prophet Cash token). Capture the headers alongside the cURL.
- **Also try first:** email partnerships@prophetx.co / whoever's on the Swagger footer at `partner-docs.prophetx.co` asking for a market-data API key. Could be same-day.
- **Why priority:** rich L3 orderbook depth visible in UI (confirmed in the 2026-04-21 screenshots), much richer than Polymarket.
- **Captured cURL:** _(paste here)_

### DK Sportsbook — moneyline/spread/total on NBA games

- **URL to load:** `https://sportsbook.draftkings.com/leagues/basketball/nba` → click into a game
- **Expected endpoint shape:** `sportsbook-nash.draftkings.com/api/sportscontent/dkusnh/v1/leagues/42648/events` or an `eventgroups/v5` URL. Will return a list of events each containing offer markets with American-odds lines.
- **Auth:** Akamai bot-mitigation cookies — your logged-in browser holds them, direct `curl` gets 403. That's why we need the cURL capture.
- **Why priority:** widest overround baseline (~104.76% on moneylines) — DK vs Polymarket is where the fattest arbs live.
- **Remember:** odds are American format. Use the shared `americanToImpliedProb()` helper when building the scraper.
- **Captured cURL:** _(paste here)_

### FanDuel Sportsbook — moneyline/spread/total on NBA games

- **URL to load:** `https://sportsbook.fanduel.com/navigation/nba` → click into a game
- **Expected endpoint shape:** often at `sbapi.nj.sportsbook.fanduel.com/api/event-page?eventId=…` (state subdomain varies).
- **Auth:** similar bot-mitigation posture to DK; rely on browser cookies.
- **Why priority:** second independent sportsbook for arb validation. Different MLB/NFL lines than DK give different arb windows.
- **Captured cURL:** _(paste here)_

### NoVig — P2P orderbook exchange, NFL/NBA

- **URL to load:** `https://app.novig.us/` (web app) or capture from the mobile app using mitmproxy. Navigate to an NBA moneyline.
- **Expected endpoint shape:** internal GraphQL or REST at `api.novig.us/*` — probably returns an orderbook object per market with `bids[]` and `asks[]`.
- **Auth:** Bearer token after login, likely a dual token for `NoVigCoins` vs `NoVigCash` modes. Scrape the **Cash** side for arb (Coins are practice currency).
- **Why priority:** truly independent book with zero-vig orderbook — the tightest cross-book reference point we can get.
- **Captured cURL:** _(paste here)_

### DraftKings Predictions — own CFTC-licensed binary markets

- **URL to load:** DK Predictions lives **inside the DK mobile app** and as a web surface at `predictionmarkets.draftkings.com` (confirm). Distinct product from DK Sportsbook — different API surface.
- **Expected endpoint shape:** separate from sportsbook, likely `api.predictionmarkets.draftkings.com/v1/events` or similar.
- **Auth:** DK session cookie; may require age/geo-verified account.
- **Why priority:** DK chose to build its own license rather than wrap Kalshi — so this is an independent price feed, not duplicated by our Kalshi scraper.
- **Captured cURL:** _(paste here)_

### FanDuel Predicts — own CFTC license (confirm)

- **URL to load:** `https://predicts.fanduel.com/` (landing page confirmed live). Navigate from there to a sport.
- **Expected endpoint shape:** unknown — capture from Network tab.
- **Open question:** does FanDuel Predicts run its own CFTC-registered exchange or white-label Kalshi/CDNA? If it's a Kalshi wrapper, **skip** (our Kalshi scraper covers it).
- **Captured cURL:** _(paste here)_

### PrizePicks Prediction Markets — own CFTC license

- **URL to load:** PrizePicks mobile app (Team Picks / Culture Picks tabs). Web may not expose full PM surface.
- **Expected endpoint shape:** private mobile API, probably at `api.prizepicks.com/v2/predictions/*` — capture with mitmproxy against the mobile app.
- **Auth:** JWT from login flow.
- **Why priority:** own CFTC license, independent price feed. Also covers Team Picks (team outcomes) and Culture Picks (entertainment).
- **Captured cURL:** _(paste here)_

### CDNA (Crypto.com Derivatives North America) — covers Underdog Predict

- **URL to load:** Underdog web/mobile app → Predict tab. Or direct at CDNA's exchange UI.
- **Expected endpoint shape:** exchange REST at `api.cdna.com/*` or `api.crypto.com/derivatives/*`. Look for `/events`, `/markets`, `/orderbook`.
- **Why priority:** covers Underdog Predict and the standalone OG Markets product. Independent book worth scraping directly.
- **Captured cURL:** _(paste here)_

---

## Tier-2 (nice to have — likely Kalshi wrappers, skip if confirmed)

### Robinhood event contracts — CONFIRMED Kalshi wrapper

- **Status:** Robinhood's event contracts are Kalshi contracts — our Kalshi scraper covers the underlying pricing.
- **Action:** capture a cURL only if you want to detect Robinhood-side markup/fee drift from Kalshi prices. Not a priority.

### Sleeper Markets — CONFIRMED Kalshi wrapper

- **Status:** same. Kalshi scraper covers it.

### Coinbase Predict — CONFIRMED Kalshi wrapper

- **Status:** same. Kalshi scraper covers it.
- **Source:** Coinbase launched Predict in late 2025 via a Kalshi partnership (search result 2026-04-22).

---

## Platforms flagged for future / unclear

### Fanatics Predicts

- DNS probe found no obvious `predicts.fanatics.com` or `predict.fanatics.com` subdomain as of 2026-04-22. Might be embedded only in the Fanatics Sportsbook app.
- Check the Fanatics Sportsbook iOS app for a Predicts tab before investing scraper time.

### Coinbase Derivatives (direct, not Coinbase Predict)

- Separate product from Coinbase Predict. Targets institutional futures/options, not retail event contracts. Not relevant for sports arb.

---

## Shape every scraper must emit

All new scrapers write to `apps/trader/data/<platform>/<date>.jsonl`, one `MarketSnapshot` (from `apps/trader/src/scrapers/types.ts`) per line:

```ts
{
  platform: string;
  platform_market_id: string;
  question: string;
  tags: string[];
  sport?: string;
  outcomes: { name, best_bid, best_ask, last_price }[];
  overround: number | null;  // use computeOverround([yesAsk, noAsk]) or across outcomes
  volume_traded: number | null;
  liquidity: number | null;
  starts_at?: string;
  locks_at?: string;
  resolves_at?: string;
  phase: 'opening' | 'pre_game' | 'live' | 'closed';
  ts: string;  // scrape timestamp
}
```

American-odds converters (for sportsbook scrapers) live at `apps/trader/src/scrapers/utils/american-odds.ts` (TODO: create).

## Execution order when cURLs land

1. ProphetX — highest information density (L3 orderbook, rich markets)
2. DK Sportsbook — biggest cross-book arb vs Polymarket
3. FanDuel Sportsbook — validation against DK
4. NoVig — third independent exchange for triangulation
5. DK Predictions + PrizePicks PM + CDNA — fill out the prediction-market coverage
6. FanDuel Predicts — only if confirmed non-wrapper
