# Changelog

All notable changes to Sneakers Terminal. Newest at top.

Format: each entry starts with the date and the commit short-sha for traceability.
Group by feature area. Keep entries scannable — terse bullets, not prose.

---

## 2026-05-02 — Bettor-journey verifier fixes

### Footer + market-detail polish bundle — pending commit
- **Footer**: social icons (X / Instagram / TikTok / Discord) used to ship with `href="#"` and a TODO comment. Switched to data-driven render — only links with a non-empty `href` are emitted, so the entire row hides until real handles are pasted in. No dead `#` clicks for cold visitors.
- **Market-detail spread table dedupe**: the cross-venue "Spread" panel was rendering `bookRowsWithCum.concat(bookRowsWithCum).concat(bookRowsWithCum)` — literally tripling each row to fake depth. Bettor-walk verifier saw 3 identical 44¢/POLYMARKET/2.5M rows. Now renders the real rows only; if there's only one cross-venue quote, you see one row, not three. Also gives each row a stable `r.platform` key (was `i`).
- **Market-detail timeframe pills (lower strip)**: removed the second "All / 1m / 1h / 1d / 📅" pill row at the bottom of the chart. The upper `<TimeframeTabs />` (5m / 1h / D / 1w) is the working selector — it pushes `?tf=` and the page consumes it via `loadMarketHistory(windowDays)`. The lower buttons had no onClick, no state, and confused users into thinking the timeframe was broken. Also dropped the decorative time/log/auto strip on the right side (UTC+1 hardcode + inert buttons).
- **Market-detail FreshnessIndicator threshold**: was using the default 5-minute "LAGGING" cutoff, which fired on first open for any market scraped less than every 5 min (i.e. most of them). Bumped to 15 min via `staleAfterSec={900}` and switched to compact mode. Now reads LIVE on normal scrape cadences and only flips amber when the feed is genuinely stale.

### /venues page — drop fake price box + soften affiliate copy — pending commit
- `VenueCard` removed the permanent "BEST PRICE — updating —" placeholder. Bettor-walk verifier flagged it as vaporware to cold visitors: every card showed the same dead text, never resolved. Authed `/dashboard/markets` already surfaces real prices, so the public marketing/discovery page no longer pretends to.
- `/venues` intro copy softened: was "Click any live venue to trade directly through our affiliate link." Now: "Click a live venue to head straight there — some links carry a Sneakers affiliate code so we earn a small share when you sign up." Reason: only ~half of live venues currently have an affiliate code attached; the old copy over-promised on every link.

### /admin/users gains LAST LOGIN column + sort — pending commit
- Server fetches `auth.users` once (one page, perPage=200) and merges `last_sign_in_at` into each waitlist row by email.
- New table column "LAST LOGIN" — shows the timestamp, "never" for users with auth rows but no sign-ins, "—" for waitlist-only (no auth.users row yet).
- New SORT chip row: NEWEST / OLDEST / LAST LOGIN. last_login is a JS-side post-merge sort with nulls (never-signed-in) sinking to the bottom.
- buildUrl preserves the sort param across other filter changes.
- "Clear" link now resets sort to default (newest) along with everything else.

### Admin user-detail: credit + tier adjusters — `0c8153a`

Adds two new operator surfaces on `/admin/users/<id>`:

- **CREDIT ADJUSTER** — shows current O'Toole credit balance + a delta input + reason field. Positive delta credits the user; negative delta debits. Hard cap of ±1,000,000 per single adjustment to prevent typo blowups. Reason is required (audit trail). Inserts a single `credit_transactions` row with `kind='admin_grant'` (delta sign reflects intent). Two-step inline confirm — first click arms with the post-adjustment balance preview, second click commits.

- **TIER ADJUSTER** — chip-style picker (Free / Pro / Elite / Business) + reason field. Updates `waitlist.plan_tier` directly. Helper note clarifies that Stripe webhook will overwrite this on next subscription event, so admin overrides are temporary unless paired with a Stripe action.

Both actions audit-logged via `logAdminAction` (`adjust_credits` / `set_user_tier` action types) with full delta + before/after values + reason in metadata. Audit page + per-user activity feed show the new pills (violet for credits, sky for tier).

User-side visibility: when an admin changes the tier, the user's `/dashboard/profile` and `/dashboard/billing` pages already read from `waitlist.plan_tier` so the new tier shows on next page load. Same for credit balance — `/dashboard/billing/credits` already reads `credit_transactions` so adjustments are visible immediately. No new user-facing surface needed.

### O'Toole anti-hallucination + tier honesty + Stripe button — `f96782c`

The bettor-walk verifier caught three trust-killer bugs. All fixed:

- **O'Toole hallucinated alert creation** — said "✓ Done! Your alert is live" without calling create_alert_rule. Trust-destroying lie. Persona now has a hard CRITICAL section: never claim "Done / Created / Set up / Live" unless a write tool actually called this turn returned ok=true. If the user describes an alert and the model can't or won't call the tool, it must say "Drafted, not created" and offer the path forward (call the tool now if confirmed, or direct to /dashboard/alerts/new).
- **O'Toole told a Free user they're on Business** — `resolveTier` returned 'business' for any admin email, ignoring actual `plan_tier`. Now split: `resolveCapTier` (admin-bumped, used for cap enforcement) vs `resolveDisplayTier` (real plan from `waitlist.plan_tier`, used in the User context block O'Toole reads). Persona also gains explicit "never invent the user's tier — only quote what the User context block lists" rule.
- **/api/stripe/checkout silent 500** — STRIPE env vars on prod are all empty strings (not yet pasted). Button result: silent failure. Fixed the user-facing copy to a friendlier "Checkout for X isn't available right now. Try again later" instead of dumping operator-facing env-var instructions. Server logs the missing-env diagnostic for ops. The actual Stripe configuration still needs real keys — separate operator task; see CHANGELOG note below.

The Stripe env var task: every `NEXT_PUBLIC_STRIPE_PRICE_*` and `STRIPE_SECRET_KEY` is currently `""` on prod. They need real Stripe Dashboard values pasted in via `npx vercel env add KEY production` followed by a redeploy. The button polish above just makes the failure mode honest until that's done.

## 2026-05-01 — Trading-terminal audit + polish round

### Wallet balance always visible in topbar — `b798e2e`
- `WalletButton` now fetches `/api/balance` on mount and every 60s (paused when tab hidden), then renders the aggregated USD total directly in the navbar pill. Always shows a number — `$0.00` when no venues are connected — so users have a constant balance reference instead of an empty button.
- Popover updated to show per-venue breakdown (was Polymarket-only previously) with green for healthy, amber for unavailable, plain text for unconnected.
- Connect-action link redirected from `/dashboard/settings/autotrade` (Polymarket-only flow) to `/dashboard/connections` (multi-venue grid). Old `/api/autotrade/balance` Polymarket endpoint no longer used by the topbar.

### Mobile-friendly O'Toole popup — pending commit
- `OToolePanel` (the 380px left sidebar) now hides below the md breakpoint (768px). On phones it crushed the layout.
- New `OTooleMobileFAB` component renders a floating action button bottom-right on mobile only. Tap → full-screen overlay containing the same OToolePanel content. Body scroll locks while overlay is open; ESC and × button close it.
- Renders into `DashboardShell` so every authed dashboard route gets the mobile popup. The collapsed-sidebar variant of OToolePanel also gates on `md:flex` so mobile never sees the vertical handle either.

### Wallet/balance/O'Toole verifier fixes — full sweep — `e71e95c`

All 5 verifier findings shipped (initially batched as #1+#2 in `a3560ab`; this commit closes #3+#4+#5):

- **#1 (security/UX) — credentials saved before verify** *FIXED*. `/api/autotrade/credentials` POST used to call `storeUserCredentials` first, then `testConnection` against the just-saved row. Verify failures left orphan rows that showed up in `/api/balance` as permanent error states. Restructured to verify FIRST against the in-memory bundle; persist only on success and return 400 + an honest "Couldn't verify... nothing was saved" message on failure. Wizard UI updated to match (defensive "Saved, but..." copy replaced with "Couldn't verify"). Out-of-band: deleted the two fake credential rows the verifier left behind on `jacksonfitzgerald25@gmail.com` for polymarket + kalshi.
- **#2 — BalanceCard missing empty state** *FIXED*. With `byVenue: []` (user has no credentials yet) the card returned `null` and was invisible. Now renders an explicit no-credentials card with copy + a "CONNECT A VENUE" CTA pointing at `/dashboard/connections`. Discoverability for a user who's never wired a venue.
- **#3 — Topbar venue checkmarks ignore credential health** *FIXED*. `getChromeData` in `dashboard/layout.tsx` now filters `configuredVenueIds` to only venues where `test_connection_ok = true`. Erroring or unverified credentials no longer get the green check in the topbar `AppsBar`.
- **#4 — O'Toole context missing venue/credential awareness** *FIXED*. Added a credential-status block to `formatUserContext` in the chat route: lists each connected venue + its verified/erroring/unverified state. Live balance numbers intentionally NOT included (per-venue API calls would add 1-3s per chat message); persona instructions tell O'Toole to direct users to the dashboard BalanceCard for actual numbers, never to fabricate.
- **#5 — Connections card state out of sync with stored credentials** *FIXED*. `ConnectionsGrid` now receives `credentialedVenueIds` + `erroringVenueIds` from `connections/page.tsx` (queried from `user_venue_credentials`). Cards with credentials show MANAGE (working) or RECONNECT (erroring, amber-styled) instead of always reading CONNECT. Health-aware UX.

### Hydration-stable chart IDs (root cause of dead row-clicks) — `f51c551`
- `RobinhoodChart` and `RobinhoodSparkline` were generating SVG gradient + clip-path IDs via `Math.random()` in `useState` / `useMemo`. Server and client first renders produced different values → React error #418 (text mismatch) → the chart component failed to hydrate → the parent `<Link>` wrapper's click handler never attached → BiggestVolume row clicks didn't navigate. The Chrome verifier hit this exactly: "Clicking the BiggestVolume row link didn't navigate". Switched both ID sources to `useId()` which is hydration-stable. Earlier verify pass that reported "no #418" was a false negative — the error fires intermittently depending on RNG collision; this removes the source entirely.
- Multi-venue parallel-bundle work was committed in `300da0a` (autotrade kalshi/opinion adapters, balance card, Supabase-backed connections, migrations 034/035/036). Migrations applied to prod.

### Market detail chrome consistency + Yes-flip + seed-prefix + hydration — `593d438`
- Market detail topbar (`MarketTopbar`) rebranded: dropped "O'Toole TERMINAL" wordmark + per-page Light/Dark theme toggle. Now uses the same Sneakers logo lockup as `DashboardTopbarV2`, so jumping from `/dashboard` → market detail no longer feels like a different product.
- BiggestVolume "YES" column was showing the *highest-priced* outcome (so when NO was favored, "YES 58%" was a lie). Now finds the literal YES leg explicitly. Resolves the price-flip bug between dashboard list and market detail.
- Seed-data `platform_market_id` values renamed to drop the `seed-` prefix (`/dashboard/markets/polymarket/poly-btc100k` instead of `/dashboard/markets/polymarket/seed-poly-btc100k`). Slugs are now production-clean.
- React hydration error #418 fixed: `FreshnessIndicator`'s tooltip used `toLocaleString()` at render time, which varies between server locale and browser locale → text mismatch on hydration. Tooltip now resolves client-only after mount.
- Market detail freshness pill: only renders when `latestTs` is supplied (was showing permanent "LOADING" if undefined).

### Authed-side audit fixes — `c7bffdc`
- `/dashboard/leaderboard` now renders (was 404 even though landing page promotes it). Lists verified joiners ordered by created_at; RETURN column placeholder until trade execution lands. CTA to `/join` for users not on the board.
- Topbar persistent "LOADING" badge → hidden when `latestTs` is undefined. Was rendering as a permanent amber pulse because the dashboard layout never passed a freshness timestamp to the topbar.
- BiggestVolume sparklines: em-dash fallback replaced with a flat 2-point line at the current YES price (40% opacity), so the column reads visually consistent across all rows even when seed data has no historical snapshots.
- `/onboarding/*` stepper was stuck at "STEP 1 OF 6" on every step because the layout was reading unreliable Vercel headers (`x-invoke-path`). Now reads `x-pathname` (set by proxy on every request). Also resolves the lingering "SKIP FOR NOW" link on `/onboarding/done` — the existing guard now triggers correctly because `currentSlug` is detected.

### Vocab leak sweep across authed surfaces — `9b811b7`
- `/dashboard/connections`: "scraping" → "streaming live prices"; "(once Execution lands)" → "(when trading is live)"
- `/dashboard` PerformanceChart footer: "stub · pending JSONL rollup" → "Synthesized from current avg-prob — full historical curves coming soon"
- `/dashboard` MyPositions empty state: roadmap-excuse copy → user-CTA copy
- `/dashboard/settings/autotrade`: dropped "Kill-switch endpoint", "POST", "Background worker", "rules engine" — replaced with user-speak
- `/dashboard/settings/otoole`: removed `PLAN_OTOOLE.md` link + "Track progress in PLAN_OTOOLE Level 2" (literal internal spec doc references in UI)
- `/dashboard/alerts/settings`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `v1` references → user-friendly copy
- `/dashboard/settings/api-keys`: "stored encrypted in our database" → "encrypted at rest"

### Public-side audit findings — `d026c33`
- `/students` + `/college`: "Referred by operator KZSB7Z" → "Referred by KZSB7Z" (dropped internal "operator" vocab)
- `/pricing` Enterprise + dashboard sales form: "dedicated infra" → "private deployment" / "private hosting"
- `/hardware` topbar: removed `CONNECT WALLET` for un-authed marketing visitors (was wrong-context CTA)
- `dashboard/layout.tsx` + `dashboard/strategies/page.tsx`: dropped `?error=no_waitlist_row` from redirect URL (was leaking internal DB vocab to visitors)

### Category cards layout fix — `102b54c`
- 4-up dashboard category cards (Politics/Economics/Crypto/Sports) restructured from 4-horizontal-quadrant to vertical-stack
- Eliminated overlapping "PolitAvgProb" text + 3-line "1\nactive\nmarkets" wrap at typical desktop widths
- Headline number is now Avg Prob; volume + active count condensed below

### Migration 031 applied to prod — out-of-band
- `waitlist.avatar_emoji` + `avatar_color` columns added with deterministic-from-id backfill
- Was missing on prod, causing every authed `/dashboard/*` load to bounce to `/signup?error=no_waitlist_row`
- Affected ALL users, not just specific accounts

### Admin Tier A polish — `509debf`
- `createFlagAction` (new, errors on duplicate) split from `setFlagAction` (upsert, used by toggle)
- Duplicate-key CREATE on `/admin/flags` now shows red "X already exists" pill instead of silently overwriting

### Tier A verify-pass fixes — `229368f`
- `UserActionPanel`: lift result banner out of the WAITLIST/INVITED conditional so it survives the post-grant status flip
- `/admin/users?status=waitlist`: filter now requires `invite_used_at IS NULL` too (was leaking AUTHED open-signup rows into waitlist view)
- `/admin/announcements`: "Everyone on waitlist" → "Everyone — waitlist + invited + authed (capped at 500)" + tightened the waitlist-only group query
- `/admin/flags`: NewFlagForm result pill auto-clears after 6s (success) / persists (error)

### Admin Tier A — full bundle — `c309446`, `ac49e86`, `a4c06eb`
- **Audit log**: migration 032 (`admin_audit_events`) + `lib/admin-audit.ts` → `logAdminAction()` helper
  - Wired into all admin write actions: grant_access, issue_invite, reissue_invite, revoke_invite, cleanup_stress_emails, set_feature_flag, create_feature_flag
  - `/admin/audit` page (filterable feed)
  - "ADMIN ACTIVITY" section per `/users/<id>`
- **Per-user click_events timeline** on `/users/<id>`
- **Richer user search**: filter chips for tier + type, country input, expanded text search to include company_name
- **Writable feature flags**: migration 033 (`feature_flags`) + `lib/feature-flags.ts` → `getFlag()` + `/admin/flags` page
- **Broadcast email composer**: `/admin/announcements` (preview + arm-confirm send, 500-recipient cap)

### Admin nav + URL polish — `3afdfa5`, `104cfb5`, `32b0559`
- Subdomain-relative nav hrefs so URL bar shows clean `admin.sneakersterminal.com/users` (was `/admin/users`)
- Apex `/admin/*` 301-redirects to admin subdomain — admin lives at one host
- Top nav wraps onto a second line at narrower widths, SIGN OUT pinned and always visible
- `requireAdmin()` reads `x-pathname` (set by proxy on every request) for accurate `next=` redirect targets
- `/users` page indicator clamps to `min(pageNum, totalPages)` so out-of-range `?page=999` reads "Page 1 of 1"

### Admin Grant Access action — `6742951`
- New `/admin/users/<id>` ACTIONS panel with state-aware buttons
- Replaces the manual tsx-script workflow for flipping waitlist users to AUTHED

### Admin polish bundle — `104cfb5`
- Proxy idempotency: paths already starting with rewrite root not double-prefixed
- `/admin` home stat math now mutually exclusive (Waitlist + Invited + Authed = total)
- `/users?page=999` empty state instead of raw "Requested range not satisfiable"
- `/system` DELETE STRESS-TEST ROWS upgraded to type-to-confirm
- `/invites` per-row revoke upgraded to two-step inline confirm
- Public marketing footer suppressed on admin/app subdomains
- SIGN OUT button in admin top-right (+ new `POST /api/auth/signout` route)
- Removed dead `/signup-config` nav item

### Login page fixes — `93eb760`, `025c40c`
- Post-signin redirect now host-aware (subdomain → `/`, apex → `/dashboard`) so admin signin lands on admin home
- "Remember me" checkbox added (default ON, persists email per origin)
- Login copy updated to match what the form actually does
- Subdomain proxy passes through shared paths (`/login`, `/signup`, `/api/*`) so they resolve correctly on `admin.*`/`app.*` hosts

### Admin subdomain set up — `025c40c`
- `admin.sneakersterminal.com` now hosts the admin panel (separate from apex `/admin`)
- DNS already configured at Namecheap; Vercel project domain attached

### Admin auth fix — `32b0559`
- `requireAdmin()` redirects non-admins to absolute apex URL (was relative path that 404'd on subdomain)
- `ADMIN_EMAILS` env var set on Vercel prod (was empty string — explained why nobody was admin)

---

## Earlier work — see `git log` for full history

Pre-2026-05-01 commits live in git history; this changelog seed begins with today's
audit + polish session. Going forward, every fix or feature ships with a CHANGELOG entry.
