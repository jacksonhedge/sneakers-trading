# Production lag diagnostic

Paste to Claude Chrome. Production at `sneakersterminal.com` is laggy —
clicks don't register or take seconds, navigation feels stuck. Profile
the site and report back what's actually slow so we can fix it.

---

I need a focused diagnostic of why `https://sneakersterminal.com` feels
unresponsive. The user is already signed in (admin). Walk through the
flow below, capture concrete timing + network + console data, and
report back. Don't try to fix anything — just report.

## Setup

1. The user is signed in as `jacksonfitzgerald25@gmail.com` with admin.
2. Open Chrome devtools (Cmd+Option+I) so you have access to Console,
   Network, and Performance tabs.
3. Make sure "Disable cache" is **unchecked** in Network tab — we want
   to measure what real users see, not cold loads.

## Phase 1 — Cold load timing per route

Visit each route. For each, capture:
- **Time to first paint** (visible in Network tab → main HTML response time + first JS chunk render — eyeball it; we don't need ms precision)
- **DOM ready vs interactive** — does typing/clicking work immediately when content is on-screen, or is there a few-second delay where the page LOOKS ready but doesn't react?
- Number of network requests in the waterfall
- Largest 3 requests by size or time

Routes to hit (in order):
1. `/` (landing)
2. `/dashboard`
3. `/markets`
4. `/dashboard/markets/kalshi/<any-id-from-/markets-list>` (click any row)
5. `/dashboard/profile`
6. `/dashboard/settings/autotrade`
7. `/dashboard/minute`

For each route, paste a one-liner like:
```
/dashboard      → ~3.2s to render, ~1.1s before clickable, 47 requests, slowest: /api/markets/opportunities (1.8s, 480KB)
```

## Phase 2 — The interactivity problem

The user says "almost everything i try to click is either lagged crazily
or doesn't load." Reproduce this concretely.

On `/dashboard/markets/kalshi/<id>` (the slowest-feeling page):
1. Click each timeframe tab: 5m, 1h, D, 1w. Time how long until the URL
   updates. If clicks feel ignored, note that.
2. Click each detail tab: Positions, Orders, Buy/Sell, Trades, Top
   Traders, Top Holders. Same — does clicking work? Does the content
   actually swap?
3. Try the slider on the right — drag it. Does the AMOUNT update in
   real time, or lag?
4. Click "Enable Trading →" or the Polymarket BUY button. Does it
   respond?

Report a short list of: **what's snappy** vs **what lags or doesn't fire**.

## Phase 3 — Console errors

Browser devtools → Console tab. After loading each phase-1 route, check
for red errors. Common things to look for + paste back:

- `Hydration mismatch` warnings (FreshnessIndicator was the prior
  culprit; check if there are others)
- Failed network requests (4xx/5xx)
- Memory leak warnings or "Maximum update depth exceeded"
- Any `Error:` stacks
- Anything yellow if it repeats more than ~3 times

Don't paste the full stack — just one line per unique error + the route
where it appeared.

## Phase 4 — Network waterfall on the worst page

Pick the slowest-feeling route from Phase 1. Open Network tab, hit
hard-reload (Cmd+Shift+R). When the waterfall settles, note:

- **Total requests**: N
- **Total transferred size**: NMB
- **Total finish time**: Ns
- **5 slowest individual requests**: name + ms each
- **Anything blocking** (red error, long Connect time, 3+ second TTFB)

If a single request is the bottleneck (e.g. `/api/markets/opportunities`
taking 4 seconds), that's the smoking gun.

## Phase 5 — Performance tab record (if Chrome agent can drive it)

If you have the Chrome MCP profiler / Performance API access:
1. Open Performance tab
2. Click record (●)
3. Hit hard-reload on `/dashboard`
4. Wait for full load (5–10s)
5. Stop recording
6. Report:
   - **Scripting time** vs Rendering vs Painting (rough %)
   - Long tasks > 50ms (count + biggest one in ms)
   - The single largest "yellow" or "purple" block in the timeline

If you can't drive Performance tab, skip — Phases 1–4 are enough.

## Phase 6 — The `track()` overhead hypothesis

Recent commits added `track()` calls everywhere (every click, every
hover). On dashboard, click 5–10 things in quick succession (sidebar
nav, filter chips, market rows). In Network tab, filter for `track` and
count how many requests fire. Each is a POST to `/api/track`.

Report: **N track POSTs per 10 clicks** + median time per request.

If the page is waiting on these to finish before re-rendering, that
explains the lag.

---

## Final report

Format:

```
TL;DR (1 sentence): the lag comes from <X>.

PER-ROUTE TIMING:
  /                         <one-liner>
  /dashboard                <one-liner>
  ... (etc)

UNRESPONSIVE INTERACTIONS:
  - <what doesn't work>
  - <what doesn't work>

CONSOLE ERRORS (unique):
  - <error> on <route>
  - <error> on <route>

WORST-PAGE WATERFALL:
  Total: N requests, MMB, Ts
  Slowest: <name> Tms

TRACK OVERHEAD:
  N POSTs / 10 clicks, median Tms each

LIKELY ROOT CAUSE:
  <best guess based on data>
```

Target length: 25–35 lines. Numbers + specific URLs over prose.

## Boundaries

- Production only. Don't sign out — keep the admin session.
- Don't actually place trades or pay through Stripe.
- If the Chrome agent's MCP tools refuse a Performance recording, skip
  Phase 5; don't fight it.
- If a route 5xx's instead of being slow, that's a separate bug — note
  it and continue.
