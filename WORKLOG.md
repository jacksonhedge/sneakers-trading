# Sneakers — Work Log

## 2026-04-21 — Post-launch iteration: logo, Wimbledon theme, Referral Phase 1

### Shipped this session
- **Logo + tagline rebrand.** Site now leads with the colorful Sneakers baseball-script wordmark logo + "Lace 'Em Up." + "Never Miss your best bet". Short, centered hero — dropped the prediction-markets descriptive paragraph for a tighter landing.
- **Wimbledon theme.** Replaced the green-on-black terminal aesthetic with a white base + animated diagonal gradient (white → cream → green-tinted → purple-tinted, 30s cycle, paused under `prefers-reduced-motion`). Accent color shifted to Wimbledon green `#00703c`; text to stone-900; form uses solid green button. Logo gets `mix-blend-multiply` to mask its dark vignette on the light bg — followup noted: want a transparent-background logo asset.
- **Referral Phase 1** — migration `002_referrals.sql` adds `referral_code` (unique, backfilled, NOT NULL), `referred_by_code` (FK, ON DELETE SET NULL), `direct_referrals` and `indirect_referrals` counters, plus an AFTER INSERT trigger that atomically increments the direct counter on the referrer and the indirect counter on the grandparent. Application code: `src/lib/referral-code.ts` (6-char alphanumeric, excludes 0/O/I/1, DB-backed collision retry), `/api/waitlist` accepts optional `referralCode` and blocks self-referral, `/r/[code]` route sets a 30-day `sneakers_ref` cookie, landing server component reads the cookie and renders a "Referred by operator X" banner, confirmation email now includes the recipient's own referral link + +5/+2 reward explanation.
- **Chrome-prompt convention.** Every prompt-for-Claude-Chrome now lives at `docs/prompts/<slug>.md` (user feedback: easier to copy-paste than inline chat). Two ready today: `apply-referral-migration.md` and `referral-qa-test.md`.

### Verification
- **Migration applied** (Supabase dashboard; one false-start due to Monaco editor swallowing a newline, re-injected and ran clean). Existing row backfilled with code `V5GHNE`.
- **Live chain test** — curled production `/api/waitlist` with an A→B→C chain where A was referred by jackson (V5GHNE), B by A, C by B. All four expected counter increments landed atomically:
  - jackson: direct=1 (A), indirect=1 (B via A)
  - A: direct=1 (B), indirect=1 (C via B)
  - B: direct=1 (C), indirect=0
  - C: direct=0, indirect=0
  - FKs all pointed correctly via `referred_by_code`
- Test rows deleted post-verification; jackson's counters manually reset to 0 (trigger only fires on insert, not on delete). Final prod state: one real row with clean counters.

### Pre-migration outage
Between deploying the Phase 1 code and the migration running, `/api/waitlist` 500'd for every signup because inserts referenced columns that didn't exist yet (`referral_code`, etc.). User reported the 500 in the window; verified via curl that the Supabase error was `column waitlist.referral_code does not exist`. Resolution was to apply the pending migration rather than roll back the code. Takeaway: when the next schema change ships, apply migration before or in the same deploy window as the code — don't trust that the Chrome prompt gets run in time.

### Branch
`feat/platform-scaffold` — commits pushed. Still stacked on `chore/monorepo-bootstrap`, still not merged to `main`. Production branch on Vercel is `feat/platform-scaffold`.

### What's Still Open
- User confirmation of the Wimbledon theme on the live site (they'll look after Vercel redeploys). Possible follow-ups: transparent-background logo asset, email template recolored to match the web theme.
- Referral QA via Claude Chrome (`docs/prompts/referral-qa-test.md`) not yet executed — user may still run it, or skip since I verified the chain from the server side.
- Next workstreams per user: Phase C step 2 = auth + dashboard (Supabase magic-link, cross-platform-ready for iOS); scrapers + Timescale plan doc; referral Phase 2 (user-facing share UI + status page).

## 2026-04-21 — Session 1: apps/platform skeleton

### Before state
- Fresh off `chore/monorepo-bootstrap` (Session 0). No `apps/platform`, no Supabase deps, no website scaffolding.
- Branched `feat/platform-scaffold` off `chore/monorepo-bootstrap` so this session reviews cleanly on top.

### Changes made
- **Scaffolded `apps/platform` via `pnpm create next-app@latest`** with `--typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*" --use-pnpm --yes`. Note: pulled current-latest, which is Next.js **16.2.4 / React 19.2.4 / Tailwind 4.2.3** — not 14/18/3 as the brief assumed. Scaffold also dropped a `CLAUDE.md` and `AGENTS.md` into the app directory; `AGENTS.md` warns that Next 16 has breaking API changes vs training-data Next, so I read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{route,page}.md` before writing any code and used the docs' preferred `Response.json()` in the route handler rather than the brief's `NextResponse.json()` (still works either way).
- **Renamed the package to `@sneakers/platform`** so it's resolvable under the workspace namespace and added a root convenience script `"platform": "pnpm --filter=@sneakers/platform run dev"` in the repo-root `package.json`.
- **Installed Supabase clients:** `@supabase/supabase-js` (runtime) and `@supabase/ssr` (dev) into `@sneakers/platform`.
- **Created `src/lib/supabase.ts`** (browser/anon client, throws at import-time if env missing) and **`src/lib/supabase-server.ts`** (`getServerClient()` with explicit missing-env check — deviated from the brief which used `!` non-null assertions, because those produce a cryptic Supabase-internal error rather than a clear "Missing env" message).
- **Wrote `supabase/migrations/001_waitlist.sql`** — `waitlist` table (id / email unique / source / referrer / ip_country / created_at), `created_at desc` index, RLS enabled. Inserts happen server-side via service role.
- **Wrote `src/app/api/waitlist/route.ts`** — POST handler that validates email, lowercases + trims, grabs `referer` and `cf-ipcountry` headers, inserts via service-role client, treats unique-violation (Postgres error code `23505`) as success so a re-signup returns 200.
- **Rewrote the landing page** (`src/app/page.tsx`) as a client component with email form, loading/done/error states. Terminal aesthetic.
- **Rewrote layout + globals** to drop the scaffold's light-mode-by-default + dual-font setup in favor of always-on green-on-black with mono by default. Title set to "Sneakers Terminal". Only Geist Mono is imported now.
- **Added `.env.local.example`** with the three Supabase keys empty. Root `.gitignore` already covers `.env.local`.
- **Added `vercel.json`** using the brief's monorepo-aware build command (`cd ../.. && pnpm install && pnpm --filter=@sneakers/platform build`). See Human TODO below for the simpler dashboard-based alternative.

### Verification
- `tsc --noEmit` inside `apps/platform` — clean, no errors.
- `pnpm --filter=@sneakers/platform run dev` — starts in ~200ms. `curl http://localhost:3000/` returns HTTP 200 with "Sneakers Terminal", "SNEAKERS TERMINAL", and "REQUEST ACCESS" visible in the rendered HTML. `curl -X POST /api/waitlist` returns HTTP 500 with a clear "Missing Supabase env vars" error in the dev log — exactly the expected "env wiring works, keys not yet provided" state the brief describes.

### Human TODO before deploy
- [ ] Create the Supabase project at supabase.com → copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` into `apps/platform/.env.local`
- [ ] Apply migration `apps/platform/supabase/migrations/001_waitlist.sql` — either via the Supabase dashboard SQL editor or `supabase db push` if the Supabase CLI is installed
- [ ] From `apps/platform/`, run `vercel` to link a new Vercel project. Consider: rather than relying on `vercel.json`'s `cd ../..` build command, set the project's **Root Directory** to `apps/platform` in the Vercel dashboard and delete `vercel.json`. Vercel auto-detects pnpm workspaces when Root Directory is set, and the build is more predictable. Only keep `vercel.json` if the dashboard approach doesn't work.
- [ ] Set the same three env keys in the Vercel project's dashboard (Environment Variables)
- [ ] Deploy: `vercel --prod`
- [ ] Only **after** the above: point `sneakersterminal.com` DNS at Vercel via the Chrome-agent Namecheap prompt — which now has a real Vercel project to target

### Branch
`feat/platform-scaffold` (off `chore/monorepo-bootstrap`) — commits not pushed, awaiting human review.

### Deviations from brief
- **Next 16 / React 19 / Tailwind 4** instead of the brief's assumed 14/18/3 — a consequence of `@latest`. Everything still works; API route uses the new recommended `Response.json()`, Tailwind 4's CSS-first `@theme` config replaces the old `tailwind.config.ts` pattern so the brief's "check tailwind.config.ts content paths" troubleshooting tip doesn't apply here.
- **`supabase-server.ts` uses an explicit missing-env check** instead of `!` assertions, for a clearer dev-time error.
- **Landing copy** adds an error-state line ("> Error. Try again in a moment.") that the brief didn't include, since otherwise a failed POST leaves the user staring at a silent form.

### Blockers hit
None.

## 2026-04-20 — Session 0: Monorepo bootstrap

### Before state
- Flat npm project at repo root
  - `package.json` name `sneakers-trading-bot`, type module
  - 11 trader scripts: `hunter`, `logger`, `analyzer`, `momentum`, `log-outcome`, `bitcoin`, `start`, `dashboard`, `crypto-hunter`, `calibration`, `correlations`
  - Deps: `better-sqlite3`, `dotenv`, `express`, `node-fetch`, `ws`
  - DevDeps: `@types/better-sqlite3`, `@types/express`, `@types/node`, `ts-node`, `tsx`, `typescript`
- `src/` at repo root, 32 top-level entries (31 files + `src/services/` + `src/db/`), mix of `.ts` and `.js` (notably `opportunity-hunter.js`, `limitless-executor.js`)
- Root `tsconfig.json` used target ES2020, module ESNext, moduleResolution node, `strict:false`, `allowJs:true`, `declaration:false` — deliberately loose
- Root-level `.env.example` (Limitless + Crypto.com keys)
- Only other docs at root: `README.md`, `TRACKING_SYSTEM.md` — not the `SNEAKERS.md`/`PROPHETX.md`/`platforms.yaml` the brief's "do not move" list anticipated. Nothing to protect there.
- No `scripts/` directory at root.
- No `.env` present — confirmed before the migration, so Step 9 runtime checks would hit env-var guards (not real APIs).

### Changes made
- **Workspace config at root:** `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `turbo.json` (build/dev/lint/test/clean pipelines), `tsconfig.base.json` (ES2022/NodeNext/strict — the aspirational base).
- **Trader move:** `git mv src apps/trader/src` and `git mv .env.example apps/trader/.env.example` — blame history preserved on every file. No content edits to trader code.
- **`apps/trader/package.json`:** name `@sneakers/trader`, private, all 11 scripts ported verbatim (paths like `src/...` are already app-relative), all deps + devDeps ported verbatim.
- **`apps/trader/tsconfig.json`:** extends `../../tsconfig.base.json` but overrides target ES2020, module ESNext, moduleResolution node, `strict:false`, `allowJs:true`, `declaration:false`, `declarationMap:false`, and adds `forceConsistentCasingInFileNames:true` + `exclude: ["node_modules","dist"]` to preserve the pre-migration compile behavior. Delta from base is deliberate — tightening strict/declaration/module would break the existing loose trader code, which is out of scope for this session.
- **Empty placeholders:** `packages/core` and `packages/sdk`, each with `package.json`, `tsconfig.json`, and `src/index.ts` containing `export {}`.
- **Root `package.json` rewritten** as workspace root: name `sneakers`, private, turbo-driven `build`/`dev`/`lint`/`test`/`clean`, plus convenience delegates for each original trader script (e.g. `pnpm run hunter` at root → `pnpm --filter=@sneakers/trader run hunter`). Used the `pnpm --filter` pattern over `turbo dev --filter ... -- hunter` because the trader doesn't have a `dev` task defined, and the script-passthrough form is less likely to break.
- **Package manager swap:** `package-lock.json` deleted, `pnpm@9` installed globally (resolved to 9.15.9), `pnpm install` at root — picked up all 4 workspace projects, 150 packages, `better-sqlite3` native build succeeded, no hoisting errors. `pnpm-lock.yaml` generated.
- **Stale root `tsconfig.json` removed** — its include pointed at `src/**/*` which no longer exists at root, and its content is now in `apps/trader/tsconfig.json`.

### Scripts tested post-migration
- `pnpm exec tsc --noEmit` inside `apps/trader/` — **pass** across all files except one pre-existing error: `src/services/portfolio-tracker.ts` imports `pg` but `pg` was never in dependencies (pre-migration gap, not caused by this session). Left as-is.
- `pnpm run log-outcome` inside `apps/trader/` — **pass**. ts-node/esm loader resolves imports, script reaches its usage-message branch and prints. Proves: import paths resolve, deps installed, `.env` path assumption (still relative to `apps/trader/`) is consistent.
- `pnpm run log-outcome -- --show` inside `apps/trader/` — script loads, hits its "Outcome must be YES or NO" arg-parsing branch (caused by the extra `--` pnpm inserts). Unrelated to migration; the usage-message test above is the clean signal.
- `pnpm run log-outcome` from repo root — **pass**. Root-level delegate correctly proxies via `pnpm --filter=@sneakers/trader run log-outcome`.
- Long-running bot scripts (`hunter`, `logger`, `dashboard`, `crypto-hunter`) not individually invoked; they would either block on API-key env-var checks (no `.env`) or spin up network polling — covered by `tsc --noEmit` for import resolution and by the shared loader/config that `log-outcome` already exercised.

### Branch
`chore/monorepo-bootstrap` — two commits, **not pushed**, awaiting human review:
1. `chore: move src/ to apps/trader/src (monorepo bootstrap)` — all renames + `apps/trader/package.json` + `apps/trader/tsconfig.json`
2. `chore: establish pnpm + turborepo workspace root` — root package.json rewrite, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `packages/core` + `packages/sdk` scaffolds, lockfile swap, stale root tsconfig removal

### Human TODO before proceeding to Session 1
- [ ] Review `git diff main..chore/monorepo-bootstrap` — especially `apps/trader/tsconfig.json` and the root `package.json` script delegates
- [ ] Add `pg` to `apps/trader/package.json` deps (or delete the unused import in `portfolio-tracker.ts`) — pre-existing bug surfaced by the type-check
- [ ] Spot-check a long-running bot locally once `.env` is in place (trader's `.env` lives at `apps/trader/.env` now, not at repo root)
- [ ] If any CI or deploy script invokes `npm run <x>` at the old root, switch to `pnpm run <x>` (same surface, new binary)
- [ ] Decide whether to merge `chore/monorepo-bootstrap` into `main` before Session 1 (website) or work off the branch
- [ ] Consider configuring `git config user.email` / `user.name` — current commits are attributed to `jeremyalbus@Jeremys-Mac-Studio.local`, not the GitHub identity

### Blockers hit
None.

### Deviations from brief
- **Did not honor the "do not move" doc list.** The briefed files (`SNEAKERS.md`, `PROPHETX.md`, `COINBASE.md`, `platforms.yaml`) do not exist in this repo. Only `README.md` and `TRACKING_SYSTEM.md` are at root and both were left there, consistent with the spirit of the rule.
- **Deleted the old root `tsconfig.json`.** The brief is silent on this. Leaving it would have been misleading (include pattern `src/**/*` no longer resolves) and its settings are fully preserved in `apps/trader/tsconfig.json`. Flagged here for review.
- **`apps/trader/tsconfig.json` overrides nearly every field from `tsconfig.base.json`.** This was deliberate to preserve the pre-migration compile behavior — the trader code relies on `strict:false`, `allowJs:true`, and `moduleResolution:node`. Tightening those is a later, careful session.
- **Added per-script root-level delegates** (`hunter`, `logger`, `dashboard`, etc.) rather than just one as the brief suggested. The aim was to make `pnpm run <script>` at the repo root feel identical to the previous `npm run <script>` for the user's daily commands.
