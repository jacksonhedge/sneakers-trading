# Test the single-market detail page

Go to `http://localhost:3000/dashboard/markets/kalshi/KXNBASPREAD-26APR23DENMIN-MIN14`.

If it redirects you to `/signup` or `/login`, sign in using whatever email is already on file for this localhost session, then come back to the URL above.

Once you're on the market page, run through the checklist below and report what you find. I want structured feedback, not a summary — tell me pass/fail for each item and include any screenshot, console error, or network 4xx/5xx you catch.

## What the page should look like

Three-column layout in **light mode by default**:

1. **Top chrome** — lean topbar: `Ø O'Toole TERMINAL` logo on the far left, horizontal nav links (Dashboard · Markets · Venues · Billing) where "Markets" is highlighted in British racing green, a search input in the middle, a green `Deposit` button, a pulsing green `LIVE` dot, a theme-toggle button (☀ Light), and `SIGN OUT`. Under the topbar a breadcrumb strip: `← Markets / <sport> / KALSHI / Minnesota wins by over 14.5 points?` — each segment is a link.
2. **Left column** (~280px): market title and question, a 2×2 grid of stat tiles (Total Volume / 24h Volume / Liquidity / Open Interest), YES and NO price tiles in emerald/red, a "PROVIDERS" card with colored dots for each venue quoting the market, a 3-column price-change strip (24H / 7D / 30D), a semicircle "Prediction Score" gauge with a red/amber/green arc and a needle, an `Add to Watchlist` button in racing green, and a "Top Movers" list at the bottom.
3. **Center column**: a narrow title strip with the market question, countdown (like `15d 3h 24m`), resolution date, volume, and bookmark/share/info icons. Below it, the chart area with timeframe tabs (`5m 1h D 1w`), a line chart with colored paths per venue and grid lines, y-axis price labels on the right (100¢ / 75¢ / 50¢ / 25¢ / 0¢), and a venue legend at the bottom. To the right of the chart: an **order book** table with columns PRICE / VENUE / SIZE / CUM. USD. Below the chart: a tab bar (Positions / Orders / Buy/Sell / Trades / Top Traders / Top Holders) and a cross-venue outcome comparison table with `Yes ##¢` / `No ##¢` buttons per row.
4. **Right column** (~340px): an `Opinion` selector, BUY/SELL toggle with racing-green underline, Market/Limit/Pro tabs, two outcome buttons (YES green / NO red) that let you pick a side, an `AMOUNT` slider with a racing-green fill, a `TO WIN` readout, an `Enable Trading →` CTA in racing green, a small "Shares Value / USD Value / Avg. Price / Fees" table, and at the bottom a `Deposit` button plus `Swap` / `Withdraw` buttons and Account/Portfolio overview strips.

## What to test

Please go through each of these. Report the result as ✅ / ❌ with one sentence of detail per item.

### 1. Visual integrity
- [ ] Page renders without a blank white screen, infinite spinner, or a Next.js error overlay.
- [ ] No browser console errors (open DevTools → Console). If any appear, paste the full message.
- [ ] No React hydration warnings in the console.
- [ ] No network requests returning 4xx or 5xx (check DevTools → Network tab after a hard reload).
- [ ] The 3-column layout actually shows 3 columns on a normal laptop-width viewport (~1440px). No horizontal scroll.
- [ ] The chart renders at least one colored line (not a blank rectangle).

### 2. Theme toggle
- [ ] Click the theme-toggle button in the topbar (shows `☀ Light`). It should cycle to `☾ Dark` — the whole 3-column content flips to near-black backgrounds, white text, and the chart grid turns to dark lines. The topbar itself stays light-ish (that's intentional — only the market content is themed).
- [ ] Click again. It should cycle to `⚘ Rainbow` — left panel turns butter yellow, center chart area turns french blue, order book turns mint, right trade panel turns dusty rose. Subtle vertical pinstripes should be visible.
- [ ] Click once more and it should return to Light. Reload the page: the theme you last picked should persist (localStorage-backed).

### 3. Navigation
- [ ] Clicking `← Markets` in the breadcrumb takes you to `/markets`.
- [ ] Clicking the sport segment (e.g. `NBA`) takes you to `/markets?sport=nba` — the filter should be pre-applied.
- [ ] Clicking `KALSHI` takes you to `/markets?platform=kalshi`.
- [ ] Typing into the search input and pressing Enter takes you to `/markets?q=<what-you-typed>`.
- [ ] Clicking `Dashboard` in the topbar goes to `/dashboard` (the full-chrome dashboard with the sidebar).
- [ ] Clicking `Deposit` goes to `/dashboard/billing/credits`.

### 4. Trade panel interactivity
- [ ] The BUY/SELL toggle switches which side is underlined.
- [ ] Market/Limit/Pro each become bold when clicked.
- [ ] Clicking the YES outcome button highlights it in green; clicking NO highlights it in red and switches the "To Win" calculation basis.
- [ ] Dragging the AMOUNT slider updates the dollar amount at the top, the racing-green fill bar, the `%` label on the right, and the `TO WIN` readout.
- [ ] `Enable Trading →` is visible. Don't click through to the affiliate URL; just confirm the button is present and styled in racing green.

### 5. Reference-feel sanity check
Compare what you see to a typical prediction-market terminal layout (Predictefy, Kalshi's trade view, etc.). Flag anything that looks noticeably unprofessional — e.g., misaligned text, overlap between the chart and the order book, truncation that loses important info, or spacing that feels wrong.

## Reporting format

Return exactly this structure:

```
## Visual integrity
- 1a: ✅/❌ — <detail>
- 1b: ... (one line per bullet)

## Theme toggle
- 2a: ...

## Navigation
- ...

## Trade panel
- ...

## Reference-feel issues
- <numbered list of anything that looks off, with screenshots attached if possible>

## Console/network errors
<paste verbatim>
```

If any critical thing is broken (blank page, auth loop, crash) stop after item 1 and report that immediately instead of continuing.
