# Sneakers Terminal — what to fix next

Written 2026-04-23 ~10am ET, after the merge to main + seed-data live + first beta-readiness pass. Ordered by criticality. Each item names an owner — me (this Claude Code session), you (operational), another Claude (coding agent), or Chrome (browser-automation agent) — plus an honest effort estimate and the risk if we don't do it.

---

## Critical — do before sending invite codes to >10 testers

### 1. Real data on prod (kill the seed)
**What:** Get scrapers running 24/7 on Railway, writing to Timescale, queryable from Vercel.
**Why:** The dashboard currently shows 13 hardcoded markets. Anyone refreshing notices the prices never move and the games never change. This is THE thing that makes the product feel alive vs feel like a demo.
**Owner:** you + Chrome — fire `docs/prompts/railway-setup-scrapers.md` against the existing Railway project (root dir is `curitiba`, the typo we never fixed). Then `POSTGRES_URL` env var on Vercel pointing at the same Postgres.
**Effort:** 30–60 min if Railway cooperates. The other Claude has been working on the Timescale side; coordinate before duplicating.
**Risk if skipped:** First-impression damage. Beta testers churn after one session because "there's no data."

### 2. Apply migrations 007 + 010 to prod Supabase
**What:** Migration `007_stripe_subscriptions.sql` creates `enterprise_inquiries`. `010_student_verification.sql` creates `student_verification`.
**Why:** Without them, `/api/student/submit` and `/api/enterprise/inquiry` 500. The prod-flow Chrome test in our last session caught both. Tester clicking "Get Verified" on `/students` sees an error.
**Owner:** you — Supabase dashboard SQL editor, paste both files, run.
**Effort:** 5 min.
**Risk if skipped:** Two of the four sign-up personas (student, enterprise) hit visible 500s.

### 3. Rotate `sk_live_` Stripe key
**What:** Roll the live secret key in Stripe dashboard. Update Vercel env. Redeploy.
**Why:** That key has been in our chat transcript and the MCP agent's memory on your other machine. Test mode would be fine; live mode is a real-money credential.
**Owner:** you — Stripe → Developers → API Keys → Roll. Then Vercel env update + redeploy.
**Effort:** 90 seconds.
**Risk if skipped:** Worst case, anyone with transcript access can drain your account. Realistic case, it sits unrotated for weeks until something happens.

### 4. Decide: live Stripe vs test Stripe for beta
**What:** Beta testers clicking subscribe on `/pricing` will currently hit live Stripe with real cards. Either:
  - **Option A** — flip Stripe back to test mode for the beta (paste test keys into Vercel env). Zero charges, can use 4242 4242 4242 4242.
  - **Option B** — leave live mode but add a clear warning banner on `/pricing` ("This is a paid product. Cards will be charged.") AND tell testers explicitly not to subscribe.
**Owner:** you (product call), me (implementation either way).
**Effort:** 15 min for test-key swap; 5 min for the warning banner.
**Risk if skipped:** A confused tester subscribes for $39/mo, you have to refund manually. Embarrassing, not catastrophic.

---

## High — within 48 hours of beta launch

### 5. Finish the onboarding stubs
**What:** 4 of 5 onboarding steps render M1 placeholders ("form lands in M2"):
  - `/onboarding/about-you` — needs name + sport prefs form
  - `/onboarding/platforms` — needs the venue checklist (use VENUES from lib/venues.ts)
  - `/onboarding/invite-friends` — needs the share-3-friends UI
  - `/onboarding/location-check` — needs state-selector dropdown
The wallet step (5th) is real and shipped.
**Why:** First-time testers see "M1 placeholder" text on 4 screens in a row. Skip-able, but feels half-built.
**Owner:** another Claude — the existing audit prompt at `docs/prompts/claude-code-signup-flow-audit.md` covers most of this. Could fork a separate prompt that just builds these 4 forms.
**Effort:** ~3 hours total for all 4.
**Risk if skipped:** Tester impression "this is unfinished." Still usable because of skip buttons.

### 6. Resend domain verification (or replace email provider)
**What:** Resend is in test mode. Magic-link emails go only to `jackson@hedgepayments.com`. The direct sign-in flow we shipped (commit `8b965e3`) bypasses email entirely for code-based access, so this isn't critical for sign-in. But it IS needed for:
  - Waitlist confirmation emails
  - Student-verification approval notifications
  - Future invite-from-friend flows
**Owner:** you — verify `sneakersterminal.com` at resend.com/domains. Or switch to Postmark / SendGrid if that's easier.
**Effort:** 15 min for Resend domain verify (DNS records). Up to a day for DNS propagation.
**Risk if skipped:** Waitlist signups never get a confirmation. Bad first impression.

### 7. Real-card Stripe end-to-end test
**What:** Subscribe with a real card, verify the webhook fires, verify Supabase row updates `plan_tier=pro` + `subscription_status=trialing`. Cancel via Stripe portal, verify it flips back. Then refund yourself.
**Why:** Live Stripe is configured but never proven to work end-to-end. Prefer to find the bug before a tester does.
**Owner:** you — needs a real card.
**Effort:** 20 min including the refund.
**Risk if skipped:** A tester subscribes, the webhook fails, they're charged but the app shows them as Free. Refund + apology required.

### 8. Mobile responsive audit
**What:** Open `/`, `/dashboard`, `/markets`, `/pricing`, `/students` on a phone-sized viewport. Right now everything's been designed for desktop. The dashboard is dense; the venue ticker has a lot of icons; the topbar is wide.
**Owner:** Chrome — open each page at 375px and 414px widths, screenshot, report what's broken.
**Effort:** 30 min for the audit. Fix time depends on what breaks; probably 1–2 hours.
**Risk if skipped:** A meaningful chunk of testers will open this on a phone. Sneakers' brand is "trader terminal" so desktop-first is defensible — but at minimum the landing should not be horizontally scrollable.

---

## Medium — within a week

### 9. Sign-up flow audit completion
**What:** The prompt at `docs/prompts/claude-code-signup-flow-audit.md` covers 8 sections of polish (waitlist success copy, revisit flow, code-with-wrong-email UX, email template consistency, onboarding continuity, referral cookie, copy tweaks, plus the new "verify 14-day trial language" section).
**Owner:** another Claude — hand them the prompt file.
**Effort:** ~3 hours of their time. They commit each section separately.
**Risk if skipped:** Many small UX papercuts at the most important touchpoint.

### 10. Venue logo PNGs (16 missing)
**What:** Prompt at `docs/prompts/venue-logos-download.md` has the list. Currently 15 of 31 venue ticker icons render as text-fallback initials.
**Owner:** Chrome — runs the prompt, drops 16 PNGs into `apps/platform/public/SneakersLogos/partners/`. Then me — adds the IDs to `LOGO_AVAILABLE` in `venue-ticker.tsx`.
**Effort:** 30 min for Chrome's run; 5 min for me to wire.
**Risk if skipped:** Cosmetic — text fallbacks are functional but ugly.

### 11. Replace seed data with real data
**What:** Once item #1 (Railway scrapers) is done, set `SNEAKERS_ENABLE_SEED=0` (or delete the env var) on Vercel. Confirm dashboard still populates.
**Owner:** you — one env var flip. Then me — delete `apps/platform/src/lib/seed-snapshots.ts` and the fallback block in `markets-data.ts` for permanent cleanup.
**Effort:** 5 min.
**Risk if skipped:** Seed data lives forever, hides the fact that real data isn't flowing.

### 12. /api/me/tier 500 root cause
**What:** Browser console intermittently shows 500s on /api/me/tier. We added defensive code in `bf18619` that should turn schema-drift errors into a free-tier fallback. If you're STILL seeing 500s, the underlying error is somewhere else (auth client init, getUser timeout, etc.). Need to grab the actual response body from a failing call to diagnose.
**Owner:** you — open DevTools, click the failing /api/me/tier in Network, paste me the Response tab body.
**Effort:** 30 seconds of your time, then 5–30 min for me to fix.
**Risk if skipped:** useTier() hook fails silently → some UI elements show wrong tier or get stuck in loading.

### 13. Rotate Supabase service_role key
**What:** Standing item from ROADMAP since session 2. Service-role key was pasted in chat early in development. Rotate via Supabase dashboard → Project Settings → API → "Reset service_role key." Update Vercel env. Redeploy.
**Owner:** you — Supabase + Vercel.
**Effort:** 5 min.
**Risk if skipped:** Same class as the Stripe key — credential hygiene.

### 14. Set up Sentry / log aggregation
**What:** Right now errors disappear into Vercel's runtime logs which are hard to search. Sentry (free tier) catches React errors + API 500s in one searchable inbox.
**Owner:** you — set up the Sentry account. Then me — install `@sentry/nextjs` and wire it.
**Effort:** 30 min total.
**Risk if skipped:** Bugs that only show in production go uninvestigated until a tester complains.

---

## Lower-priority / month-out

### 15. iOS app M1+M2 (in progress per git history)
The `apps/ios/` scaffold exists. Continue the work the other Claude started.

### 16. Game-level matcher
`apps/trader/src/scanner/match-games.ts` doesn't exist; only the moneyline matcher does. Future cross-book NBA / MLB game-spread arbs need it.

### 17. Public daily "what Sneakers found" snapshot
Idea from earlier session — daily tweet/email/landing strip showing the day's tightest cross-book pairs. Free marketing. Low priority until real data is flowing.

### 18. Shareable arb cards
Same source — generate a PNG when an arb fires. Viral loop. Depends on real arbs existing first.

### 19. Watchlists + price alerts
First Premium-tier-worthy feature post-launch. Deferred until paying users exist.

### 20. Pro/Casual mode toggle
Already have view modes (Simple/Medium/Terminal). Just need messaging that helps users pick.

### 21. Bulk-fraud flag UX (student verification)
Currently log-only. Should surface as a visible badge in `/admin/students`. Low risk until you actually have student volume.

### 22. Approve-resubmit-overwrite on student-verification
Open product question. Approved students who re-submit currently flip back to pending. Decide: lock or allow.

### 23. ASCII-only email validator
Open product question from earlier session. Reject IDN emails or accept? US-only product probably wants reject.

### 24. Migration cleanup
Numbering chaos: 007 (Stripe), 010 (student), 011 (enterprise hardware), 012 (alerts), 013 (invite scarcity). At least one cherry-pick collision was fixed mid-flight ("renumber my migrations to avoid collisions"). Worth a pass to confirm the prod schema matches what the code expects.

---

## Maintenance / always-on

- **Don't push live secrets to chat.** When a Stripe key, Supabase service-role key, etc. needs to change, the MCP agent on the secure machine writes directly into Vercel/Supabase — never relays through chat.
- **Branch hygiene.** We're now in a stable place: `main` is the deploy branch, `feat/autotrade-tos` was the working branch, both are roughly in sync. Going forward, prefer one feature branch per real feature, merge often, delete after merge.
- **Verify before deploy.** The pattern that worked: edit → typecheck → smoke curl → commit → push → wait for Vercel green → re-curl. Skipping any step burned an hour at least once this session.

---

## Calendar — what to actually do today (Apr 23)

If you have ~3 hours after waking up:

| Time | Item | Why |
|---|---|---|
| 0:00–0:15 | Verify dashboard shows Kalshi/Polymarket and the wallet card (just shipped — commit `<this commit>`) | Confirm the morning ships landed |
| 0:15–0:30 | Apply migrations 007 + 010 to Supabase | Unblocks /api/student/submit + /api/enterprise/inquiry |
| 0:30–1:00 | Rotate Stripe + Supabase keys | Credential hygiene |
| 1:00–1:30 | Real-card Stripe e2e test (subscribe + webhook + cancel + refund) | Prove the live billing chain works |
| 1:30–2:30 | Fire Railway scraper prompt against the existing project | Get real data flowing |
| 2:30–3:00 | Write tester recruitment pitch + send first 5 codes | Soft launch to people whose feedback you trust most |

Sequencing matters: 1 → 2 → 3 (security) → 4 (billing) → 5 (data) → 6 (people). Going in a different order is fine; doing #6 before #5 means testers see seed data which is the main caveat.

---

## When to ask me for help

Anything in this doc — DM the section number and I'll either do it autonomously, write a Chrome/MCP prompt for it, or spawn a subagent. The big stuff (Railway scraper deploy, finishing onboarding stubs, mobile audit) benefits from a dedicated Claude Code session because it's longer than a single back-and-forth — the prompts at `docs/prompts/` are designed for handoff.
