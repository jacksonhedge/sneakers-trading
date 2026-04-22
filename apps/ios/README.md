# Sneakers iOS

SwiftUI iOS app. Shares Supabase auth + data with the web at sneakersterminal.com.

## First-time setup

1. **Install Xcode** (full app, not just CLT): Mac App Store → Xcode. After install:
   ```
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
2. **Install xcodegen**:
   ```
   brew install xcodegen
   ```
3. **Fill in Supabase credentials.** Open `Sneakers/Info.plist` and replace:
   - `SupabaseURL` → value of `NEXT_PUBLIC_SUPABASE_URL` from `apps/platform/.env.local`
   - `SupabaseAnonKey` → value of `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Add the iOS redirect URL to Supabase.** In the Supabase dashboard (project `ujfgtkebslesepbjrhyr`) → Authentication → URL Configuration → Redirect URLs, add:
   ```
   sneakers://auth/callback
   ```
5. **Generate the Xcode project** (from `apps/ios/`):
   ```
   xcodegen generate
   ```
6. **Open + build**:
   ```
   open Sneakers.xcodeproj
   ```
   Select an iPhone simulator, press ⌘R.

## Running on device / TestFlight

- Apple Developer account ($99/yr) required.
- In Xcode → Sneakers target → Signing & Capabilities → check "Automatically manage signing", pick your team.
- Archive → Distribute App → App Store Connect → TestFlight.

## Structure

```
Sneakers/
├── SneakersApp.swift        # @main, root scene + URL handling
├── AppConfig.swift          # Info.plist-backed config
├── AppState.swift           # @Observable auth + session
├── SupabaseClientProvider.swift
├── BiometryGate.swift       # LocalAuthentication wrapper
├── Models.swift             # API response Codable types
├── OpportunitiesAPI.swift   # GET /api/markets/opportunities
├── LoginView.swift          # magic-link email form
├── LockView.swift           # Face ID / passcode unlock screen
├── RootTabView.swift        # 4-tab shell
├── MoneyTab.swift           # embedded USDC wallet (placeholder)
├── OpportunitiesTab.swift   # Markets feed — live in M2
├── PortfolioTab.swift       # trade journal (placeholder)
├── SettingsTab.swift        # email + sign out
├── Info.plist
└── Assets.xcassets/
```

## Auth flow

Four `AuthPhase` states drive `RootView`:

1. **`.loading`** — bootstrap waiting on `authStateChanges`
2. **`.signedOut`** — `LoginView` (email → magic link)
3. **`.locked`** — `LockView` (launched with an existing session, biometry required)
4. **`.signedIn`** — `RootTabView`

Magic-link loop:
- `LoginView` → `AppState.sendMagicLink(to:)` → Supabase sends email
- User taps link → iOS opens `sneakers://auth/callback#access_token=…&refresh_token=…`
- `SneakersApp.onOpenURL` → `AppState.handleIncomingURL` → `supabase.auth.session(from: url)`
- `authStateChanges` emits `.signedIn` → phase flips to `.signedIn` (skips `.locked` because the user just authenticated)

App-launch biometry gate:
- `.initialSession` with a session + biometry available → `.locked`, then `tryUnlock()` runs `LAContext.deviceOwnerAuthentication` (Face ID / Touch ID / passcode fallback)
- On success → `.signedIn`. On failure → user taps UNLOCK in `LockView` to retry, or Sign out.

## Roadmap for this app

- **M1 ✅ (shipped):** auth + tab shell, compiles and runs in simulator
- **M2 ✅ (shipped):** Markets feed reads `/api/markets/opportunities` with pull-to-refresh + empty/error states; Face ID app-launch gate via LocalAuthentication
- **M3:** Trade journal + `user_trades` Supabase table + RLS; referral share-sheet in Settings
- **M4:** Embedded wallet (Privy or Turnkey) — Apple Pay → USDC on Polygon → send to Polymarket
- **M5:** Universal Links (replace custom scheme), push notifications, TestFlight
- **M6:** Subscriptions (Apple IAP / StoreKit 2)

## Known gap (2026-04-22)

The Markets tab calls `GET https://sneakersterminal.com/api/markets/opportunities`. That route reads JSONL from `apps/trader/data/*/<date>.jsonl` on the local filesystem. Vercel's serverless runtime has no access to Albus's disk, so the deployed endpoint always returns `{ opportunities: [], note: "No scraper data available. Start the scrape loop on the host machine." }`. The iOS app handles that empty-state correctly.

To exercise the feed against real data, either:
- Run `pnpm dev` on Albus (where the JSONL lives) and point `SneakersAPIBaseURL` at `http://<albus-lan-ip>:3000`, or
- Finish the Timescale migration and swap the route to read from the DB.

## Design principles

- UI matches web terminal aesthetic: monospaced, green accent (`#00703c`), stone backgrounds.
- All authenticated endpoints are plain HTTP JSON — no Next-only primitives — so web and iOS hit the same routes.
- Trade execution always happens on the venue (affiliate links). Sneakers never custodies trading funds.
- For reads of `user_trades` and other RLS-protected tables, go direct to Supabase PostgREST via `supabase-swift`. Use `/api/*` only for aggregation (opportunities, market details).
