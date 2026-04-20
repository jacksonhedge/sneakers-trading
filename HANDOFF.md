# Handoff — Parallel Claude Window

This file defines scope boundaries so a second Claude Code session can work on **user sign-up + location checking** without colliding with the main session's work.

Last updated: 2026-04-20

## Current state of the repo

- Branch: `add-web-terminal` (two commits behind `main`, will merge via PR)
- **API server:** `src/api/server.ts` — Express on :4000, runs Kalshi + Polymarket scrapers, serves `/v1/markets`, `/v1/markets/hot`, `/v1/stats`, `/v1/platforms`, `/v1/health`, `POST /v1/otoole/chat`
- **Web terminal:** `web/` — Next.js 14 App Router, runs on :3030. Single page at `app/page.tsx` with three modes (Simple/Medium/Terminal)
- **Scrapers:** `src/scrapers/` — Kalshi + Polymarket live (13k markets). DK/FD/Fliff/sweeps scaffolded but not live-tested against real endpoints
- **Styling:** one big `web/app/globals.css`. No Tailwind or CSS modules. Match this style — don't introduce new CSS systems
- **State:** client-side React only. localStorage for persistence. No auth yet.
- **Deploy target:** Railway (configs in `railway.json` + `web/railway.json`). Not deployed yet.

## Run locally

```bash
# Terminal 1 — API
cd ~/Projects/sneakers-trading
npx tsx src/api/server.ts              # :4000

# Terminal 2 — Web
cd ~/Projects/sneakers-trading/web
npm run dev                            # :3030
```

Open http://localhost:3030.

## Your scope (parallel window)

You own:
1. **Authentication** — sign-up, sign-in, session, logout
2. **Location checking** — validation, state→platform availability logic, geocoding if GPS returns lat/lng

### Suggested approach

- **Auth:** use **Supabase Auth**. Project already uses Supabase elsewhere in the user's stack (Bankroll, Hedge Payments, CoverPay). If this repo doesn't have a Supabase project yet, spin up a new one and add the project ID to `CLAUDE.md` and this doc.
- **Sign-up fields v1:** email, password, display name, primary platform (dropdown pulling from `web/lib/connectedSites.ts`)
- **Location check:** take the `LocationState` from `web/app/page.tsx` (currently stored in localStorage key `otoole:location:v1`). Enrich with:
  - If only lat/lng is present → reverse-geocode to state (use a free service — Nominatim, or Vercel's geo headers once deployed)
  - Given a state, check against a platform-availability matrix (Kalshi: 50 states; Polymarket: blocks US; DraftKings: 25+ states; etc.)
  - Expose an API endpoint `/v1/location/resolve` that takes `{ lat, lng } | { state }` and returns `{ state, country, availablePlatforms: string[] }`

### Files you should own

Create/modify freely:
- `web/app/signup/` — sign-up page
- `web/app/signin/` — sign-in page
- `web/app/account/` — account settings
- `web/components/auth/*` — AuthForm, SessionProvider, etc.
- `web/lib/auth.ts` — Supabase client + session helpers
- `web/lib/supabase.ts` — Supabase client init
- `src/api/routes/auth.ts` — any server-side auth routes on Express
- `src/api/routes/location.ts` — location resolve endpoint
- `src/services/platform-availability.ts` — state → available platforms matrix
- Schema migrations in `supabase/migrations/` (create this dir)

Safe to extend (additive only — don't refactor existing):
- `web/lib/connectedSites.ts` — add `username?: string` field capture to `Connection`
- `web/lib/api.ts` — add new fetchers, don't touch existing ones
- `src/api/server.ts` — add new route mounts at the bottom, don't refactor existing routes

## Files the main window owns — DO NOT MODIFY

Do not refactor or restructure these; I'm actively working here:

- `web/app/page.tsx` — exception: you may import new components and add a single `<AuthGate>` wrapper or `<UserMenu>` in the header `.h-right` section. Don't restructure the sidebar or any mode section.
- `web/app/layout.tsx` — exception: you may wrap `<body>` in an auth provider
- `web/app/globals.css` — exception: append new CSS blocks at the bottom with clear comments (`/* ═══ AUTH ═══ */`). Don't edit existing selectors.
- `src/scrapers/*`
- `src/api/server.ts` — existing routes. Add yours at the bottom.
- `railway.json`, `web/railway.json`

## Conventions to follow

- **No node-fetch.** Use global `fetch` (Node 18+ native). The scrapers learned this the hard way.
- **Use localStorage keys with a prefix:** `otoole:<feature>:v1`. Existing: `otoole:connections:v1`, `otoole:location:v1`.
- **Date formatting** in `web/lib/api.ts` — reuse `formatCloseDate`, `formatVolume`, `formatPct`.
- **Styling** — match the existing vocabulary in `globals.css` (`.nav-item`, `.widget`, `.mkt-card` patterns). No Tailwind utility classes. Use the CSS custom props (`--text`, `--green`, `--card`, `--border`).
- **Emojis in nav only.** Don't use emojis in data labels, buttons inside widgets, or chat UI — feedback found those gimmicky.
- **Typography:** DM Sans body, Share Tech Mono for terminal mode, Orbitron for logo only. **Do not add new fonts.** Barlow Condensed was removed; keep it gone.
- **Client components** — mark with `"use client"` at the top. Default to server components unless you need state/effects.

## Supabase setup (if you go this route)

Add these to `CLAUDE.md` once created:
```
## Sneakers Trading
- **Path:** /Users/jacksonfitzgerald/Projects/sneakers-trading
- **Supabase Project ID:** <fill in>
- **Supabase URL:** https://<id>.supabase.co
- **GitHub:** jacksonhedge/sneakers-trading
```

Tables to create:
- `users` (managed by Supabase auth)
- `user_profiles` — user_id FK, display_name, location (jsonb: { state, country, lat, lng }), created_at
- `user_connections` — user_id FK, site_id, username, connected_at — migrates the localStorage `connections` store to the server
- `platform_availability` — state (text), platform_id (text), available (bool). Seed from legal research.

## Communication with me

Leave a brief note at the top of this file when you start working so I see it:
```
> STARTING 2026-04-20 14:30 — building Supabase auth + sign-up page. ETA ~2h.
```

And when you finish, append:
```
> DONE 2026-04-20 16:15 — auth live, sign-up at /signup, supabase configured (see CLAUDE.md). Touched: web/lib/supabase.ts, web/lib/auth.ts, web/app/signup/*, web/app/layout.tsx (added SessionProvider wrapper), web/app/globals.css (appended /* AUTH */ block).
```

## What's decided vs. what you should ask about

**Decided:**
- Supabase for auth (user's default stack)
- Email + password v1; Google/Apple OAuth later
- Location is state-granular in the US, country-level internationally
- Sign-up captures primary platform + location upfront so we can filter markets immediately

**Open questions** — answer before building:
- Do we require auth to view markets, or is the terminal public with a "log in to save" promo? (Recommend: public, gated for chat/positions)
- Does location capture happen during sign-up, after sign-up, or on first visit regardless of auth state? (Currently: on first visit regardless. Modal in the sidebar footer already exists.)
- What platforms do we filter out by state? Research + seed the availability matrix before writing the filter logic.

Ping me in the main thread if blocked.
