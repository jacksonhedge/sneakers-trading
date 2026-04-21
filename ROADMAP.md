# Sneakers Terminal — Roadmap

Single source of truth for what's next. `WORKLOG.md` is the retrospective side (what actually happened); this file is forward-looking.

> **Convention:** keep this to ~one screen. When items get granular, promote them to GitHub Issues.

---

## Shipped

- [x] **Monorepo bootstrap** — pnpm + Turborepo, `apps/trader` + `apps/platform` + `packages/core|sdk` skeletons. Branch `chore/monorepo-bootstrap`.
- [x] **Waitlist website** — Next.js 16 app at `apps/platform`, Supabase-backed waitlist table with RLS, terminal green-on-black landing page, deployed at **https://sneakersterminal.com**. Branch `feat/platform-scaffold`.
- [x] **Live waitlist counter** — `> N OPERATORS IN QUEUE` on landing, offset-seeded to 56, increments on signup.
- [x] **Confirmation email scaffolding** — Resend wrapper, wired into the signup route, silently skips until `RESEND_API_KEY` is set.
- [x] **Brand assets** — logo added as favicon, apple-icon, and OpenGraph social-share image.

## Now (in flight)

- [ ] **Finish Resend setup** — sign up at resend.com, paste `RESEND_API_KEY` into Vercel env, optionally verify `sneakersterminal.com` as a sender domain for a custom From address. 5 min.
- [ ] **Rotate Supabase `service_role` key** — the current one was pasted in chat. Supabase dashboard → Settings → API → Reset. Paste new one into Vercel env + `apps/platform/.env.local`. 2 min.
- [ ] **Landing-page logo placement decision** — cartoon logo vs terminal aesthetic; three options noted in the chat recap (tiny header / framed / desaturated / or re-palette the whole site). Needs a product decision before we implement.

## Next

- [ ] **Referral program — Phase 1** (spec: `docs/REFERRAL_PLAN.md`)
  - Blocks on: reward-structure decision (default: 5 positions/referral + tiers at 1/3/10) and rate-limit vendor choice (default: Upstash).
  - Phase 1 is codes + attribution + migration `002_referrals.sql`. Estimated 1–2h.
- [ ] **Scrapers + TimescaleDB + EV analysis plan** (spec: to be drafted at `docs/SCRAPER_PLAN.md` in the next session)
  - Target platforms: Polymarket, Kalshi, Coinbase Predict, Limitless, Crypto.com/OG (API); **Underdog, ProphetX**, DraftKings Predictions, CDNA (no public API — scrape).
  - Plan needs to split the two categories. Open questions captured in memory.
- [ ] **100 testers goal** — user-set priority for 2026-04-22; needs a concrete plan (channels, pitch, account connection flow).
- [ ] **Merge branches to `main`** — `chore/monorepo-bootstrap` → `main`, then `feat/platform-scaffold` → `main`. Then flip Vercel's production branch back to `main`. Do after the referral Phase 1 is stable so we're not churning prod.

## Later

- [ ] **Referral program — Phase 2** — user-facing UI, `/status/[code]` page, referral notification emails
- [ ] **Referral program — Phase 3** — social share, rate limit, disposable-email blocker, UTM tracking
- [ ] **Cross-platform scraper coverage** — once the pipeline is proven on one easy API + one hard scrape, expand
- [ ] **TimescaleDB on Albus** — install + schema (brief at `~/Downloads/CLAUDE_CODE_BRIEF_timescaledb.md`, not yet executed)
- [ ] **EV analysis surface** — whether as internal signals or user-facing trend summaries on the Terminal site — decision needed
- [ ] **Product roadmap for launched Terminal** — once waitlist → invited-beta transition begins, this roadmap gets a new top section for in-product features

## Small fixes worth remembering

- [ ] `ip_country` header fallback — already partially fixed (reads both `cf-ipcountry` and `x-vercel-ip-country`). Should confirm it populates on a real production signup.
- [ ] `apps/trader/src/services/portfolio-tracker.ts` imports `pg` but `pg` isn't in deps. Pre-existing bug flagged in WORKLOG's Session 0 entry. Either add the dep or delete the unused import.
- [ ] Delete unused Next.js scaffold SVGs in `apps/platform/public/` (`next.svg`, `vercel.svg`, etc.). Cosmetic.
- [ ] Configure `git config user.email` — current commits authored as `jeremyalbus@Jeremys-Mac-Studio.local` instead of the GitHub identity.
