# Chrome prompt — full-stack tour after the 2026-04-27 build session

Walks through everything that's been shipped over the recent build sessions: Robinhood-style charts, minute-markets dashboard, click tracking, admin views, O'Toole strategy-scaffolding tools (Phase 1A). Verifies each piece works end-to-end and reports a structured summary back.

This is a verification tour, not a smoke test — the dev server should already be running on `sneakersterminal.com` and the user should already be able to sign in.

---

Task: log in to Sneakers Terminal at `https://sneakersterminal.com`, walk through every major surface that's been shipped tonight, exercise each new feature, and produce a structured report. Run each phase, end with the structured report described at the bottom.

Prerequisites:
- Dev server running on `https://sneakersterminal.com`
- The user has either: (a) an email/password account they can sign in with, OR (b) `AUTH_DEV_RETURN_LINK=1` set in `.env.local` so the magic-link flow returns a clickable URL in the JSON response
- Migrations 012 and 027 are applied to Supabase (alert_rules + trade_drafts tables exist)

Fresh incognito window for the start. Open browser devtools (Console + Network) before starting — track any 5xx, console errors, or unhandled promise rejections per phase.

---

## Phase 1 — Public landing + first auth

1. Open `https://sneakersterminal.com/` in a fresh incognito tab.
2. Landing page should render with the dark/emerald terminal aesthetic, "SIGN UP / WAITLIST" eyebrow, hero CTA, and a venue ticker scrolling at the bottom showing platform logos.
3. Note the response time to first paint (rough — under 3s is fine).
4. Click the primary "SIGN IN" or equivalent CTA in the nav. Lands on `/login`.
5. The login form should show **email + password** fields with a "SIGN IN →" button (this is the recent password flow — not just magic link). There should be a "Sign in via email link instead" link below for magic-link fallback.
6. Sign in with the user's credentials. End up on `/dashboard`.

**PASS criteria**: signed-in dashboard renders without errors. Capture the user email and any tier badge visible.

## Phase 2 — Dashboard overview + sparklines

You're on `/dashboard`. Verify the new chart treatments:

1. **Biggest Volume widget**: should be a 4-column table with `MARKET | (sparkline) | YES | VOL`. Each row's third-to-last column is a tiny green-or-red sparkline showing that market's 7-day price trajectory. Em-dash placeholders on rows without history.
2. **Biggest Movers widget**: should be a 6-column table with `(logo) | MARKET | (sparkline) | NOW | Δ | WINDOW`. Sparklines should be 90px wide, 28px tall, mostly green (these are markets that surged ≥40pp).
3. **Arbitrage Panel** (if visible — gated by tier): cross-book arb candidates with sport / away @ home / cheapest home / cheapest away.
4. **Performance Chart**: still a stub with synthesized curves — that's expected, real time-series rollups are a future task.

Capture: how many BiggestVolume rows have real sparklines vs em-dash; whether any sparkline is conspicuously red (down market).

**PASS criteria**: at least one sparkline visible on BiggestVolume + at least one on BigMovers. No 5xx in network tab.

## Phase 3 — Minute Markets dashboard

Click into `/dashboard/minute` (you may need to navigate via URL bar if there's no nav link yet).

1. Page header reads `MINUTE MARKETS` in emerald monospace.
2. Below the header: window-filter pills `5m | 15m | 30m | 60m | 2h | 4h` and asset-filter pills `all | BTC | ETH | SOL | XRP | DOGE | ...`. Default selected: `60m` window, `all` assets.
3. Page summary line: `N markets · M groups · 5m: X · 15m: Y · 30m: Z · 60m: W`.
4. Below the header: stack of group cards. Each card header reads `[ASSET] resolves in X.Xm · HH:MM UTC · platforms with colored dots · N strikes`.
5. Card body is a 6-column table: `platform | strike | dir | yes | Δ5m | vol`. Direction column shows `above` / `below`. Δ5m column should show colored values (green for up, red for down) if the scraper loop has run twice within the last ~7 minutes.
6. Auto-refresh: the page should re-fetch silently every 15 seconds (no full reload — `last scrape` indicator near header should tick down).
7. Click the `BTC` asset filter chip. URL updates to `?asset=BTC`. Group list narrows to BTC-only.
8. Click `all` to clear. Returns to full list.

Capture: total markets count, group count, top 2-3 asset cards visible, whether Δ5m has populated values or just em-dashes.

**PASS criteria**: page loads, filters work, at least one asset card visible, no 5xx.

## Phase 4 — Markets browse with sparklines

Navigate to `/markets` (auth-gated, full browse).

1. Header: `All markets` + market count + multi-book count.
2. Filter bar with platform / sport / category / phase / sort controls.
3. Below: 3-column grid of market cards (responsive — fewer columns on smaller screens).
4. **Each card** should show:
   - Platform logo + sport tag + market question
   - Phase badge (LIVE/PRE/OPENING/CLOSED)
   - **Sparkline** between the question and the outcome list — 40px tall, full-width, green/red based on 7-day direction
   - Outcome list with prices in cents
   - Best price + total volume row
   - Trade-destination chips at the bottom (affiliate-linked to venues)
5. Some cards will not have sparklines (new markets without history) — that's expected.
6. Try a filter — e.g. `?platform=polymarket` or click a platform chip. Card list narrows.

Capture: how many of the visible cards have sparklines vs none; any platform with markedly different sparkline density.

**PASS criteria**: cards render, at least 50% of visible cards have sparklines, no 5xx.

## Phase 5 — Single-market detail with full Robinhood chart

Click on any market card with a sparkline. Lands on `/dashboard/markets/<platform>/<market_id>`.

1. The center of the page is a large chart. **Verify all of these visual elements**:
   - Top-left: big bold price + delta + percent change (e.g. `45¢` + `+3.2¢ (7.65%)` in green)
   - Top-right: live indicator — pulsing emerald dot + `LIVE · 12s ago` if scrape is fresh, or muted `updated 7m ago` if stale
   - Top-right next to live indicator: timeframe pills `1H | 4H | 1D | 1W | ALL` in a segmented control (white background on the active one)
   - Single bold smooth line (Catmull-Rom curve, NOT straight segments)
   - Soft gradient fill underneath the line (fades to transparent at the bottom)
   - Dashed horizontal reference line at the start price of the visible range
   - On mount: line should ANIMATE in left-to-right over ~700ms (you'll only catch this on first load)
   - No grid lines, no Y-axis labels — just the line + gradient
2. **Hover the chart** (or touch + drag if mobile):
   - Vertical dashed crosshair line follows your cursor
   - Filled circle marker snaps to the nearest data point
   - Dark popover above the marker showing the value + timestamp
   - Top-left price updates live as you scrub
3. **Click the `1H` pill** in the timeframe row:
   - Chart re-animates (line draws in again)
   - Visible data narrows to the last hour
   - Footer changes to show `47 pts (of 142)` — pts in window vs total loaded
4. **Click `ALL`** to return to full window.
5. If there are multiple platforms quoting this market, you'll see a secondary line behind the primary in a muted color, plus a legend at the bottom-left.

Capture: did the line draw-in animate? Are the timeframe pills working? Does hover show a popover?

**PASS criteria**: chart renders with smooth curve + gradient + timeframe pills + hover popover. Animation visible on at least one interaction.

## Phase 6 — O'Toole strategy scaffolding (Phase 1A)

Find the O'Toole chat widget — it should be on `/dashboard` or accessible via a sidebar / floating button.

Test the 4 new tools by chatting with O'Toole:

**Test 1 — list_my_alert_rules**:
> "What alert rules do I have set up?"

Expected: O'Toole reports your existing rules (could be 0) plus your tier's rule cap. **NOT expected**: O'Toole guessing or fabricating rules.

**Test 2 — get_my_recent_activity**:
> "What have I been clicking on lately?"

Expected: O'Toole calls the tool and summarizes top click events from the last 7 days. Should mention specific event names like `page_view` or `trade_panel_side`.

**Test 3 — search_markets + get_market**:
> "Find me a current BTC market on Limitless and tell me the latest price."

Expected: O'Toole calls `search_markets` for BTC, picks a Limitless result, calls `get_market`, reports the current YES ask + recent history.

**Test 4 — propose_trade** (writes to trade_drafts table, NO real order):
> "Propose a $25 trade: buy YES on whichever BTC market you just found, max price 95¢."

Expected: O'Toole calls `propose_trade`, returns a `draft_id`, explains the rationale. **NOT expected**: claims of a real order being placed — it should explicitly say "draft proposed, awaiting your confirm."

Capture: which tools O'Toole actually called (their names should appear in O'Toole's reasoning or you can check the response timing — tool calls add 1-3s of latency); whether the responses are confident + specific or vague.

**PASS criteria**: O'Toole successfully calls at least 2 of the 4 tools and produces specific, market-grounded responses.

## Phase 7 — Verify click events landed

Open `/admin/clicks` (admin-gated; if you don't have admin access, skip to Phase 9).

1. Should see 4 metric cards at the top: Events 24h / Page views 24h / Unique sessions / Distinct events.
2. Top events table on the left, top pages table on the right.
3. Recent activity feed at the bottom — last 50 events with TIME / EVENT / PAGE / TARGET / USER / META columns.
4. **Look for events from your tour**: page_views to /dashboard, /dashboard/minute, /markets, /dashboard/markets/..., timeframe_select, asset_filter (if you clicked the chips on /minute), button_click events.

Capture: total event count, top 3 event names, whether your specific session is visible (filter by session_id if you can identify yours).

**PASS criteria**: total events > 0, recent activity shows YOUR session within the last few minutes, NO `relation click_events does not exist` error.

## Phase 8 — Admin scrapers + markets

If you have admin access:

1. `/admin/scrapers` — should show 4 metric cards (platforms tracking, rows today, historical bytes, OddsAPI quota), then a per-platform table with rows for limitless, kalshi, polymarket, novig, prophetx, og, prizepicks, underdog. Each row: PLATFORM | LATEST ROWS | LATEST SIZE | LAST WRITE | DAYS ON DISK | TOTAL SIZE. May also show a DISABLED banner if any scrapers are disabled.
2. `/admin/markets` — full market catalog. Should show 4 metric cards (Total markets / Stale / Wide overround / No price), a filter strip with platform / phase / flag / sort chips, then a table of markets with QUESTION | PLATFORM | SPORT | YES ASK | OVERROUND | VOLUME | PHASE | AGE | FLAGS columns.
3. Try filter `?flag=STALE` on /admin/markets to see stale markets only.

Capture: total markets per platform, count of stale markets, count of WIDE overround flags.

**PASS criteria**: both admin pages render with real data, no 5xx.

## Phase 9 — /dashboard/alerts (just unblocked by migration 012)

Visit `/dashboard/alerts`. Until tonight this would have 500'd because the `alert_rules` table didn't exist; now it should work.

1. Page should render. If you have no rules yet (most likely), it shows an empty state with "Create your first rule" or similar.
2. If you created a rule via O'Toole in Phase 6, it should appear here with `[OTOOLE]` or similar badge / `created_by` indicator.

Capture: page status (renders OK / empty state / error / shows rules).

**PASS criteria**: page renders without 500.

## Phase 10 — Browser console + network sweep

1. Throughout the tour, the browser DevTools Console should have NO red errors. One yellow LCP image warning is acceptable. Note anything else.
2. Network tab: look for any 5xx responses. Note their URL + status. Some 304 / 404 on favicons / static assets is fine.
3. Check that `/api/track` POSTs are firing — should see them in the Fetch/XHR filter every time you navigate. Status should be 200.
4. Check that `/api/markets/minute` POSTs are firing on the /dashboard/minute page (auto-refresh). Status 200.

Capture: any unexpected red console errors, any 5xx network responses.

**PASS criteria**: zero red console errors, zero 5xx in network tab.

---

## Final structured report

Return as:

```
## Phase 1 — Public + sign in
- Status: PASS / FAIL
- Notes:

## Phase 2 — Dashboard overview + sparklines
- BiggestVolume sparklines: X of Y rows
- BigMovers sparklines: X of Y rows
- Status: PASS / FAIL

## Phase 3 — Minute Markets
- Total markets visible:
- Group count:
- Asset filters worked: yes / no
- Δ5m has values: yes / no
- Status: PASS / FAIL

## Phase 4 — /markets browse
- Cards visible:
- % with sparklines:
- Status: PASS / FAIL

## Phase 5 — Single-market chart
- Smooth curve: yes / no
- Gradient fill: yes / no
- Animated draw-in seen: yes / no
- Live indicator visible: yes / no
- Hover popover works: yes / no
- Timeframe pills work: yes / no
- Status: PASS / FAIL

## Phase 6 — O'Toole tools
- Tool calls observed: list_my_alert_rules / get_my_recent_activity / search_markets / get_market / propose_trade — which fired
- Quality of responses (specific vs vague):
- Status: PASS / FAIL

## Phase 7 — /admin/clicks
- Total events 24h:
- Top 3 event names:
- Your session visible: yes / no
- Status: PASS / FAIL

## Phase 8 — Admin scrapers + markets
- Top platform by row count:
- Stale market count on /admin/markets:
- Status: PASS / FAIL

## Phase 9 — /dashboard/alerts
- Renders: yes / no
- O'Toole-created rule visible (if Phase 6 created one): yes / no / N/A
- Status: PASS / FAIL

## Phase 10 — Console + network sweep
- Red console errors:
- 5xx network responses:
- Status: PASS / FAIL

## Anything weird
(free-form — anything that didn't look right or was confusing UX)

## Top 3 things that surprised you (positively or negatively)
1.
2.
3.
```

---

## Boundaries

- DO NOT click the affiliate venue links on market cards — those go to external sportsbook sites, no need to leave the test.
- DO NOT click "Confirm" on any trade draft if you happen to encounter UI for one — the execution layer doesn't exist yet (Phase 1B+); confirmation would either error or have no effect, and we don't want to test that path tonight.
- DO NOT delete any alert rules during the tour. If you create one in Phase 6, leave it for now so it shows up in Phase 9.
- If a page 500s, screenshot it + note the URL + the console error stack, then continue with the next phase.
- If the dev server crashes mid-tour, restart it (`pnpm dev` in `apps/platform`) and resume from the current phase.
- Stay on `sneakersterminal.com`. Don't follow any redirects to external domains.
