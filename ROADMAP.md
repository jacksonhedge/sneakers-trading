# Sneakers Terminal — Roadmap

Single source of truth for what's next. `WORKLOG.md` is the retrospective side (what actually happened); this file is forward-looking.

> **Convention:** keep this to ~one screen. When items get granular, promote them to GitHub Issues.

---

## Shipped

- [x] **Monorepo bootstrap** — pnpm + Turborepo, `apps/trader` + `apps/platform` + `packages/core|sdk` skeletons. Branch `chore/monorepo-bootstrap`.
- [x] **Waitlist website** — Next.js 16 app at `apps/platform`, Supabase-backed waitlist table with RLS, deployed at **https://sneakersterminal.com**. Branch `feat/platform-scaffold`.
- [x] **Live waitlist counter** — `> N OPERATORS IN QUEUE` on landing, offset-seeded to 56, increments on signup.
- [x] **Resend confirmation email** — production `RESEND_API_KEY` set, emails send from `onboarding@resend.dev`, HTML + text templates include user's own referral link and the +5/+2 reward explanation.
- [x] **Brand assets** — logo added as favicon, apple-icon, and OpenGraph social-share image. Wordmark-inclusive version swapped in.
- [x] **Wimbledon theme** — animated white/cream/green/purple diagonal gradient (30s, respects `prefers-reduced-motion`), `#00703c` as primary accent, `mix-blend-multiply` masks the logo's vignette on light bg.
- [x] **Rebranded hero** — "Lace 'Em Up." + "Never Miss your best bet" tagline stack; dropped the prediction-markets description paragraph.
- [x] **Referral Program — Phase 1** — migration `002_referrals.sql` (code, referrer FK, counters, trigger), `/r/[code]` route + cookie, landing-page banner, 1st- and 2nd-degree attribution verified via end-to-end chain test on production.

## Now (in flight)

- [ ] **Rotate Supabase `service_role` key** — still outstanding; the current key was pasted in chat earlier. Low risk pre-launch but worth doing before real user traffic.
- [ ] **Transparent-background logo asset** — current logo has a built-in dark vignette. `mix-blend-multiply` works but a clean transparent asset would look better, especially for light-theme email templates and press use.

## Next

- [ ] **Auth + Dashboard (Path C step 2)** — Supabase Auth with **magic-link email** (no passwords). Protected `/dashboard` route shows user's waitlist position, direct/indirect referral counts, shareable link, account settings. Supabase `auth.uid()`-based RLS. Keep routes as plain HTTP JSON so the planned iOS app can reuse them. Estimated 5–8h.
- [ ] **Referral Program — Phase 2** — user-facing share UI on the landing post-signup, `/status/[code]` unauthenticated page via cookie, referral-notification emails when someone's signup moves the referrer up. Once auth ships, `/dashboard` and `/status/[code]` converge (the dashboard IS the authenticated status page).
- [ ] **Scrapers + TimescaleDB + EV analysis plan** — write at `docs/SCRAPER_PLAN.md`. Target platforms: Polymarket, Kalshi, Coinbase Predict, Limitless, Crypto.com/OG (API path); **Underdog, ProphetX**, DraftKings Predictions, CDNA (no public API — private-endpoint scrape path). 5 clarifying questions captured in memory before I write the doc.
- [ ] **100 testers goal** — recruitment channels + pitch + onboarding/account-connection flow. Tied to the auth + dashboard work since testers need accounts.
- [ ] **Merge branches to `main`** — `chore/monorepo-bootstrap` → `main`, then `feat/platform-scaffold` → `main`. Flip Vercel's production branch to `main` afterwards. Delay until auth + dashboard stable so we're not churning prod.

## Later

- [ ] **Referral Program — Phase 3** — rate limiting (Upstash), disposable-email blocker, UTM tracking on share links, public leaderboard (optional, depends on abuse signal)
- [ ] **Pricing toggle** (American ↔ 0–99¢) — utility + `<Price>` component + preference cookie. Build when we have real prices to render.
- [ ] **Design content layers** ("Public"-style depth) — Platforms grid, How It Works, market demo, FAQ below the hero fold
- [ ] **Cross-platform scraper coverage** — once pipeline proven on one easy API + one hard scrape, expand
- [ ] **TimescaleDB on Albus** — install + schema (brief at `~/Downloads/CLAUDE_CODE_BRIEF_timescaledb.md`, not yet executed)
- [ ] **EV analysis surface** — decide: internal trading signals vs user-facing trend summaries on the Terminal site
- [ ] **iOS app** — Supabase-swift, magic-link deep-link auth, shares API + data model with web. Planned, not scoped.
- [ ] **Email template theming** — confirmation email still uses green-on-black. Bring it in line with the Wimbledon web theme.
- [ ] **Product roadmap for launched Terminal** — once waitlist → invited-beta transition begins, this file grows a top section for in-product features

## Small fixes worth remembering

- [ ] `ip_country` header fallback — already partially fixed (reads both `cf-ipcountry` and `x-vercel-ip-country`). Should confirm it populates on a real production signup.
- [ ] `apps/trader/src/services/portfolio-tracker.ts` imports `pg` but `pg` isn't in deps. Pre-existing bug flagged in WORKLOG Session 0 entry. Either add the dep or delete the unused import.
- [ ] Delete unused Next.js scaffold SVGs in `apps/platform/public/` (`next.svg`, `vercel.svg`, etc.). Cosmetic.
- [ ] Configure `git config user.email` — current commits authored as `jeremyalbus@Jeremys-Mac-Studio.local` / `jeremyalbus@jeremysacstudio.mynetworksettings.com` instead of the GitHub identity.
- [ ] **Apply pending schema changes before deploying the code that references them.** Phase 1 of the referral program briefly 500'd because the migration ran after the code deploy — next schema change should either go in the same deploy window or ship the code in a no-op state that no-ops until the column exists.
