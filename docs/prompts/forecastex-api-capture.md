# ForecastEx (IBKR) API capture

**Task:** Reverse-engineer the JSON API endpoints that power ForecastEx's market listing and per-contract orderbook display, so we can build a direct-HTTP scraper.

**Why:** ForecastEx is Interactive Brokers' CFTC-regulated event contract exchange. It's **genuinely independent** — NOT a Kalshi or CDNA wrapper. That means its prices diverge from Kalshi/Polymarket on the same outcomes, which creates real cross-book arb opportunities. Not covered by The Odds API (event contracts category). User flagged this as the next-priority direct-scrape target 2026-04-22.

**Scope for this capture:** Binary YES/NO event contracts on upcoming / currently-open markets across whichever categories ForecastEx runs (typically economic indicators, politics, Fed rates, geopolitical events, sports if they've launched it). **No need** to capture deposit/withdrawal/KYC endpoints — just the market-data surface.

**⚠️ Important context:** ForecastEx is operated by Interactive Brokers, a regulated broker-dealer. IBKR's web infrastructure is known for:
- Aggressive session timeout behavior
- 2FA / re-authentication prompts on suspicious activity
- Session cookies tied to IBKR account-level auth (not just the ForecastEx subdomain)

If you hit a 2FA / re-auth prompt or a "session expired" wall at ANY point, **stop and tell me.** We'll figure out the auth bootstrap separately — don't try to power through.

---

## What I need you to do

1. **Navigate to ForecastEx:** `https://forecasttrader.interactivebrokers.com/en/home.php`

   If redirected to an IBKR login page first, log in using your existing IBKR account. Complete any 2FA prompts normally.

2. **Confirm you're on the logged-in trading surface.** You should see a list of markets/events with prices (typically "YES at X¢ / NO at Y¢" or "X%" probability display). If you see only marketing content, click "Trade" or "Markets" or similar to reach the actual data view.

3. **Open Chrome DevTools** with Cmd+Option+I. Click **Network** tab. Click **Fetch/XHR** filter. Click **🚫 Clear** to empty.

4. **Reload the page** with Cmd+R and wait ~8 seconds for all network activity to settle. IBKR loads heavily — wait for the throbber to fully stop.

5. **Click into one specific event / market** (whatever catches your eye — economic indicator, Fed decision, geopolitical contract, anything with actual prices). Let the detail page load fully. This gives us both the market-list and per-market endpoints in one capture.

6. **Find the market-data requests.** Aggressively ignore:
   - `newrelic`, `segment`, `datadog`, `google-analytics`, `adobedtm`, `tealium`, `pendo` (analytics)
   - `.js`, `.css`, `.woff`, `.png`, `.svg`, `.ico` (static assets)
   - anything on `insight.adsrvr.org`, `doubleclick`, `googletagmanager`

   You're looking for requests that:
   - Return JSON (click a row → Response preview → should show `{...}` or `[...]`)
   - Contain pricing fields: `yes`, `no`, `bid`, `ask`, `price`, `probability`, `lastPrice`, `midpoint`
   - Are hosted on an IBKR or ForecastEx domain — likely one of:
     - `forecasttrader.interactivebrokers.com/api/...`
     - `forecastex.interactivebrokers.com/...`
     - `api.interactivebrokers.com/...`
     - `iserver.interactivebrokers.com/...` (IBKR's main trading API — ForecastEx might reuse it)

7. **For each market-data request you identify (aim for 2–4),** record:
   - **Full URL** including all query params
   - **Method** (GET most likely, POST if GraphQL)
   - **Full cURL** — right-click the request → **Copy → Copy as cURL (bash)**
   - **Response status** and **sample body** (first ~3000 chars, pretty-printed)

8. **We specifically need at minimum two shapes:**

   **Shape A — market listing** (fired when you're on the main markets view). Array of all open event contracts with their current prices. Fields to look for: event name, contract ID, yes/no best bid/ask, volume, expiration/resolution date.

   **Shape B — per-contract orderbook / detail** (fired when you click into one market). Full bid/ask ladder, volume history, any metadata about resolution rules. More valuable than Shape A because it exposes depth, but Shape A is what the scraper loops to find all contracts.

9. **Capture one full example response for each shape.** I need to see:
   - Exact field name for YES price (`yesPrice`? `yesAsk`? `lastPriceYes`?)
   - Exact field name for NO price (symmetric — or inferred as `1 - yesAsk`?)
   - How **contract/market IDs** are encoded (numeric? UUID? conidEx from IBKR?)
   - How **resolution / expiration** is represented (ISO timestamp? Unix millis?)
   - How **event metadata** (category, description, resolution criteria) is attached
   - Whether prices are quoted in **cents (0–100)**, **dollars (0.00–1.00)**, or **percent**

10. **Check for WebSocket connections** — click the **WS** filter. IBKR heavily uses WebSockets for live prices on their main trading platform; ForecastEx probably inherits this. If there's a WS:
    - Record the `wss://` URL
    - Copy the first 3–5 inbound messages (click the WS → **Messages** tab)
    - Note any subscription protocol (e.g., `{"msg":"subscribe","topic":"market.123"}`)

11. **Check for CSRF / auth tokens in request headers** — IBKR often uses:
    - `x-tws-token`
    - `x-iserver-session-token`
    - `x-csrf-token`
    - `authorization: Session <token>`

    Note which header(s) the market-data requests carry. These are what the scraper will need to replay (we'll bootstrap them from a user-supplied login session).

12. **Category/taxonomy endpoint** — somewhere on page load there's probably a call that returns the category tree ("Economics", "Politics", "Financials", etc.) or the list of event types. Capture that too if you see it — helps the scraper iterate categories.

---

## Output format

Return your findings in exactly this shape, in chat (not as a file — I'll copy into my session):

```markdown
## ForecastEx (IBKR) API capture — 2026-04-XX

### Summary
- Final app URL: <e.g., https://forecasttrader.interactivebrokers.com/...>
- API host(s) identified: <e.g., forecasttrader.interactivebrokers.com/api>
- Auth mechanism: <session cookie / bearer token / x-tws-token / other>
- Auth header(s) needed: <list header names>
- WebSocket used: <yes/no + URL + purpose>
- Price format: <cents 0–100 / dollars 0.00–1.00 / percent>
- YES price field name: <e.g., yesAsk>
- NO price field name: <or: derived from 1-yesAsk>
- Number of market-data endpoints identified: <N>
- Categories accessible in capture: <economics / politics / financials / sports / other>

### Endpoint 1 — <purpose, e.g., "All open markets list">

**URL:** `<full URL with all params>`
**Method:** `GET`

**Key headers:** (auth-related only — truncate values)
- `Cookie: IBKR-session=<first 30 chars>...`
- `X-TWS-Token: <first 20>...`
- `Authorization: <if present>`

**Full cURL:** (truncate long tokens to first 30 chars + `...`)
```bash
curl '...' \
  -H '...' \
  ...
```

**Response status:** 200
**Response sample:** (first ~3000 chars, formatted JSON)
```json
{ ... }
```

**What this gives us:** <one sentence — e.g., "all open binary contracts with current yes/no prices and expiration dates">

### Endpoint 2 — <e.g., "Per-contract orderbook">

(repeat)

### WebSocket (if any)

**URL:** `wss://...`
**Subscription protocol:** <message format to subscribe to a market's price updates>
**First inbound messages:**
```json
{ ... }
{ ... }
```

### Notes
- Session timeout behavior observed (did you get logged out mid-capture?)
- Any geo / country restrictions surfaced
- Any rate-limit responses (`429`, `Retry-After` headers)
- Anything that surprised you — undocumented fields, weird encodings, token rotation
```

---

## If the primary approach fails

If the Network tab is overwhelmed by IBKR's chat widget / tracking noise, **fallback: interceptor in Console**:

1. In DevTools click the **Console** tab.
2. Paste and press Enter:

```js
window.__cap = [];
const of = window.fetch;
window.fetch = async function(u, o) {
  const r = await of.apply(this, arguments);
  try {
    const c = r.clone();
    const t = await c.text();
    const url = typeof u === 'string' ? u : u.url;
    if (/interactivebrokers|forecast|forecastex/i.test(url) && t.length > 300) {
      window.__cap.push({ url, method: (o && o.method) || 'GET', status: r.status, body: t.slice(0, 5000) });
    }
  } catch(e) {}
  return r;
};
const OX = window.XMLHttpRequest;
window.XMLHttpRequest = function() {
  const x = new OX();
  const oo = x.open, os = x.send;
  let m, u, b;
  x.open = function(a,v){ m=a; u=v; return oo.apply(this, arguments); };
  x.send = function(body){ b = body;
    x.addEventListener('load', () => {
      if (/interactivebrokers|forecast|forecastex/i.test(u) && (x.responseText||'').length > 300) {
        window.__cap.push({ type:'xhr', url:u, method:m, reqBody:b, status:x.status, body:(x.responseText||'').slice(0,5000) });
      }
    });
    return os.apply(this, arguments);
  };
  return x;
};
console.log('Installed. Reloading in 2s...');
setTimeout(() => location.reload(), 2000);
```

3. After the reload finishes, click into one market, wait 5 seconds, then dump:

```js
copy(JSON.stringify(window.__cap, null, 2))
```

4. Paste clipboard contents into the output format above.

---

## Do not

- Do not attempt to place an order, add funds, withdraw, or interact with any real-money action.
- Do not click Place Order / Buy / Sell / Deposit / Withdraw buttons.
- Do not navigate to account-settings / identity / W-9 / tax docs pages.
- Do not share the IBKR session token / cookie with any site other than `interactivebrokers.com`.
- Do not bypass or ignore any IBKR security prompt (2FA, device verification, ToS re-accept). Stop and tell me if you hit one.
- If the session times out mid-capture, **stop** — tell me and I'll adjust. Do not re-authenticate and retry until we're sure the capture flow won't trigger the same timeout.

## Done when

You've posted the structured report with at least:
- **Shape A** (market list) — URL, method, full cURL, response sample with at least 3 contracts visible
- The exact YES-price and NO-price field names
- The auth header(s) needed
- A note on whether WebSockets are used (and their URL if yes)

Shape A is the critical one — the scraper loops it. Shape B (per-contract detail) is a nice-to-have; it unlocks orderbook depth in the dashboard but isn't required for the arb scanner's v1 (which only needs best bid/ask at the top of book).

---

## Post-capture: scraper plan

Once you've sent the capture back, the scraper will live at `apps/trader/src/scrapers/forecastex/scrape.ts` mirroring the NoVig / ProphetX pattern:
- Auth via `FORECASTEX_BEARER_TOKEN` (or whatever header emerges) in `apps/trader/.env`
- `pnpm token:set -- forecastex "..."` to rotate
- One `MarketSnapshot` per binary contract (YES outcome = best_ask in 0–1 probability space, NO outcome = `1 - yes_ask`)
- Writes to `apps/trader/data/forecastex/<date>.jsonl`
- `platform: "forecastex"` so the cross-book matcher picks it up as an independent 6th book (after Polymarket, Kalshi, ProphetX, NoVig, OG)

Est. build time after capture: ~45 minutes, assuming the shape is clean. IBKR auth complexity could push it to 90 min if the token bootstrap needs custom handling.
