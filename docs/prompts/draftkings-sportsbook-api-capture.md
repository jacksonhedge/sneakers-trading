# DraftKings Sportsbook API capture

**Task:** Reverse-engineer the JSON API endpoints that power the DraftKings **Sportsbook** (real-money, state-regulated) web app's odds display, so we can build a direct-HTTP scraper.

**Why:** DraftKings Sportsbook is the widest-vig tier-1 book on our target list — biggest expected arbs vs NoVig + ProphetX. Unlike NoVig/ProphetX, DK's odds endpoints are generally fetchable without a bearer token from within a licensed state (geo-gated, not auth-gated). We want the exact URL shapes, state-routing mechanism, and response structure so the scraper can run anonymously from Albus (which is in a licensed state) without a user login.

**Scope for this capture:** Team-and-game markets only — **moneyline, spread (point-spread), total (over/under)** on upcoming NBA games. Player props, same-game parlays, futures, and live-in-game are **out of scope** for v1. Do not spend capture budget on them.

**⚠️ Not to be confused with:** DraftKings **Predictions** (`predictions.draftkings.com`, CFTC event contracts). That's a separate product, different API, different capture. This prompt is the real-money sportsbook only — the one that quotes American odds like `-110 / +240`.

---

## What I need you to do

1. **Navigate to DraftKings Sportsbook (logged in):**
   `https://sportsbook.draftkings.com/`
   You should land on the state-specific app surface (URL may redirect to `sportsbook-us-XX.draftkings.com` or show a state selector). **Note the final URL + state code** — this is critical, DK's APIs vary by state.

2. **Confirm you're in a licensed state.** If you hit a "Not available in your state" wall, stop and tell me — we need to either use a VPN to a licensed state (NJ, PA, MI, NY, etc.) or capture from a different machine. Don't try to bypass geo checks yourself.

3. **Navigate to NBA → upcoming games list.** Typical path: top nav → NBA (or NCAAB if NBA is out of season — then NFL → MLB → NHL in that priority). Stop on the **league landing page** — the one showing a scrolling list of upcoming games with moneyline + spread + total shown on each card. Do not click into a single game yet.

4. **Open Chrome DevTools** with Cmd+Option+I. Click **Network** tab. Click **Fetch/XHR** filter. Click **🚫 Clear** to empty.

5. **Reload the page** with Cmd+R and wait ~8 seconds for all network activity to settle. DK loads heavily — wait for the network throbber to fully stop.

6. **Now click into one specific NBA game** (any single game). Let the game page load fully. This gives us both the league-list and per-game endpoints in the same capture.

7. **Find the odds-data requests.** Aggressively ignore these (DK loads dozens of them): `segment.io`, `mparticle`, `datadog`, `sentry`, `amplitude`, `fullstory`, `hotjar`, `google-analytics`, `googletagmanager`, `gtm.js`, `doubleclick`, `optimizely`, `braze`, `adobedtm`, `launchdarkly`, `recaptcha`, `stripe`, CSS, fonts, images, bundle JS chunks (`.js`, `.css`, `.woff`). You're looking for requests that:
   - Return JSON (click a row → Response preview)
   - Contain odds-shaped fields: `displayOdds`, `americanOdds`, `decimalOdds`, `fractionalOdds`, `odds`, `priceUp`, `line`, `handicap`, `points`, `selections`, `outcomes`, `offers`, `markets`, `eventGroups`, `competitions`, `events`
   - Are hosted on a DK subdomain — likely one of:
     - `sportsbook.draftkings.com/sites/US-*-SB/api/...`
     - `sportsbook-nash.draftkings.com/...`
     - `sportsbook-nash-usnj.draftkings.com/...` (state suffix varies)
     - `sbapi.draftkings.com/...`
     - `api.draftkings.com/...`
   - Typical path fragments: `/leagues/`, `/categories/`, `/subcategories/`, `/eventgroups/`, `/events/`, `/offers/`, `/markets/`, `/v5/`, `/v4/`, `/sportscontent/`

8. **For each odds-data request you identify (aim for 2–4, don't hoard),** record:
   - **Full URL** (including all query parameters — DK's path segments carry state + sport IDs, parameters carry feature flags)
   - **Method** (GET almost certainly)
   - **Request headers** — right-click the request → **Copy → Copy as cURL (bash)** — paste the full cURL. Pay special attention to any `X-*` custom headers, `User-Agent`, `Accept-Language`, and the `Cookie` header (which carries the geo/session affinity).
   - **Response status** and **sample body** (first ~3000 chars, pretty-printed if JSON)

9. **We need to capture at minimum these two shapes** — one of each is the goal:

   **Shape A — league events list** (returned when you're on the NBA landing page). Should contain an array of games/events with their moneyline/spread/total prices inline. Example field names DK uses: `eventGroup`, `offerCategories`, `offerSubcategoryDescriptors`, `offers`, `outcomes`. The key question: **does one request return prices for all ~12 NBA games for the week, or does each game fetch its own?**

   **Shape B — per-event markets** (returned when you click into a single game). Should contain all markets for that one game (moneyline, spread, total, plus props we don't care about). Even if Shape A already has all the prices inline, capture Shape B too — it's the fallback if Shape A is paginated or stale.

10. **Capture one full example response for each shape.** I need to see:
    - The **exact field name** for American odds (is it `displayOdds`? `oddsAmerican`? `priceUp`? `line`?). One example like `{ "outcomeType": "Moneyline", "label": "Pistons", "oddsAmerican": "+140", "oddsDecimal": 2.4 }` tells us everything.
    - How **spread line** and **total line** are encoded — is the point-spread number in the same object as the odds, or a separate `line` / `handicap` field?
    - How **teams** are identified — by string ("Detroit Pistons") or by ID?
    - How **start time** is represented — ISO-8601? Unix millis?

11. **Check for WebSocket / SignalR connections** — click the **WS** filter. DK historically used SignalR for live odds; current state unknown. If there's a WS connection:
    - Record the `wss://` URL
    - Copy the first 3–5 inbound messages (click the WS → **Messages** tab)
    - Note whether it's **SignalR negotiation** (posts to `/signalr/negotiate`, `/signalr/connect`) or plain WS with JSON frames

12. **Check the response for a state code anywhere** — URL path (`US-NJ`, `US-PA`), query param (`?state=NJ`), header (`x-geo-state`), or cookie. That's how DK routes requests to the right regulatory jurisdiction. We need to pin the scraper to one state.

---

## Output format

Return your findings in exactly this shape, in chat (not as a file — I'll copy into my session):

```markdown
## DraftKings Sportsbook API capture — 2026-04-22

### Summary
- Final app URL: <e.g., https://sportsbook-us-nj.draftkings.com/>
- State routing mechanism: <URL path segment / subdomain / query param / cookie — describe exactly>
- State code captured: <e.g., US-NJ>
- Auth required: <yes/no — bearer token? just cookies? fully anonymous?>
- WebSocket used: <yes/no + URL if yes + what it carries — live odds / user bets / both>
- SignalR or plain WS: <if WS — which>
- Odds field name: <displayOdds / oddsAmerican / priceUp / other>
- Spread-line encoding: <same object / separate field / in outcome label string>
- Number of odds-data endpoints identified: <N>
- NBA covered in capture: <yes/no — if no, which sport instead and why>

### Endpoint 1 — <name/purpose, e.g., "NBA league events list">

**URL:** `<full URL with all query params>`
**Method:** `GET`

**Key headers:** (non-obvious ones only)
- `User-Agent: ...`
- `X-App-Id: <value>` (if present)
- `Cookie: <first 60 chars>...` (truncate, don't paste full session)

**Full cURL:** (truncate long Cookie values to first 30 chars + `...`)
```bash
curl '...' \
  -H '...' \
  ...
```

**Response status:** 200
**Response sample:** (first ~3000 chars, formatted)
```json
{
  ...
}
```

**What this gives us:** <one-sentence purpose — e.g., "all NBA games for the next 7 days with moneyline+spread+total prices inline">

### Endpoint 2 — <name/purpose, e.g., "Single-game markets bundle">

(repeat)

### WebSocket (if any)

**URL:** `wss://...`
**Handshake type:** <plain WS / SignalR negotiate+connect / other>
**First inbound messages:**
```json
{ ... }
{ ... }
```

### Notes
- Anything unusual: state-switching flow, rate-limit responses, geo-block behavior, `Retry-After` headers, token refresh, response compression, cursor pagination, anything that surprised you while capturing.
- Whether the endpoints responded without a `Cookie` header (test: in DevTools, right-click → copy as cURL, then paste in a terminal with the `-b` / `-H 'Cookie: ...'` flag stripped — does it still 200, or does it 401/403/empty?). This determines whether the scraper needs any session state at all.
```

---

## If the primary approach fails

If the Network tab isn't cooperating (panel layout issues, overwhelmed by adtech noise, filters not sticking), **fallback: inject an interceptor**:

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
    window.__cap.push({ type: 'fetch', url: typeof u === 'string' ? u : u.url, method: (o && o.method) || 'GET', reqBody: o && o.body, status: r.status, body: t.slice(0, 4000) });
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
    x.addEventListener('load', () => window.__cap.push({ type:'xhr', url:u, method:m, reqBody:b, status:x.status, body:(x.responseText||'').slice(0,4000) }));
    return os.apply(this, arguments);
  };
  return x;
};
console.log('Interceptors installed. Reloading in 2 seconds...');
setTimeout(() => location.reload(), 2000);
```

3. After the reload finishes, click into an NBA game, wait 5 seconds, then dump the filtered results:

```js
copy(JSON.stringify(window.__cap.filter(r =>
  /draftkings|sportsbook|eventgroup|offer|market|odds|selection|competition/i.test(r.url)
  && !/segment|mparticle|datadog|sentry|amplitude|fullstory|hotjar|google|doubleclick|optimizely|braze|adobe|launchdarkly|recaptcha|stripe/i.test(r.url)
  && r.body && r.body.length > 500
), null, 2))
```

4. Paste clipboard contents into the output format above.

---

## Do not

- Do not attempt to place bets, deposit, withdraw, or interact with any real-money transaction.
- Do not click Deposit / Withdraw / Bet Slip / Place Bet buttons.
- Do not navigate to account-settings / KYC / identity-verification / responsible-gaming pages.
- Do not share my session cookie / auth token with any site other than `draftkings.com`.
- Do not attempt to bypass geo-restrictions (VPN, proxy tricks). If you hit a state-not-licensed wall, stop and tell me.
- If you hit a 2FA / re-authentication prompt, stop and tell me.
- Do not capture player-prop endpoints unless the same endpoint also carries moneyline/spread/total — props are v2 and not worth the response-size bloat.

## Done when

You've posted the structured report with:
- **Shape A** (league events list) — URL, method, full cURL, response sample showing at least one NBA game with its moneyline prices
- **Shape B** (per-event markets bundle) — same, for a single game click-through
- The state code and routing mechanism identified
- The exact odds-field name called out in Summary

Shape A is the critical one (it's what the scraper will loop). Shape B is the nice-to-have but it unlocks the per-game detail view in the dashboard. If you can only get one, get Shape A.
