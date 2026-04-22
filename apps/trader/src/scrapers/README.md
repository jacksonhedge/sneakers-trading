# Scrapers

Each platform gets its own directory with a `scrape.ts` that emits `MarketSnapshot` rows (see `types.ts`) to `apps/trader/data/<platform>/<YYYY-MM-DD>.jsonl`.

## Running a scraper

```bash
pnpm scrape:polymarket              # public API, no auth
pnpm scrape:kalshi                  # public API, no auth (covers Sleeper, Robinhood, Coinbase Predict)
pnpm scrape:prophetx                # needs PROPHETX_BEARER_TOKEN in .env
```

The JSONL appends — re-running adds new rows with fresh timestamps. That's intentional so we can do time-series drift analysis later.

## Auth tokens (ProphetX, eventually NoVig/DK/etc.)

Tokens live in `apps/trader/.env` (gitignored). Shape:

```
PROPHETX_BEARER_TOKEN=eyJ...
NOVIG_BEARER_TOKEN=eyJ...
DRAFTKINGS_BEARER_TOKEN=...
```

### Rotating a token

When a scraper starts returning `401` / `403`, the JWT has expired. Grab a fresh one from the logged-in browser:

1. Open the platform (e.g., `www.prophetx.co`) in Chrome
2. `Cmd+Option+I` → Network tab → Fetch/XHR filter → `Cmd+R` to reload
3. Click any JSON request → Headers tab → Request Headers → copy the full string after `authorization: Bearer `
4. Update `.env`:

```bash
pnpm token:set -- --platform=prophetx --token="eyJ...new-token..."
```

Or positionally:

```bash
pnpm token:set -- prophetx "eyJ..."
```

The helper upserts the right env key (`<PLATFORM>_BEARER_TOKEN`), preserving other vars in the file.

### How long tokens last

- **ProphetX:** JWT with `exp` baked in. In practice lasts at least a day with light use, likely longer if you keep the browser session alive (the app refreshes in the background).
- **Other SPAs:** same pattern — check the JWT's `exp` claim at [jwt.io](https://jwt.io) if curious, but easier to just refresh when scrapers 401.

## Output shape (shared)

See `types.ts` for the full `MarketSnapshot` type. Every scraper emits the same shape:

```ts
{
  platform: "prophetx" | "kalshi" | "polymarket" | ...,
  platform_market_id: string,
  question: string,
  tags: string[],
  sport?: string,
  outcomes: { name, best_bid, best_ask, last_price }[],
  overround: number | null,        // sum of best asks; 1.00 = no vig
  volume_traded: number | null,
  liquidity: number | null,
  starts_at?: string,
  locks_at?: string,
  resolves_at?: string,
  phase: "opening" | "pre_game" | "live" | "closed",
  ts: string                       // scrape timestamp
}
```

Downstream consumers:

- `scanner/rank.ts` — overround ranker with liquidity gate (two-sided, ≤15pp per-side spread, ≥\$500 volume default). Run via `pnpm rank:overround`.
- `scanner/match-futures.ts` — cross-book futures matcher (MVP / ROTY / Championship / Conference Finals). Run via `pnpm match:futures`.

## Adding a new platform

1. Capture cURL per `docs/PLATFORM_ENDPOINTS.md`.
2. Copy `prophetx/scrape.ts` as the template (token-gated direct HTTP) or `polymarket/scrape.ts` (public API).
3. Transform the platform's response into `MarketSnapshot[]`. Reuse `utils/american-odds.ts` if odds are in American format.
4. Add `scrape:<platform>` to `package.json`.
5. Run it once, inspect the JSONL, confirm `rank:overround` picks it up across all loaded platforms.
