# Changelog

All notable changes to Sneakers Terminal. Newest at top.

Format: each entry starts with the date and the commit short-sha for traceability.
Group by feature area. Keep entries scannable — terse bullets, not prose.

---

## 2026-05-01 — Trading-terminal audit + polish round

### Authed-side audit fixes — pending commit
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
