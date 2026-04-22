# PrizePicks API capture

**Task:** Reverse-engineer the JSON API for PrizePicks' **Pick'em** board and their newer **Prediction Markets** product (Team Picks, Culture Picks). Scraper follows as soon as the capture comes back.

**Why this is high-value:**
- PrizePicks is the #1 DFS pick'em app in the US — widest player-prop coverage of any pick'em book.
- PrizePicks Prediction Markets got its own CFTC approval in Feb 2026 (not a Kalshi/CDNA wrapper — independent CFTC license). That makes it one of the ~6 genuinely independent prediction books we track.
- User is a WINDAILY partner with a PrizePicks account — auth works out of the box.

---

## What I need you to do

### Part 1 — Check if web is usable

1. Navigate to **`https://app.prizepicks.com/`** — I'm logged in via WINDAILY invite code. If that redirects to `prizepicks.com/` marketing, click **Log In** and use my credentials (already saved in Chrome).
2. PrizePicks is primarily mobile but has a functional web app for the Pick'em lobby. **Confirm the web lobby loads with live player props visible.** If it redirects to the app store or shows a "Download our app" wall, note that and stop — PrizePicks-web is thin and we'd need mitmproxy on mobile for full capture.

### Part 2 — Capture the Pick'em board

1. Navigate to the NBA lobby (or NFL / MLB / NHL, whichever has a full slate right now).
2. **Cmd+Option+I** → Network tab → **Fetch/XHR** filter → **🚫 Clear**.
3. Cmd+R reload.
4. Wait 5s. Ignore analytics (Segment, Mixpanel, Datadog, Sentry, Amplitude, Braze, Iterable, gtm, Google, Meta, Facebook).
5. Hunt for JSON endpoints on:
   - `api.prizepicks.com/*`
   - `partner-api.prizepicks.com/*`
   - `bff.prizepicks.com/*`
   - possibly `api.lobby.prizepicks.com` / `api.picks.prizepicks.com`
6. Look for paths named `/projections`, `/picks`, `/props`, `/players`, `/lines`, `/leagues`, `/lobby`, `/slates`, `/board`.
7. **The one you want:** a single call that returns all tonight's projections for a sport, with lines + odds + player metadata. That's the scraper's primary target.
8. Capture full cURL for up to 6 endpoints.

### Part 3 — Capture the Prediction Markets side

1. Navigate to **Team Picks** or **Culture Picks** (PrizePicks' binary prediction product — launched Feb 2026).
2. Clear Network tab, reload.
3. Hunt for the same kinds of endpoints but now returning binary YES/NO contracts instead of player-prop lines.
4. Capture cURL for those.

**Key question:** does the Prediction Markets product use the same API surface as Pick'em (with a `type` flag), or a separate base path (`/predictions/*` vs `/projections/*`)? Note which.

### Part 4 — Odds format

In responses, check what format the lines come in:
- **Over/Under with juice:** `{line: 27.5, over_odds: -118, under_odds: -118}` → standard pick'em with ~-118 juice baked in
- **Multiplier:** `{multiplier: 3.0}` → raw pick'em payout (2-pick = 3x, 3-pick = 6x, 4-pick = 10x)
- **Probability:** `{yes: 0.54, no: 0.48}` → prediction-market style (for Team Picks)

Tell me which for each surface — I need to know before writing the American-odds conversion path.

### Part 5 — Pagination / league structure

- Are all projections for a sport returned in one call, or paginated?
- Are leagues (NBA / NFL / MLB / NHL / NCAAB / NCAAF / WNBA / ESports / PGA) separate endpoints, or a `league_id` query parameter?
- Is there a **state gate** (PrizePicks' state availability is the narrowest of any book — specific states excluded; the app checks your geo before showing the lobby)?

Note these in the report so the scraper knows how to enumerate.

---

## Output format

Return in chat (not a file):

```markdown
## PrizePicks API capture — 2026-04-22

### Summary
- Web accessible: <yes / thin / blocked>
- Geo status: <available / state-blocked + message>
- API base domain(s): <e.g., api.prizepicks.com>
- Auth shape: <Bearer / Cookie / custom>
- Pick'em odds format: <over-under with juice / multiplier / ...>
- Predictions odds format: <probability / american / ...>
- Pick'em and Predictions on same API surface? <yes / no + details>
- League enumeration: <separate endpoints per league / query param / single call for all>
- Pagination: <yes/no + cursor shape>
- WebSocket: <yes/no + URL>
- Endpoints identified: <N>

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

### Endpoint 2 — (repeat)

### Notes

- Anything unusual: geo requirement, app-version header requirements, response format quirks (PrizePicks historically used JSON:API spec — `{data: [...], included: [...]}` — if that's still true, note it because it changes how we parse)
```

---

## If the primary approach fails

Console interceptor (standard pattern):

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
copy(JSON.stringify(window.__cap.filter(r => /prizepicks|projection|pick|prop|board|lobby|predict|team.?pick/i.test(r.url) && r.body && r.body.length > 200), null, 2))
```

---

## Do not

- Do not enter a contest, deposit, or make a pick.
- Do not touch identity / KYC / responsible-gaming / deposit screens.
- Do not share the session cookie with any non-prizepicks.com domain.
- If you hit 2FA or re-verification, stop.

## Done when

Structured report posted with at least one Pick'em endpoint + (if PrizePicks Predictions is accessible on web) one Predictions endpoint, with URLs + headers + response samples. If web is blocked and only mobile works, say so — we'll defer to a mitmproxy session.
