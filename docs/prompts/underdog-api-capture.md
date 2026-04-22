# Underdog API capture

**Task:** Reverse-engineer the JSON API for both Underdog **Predict** (CDNA-backed prediction markets) and Underdog **Fantasy** (DFS pick'em), so we can build a scraper.

**Why both at once:**
- **Underdog Predict** runs on Crypto.com Derivatives (CDNA) — same backend as OG Markets. Underdog Predict prices should equal OG prices (we've already confirmed the OG ↔ CDNA relationship; Underdog wrapping CDNA is the same pattern). A capture here verifies whether Underdog applies a markup/fee vs OG's direct prices.
- **Underdog Fantasy** is pick'em (their original product) — player-prop lines with fixed juice and multiplier payouts. Distinct from prediction markets; separate pricing source worth scraping.

Both surfaces live in the same Underdog web app, so one browser session captures both.

---

## What I need you to do

### Part 1 — Web surface

1. Navigate to **`https://play.underdogfantasy.com/`** (you're logged in as WINDAILY partner).
2. Verify you land on a logged-in view (Lobby, Pick'em board, or Predict tab). If it redirects to the mobile-app store, try `https://underdogfantasy.com/predict` directly. Underdog is mobile-first — web may expose less than the app.
3. **If web is thin / redirects to app store:** note that and stop. We'll capture via mobile + mitmproxy on a future day.

### Part 2 — Capture the Predict side first (higher priority)

1. Click into the **Predict** tab (or navigate to `/predict`, `/predictions`, whatever surface exists).
2. **Cmd+Option+I** → Network tab → **Fetch/XHR** filter → **🚫 Clear**.
3. Click into a specific prediction market (NBA / NFL / MLB game event — whatever's live).
4. Watch for JSON requests. Ignore: analytics (Segment, Mixpanel, Datadog, Sentry, Amplitude, Braze, Iterable), auth refresh, asset fetches.
5. Likely domains:
   - `api.underdogfantasy.com/*`
   - `api.underdogpredict.com/*`
   - `bff.underdogfantasy.com/*`
   - possibly `*.crypto.com` or `*.cdna.com` if they embed CDNA directly
6. Hunt for endpoints named `/events`, `/markets`, `/contracts`, `/predict`, `/prediction`, `/orderbook`, `/prices`.
7. Capture full cURL for up to 5 key endpoints.

### Part 3 — Capture the Pick'em side

1. Navigate back to the Pick'em board (default view usually).
2. Clear Network tab, Cmd+R reload.
3. Look for:
   - A **player-prop board** endpoint returning tonight's props across a sport.
   - A **per-player** detail endpoint for full prop coverage.
   - A **slate / contest** endpoint that wraps props into enterable slates.
4. Capture cURL for those.

### Part 4 — Verify the Underdog-Predict ≡ OG hypothesis

If Underdog Predict is live on your account, pick one market (e.g., an NBA game winner) and note:
- **Underdog Predict's YES price** on that market.
- **Market title** exactly as displayed.

Then check **og.com** for the same market title and note OG's YES. If they match to the cent, it's confirmed — Underdog Predict is a CDNA wrapper, no separate scraper needed. If they differ meaningfully, Underdog runs a parallel book with its own markup and deserves a dedicated scraper.

### Part 5 — Odds format

In responses, check whether prop/prediction prices come as:
- **Probability** (`0.52`, `0.48`) — same format as our other books
- **American odds** (`-110`, `+240`) — typical for pick'em
- **Multiplier** (`3x`, `6x` for 2/3-pick combos) — pick'em-specific

Note which, and whether the format differs between Pick'em and Predict surfaces.

---

## Output format

Return in chat (not as a file) — I'll copy into my scraper session:

```markdown
## Underdog API capture — 2026-04-22

### Summary
- Surfaces accessed: <predict / pickem / both / web-is-thin>
- API base domain(s): <e.g., api.underdogfantasy.com>
- Auth shape: <Bearer / Cookie / custom>
- Odds format (Predict): <probability / american / multiplier>
- Odds format (Pick'em): <probability / american / multiplier>
- Underdog Predict vs OG parity check:
  - Market title: "<…>"
  - Underdog YES: 0.XX
  - OG YES: 0.XX (or "didn't verify")
  - Verdict: <identical = wrapper / meaningful delta = independent book / n/a>
- WebSocket used: <yes/no + URL>
- Number of endpoints identified: <N>

### Endpoint 1 — <name/purpose>

**URL:** `<full URL>`
**Method:** `GET` or POST

**Key headers:** (auth + required app headers only)
**Full cURL:** (truncate long tokens)
```bash
curl '...' -H '...'
```

**Response status:** 200
**Response sample:** (first ~2000 chars, pretty-printed)
```json
{ ... }
```

### Endpoint 2 — (repeat for each)

### Notes

- Anything unusual: geo checks, JWT claims hinting at CDNA backend, response-shape oddities
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
copy(JSON.stringify(window.__cap.filter(r => /underdog|predict|pick|prop|market|event|cdna|crypto\.com/i.test(r.url) && r.body && r.body.length > 200), null, 2))
```

---

## Do not

- Do not enter any contest, deposit, or place any pick'em entry.
- Do not navigate to identity / KYC / deposit / withdrawal screens.
- Do not share the session cookie with any non-underdog.com / non-crypto.com domain.
- If you hit 2FA / re-verification, stop and tell me.

## Done when

Posted structured report with at least one Predict-side endpoint + (ideally) one Pick'em endpoint. Wrapper verdict from Part 4 is a stretch goal — without it we'll still build, just might end up with a redundant scraper vs OG.
