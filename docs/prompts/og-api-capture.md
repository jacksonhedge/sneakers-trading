# OG Markets API capture

**Task:** Reverse-engineer og.com's JSON API so we can build a direct-HTTP scraper for their crypto + sports prediction markets.

**Why this is priority #1:**

- OG Markets is the **CFTC-regulated retail prediction product on the Crypto.com Derivatives (CDNA) stack.** CDNA is also the backend for Underdog Predict — so scraping OG directly covers Underdog Predict's prices *and* gives us a crypto-native independent book we don't yet have.
- The user is an **OG affiliate partner** (WINDAILY) and has a logged-in account — auth won't be a blocker.
- Crypto-native contracts (BTC/ETH price predictions) are OG's core product differentiation vs the other books we've scraped. None of our current 4 books have deep crypto-derivative coverage — adding OG fills a real gap.

---

## What I need you to do

### Part 1 — Locate the logged-in product

1. Navigate to `https://og.com/` — I'm logged in. If og.com is just marketing and the real app is elsewhere (e.g., `https://app.og.com/` or `https://trade.og.com/`), follow the "launch app" / "trade" CTA to wherever the real orderbook lives.
2. If you hit a geo-block (state-restricted CFTC products sometimes are), report the state + message and stop. Otherwise continue.
3. Navigate to a **crypto market first** (BTC or ETH price prediction). This is the highest-priority capture. Then a sports market (ideally an NBA game-winner) second so we can confirm OG ≡ CDNA pricing.

### Part 2 — Network capture

1. **Cmd+Option+I** → Network tab → **Fetch/XHR** filter → **🚫 Clear**.
2. **Cmd+R** to reload.
3. Wait 5 seconds. Find the requests returning JSON pricing data. Ignore:
   - analytics (Segment, Mixpanel, Datadog, Sentry, Amplitude, hotjar)
   - auth refresh calls
   - Crypto.com's **wallet / spot trading** APIs (those are for the separate crypto exchange, not predictions)
4. You're hunting for JSON responses with bid/ask / book / price / orderbook / event / market fields. Likely domains:
   - `api.og.com`
   - `api.ogmarkets.com`
   - `api.cdna.com` or `cdna.crypto.com` (since backend is CDNA)
   - Possibly `*.derivatives.crypto.com`
5. **For each market-data request (up to 6),** record full URL, method, request headers (especially `Authorization`, any `X-*`, cookie if present), response status, first ~2000 chars of body. Right-click → **Copy → Copy as cURL** gives everything.

### Part 3 — Verify OG ≡ CDNA hypothesis

Pick one specific market on OG (e.g., "Will BTC close above $X on date Y?") and note:
- **OG's YES price**
- **Market title exactly as displayed**
- **Any contract identifier / ticker visible** (e.g., if the URL has `/markets/BTC-2026-04-22-120000-YES` style)

If you can ALSO hit CDNA directly (Underdog Predict inside Underdog Fantasy is CDNA-powered — if you have that app accessible), diff the same market's price. Expectation: identical prices if both are direct surfaces on the same CDNA backend; different prices would mean OG and CDNA run parallel books.

If you can't verify, that's fine — just note it. I can revisit when we capture Underdog Predict.

### Part 4 — WebSocket

Click the **WS** filter. If live prices stream over WS, capture the `wss://` URL and the first few inbound messages. CFTC-regulated exchanges often have WebSocket feeds for orderbook updates — likely candidates:
- `wss://api.og.com/ws`
- `wss://stream.cdna.com/v1/orderbook`
- `wss://stream.crypto.com/exchange/v1/market`

### Part 5 — Markets catalog

If there's a **sports / crypto / "all markets"** listing endpoint that returns the full event catalog (multiple markets in one call), capture that — it's how we'd drive discovery. Usually a GET to `/events`, `/markets`, `/catalog`, `/products`.

Also note if there's a **categories** endpoint (crypto vs sports vs culture) — OG may partition its markets.

---

## Output format

Return in chat (not a file — I'll copy into the scraper session):

```markdown
## OG Markets API capture — 2026-04-22

### Summary
- Live URL for the trading app: <the real surface, not og.com marketing>
- API base domain: <e.g., api.og.com>
- Auth shape: <Bearer / Cookie / custom header + sample>
- WebSocket used: <yes/no + URL + what it carries>
- Backend tells: <evidence OG === CDNA — e.g., "requests also hit cdna.com", "tickers use CDNA convention", or "OG appears self-contained">
- Markets categorized by: <crypto / sports / other — and any routing>
- Number of endpoints identified: <N>

### Endpoint 1 — <name, e.g., "Markets catalog">

**URL:** `<full URL with all query params>`
**Method:** `GET` or POST
**Key headers:**
- `Authorization: Bearer <first 20 chars>...`

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

### Endpoint 2 — (repeat for each)

### WebSocket (if any)

**URL:** `wss://...`
**First messages:**
```json
{ ... }
```

### Wrapper verification

- OG's YES on "<market title>": <0.XX>
- CDNA/Underdog Predict same market: <0.XX or "didn't verify">
- Verdict: <same backend / different pricing / couldn't verify>

### Notes

- Anything unusual: rate limits, cursor pagination, auth-refresh flow, state/geo checks, odd encodings, dependencies between calls
```

---

## If the primary approach fails

Console interceptor (same pattern as prior captures):

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

After reload + 5s:

```js
copy(JSON.stringify(window.__cap.filter(r => /og\.com|cdna|crypto\.com|market|event|book|price|odds|btc|eth/i.test(r.url) && r.body && r.body.length > 200), null, 2))
```

---

## Do not

- Do not place a bet, deposit, withdraw, or click any "Trade" / "Confirm" button.
- Do not touch identity / KYC / settings pages.
- Do not share my session cookie with any non-og.com / non-crypto.com domain.
- If you hit a 2FA / re-verification prompt, stop and tell me.

## Done when

You've posted the structured report with at least one valid market-data endpoint (URL + method + headers + response sample) — **ideally the markets catalog or orderbook call** since that's the primary scrape target. The wrapper-verification answer (OG ≡ CDNA?) is secondary but valuable.
