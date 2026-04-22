# Coinbase Predict API capture

**Task:** Reverse-engineer the JSON API endpoints that power Coinbase Predict so we can build a direct-HTTP scraper.

**Why this matters — and what I already suspect:**
Coinbase Predict launched in late 2025 through a Kalshi partnership, so many (maybe all) of the sports/politics/culture contracts are actually Kalshi's contracts surfaced through Coinbase's UI. If that's the case, our existing Kalshi scraper already covers them. **Your job is twofold: capture the API shape AND tell me which of these is true:**

- **(A) Pure Kalshi wrapper:** every contract price on Coinbase == corresponding Kalshi price. Confirm by spot-checking one shared market (e.g., same "NBA Champion" YES price). If so, we skip writing a separate scraper.
- **(B) Has independent pricing:** Coinbase prices differ from Kalshi (markup, fee, separate liquidity, or truly native crypto-event contracts). If so, we need a scraper — and the arb opportunity is between Coinbase's price and Kalshi's price for the same underlying event.
- **(C) Mix:** some contracts Kalshi-sourced, some native to Coinbase (especially crypto price ladders — BTC above $X, ETH above $Y — which Coinbase has its own market data for). Worth capturing regardless.

---

## What I need you to do

### Part 1 — Locate and load the app

1. Navigate to **`https://www.coinbase.com/predictions`** (I'm logged in; if that's gone stale, try `https://www.coinbase.com/predictions/crypto` or `https://www.coinbase.com/predictions/sports`).
2. If Coinbase shows a "not available in your state" banner, note which state it says and stop — I'm in NY and NY sued Coinbase over this product on 2026-04-21, so Coinbase may have geo-blocked. Report that and we're done.
3. Otherwise, pick a **crypto-native market first** (e.g., "Will BTC close above $X on [date]?") AND a **sports market** (e.g., "Will the Lakers win the 2026 NBA Finals?"). We want to capture both, because the crypto ones might be Coinbase's own product while the sports ones come from Kalshi.

### Part 2 — Network capture

1. **Cmd+Option+I** → Network tab → **Fetch/XHR** filter → click **🚫 Clear**.
2. **Cmd+R** to reload.
3. Wait 5 seconds. Find the requests returning JSON pricing data. Ignore:
   - analytics (Segment, Mixpanel, Datadog, Sentry, Amplitude)
   - auth refresh calls
   - Coinbase's `/exchange/` or `/wallet/` APIs (those are for crypto trading, not predictions)
4. You're looking for requests on domains like:
   - `api.coinbase.com/cfm/*` (Coinbase Financial Markets — likely the prediction API)
   - `api.coinbase.com/predict/*`
   - `api.coinbase.com/derivatives/*`
   - `api.coinbase.com/api/v4/*` (older pattern)
5. **For each market-data request you identify (up to 6),** record full URL, method, key headers (auth, CSRF, custom X-* headers), response status, and first ~2000 chars of the response body. Right-click → **Copy → Copy as cURL** gives you everything; paste the full cURL.

### Part 3 — Verify wrapper vs independent

On the logged-in Coinbase page for one specific market (pick something easy like an NBA Finals contract), note:
- **The price Coinbase shows for YES.**
- **The market's title** exactly as displayed.

Then in a new tab, check whether Kalshi has the same contract:
- Go to **`https://kalshi.com`** → search for the same title (e.g., "2026 NBA Champion"), find the same team's YES price.

In your report, write: "Coinbase YES = 0.XX, Kalshi YES = 0.XX" so I can judge the wrapper hypothesis. If you can't get to Kalshi (not logged in, blocked, whatever), skip this part — just note you couldn't verify.

### Part 4 — WebSocket

Click the **WS** filter in Network. If Coinbase Predict uses a WebSocket for live pricing, capture the `wss://` URL and the first few JSON messages. Likely candidates:
- `wss://advanced-trade-ws.coinbase.com/`
- `wss://ws-feed.coinbase.com/`
- `wss://api.coinbase.com/ws/*`

If WS is only carrying user-account events (balance, orders) — not price ticks — note that.

---

## Output format

Return your findings in exactly this shape, in chat (not a file — I'll copy to my session):

```markdown
## Coinbase Predict API capture — 2026-04-22

### Summary
- State/geo status: <available / blocked / waitlist>
- API base domain: <e.g., api.coinbase.com/cfm>
- Auth shape: <Bearer / Cookie / custom header>
- WebSocket used: <yes/no + URL + what it carries>
- Wrapper vs independent: <A / B / C — and the evidence>
  - Coinbase YES on "<market title>": <0.XX>
  - Kalshi YES on same: <0.XX> (or "couldn't verify")
- Number of market-data endpoints identified: <N>

### Endpoint 1 — <name/purpose>

**URL:** `<full URL>`
**Method:** `GET` or POST
**Key headers:**
- `Authorization: Bearer <truncate>`
- `X-... : ...`

**Full cURL:** (truncate long tokens)
```bash
curl '...' \
  -H '...' \
  ...
```

**Response status:** 200
**Response sample:** (first ~2000 chars, pretty-printed)
```json
{ ... }
```

### Endpoint 2 — (repeat)

### WebSocket (if any)

**URL:** `wss://...`
**First inbound messages:**
```json
{ ... }
```

### Notes
- Anything unusual — rate limits, geo headers, auth-refresh flow, pagination, sub-resource dependencies
```

---

## If the primary approach fails

If DevTools Network tab isn't cooperating, **fallback: inject a network interceptor**. Go to Console tab and paste:

```js
window.__cap = [];
const of = window.fetch;
window.fetch = async function(u, o) {
  const r = await of.apply(this, arguments);
  try {
    const c = r.clone();
    const t = await c.text();
    window.__cap.push({ type: 'fetch', url: typeof u === 'string' ? u : u.url, method: (o && o.method) || 'GET', reqBody: o && o.body, status: r.status, body: t.slice(0, 3000) });
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
    x.addEventListener('load', () => window.__cap.push({ type:'xhr', url:u, method:m, reqBody:b, status:x.status, body:(x.responseText||'').slice(0,3000) }));
    return os.apply(this, arguments);
  };
  return x;
};
console.log('Interceptors installed. Reloading in 2 seconds...');
setTimeout(() => location.reload(), 2000);
```

After reload + 5s wait, copy relevant requests to clipboard:

```js
copy(JSON.stringify(window.__cap.filter(r => /coinbase|cfm|predict|event|market|price|kalshi/i.test(r.url) && r.body && r.body.length > 200), null, 2))
```

Paste the result into the output format above.

---

## Do not

- Do not attempt to place a bet, buy a contract, deposit, or withdraw.
- Do not touch any 2FA / identity / settings pages. If you hit one, stop and tell me.
- Do not share my Coinbase session cookie with any non-coinbase.com domain.
- Do not browse to Coinbase's non-prediction products (spot trading, staking, NFTs, Base) — stay on the Predict surface.

## Done when

You've posted the structured report with:
1. At least **one** valid Coinbase Predict endpoint (URL + method + headers + response sample), **OR**
2. Confirmation that Coinbase Predict is geo-blocked in this jurisdiction (plus any banner text) so I know to deprioritize.

**Ideally:** you give me the wrapper-vs-independent verdict from Part 3, since that directly decides whether we build a scraper or skip it.
