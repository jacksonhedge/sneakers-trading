# Opinion.trade frontend recon

Open https://opinion.trade and navigate the product end-to-end. Connect a
wallet if the flow allows a read-only / "connect to browse" mode; if it
requires funding to see markets, go as deep as you can without depositing.
Also crawl the marketing site, any `/markets`, `/discover`, `/leaderboard`,
`/pro`, `/portfolio`, `/rewards`, or `/docs` paths that exist. If they have
a mobile-web version or PWA, capture that separately — we care about both.

The purpose: I run Sneakers Terminal (Bloomberg-style prediction-market
dashboard at sneakersterminal.com). I'm adding Opinion as a tradable venue
and need to decide two things from this recon:

1. **What data + affordances do I need to surface** on our market-detail
   pages to make "trade on Opinion" a useful destination (vs. "trade on
   Polymarket" or "trade on Kalshi" buttons we already have)?
2. **What UX patterns are worth lifting** from Opinion into our own
   dashboard (filters, category taxonomy, chart patterns, orderbook
   visualizations, resolution-status indicators, etc.)?

Quote exact labels, URLs, colors, and numeric values verbatim. If a fact
isn't observable, write "not observed" — don't guess. I'd rather have 4000
words of raw observations than a 500-word tidy summary.

Take screenshots of every surface mentioned below and include them inline
(or link them if your tool uploads them). Cropped screenshots are fine.

---

## PART 1 — Site map + page inventory

List every distinct URL / route you found, with:
- URL path (verbatim)
- Page name (verbatim from the `<title>` or H1)
- One-sentence description of what lives on it
- Auth requirement: public, wallet-connected, or KYC'd

Group into:
- **Marketing surfaces** (landing, about, why-Opinion, fees page)
- **App surfaces** (discover, market list, market detail, portfolio, etc.)
- **Account + wallet surfaces** (connect, deposit, withdraw, settings)
- **Docs / legal** (terms, privacy, docs, API)
- **Social / community** (blog, X links, Discord, Telegram)

For each app surface, note whether it's a server-rendered page or a
client-rendered SPA (Network → refresh: is the route returned as HTML with
content or as an empty shell + JSON fetch?). Call out the frontend stack
if fingerprintable (Next.js? Vite? Wagmi + RainbowKit?).

---

## PART 2 — Visual language

### 2.1 Brand palette

- Primary background color (hex).
- Primary text color (hex).
- Accent / CTA color (hex).
- "Yes" and "No" colors for outcome tokens (hex each).
- Chart line colors (list every distinct one you see).
- Link color, hover color, disabled color.
- Any dark-mode vs. light-mode toggle? Default mode on first load?

### 2.2 Typography

- Primary font family (what shows in DevTools computed styles for body).
- Monospace / tabular-nums font for numbers (if different).
- Font sizes used for: H1 market title, body text, small labels, numeric
  price cells, CTA button labels.
- Are prices displayed bold / semibold / tabular-nums?

### 2.3 Iconography + imagery

- Icon library used (Lucide? Heroicons? Custom SVGs?).
- Does every market have an image / hero artwork, or text-only?
- If image-per-market: where is the image sourced (IPFS? S3? dynamically
  generated?), and is the image URL exposed anywhere in the API
  response (`imageUrl`, `logoUri`, etc.)?
- Any animated elements (confetti on trade, price flash on update, etc.)?

### 2.4 Layout grammar

- Default page width / max container width.
- Left-nav vs. top-nav vs. bottom-tabbar.
- Sticky elements (header? trade panel? filter bar?).
- Mobile breakpoint behavior — what collapses, what becomes a drawer?

---

## PART 3 — Discover / market-list surface

This is the "browse all markets" page.

### 3.1 Top-level taxonomy

- Exact category labels shown in the top nav or filter chips (quote
  verbatim, in order).
- Are categories hierarchical (category → subcategory), or flat?
- Is there a "Trending / Hot / New / Ending Soon" set of tabs, and what
  are the exact labels?

### 3.2 Filters + sort

- Every available filter (status, category, volume min/max, date, chain,
  etc.) with exact labels + control type (dropdown, chips, slider).
- Every available sort (volume, 24h volume, liquidity, ending soonest,
  newest, biggest mover, etc.) with exact labels.
- Default sort on first load.

### 3.3 Market card anatomy

For the market card that shows in the list view, list every element
visible on a single card, top-to-bottom / left-to-right:
- Image / icon?
- Question text
- Category badge?
- Yes price / No price (as % or cents? how many digits of precision?)
- 24h change indicator (green/red, arrow icon?)
- Volume display (format: `$1.2M` vs `1,234,567` vs token amount?)
- Liquidity display
- Resolution / end-date countdown ("ends in 2d 14h" style?)
- Watchlist / bookmark affordance
- Share / copy-link affordance
- Any inline chart sparkline? If yes, what timeframe?

Include a screenshot of a single card cropped tight.

### 3.4 Pagination + infinite scroll

- Is it paginated (page numbers), "load more" button, or infinite scroll?
- How many markets per page / per initial load?

---

## PART 4 — Market detail page (the most important surface)

Open a specific market detail page. Pick one with both reasonable volume
and an active orderbook — note the URL + marketId you used.

### 4.1 Above-the-fold anatomy

Top-to-bottom, list every element:
- Breadcrumb / back button
- Market question H1
- Category / tag badges
- Resolution date + countdown
- Current prices (Yes/No) — format, size, prominence
- 24h change, 7d change
- Volume, liquidity, open interest, # holders
- Any "reliability" / resolution-source indicator?
- Trade panel position (right rail? modal? bottom drawer on mobile?)
- Social / share / watchlist buttons

Screenshot.

### 4.2 Price chart

- Default timeframe on load (5m / 1h / 1d / 1w / all)?
- All available timeframe options (exact labels).
- Chart type — line, candle, area?
- Does it show **both** Yes and No lines overlaid, or just Yes?
- Does it show crosshair hover with price + timestamp tooltip?
- Does it show volume bars underneath?
- Are trade markers / fills drawn on the chart?
- Library fingerprint if visible (TradingView Lightweight Charts?
  Recharts? d3? Custom canvas?).

Screenshot.

### 4.3 Orderbook display

- Is there a visible orderbook (bid/ask ladder), or only top-of-book?
- If ladder: how many levels deep by default? Collapsible?
- Columns shown (price / size / cumulative / my-orders?).
- Colors for bid side vs. ask side.
- Does it update in real-time? WebSocket push vs. polling interval.
  (Check DevTools → Network → WS.)
- Is there a depth chart visualization alongside the ladder?

Screenshot.

### 4.4 Recent trades / tape

- Is there a "Recent Trades" list?
- Columns (time / price / size / side).
- Is it filtered to just this market, or global?
- Does it update live?

### 4.5 Trade panel

- Tabs: Buy / Sell? Yes / No? Market / Limit / Stop?
- Input controls: dollar amount? share amount? price?
- Slippage / max-fee configuration.
- "Estimated payout" / "If Yes wins you get $X" calculator.
- Confirmation flow — inline vs. modal vs. wallet popup.
- Transaction signing UX (one sig? multi-step approve + execute?).
- Does it show fees estimated for the trade separately? What fee labels?

Screenshot of the trade panel in isolation.

### 4.6 Positions + holders

- Is "Top Holders" / "Top Traders" visible for each market?
- If yes: what columns, and does it link to wallet profiles?
- Is there an activity / comments / social layer on the market page?

### 4.7 Resolution + disputes

- What shows after a market resolves?
- Is the resolution source (oracle name, transaction link) visible?
- Is there a dispute UI?

---

## PART 5 — Portfolio / account surface

### 5.1 Portfolio page

- What columns show for a user's positions (market / side / size / avg
  cost / current price / P&L / realized / unrealized)?
- Does it show a portfolio equity curve / time-series chart?
- Does it surface open orders separately from positions?
- Trade history — how far back, exportable (CSV)?

### 5.2 Wallet + funding

- Accepted collateral tokens (list them, with chain each).
- Deposit flow steps.
- Withdrawal flow steps, including delays / limits.

### 5.3 Rewards / points

- Is there a points / season / rewards dashboard?
- Exact name of the program and the metrics tracked (volume, streak,
  referrals, predictions-won).
- Leaderboard — public? How does it rank users (volume? P&L? points?)?

---

## PART 6 — Trading microinteractions

- On price update, does the cell flash (green-up / red-down)? Duration?
- Loading states: skeleton screens, spinners, or optimistic rendering?
- Empty states (no markets found, no positions, no trades) — quote the
  copy verbatim.
- Error states — wallet rejected, insufficient balance, market closed.
  Quote the error messages.
- Toasts / notifications — how do they surface trade confirmations?

---

## PART 7 — Mobile experience

Open the same market detail URL on a narrow viewport (375×812 iPhone).

- Does the trade panel become a sticky bottom drawer?
- Does the chart shrink to height X?
- Does the orderbook collapse?
- Is there a separate mobile-only nav pattern (bottom tabbar)?
- Any mobile-specific features (biometric sign-in, push notifications
  setup)?

Screenshots at 375px wide for: discover, market detail, portfolio.

---

## PART 8 — Comparison matrix (Opinion vs Polymarket vs Kalshi)

Fill this table by doing the equivalent recon on polymarket.com/event/...
and kalshi.com/markets/... for a similar-shaped market. One row per
feature, one column per venue, Y/N or short value:

| Feature | Opinion | Polymarket | Kalshi |
|---|---|---|---|
| Yes/No price as % or ¢ | | | |
| Orderbook ladder visible | | | |
| Depth chart visualization | | | |
| Timeframe options on chart | | | |
| Chart shows both Yes and No | | | |
| Recent trades tape | | | |
| Top holders list | | | |
| Comments / social layer | | | |
| Resolution-source visible | | | |
| Real-time WS updates | | | |
| Slippage config | | | |
| Limit orders | | | |
| Portfolio equity curve | | | |
| Points / rewards program | | | |
| Mobile bottom-drawer trade | | | |
| Category nav chips | | | |
| Ending-soon filter | | | |

---

## PART 9 — Integration implications for Sneakers Terminal

Given what you observed, answer each of these in one short paragraph:

1. **What fields from Opinion should we show** on our market-detail page
   alongside Polymarket / Kalshi? (Do they expose anything we don't
   already fetch — liquidity depth, resolution source, volume tiers?)
2. **What UX patterns should we lift** into our own dashboard? Be
   specific — quote the component / interaction and explain what it
   does better than our current UI.
3. **What should we NOT copy** — patterns that feel wrong for a
   Bloomberg-style pro terminal (consumer-social affordances, gamified
   elements, emoji-heavy copy)?
4. **What's the right "Trade on Opinion" CTA** from our market-detail
   page — deep-link to their market-detail URL pattern? Embed an iframe?
   Popup wallet flow? Quote the exact URL pattern for their market pages
   so we can construct deep links.
5. **Any dark patterns / deceptive UX** worth flagging — misleading
   price displays, hidden fees, fake-urgency timers, etc.

---

## Output format

Reply in a single Markdown doc organized under the exact same headers
above (Parts 1-9, with subsections). Under each bullet, answer in 1-3
sentences or a data table. Inline screenshots where noted. Don't skip
bullets; write "not observed" if a surface doesn't exist.

Final section — "Executive take": three bullets max, arguing whether we
should (a) lift major UX patterns from Opinion, (b) lift nothing and just
link to them cleanly, or (c) treat their UX as a cautionary tale. Cite
specific observed patterns. Pick one.
