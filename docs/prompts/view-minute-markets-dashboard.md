# Chrome prompt — view /dashboard/minute and report what's there

The minute markets dashboard just shipped at `http://localhost:3000/dashboard/minute`. It pulls live cross-platform strike ladders from Limitless + OG + Polymarket and renders them with a Δ5m movement column. A background scraper loop is hitting those APIs every ~75s so movement data populates over time.

This prompt navigates to the page, signs in via dev escape hatch if needed, and reports what's actually rendering. Useful for verifying the build matches expectations + flagging anything weird.

---

Task: open the Sneakers Terminal Minute Markets dashboard at `http://localhost:3000/dashboard/minute`, sign in if necessary, and report a structured summary of what's visible.

Prerequisites: dev server running on `localhost:3000` (Next.js 16). User confirms it is.

Run each step, end with the structured report described at the bottom.

---

## Step 1 — Navigate

1. Open `http://localhost:3000/dashboard/minute` in a fresh tab.
2. **Possible outcomes:**
   - **(a) Already signed in** — page loads, header reads `MINUTE MARKETS` in green monospace. Skip to Step 3.
   - **(b) Redirected to `/login`** — go to Step 2.
   - **(c) 500 error or other** — screenshot and STOP, report the error.

## Step 2 — Sign in via dev mode link

1. On `/login`, type any email (e.g. `chrome-test@example.com`) into the email field. Click submit.
2. Look for an **amber "DEV MODE LINK"** box that appears below the success message. It contains a clickable URL starting with `https://*.supabase.co/auth/v1/verify?...`.
3. **If the amber box is present**: click that link. You'll redirect through `/auth/callback` and land on a dashboard route. Then manually navigate back to `http://localhost:3000/dashboard/minute`.
4. **If the amber box is NOT present**: that means `AUTH_DEV_RETURN_LINK=1` isn't set in `.env.local` and the user is using real email magic links instead. STOP and tell the user to either (a) check their email inbox for the magic link or (b) add `AUTH_DEV_RETURN_LINK=1` to `apps/platform/.env.local` and restart the dev server.

## Step 3 — Verify the header chrome

Once on `/dashboard/minute`, the sticky header at the top should contain:

- Title `MINUTE MARKETS` in emerald monospace, with a `← dashboard` link on its right.
- Top-right: `last scrape: <Ns ago>` and `auto-refresh: 15s`. The `last scrape` should read **30s or less** ago (the scraper loop runs every ~75s, so latest scrape is recent).
- A row of window-filter buttons: `5m | 15m | 30m | 60m | 2h | 4h`. Default selected is `60m` (highlighted emerald).
- A row of asset-filter buttons: `all | BTC | ETH | SOL | XRP | DOGE | ...`. Default is `all`.
- A summary line: `N markets · M groups · 5m: X · 15m: Y · 30m: Z · 60m: W`.

**Note** the values for: `last scrape`, `total markets`, `total groups`, and the bucket counts. Include in the final report.

## Step 4 — Verify a group card

Below the header, a stack of cards should appear, sorted by minutes-to-resolve (soonest first).

For the **first card**, capture:
- The asset name (e.g. `BTC`, `ETH`, `XRP`)
- "resolves in" duration (e.g. `2.5m`, `45m`)
- Resolution time in UTC HH:MM
- The list of platform pills with colored dots (limitless = magenta, og = amber, kalshi = cyan, polymarket = violet)
- Strike count

The card body should be a 6-column table:
- `platform | strike | dir | yes | Δ5m | vol`

For the first **3 rows of that table**, capture:
- platform
- strike (e.g. `$78,499`)
- direction (`above` / `below`)
- yes price (e.g. `0.965`)
- **Δ5m** column — this is the critical one. It will read `—` if there are not yet 2 samples in the 7-min window. After the scraper has run 2+ times against this market, it should show e.g. `+0.45pp` (green) or `-1.20pp` (red).
- volume

## Step 5 — Verify auto-refresh

1. Scroll back to the top so `last scrape: Ns ago` is visible. Note the value.
2. Wait ~20 seconds (count to 20, don't sleep — just watch the page).
3. Page should auto-refresh once during that window (meta tag at content=15s).
4. After refresh, `last scrape` should be a **smaller** number than before (e.g. went from `45s ago` → `5s ago`) — confirming both that the page refreshed AND that the scraper loop is producing fresh data.

If the page never auto-refreshes during a 20s wait, that's a FAIL — flag it.

## Step 6 — Test a filter

1. Click the `BTC` button in the asset row.
2. URL should update to `/dashboard/minute?asset=BTC`.
3. The market list should narrow to BTC-only groups. The header summary line's "N markets" count should drop.
4. Click `all` to clear the filter. List expands back.

## Step 7 — Browser console check

Throughout all steps:
- Browser devtools → Console: any red errors? Any unhandled promise rejections?
- Network tab: any 500s? Any 4xx other than 304 (cache OK)?

Note anything that appears.

---

## Final structured report

Return as:

```
## Header
- last scrape: <value>
- total markets: <value>
- total groups: <value>
- bucket counts: 5m=<>, 15m=<>, 30m=<>, 60m=<>

## First group card
- asset: <>
- resolves in: <>
- resolution time UTC: <>
- platforms: <>
- strike count: <>

## First 3 rows of that card's strike ladder
| platform | strike | dir | yes | Δ5m | vol |
| ...      | ...    | ... | ... | ... | ... |

## Δ5m column
- How many of the visible rows have a non-"—" Δ5m value?
- Any obvious outliers (very large +/- moves)?

## Filters
- BTC filter narrowed correctly: yes / no
- "all" cleared correctly: yes / no

## Auto-refresh
- Did the page reload during the 20s wait? yes / no
- Did `last scrape` decrease? yes / no

## Console / network
- Any red console errors?
- Any 5xx responses?

## Anything weird
- (free-text — anything that didn't look right)
```

---

## Boundaries

- Do NOT click platform dots/links that look like they'd take you off `localhost:3000` or trigger a real wallet sign-in. We are NOT testing trade execution yet.
- If you hit `localhost:3001` or any port other than `3000`, that's a different dev server instance — STOP and tell the user.
- If the page shows "no minute markets in window", that's a legitimate state if the scrape data is too stale OR the markets all resolved already. Try `?within=120` first; if still empty, report and STOP — the scraper loop may have crashed.
- Auth flow: do not test sign-out / sign-in cycles or the org wizard from this prompt. Other prompts cover that.
