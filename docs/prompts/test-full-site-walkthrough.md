# Full site walkthrough — every user journey

Paste to Claude Chrome. Walks every meaningful surface of the Sneakers
Terminal site running locally on `http://localhost:3000` to verify nothing
is 500ing or visibly broken after the security audit + auth refactor +
scraper changes.

This is a **breadth-first** test — fast tour through every page, marking
PASS/FAIL/WEIRD per surface. Not a deep regression test. If a phase
takes more than 90 seconds, mark partial pass and move on.

---

I need a comprehensive walkthrough of the Sneakers Terminal site running
locally. Verify each surface renders without 500s, console errors, or
visible breakage. Each phase is a quick tour of a route family — I want
breadth coverage, not deep functional testing.

Run each phase, mark **PASS** / **FAIL** / 🟡 with one line. Total
target: 18–25 minutes. Final summary table.

## Setup (verify before testing)

1. Dev server running on `http://localhost:3000`
2. Auth flow already verified (run `bash apps/platform/scripts/test-auth-curls.sh`
   if uncertain — should show all 6 sections passing)
3. The user is already authenticated as a regular user in one tab (no
   captain status, no admin status). Ask the user to point you to that
   tab — call it "REGULAR USER TAB".
4. The user has admin privileges via `ADMIN_EMAILS` env. Ask them to give
   you a fresh tab signed in as admin — call it "ADMIN TAB". If they
   don't have admin access set up, skip Phase 11 (admin pages).
5. Browser devtools Console + Network tabs open in both tabs.

---

## Phase 1 — Anonymous landing page

Fresh incognito (no auth).

1. Visit `http://localhost:3000/` — landing page renders. Confirm:
   - Emerald + dark terminal aesthetic
   - Hero CTAs: "Sign up as an individual" and "Sign up your organization"
   - No console errors
2. Click `Sign up as an individual` → URL becomes `/signup`. Page renders
   with EMAIL + ACCESS CODE (optional) form.
3. Back to landing. Click `Sign up your organization` → 3-step modal opens.
4. Close the modal. Look for any other CTAs/links on landing — note them.

**PASS criteria**: landing renders cleanly, both signup paths reachable.

## Phase 2 — Public marketing pages (anonymous)

Still in fresh incognito.

Visit each in turn, verify each renders without 500/console errors:

- `/pricing` — tier cards, prices visible
- `/hardware` — Mac Studio + MacBook Pro
- `/students` — .edu signup story / 75% off
- `/college` — college-team page
- `/venues` — venue catalog (Kalshi, Polymarket, Sleeper, etc.)
- `/markets` — public markets list (may be auth-gated; if redirected to
  /signup, that's OK, just note it)

**PASS criteria**: all 6 routes return 200. Note any that redirect or
404.

## Phase 3 — Auth gating (anonymous → protected routes)

Fresh incognito.

Visit each protected route directly in the URL bar. Each should redirect
to `/signup` or `/login` (not 500, not show signed-in content):

- `/dashboard`
- `/dashboard/profile`
- `/dashboard/markets/kalshi/test`
- `/dashboard/minute`
- `/dashboard/alerts`
- `/dashboard/billing`
- `/dashboard/treasury`
- `/dashboard/settings`
- `/admin`

**PASS criteria**: all 9 redirect to a signup/login surface, none 500,
none expose authed content.

## Phase 4 — REGULAR USER TAB: dashboard tour

Switch to the REGULAR USER TAB (already authed as a non-captain user).

Visit each, verify it renders:

1. `/dashboard` — main terminal, "Set up your wallet" yellow banner OK,
   O'Toole right-sidebar visible, market cards (Politics, Sports, etc)
2. `/dashboard/profile` — 6 cards (EMAIL, PLAN, STUDENT VERIFICATION,
   UNIVERSITY, REFERRALS, BOT & WALLET). **NO captain card.**
3. `/dashboard/billing` — pricing tiers + current-plan banner
4. `/dashboard/billing/credits` — credit packs (10/25/100/500)
5. `/dashboard/settings` — settings index
6. `/dashboard/settings/api-keys` — BYO LLM keys form
7. `/dashboard/settings/otoole` — model picker
8. `/dashboard/settings/autotrade` — autotrade waitlist
9. `/dashboard/connections` — venue connection cards
10. `/dashboard/treasury` — Safe address form
11. `/dashboard/leaderboard/join` — handle claim form

**PASS criteria**: all 11 routes return 200, render expected card layouts,
no console errors.

## Phase 5 — Markets list + market detail

In REGULAR USER TAB:

1. Visit `/markets` — public markets index. Confirm:
   - Filter chips for category (Politics, Sports, Crypto, etc.)
   - Market rows with platform badges + price + volume
   - Freshness strip showing per-book last-update times
2. Click any individual market → URL becomes
   `/dashboard/markets/<platform>/<marketId>` (e.g. `kalshi/KXNBASPREAD-...`)
3. Confirm the market detail page renders:
   - Market topbar with question + breadcrumb
   - Price chart area
   - Trade panel (right side)
   - Tabs: Positions, Orders, Buy/Sell, Trades, Top Traders, Top Holders
   - Timeframe tabs: 5m, 1h, D, 1w
4. Click each timeframe tab — URL updates `?tf=...`, page reloads cleanly.

**PASS criteria**: index + detail both render, timeframe tabs work, no 500
on any market clicked.

🟡 If any market shows 500, copy the URL + the error from the server
console (`npm run dev` terminal).

## Phase 6 — Minute Markets

In REGULAR USER TAB:

1. Visit `/dashboard/minute`. This is the short-time-horizon strike ladder
   across Limitless, OG, Kalshi, Polymarket.
2. Confirm:
   - Page title "Minute Markets — Sneakers Terminal" (browser tab title)
   - Group cards, each labeled with an asset (BTC, ETH, etc.)
   - Each card shows "resolves in <N>m" with a live countdown timestamp
   - Strike ladder table per group: platform / strike / dir / yes / Δ5m
   - Platform-color dots (fuchsia=limitless, amber=og, cyan=kalshi,
     violet=polymarket)
   - Auto-refresh badge somewhere (the page polls)
3. If there are NO groups visible (empty state), that's fine — just
   confirm it doesn't 500 and shows an "Empty" message.
4. Try query params: `/dashboard/minute?within=30` and `?asset=BTC` —
   should narrow the displayed groups without erroring.

**PASS criteria**: page renders. If data is sparse (scrapers behind),
note "no groups in window" but mark PASS as long as there's no error.

## Phase 7 — Alerts

In REGULAR USER TAB:

1. `/dashboard/alerts` — alerts index. Confirm rules table or empty state.
2. `/dashboard/alerts/new` — rule creation form. Confirm:
   - Trigger type dropdown
   - Market filter inputs
   - Quiet hours / channel toggles
3. Don't actually create an alert. Click cancel/back.
4. `/dashboard/alerts/settings` — delivery preferences (push, email, etc.).

**PASS criteria**: 3 routes render, form fields are present.

## Phase 8 — O'Toole chat (LLM)

In REGULAR USER TAB:

1. On `/dashboard`, find the O'Toole panel (right sidebar).
2. Verify the model selector at top shows "Claude Haiku 4.5 · 3cr" or
   similar (depends on user's tier).
3. Type a short message like "what's hot today?" → submit.
4. Confirm:
   - "Rendering" indicator appears at bottom-left of the panel
   - A response streams in (or appears all at once) within ~10s
   - Response uses prose, references some markets if data is fresh
   - The credits counter / cap counter updates in the response payload
     (devtools Network → POST /api/otoole/chat → response includes
     `cap.used` and `creditsSpent`)

**PASS criteria**: O'Toole responds without 500. If it fails with
"daily_cap_reached" or "insufficient_credits", that's fine — the gating
works.

🟡 If response takes >30s with no output, check `npm run dev` terminal
for `[otoole/chat]` errors.

## Phase 9 — Captain flow (uses prior test artifacts)

If your prior testing already created `Local Test Frat` (Phases 5–6 of
the auth test), revisit it. Otherwise skip to Phase 10.

1. Open the captain incognito tab. `/dashboard/profile` should show
   the gradient captain hero card.
2. `/dashboard/org` — captain dashboard with 5 tabs (Members, Seats,
   Treasury, Bot, Settings). Members tab shows:
   - Org name + status pill at top
   - Join link card (emerald, "Your join link · FASTEST")
   - Pre-invite paste-list / CSV
   - Roster table
3. Click each disabled tab (Seats, Treasury, Bot, Settings) — should
   show "SOON" placeholders, no 500s.

**PASS criteria**: org dashboard + tabs render.

## Phase 10 — Onboarding flow (skip if user already onboarded)

If the regular user just signed up for the first time, they should have
been routed to `/onboarding/about-you`. Walk through:

1. `/onboarding/about-you` — first-time-user form (display name, etc.)
2. `/onboarding/location-check` — geo permissions
3. `/onboarding/platforms` — venue selection grid
4. `/onboarding/wallet` — wallet setup
5. `/onboarding/invite-friends` — referral share screen
6. `/onboarding/done` — completion

Don't actually fill in / submit. Just confirm each route renders
without 500. If the flow is gated such that step 2 redirects when
step 1 isn't complete, note it and skip ahead.

**PASS criteria**: all 6 onboarding routes return 200.

## Phase 11 — ADMIN TAB: admin pages

If admin access is set up, switch to ADMIN TAB. Otherwise skip.

Visit each:

1. `/admin` — admin home / index
2. `/admin/users` — users table with search bar
   - Try search: type `test` in the search box → results filter
3. `/admin/users/<some-id>` — user detail (click any row)
4. `/admin/scrapers` — scraper status. Confirm:
   - **Amber "DISABLED · NEEDS FIX" banner** at top showing prizepicks +
     underdog with their reasons
   - Per-platform table with rows for each scraper
   - prizepicks + underdog rows have a `DISABLED` badge next to the name
5. `/admin/students` — student verification queue
6. `/admin/invites` — invite-code management
7. `/admin/enterprise` — enterprise inquiry queue
8. `/admin/alerts` — admin alerts overview
9. `/admin/analytics` — analytics dashboard
10. `/admin/autotrade` — autotrade waitlist
11. `/admin/otoole` — O'Toole usage view
12. `/admin/system` — system tools (cleanup, etc.)
13. `/admin/signup-config` — signup feature flags

**PASS criteria**: all 13 admin routes return 200, the scrapers page shows
the new DISABLED banner.

## Phase 12 — Security headers spot-check

In ANY tab, devtools Network → reload the page → click the document
request → Headers tab. Confirm:

- `Content-Security-Policy` — long string starting with `default-src 'self'`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — includes `camera=()`, `microphone=()`, `geolocation=()`
- `X-Frame-Options: DENY`

**PASS criteria**: all 6 headers present on at least one page response.

## Phase 13 — Browser + server console clean check

1. Throughout the test, the browser devtools Console should have NO red
   errors. Note anything that appears with the route that triggered it.
2. The `npm run dev` terminal should not have repeating stack traces.
   Acceptable: `[proxy]` route logs, `[magic-link]`, Supabase pings.
   Not acceptable: `Error:` stacks, `permission denied for table`,
   `Attempted to call X() from the server but X is on the client`.

**PASS criteria**: no red errors, no repeating stacks.

---

## Final report

For each phase 1–13:
- ✅ PASS items (one line each)
- ❌ FAIL items (specific symptom + route + what you expected)
- 🟡 ANYTHING WEIRD that's not pass/fail

Total: target under 40 lines. Screenshot only on FAILs.

End with a count of routes visited (should be 50+) and total console
errors observed.

## Boundaries

- Localhost only — do NOT hit production endpoints.
- Don't actually create alerts, send invites, submit student
  verifications, or trigger Stripe checkout — just verify the FORMS are
  present and not erroring.
- If a route 500s, note the URL + error and continue. Don't get stuck
  trying to fix it from the browser side.
- If the dev server crashes, restart with `npm run dev` from
  `apps/platform/` and resume from current phase. Note the trigger.
