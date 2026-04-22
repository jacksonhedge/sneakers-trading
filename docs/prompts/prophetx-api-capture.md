# ProphetX API capture

**Task:** Reverse-engineer the JSON API endpoints that power the ProphetX web app's market-data display, so we can build a direct-HTTP scraper.

**Why:** `api.prophetx.co` and other obvious subdomains don't resolve from outside the browser, and the HTML doesn't leak the API domain — the React app configures it at runtime. We need the real request details (URL, headers, response shape) by observing the browser in action.

---

## What I need you to do

1. **Navigate to this page (I'm already logged in):**
   `https://www.prophetx.co/ice-hockey/nhl-series-prices/pittsburgh-penguins-(series)-vs-philadelphia-flyers-(series)-1500006693?currency=cash`

2. **Open Chrome DevTools** with Cmd+Option+I (or F12). Click the **Network** tab. Click the **Fetch/XHR** filter button. Click the **🚫 Clear** button to empty the log.

3. **Reload the page** with Cmd+R and wait 5 seconds for all network activity to finish.

4. **Find the market-data requests.** In the Network list, ignore analytics beacons (Segment, Mixpanel, Datadog, Sentry, Amplitude, hotjar, fullstory, gtm/google). You're looking for requests that:
   - Return JSON (click a row to check the "Response" preview)
   - Have response bodies that contain pricing fields like `yes_bid`, `yes_ask`, `price`, `odds`, `book`, `markets`, or the market ID `1500006693`
   - Are hosted on a subdomain of `prophetx.co` or `dtn.com` or similar
   - Typically have names like `markets`, `events`, `book`, `series`, `quotes`, `lines`

5. **For each market-data request you identify (up to 5),** record in the output below:
   - **Full URL** (including all query parameters)
   - **Method** (GET / POST / etc.)
   - **Request headers** — especially `Authorization`, `Cookie`, any `X-*` custom headers, and `User-Agent`. You can right-click the request → **Copy → Copy as cURL** and paste the full cURL — that contains everything.
   - **Response status** and a **sample of the response body** (first ~2000 characters, pretty-printed if JSON)

6. **Also look for a "game" or "event" level call** — the page shows the full NHL series market; there's probably a single call that returns all the sub-markets on this page at once. That's the highest-value one.

7. **Note any WebSocket connections** — if the page uses WS for live price updates (check the WS filter in Network), capture the `wss://` URL and the first few messages.

---

## Output format

Return your findings in exactly this shape, in chat (not as a file — I'll copy it into my session):

```markdown
## ProphetX API capture — 2026-04-22

### Summary
- API base domain: <domain>
- Auth shape: <e.g., "Cookie: session=...; X-CSRF=..." or "Authorization: Bearer ...">
- WebSocket used: <yes/no + URL if yes>
- Number of market-data endpoints identified: <N>

### Endpoint 1 — <name/purpose, e.g., "Event markets bundle">

**URL:** `<full URL>`
**Method:** `GET`
**Key headers:** (auth-related only)
- `Cookie: <redact the value partially — first 20 chars is fine>`
- `Authorization: Bearer <truncate>`
- `X-App-Id: <value>`

**Full cURL:** (paste here, truncate long cookie values to first 30 chars + `...`)
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

### Notes
- Anything unusual: rate-limit headers, cache-control oddities, response-encoding flags, geo checks, sequence of calls (does endpoint A need a token from endpoint B?), etc.
```

---

## If the primary approach fails

If DevTools → Network isn't giving you clean access, **fallback: inject a network-interceptor into the page** instead:

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
    window.__cap.push({ type: 'fetch', url: typeof u === 'string' ? u : u.url, method: (o && o.method) || 'GET', status: r.status, headers: o && o.headers, body: t.slice(0, 3000) });
  } catch(e) {}
  return r;
};
const OX = window.XMLHttpRequest;
window.XMLHttpRequest = function() {
  const x = new OX();
  const oo = x.open, os = x.send;
  let m, u;
  x.open = function(a,b){ m=a; u=b; return oo.apply(this, arguments); };
  x.send = function(){
    x.addEventListener('load', () => window.__cap.push({ type:'xhr', url:u, method:m, status:x.status, body:(x.responseText||'').slice(0,3000) }));
    return os.apply(this, arguments);
  };
  return x;
};
console.log('Interceptors installed. Reloading in 2 seconds...');
setTimeout(() => location.reload(), 2000);
```

3. After the reload finishes (wait ~5 seconds), run this in the Console to see what was captured:

```js
copy(JSON.stringify(window.__cap.filter(r => /prophet|dtn|market|event|book|price|odds/i.test(r.url) && r.body && r.body.includes('{')), null, 2))
```

(That copies the filtered capture to the clipboard.) Paste the result into the output format above.

---

## Do not

- Do not attempt to place bets, deposit money, or interact with any real-money transactions.
- Do not click any "Withdraw" or "Deposit" buttons.
- Do not navigate to account-settings pages.
- Do not share my session cookie with any site other than `prophetx.co`.
- If you encounter a 2FA / re-authentication prompt, stop and tell me — don't try to solve it.

## Done when

You've posted the structured report above with at least **one** valid market-data endpoint's URL, method, headers, and response sample. Ideally the "event markets bundle" endpoint that returns the full market list for this series.
