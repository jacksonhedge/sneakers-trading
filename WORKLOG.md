# Sneakers — Work Log

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
