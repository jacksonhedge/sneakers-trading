# NoVig API capture

**Task:** Reverse-engineer the JSON API endpoints that power the NoVig web/mobile app's market-data display, so we can build a direct-HTTP scraper.

**Why:** NoVig is a P2P orderbook exchange — one of the few truly independent prediction-market books with zero vig pricing. No public API, but the logged-in web/mobile app is calling some JSON endpoint under the hood. We want the exact URL, headers, and response shape so we can poll it from a scraper.

---

## What I need you to do

1. **Navigate to the NoVig web app (you/I am already logged in):**
   `https://app.novig.us/`
   (If that redirects, try `https://novig.us/` or whatever the logged-in app surface is.)

2. **Make sure you're viewing CASH mode**, not Coins mode. There's usually a toggle top-right. **We only care about NoVig Cash for arb** — Coins is their sweeps/practice currency and has different (fake) pricing.

3. **Navigate to any NBA game page.** If NBA has no live games right now, pick NFL → MLB → NHL in that priority. Click into a single game so you see the moneyline, spread, total, and ideally player props for that game.

4. **Open Chrome DevTools** with Cmd+Option+I. Click **Network** tab. Click **Fetch/XHR** filter. Click **🚫 Clear** to empty.

5. **Reload the page** with Cmd+R and wait 5 seconds for all network activity to finish.

6. **Find the market-data requests.** Ignore analytics beacons (Segment, Mixpanel, Datadog, Sentry, Amplitude, hotjar, fullstory, gtm/google, meta/facebook). You're looking for requests that:
   - Return JSON (click a row → Response preview)
   - Contain pricing fields like `bid`, `ask`, `orderbook`, `book`, `price`, `odds`, or market IDs
   - Are hosted on a subdomain of `novig.us`, `novig.com`, `novigapp`, or similar
   - Typically have path names like `/markets`, `/events`, `/games`, `/orderbook`, `/book`, `/lines`, `/quotes`, `/graphql`, `/api/v*/…`

7. **For each market-data request you identify (up to 6),** record:
   - **Full URL** (including all query parameters)
   - **Method** (GET / POST — NoVig likely uses GET for reads, but if you see POST with a JSON body, capture the body too)
   - **Request headers** — especially `Authorization`, `Cookie`, any `X-*` custom headers, and `User-Agent`. Right-click the request → **Copy → Copy as cURL** — paste the full cURL, it contains everything.
   - **Response status** and **sample body** (first ~2000 chars, pretty-printed if JSON)

8. **Specifically hunt for these shapes** (one of them will be "the one"):
   - An **events/games list** — returns all active NBA games with IDs
   - A **per-game markets bundle** — returns all moneyline/spread/total/prop markets for one game in one call
   - A **per-market orderbook** — bid/ask depth for a specific market (most valuable; exchanges expose this)
   - Any **GraphQL POST** to `/graphql` — if NoVig uses GraphQL, the request body (JSON with `query` and `variables`) tells us everything

9. **Check for WebSocket connections** — click the **WS** filter in Network. If the page uses WS for live orderbook updates, capture:
   - The `wss://` URL
   - The first few inbound messages (click the WS connection → **Messages** tab → copy the first 3–5 JSON messages)

10. **Check for a "currency mode" flag** on requests. Some platforms use a header or query param (`X-Currency: cash`, `?currency=cash`, `mode=real`) to distinguish real-money pricing from sweeps. NoVig likely does — capture which header/param controls it so our scraper pins to Cash.

---

## Output format

Return your findings in exactly this shape, in chat (not as a file — I'll copy into my session):

```markdown
## NoVig API capture — 2026-04-22

### Summary
- API base domain: <e.g., api.novig.us>
- Auth shape: <e.g., "Authorization: Bearer ..." or "Cookie: novig_session=...">
- WebSocket used: <yes/no + URL if yes + what it carries — orderbook updates / user events / both>
- Currency mode flag: <how to pin to Cash>
- GraphQL or REST: <rest / graphql / both>
- Number of market-data endpoints identified: <N>

### Endpoint 1 — <name/purpose>

**URL:** `<full URL>`
**Method:** `GET` (or POST)

**GraphQL body:** (only if POST to /graphql; include the query and variables)

**Key headers:** (auth-related only)
- `Authorization: Bearer <first 20 chars>...`
- `X-App-Id: <value>`
- `X-Currency: cash` (or whatever)

**Full cURL:** (truncate long tokens to first 30 chars + `...`)
```bash
curl '...' \
  -H '...' \
  ...
```

**Response status:** 200
**Response sample:** (first ~2000 chars, formatted)
```json
{
  ...
}
```

### Endpoint 2 — ...

(repeat)

### WebSocket (if any)

**URL:** `wss://...`
**First inbound messages:**
```json
{ ... }
{ ... }
```

### Notes
- Anything unusual: auth-refresh flow, cursor pagination, rate limits, subscription model, geo check, token in URL query vs header
```

---

## If the primary approach fails

If the Network tab isn't cooperating (panel layout issues, filters not working), **fallback: inject an interceptor**:

1. In DevTools, click the **Console** tab.
2. Paste this snippet and press Enter:

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

3. After the reload finishes (wait ~5 seconds), copy captured market-data requests to clipboard:

```js
copy(JSON.stringify(window.__cap.filter(r => /novig|market|event|book|price|odds|game|graphql/i.test(r.url) && r.body && r.body.length > 200), null, 2))
```

4. Paste result into the output format above.

---

## Do not

- Do not attempt to place bets, deposit money, or interact with any real-money transactions.
- Do not click Withdraw / Deposit / Buy / Sell buttons.
- Do not navigate to account-settings / KYC / identity pages.
- Do not share my session cookie or auth token with any site other than `novig.us`.
- If you hit a 2FA / re-authentication / identity prompt, stop and tell me.

## Done when

You've posted the structured report with at least **one** valid market-data endpoint's URL, method, headers, and response sample — ideally the **per-game markets bundle** or **orderbook** call. If it's GraphQL, include the query string and variables from the POST body; that's what we need to replay it.
