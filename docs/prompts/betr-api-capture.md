# Betr API capture

**Task:** Reverse-engineer Betr's JSON API so we can build a direct-HTTP scraper for their player-prop pick'em lines (and the sportsbook side if you're in a state where that's live).

**Why:** Betr is primarily a DFS **pick'em** product (like PrizePicks/Underdog/Sleeper) — player-prop lines with fixed ~-118 juice on each side and multiplier-based payouts (2-pick = 3x, etc.). This is a distinct category from binary prediction markets; the arb math is different but the scraper mechanics are the same — capture lines, store them, compare against other books.

**Likely surfaces:**
- Web app at **`https://play.betr.com/`** or **`https://betr.com/picks/`** (most product access is through the mobile app, but a web surface exists for the logged-in experience)
- Possible separate sportsbook at `sportsbook.betr.com` in states where Betr Sportsbook operates (currently a narrow list — Ohio, Virginia, Massachusetts, Colorado, maybe others)
- Fallback: capture off the mobile app via mitmproxy if web has nothing

---

## What I need you to do

### Part 1 — Locate the live product

1. Navigate to `https://play.betr.com/` (I'm logged in; if it redirects or 404s, try `https://betr.com/picks`, `https://www.betr.com/`, or `https://app.betr.com/`).
2. If you hit a geo-block ("not available in your state") banner, note which state it reports and whether it offered a waitlist/zipcode entry. Then try `https://sportsbook.betr.com/` as a fallback in case only the sportsbook is live for this region.
3. Once you're on a functional page, navigate to **tonight's NBA pick'em board** (should be the default sport). If NBA isn't available, go NFL → MLB → NHL in that priority.

### Part 2 — Network capture

1. **Cmd+Option+I** → Network tab → **Fetch/XHR** filter → click **🚫 Clear**.
2. **Cmd+R** to reload.
3. Wait 5 seconds. Find the requests returning JSON player-prop data. Ignore:
   - analytics (Segment, Mixpanel, Datadog, Sentry, Amplitude, hotjar, fullstory)
   - auth refresh calls
   - asset/CDN fetches (images, fonts, JS bundles)
4. You're hunting for requests on `api.betr.com`, `api.play.betr.com`, `bff.betr.com` (backend-for-frontend is a common pattern), or similar. Likely path names: `/picks`, `/props`, `/lines`, `/markets`, `/contests`, `/events`, `/players`, `/board`.
5. **Specifically hunt for these shapes:**
   - A **player-prop board** — returns tonight's player lines for a sport in one call, e.g., "Jayson Tatum points 27.5 — over -118 / under -118"
   - A **per-player detail** — all available props for one player (points, rebounds, assists, 3PM, etc.)
   - A **per-game bundle** — all player props tied to one game
   - A **contests / lobby** endpoint — Betr may gate props behind "entering a contest" so this might be the root
6. **For each request you identify (up to 6),** record:
   - Full URL (including query params)
   - Method (GET/POST; if POST, capture the request body)
   - Key request headers — `Authorization`, `Cookie`, any `X-*` headers, `X-App-Version`, `X-Device-ID` (mobile-app APIs often require these)
   - Response status and first ~2000 chars of the response body

### Part 3 — Capture from the mobile app if web is thin

Betr is mobile-first, so web may expose less than the app. If Part 2 didn't surface rich prop data:

1. **Skip this** unless you have mitmproxy / Proxyman set up and know how to intercept iOS SSL traffic. For tonight, web data is fine as a starting point — we can enrich from the app later.
2. Just note in the output: "web surface has limited props; mobile capture needed for full coverage."

### Part 4 — Note the odds format

In the response body, check what format the odds come in:
- **American** — `"odds": -118` or `"american_odds": -115`
- **Decimal** — `"decimal_odds": 1.85`
- **Probability** — `"implied_prob": 0.542`
- **Multiplier** — `"multiplier": 3.0` (raw pick'em payout)

Tell me which. Pick'em books often return the raw multiplier for the "combo" (2-pick = 3x, 3-pick = 6x) and leave per-leg odds implicit (~-118/-118 per leg). I need to know so the scraper converts correctly.

---

## Output format

Return in chat (not a file — I'll paste into my session):

```markdown
## Betr API capture — 2026-04-22

### Summary
- Product scraped: <pick'em / sportsbook / both>
- Geo status: <available / blocked with state + message>
- API base domain: <api.betr.com, bff.betr.com, etc.>
- Auth shape: <Bearer / Cookie / custom>
- Odds format: <american / decimal / implied_prob / multiplier>
- WebSocket used: <yes/no + URL>
- Number of endpoints identified: <N>

### Endpoint 1 — <name>

**URL:** `<full URL>`
**Method:** `GET` or POST (with body)

**Key headers:**
- `Authorization: Bearer <first 20 chars>...`
- `X-... : ...`

**Full cURL:**
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

### Notes
- Anything unusual: KYC gate, state-specific routing, contests-as-container, pagination, auth-refresh
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
copy(JSON.stringify(window.__cap.filter(r => /betr|pick|prop|player|board|contest/i.test(r.url) && r.body && r.body.length > 200), null, 2))
```

---

## Do not

- Do not enter a contest, deposit, or place any pick'em / bet.
- Do not navigate to identity / KYC / responsible-gaming / deposit pages.
- Do not share my Betr session cookie with any non-betr.com site.
- If you hit a 2FA / identity re-verification prompt, stop and tell me.

## Done when

You've posted the structured report with at least one valid Betr endpoint's URL, method, headers, and response sample. **Most valuable target:** the per-game or per-sport player-prop board call (one request that returns all tonight's NBA player props) — that's what the scraper will poll.
