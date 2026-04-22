# Handoff — Markets UI (Dashboard + Trading Terminal)

Snapshot of what the late-night 2026-04-21 → 2026-04-22 session shipped, so the next Claude can start populating the **markets** side of the user dashboard and the trading terminal UI on the platform app.

## TL;DR

- **4 independent prediction/exchange books scraping live** → writing normalized JSONL rows to `apps/trader/data/<platform>/<date>.jsonl`.
- **Shared shape:** `MarketSnapshot` in `apps/trader/src/scrapers/types.ts`.
- **New `/venues` page** on the platform app at `apps/platform/src/app/venues/`, backed by a canonical venue catalog at `apps/platform/src/lib/venues.ts` and a `venue_access_requests` Supabase table for the "Request early access" CTA (migration 004, already applied).
- **Nothing on the platform app consumes the scraped JSONL yet.** That's your job — wire live prices into the dashboard + a trading-terminal market view.
- Work is on branch `feat/arb-scraper-mvp`. Main domain is probably still pointing at `feat/platform-scaffold`; coordinate the merge before you ship user-facing stuff.

## What's on disk (the data you'll render)

```
apps/trader/data/
  polymarket/2026-04-22.jsonl   # ~2,700 markets (sports + crypto + politics + elections)
  kalshi/2026-04-22.jsonl       # ~1,450 markets (10 categories hand-picked)
  novig/2026-04-22.jsonl        # ~1,500 markets (NBA/NFL/MLB/NHL/NCAAB/NCAAF/WNBA)
  prophetx/2026-04-22.jsonl     # ~50 markets (basketball/baseball/hockey/football game-level)
```

Each line is a `MarketSnapshot` JSON object. Re-running a scraper **appends**, so the files grow over time — already useful for drift analysis if you group by `platform_market_id` + sort by `ts`.

### MarketSnapshot shape (the only contract you need)

```ts
{
  platform: "polymarket" | "kalshi" | "novig" | "prophetx",
  platform_market_id: string,
  question: string,               // human-readable market title
  tags: string[],
  sport?: string,                 // basketball | baseball | ice_hockey | football | soccer | crypto | politics | ...
  outcomes: {
    name: string,                 // e.g., "OKC", "Over 9.5", "Nikola Jokic"
    best_bid: number | null,      // 0.0–1.0 probability
    best_ask: number | null,      // 0.0–1.0 probability
    last_price: number | null,
  }[],
  overround: number | null,       // sum of best_asks; 1.00 = zero vig, >1 = spread baked in
  volume_traded: number | null,   // platform-native units (dollars or contracts)
  liquidity: number | null,
  starts_at?: string,
  locks_at?: string,
  resolves_at?: string,
  phase: "opening" | "pre_game" | "live" | "closed",
  ts: string,                     // scrape timestamp
}
```

Prices are already **unit-normalized to probability space (0.0–1.0)** regardless of whether the source used American odds (ProphetX) or probability-native (Kalshi, NoVig, Polymarket). You render these directly as percentages.

## Running a fresh scrape

From `apps/trader/`:

```bash
pnpm scrape:polymarket              # public API, no auth
pnpm scrape:kalshi                  # public API, no auth
pnpm scrape:novig                   # needs NOVIG_BEARER_TOKEN in apps/trader/.env
pnpm scrape:prophetx                # needs PROPHETX_BEARER_TOKEN in apps/trader/.env
pnpm rank:overround -- --limit=25   # top arb candidates across all loaded JSONL
pnpm match:futures                  # futures-only cross-book matcher
```

Tokens are in `apps/trader/.env` (gitignored). Rotate via `pnpm token:set -- <platform> "eyJ..."`. ProphetX JWTs expire fast; NoVig's last ~30 days. Scrapers surface a clear error when the token is dead — they don't silently fail.

There is **no continuous loop yet**; scrapers are one-shot. If you want fresh data every minute you need to add a cron/loop wrapper or wait for Timescale.

## The venue catalog (your source of truth for UI rendering)

`apps/platform/src/lib/venues.ts` — 37 venues with:

```ts
{
  id: string,
  name: string,
  category: 'prediction_market' | 'sportsbook' | 'dfs_pickem' | 'sweeps_social',
  status: 'live' | 'coming_soon' | 'requested_frequently',
  blurb: string,
  affiliateUrl?: string,
  wrapperOf?: string,  // e.g., 'kalshi' — see "Wrapper venues" below
}
```

### Wrapper venues — critical product decision

**Coinbase Predict, Sleeper Markets, and Robinhood event contracts all display Kalshi's prices verbatim.** Confirmed by DevTools capture: Coinbase productIds literally end in `-KALSHI`, contract-terms URLs point at Kalshi's S3 bucket, prices match to the cent.

The product call (made 2026-04-22, locked in): **surface wrapper venues in the UI as distinct trade destinations with their own affiliate links, even though the arb scanner treats them as one price.** A user trading on Kalshi-proper, Coinbase Predict, Sleeper, or Robinhood sees the same price everywhere — we let them click through to wherever they already have an account, and collect affiliate revenue.

**What this means for you:**
- When rendering markets in the dashboard/terminal, a **Kalshi market** should show buttons for **all four** venues (Kalshi, Coinbase, Sleeper, Robinhood) as trade options.
- The **arb scanner view must NOT** create fake cross-book arbs from identical wrapper prices — treat wrapper venues as a single price point for arb math.
- Memory file with full rationale: `~/.claude/projects/-Users-jeremyalbus/memory/project_wrapper_venues_as_trade_destinations.md`

## What's already shipped (don't duplicate)

1. **`/venues` page** — full catalog with status badges and email-capture form. `apps/platform/src/app/venues/page.tsx` + `venue-card.tsx`. Live venues get "Trade on X →" affiliate buttons; coming-soon venues get "Request early access" email capture.
2. **`/api/venues/access-request`** — POST endpoint, email + venueId, upserts into `venue_access_requests` with `onConflict: 'email,venue_id'`.
3. **Migration 004** applied to Supabase (table exists, no rows yet until real traffic hits /venues).

## What the dashboard + trading terminal need next

### 1. Live market data reaching the UI

Right now JSONL sits on disk. The platform app needs a way to read it. Options in increasing complexity:

- **Quick (tonight/tomorrow):** an API route in `apps/platform/src/app/api/markets/` that reads today's JSONL files from `apps/trader/data/` via filesystem (both apps are in the same monorepo; resolve path via `process.cwd()` + relative walk). Returns `MarketSnapshot[]`. Filters by platform / sport / search term.
- **Right (this week):** stand up Timescale per `~/Downloads/CLAUDE_CODE_BRIEF_timescaledb.md`, point scrapers at it, query from the platform app via Supabase-like connection. Trader app stays in-repo; Timescale runs locally on Albus.

The `MarketSnapshot` shape is the same whether you read JSONL or Timescale — don't couple UI code to the storage layer.

### 2. Market-display cards

A card per market showing:
- The market question/title
- Each outcome with best_ask as a percentage
- Best overround on any single platform (signal of spread width)
- Venue buttons for all platforms that carry this market (including wrappers)
- Overall `phase` badge (live / pre-game / etc.)

Pattern to follow: the existing `apps/platform/src/app/venues/venue-card.tsx` for terminal-green + stone-black aesthetic.

### 3. Cross-book price-compare view

The core product pitch. For a market that exists on multiple platforms, show the price side-by-side across every venue. This is where the user sees "NoVig has OKC at 0.48, Kalshi at 0.52" and clicks through via affiliate.

**Matching logic does not exist yet for game-level markets.** The futures matcher (`apps/trader/src/scanner/match-futures.ts`) handles Championship / MVP / ROTY by regex-classifying the question + extracting subject. A game-level matcher keyed on `{sport, home_team, away_team, scheduled_start, market_type, line}` is the missing piece. Worth building in `apps/trader/src/scanner/match-games.ts` — then the API route returns `{ market, venues: [{platform, best_ask, affiliate_url}] }`.

### 4. Speed Scan (user's explicit request)

Input box: user types "Cade Cunningham" → fuzzy search across every market's `question` + `outcomes[].name` → returns every active market that mentions him, grouped by player-prop type. Cheap: a single loop over loaded snapshots.

### 5. Ranked arb/opportunities widget

`apps/trader/src/scanner/rank.ts` already computes this with a proper liquidity gate (min volume, two-sided quotes, ≤15pp per-side spread). The platform app should call it (or reimplement the same gate) and display the top N as a live "opportunities" strip.

## What's deliberately NOT done (don't accidentally rebuild)

- **No continuous scraping loop** — scrapers are one-shot CLIs. Don't wire the UI to expect sub-minute freshness; build to the JSONL's actual cadence (manually re-run every N minutes for now).
- **No Timescale** — JSONL is the primary store. See `project_sneakers_oddsjam_superset.md` and `project_arb_scanner_design.md` memories for the Timescale plan.
- **No verified arbs yet** — the scanner surfaces *candidates* by overround width. No one has hand-verified an actual executable arb yet. Don't ship "ARB FOUND" copy until you confirm with real prices.
- **No logos for most venues** — only DK/FanDuel/NoVig/DK Predictions logos are in `apps/platform/public/SneakersLogos/partners/`. The other ~34 are pending. Cards degrade gracefully when `venue.logo` is undefined.

## Critical things to know before touching code

- **Branch situation:** session work is on `feat/arb-scraper-mvp`. Main production domain tracks `feat/platform-scaffold` or `main`. The `/venues` page will not be live at `sneakersterminal.com` until merged. Check Vercel branch config before promising "it's live."
- **Next.js version has breaking changes** per `apps/platform/AGENTS.md` — read `node_modules/next/dist/docs/` before writing Next-specific code. Everything in `/venues/` already built against this version, mirror those patterns.
- **Git remote keeps switching branches on this machine** — the user pushes from multiple machines. `git fetch` + `git status` before trusting what's on disk.
- **Supabase service role key was pasted in chat during earlier session** — on the roadmap to rotate. Don't worsen it; use existing `getServerClient()` everywhere.

## File inventory from this session

```
apps/trader/src/scrapers/
  types.ts                       # MarketSnapshot + computeOverround
  token-set.ts                   # upserts <PLATFORM>_BEARER_TOKEN in .env
  utils/american-odds.ts         # for future sportsbook scrapers
  polymarket/scrape.ts           # public API, sports + crypto + politics
  kalshi/scrape.ts               # public API, 10 categories
  novig/scrape.ts                # Auth0 JWT + GraphQL + REST orderbook
  prophetx/scrape.ts             # Bearer JWT + /v2/events/{id}/markets
  README.md                      # scraper conventions + token rotation

apps/trader/src/scanner/
  rank.ts                        # overround ranker w/ liquidity gate
  match-futures.ts               # cross-book futures matcher

apps/platform/src/lib/venues.ts  # 37-venue catalog
apps/platform/src/app/venues/    # /venues page + card + API
apps/platform/supabase/migrations/004_venue_access_requests.sql

docs/PLATFORM_ENDPOINTS.md       # cURL capture checklist (remaining 4 platforms)
docs/prompts/prophetx-api-capture.md
docs/prompts/novig-api-capture.md
docs/prompts/coinbase-predict-api-capture.md   # (verdict: wrapper, no scraper needed)
docs/prompts/betr-api-capture.md              # (needs mobile capture via mitmproxy)
docs/HANDOFF_MARKETS_DASHBOARD.md             # this file
```

## Suggested first move for the other Claude

Build a `/markets` or `/dashboard/markets` page that:
1. Reads the most recent `MarketSnapshot[]` from all four JSONL files via a server component (use `fs.readFileSync` + split on newlines + parse — no need for a DB yet).
2. Renders a filterable grid: search box, sport filter, platform filter.
3. Each card shows the market question, outcome prices as percentages, and a "Trade on" row that fans to every venue the catalog says hosts this market (including Kalshi wrappers).
4. Ships behind the existing auth gate so only signed-in users see it.

That gives the user something tangible to click in the morning. The cross-book matcher, the live feed, the arb alerting — all layer on top of this foundation.
