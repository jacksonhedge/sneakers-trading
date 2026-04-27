# Claude Code prompt — iOS auto-trade budgets + notifications

Hand this to a fresh Claude Code session running in `~/sneakers-trading/apps/ios/`. Builds the iOS auto-trade surface: per-event / per-hour sub-budgets, paper-trading first, push notifications when bots fire, all matching the existing app's design language.

---

I need you to extend the Sneakers iOS app (SwiftUI, at `apps/ios/`) with an auto-trade feature. Read these first to ground yourself:

- `apps/ios/README.md` — current app structure, auth flow, design principles, M1-M5 roadmap (we're at M2 done; this work is roughly M3.5 — sits between trade journal and full embedded wallet)
- `apps/ios/Sneakers/RootTabView.swift` — current 4-tab shell (Money / Opportunities / Portfolio / Settings)
- `apps/ios/Sneakers/Models.swift` — Codable types
- `apps/ios/Sneakers/OpportunitiesAPI.swift` — pattern for HTTP calls to sneakersterminal.com
- `apps/ios/Sneakers/SupabaseClientProvider.swift` — direct PostgREST pattern for RLS-protected tables
- `docs/PLAN_GROUPS_AND_PRODUCT_SPLIT.md` — the autotrade vision sits in the Terminal tier
- `apps/platform/src/app/dashboard/settings/autotrade/page.tsx` — web's autotrade waitlist surface (for design parity)

## Product spec

A user can:

1. **Set a total auto-trade budget** ("$200 today")
2. **Allocate that budget into sub-buckets**:
   - Per-game (e.g. "$50 on Lakers @ Warriors", "$100 on Yankees @ Red Sox")
   - Per-hour window (e.g. "$30 between 8-10pm covering whatever lives")
   - Per-category (e.g. "$50 reserved for crypto markets")
3. **Choose a strategy per bucket**:
   - "Follow O'Toole's recommendations" (default — uses model output)
   - "Only when arb scanner finds cross-book divergence > 5pp"
   - "Only when implied probability moves > 10pp in 10 minutes"
4. **Get notified** at intervals they choose:
   - Every trade (push notification per fill)
   - Hourly summary (1 push per hour with P&L + recent fills)
   - Threshold-based (only push if down > -10% or up > +10%)
   - Daily wrap-up (one push at 11pm)
5. **See live status** in the app:
   - Active buckets with remaining budget + current P&L
   - Recent trades (last 24h) with outcome
   - "Pause all" kill switch

## Phase 1 — UI shell + mock data (~2 days, this prompt's scope)

Build the iOS surface end-to-end against **mocked data**. Don't wire to real backend yet — that's Phase 2. The point is to land the UX so the user can poke around in simulator.

### New screen: AutotradeTab

Add a 5th tab to `RootTabView` between Portfolio and Settings:
- Tab icon: SF Symbol `bolt.shield.fill`
- Title: "Autotrade"
- Tag color: emerald (match the existing palette)

### AutotradeTab structure

**Top section — Today's budget**
- Big number: total daily budget allocation (e.g. `$200.00`)
- Subtext: "$N spent · $M reserved · $K available"
- "Pause All" toggle (inactive when no budgets exist)
- Edit button → opens `BudgetEditor` sheet

**Middle section — Active buckets** (list)
- Each bucket card shows:
  - Title (e.g. "Lakers @ Warriors", "8-10pm Live Markets", "Crypto today")
  - Strategy ("Follow O'Toole" / "Arb scanner" / "Drift")
  - Progress bar — spent vs allocated
  - Current P&L (green if positive, red if negative)
  - Trade count
  - Tap → drills into `BucketDetail`
- Empty state: "No active buckets. Tap + to start."
- + button (top-right) → `BudgetCreator` sheet

**Bottom section — Recent trades (last 24h)**
- Compact list, max 10 rows
- Each row: timestamp · market · stake · result (won $X / lost $X / pending)
- Tap → `TradeDetail` (read-only)

### Sheets

**BudgetCreator** — new bucket flow:
- Step 1: Pick scope (single game / time window / category)
- Step 2: Set $ amount (slider $5-$500)
- Step 3: Pick strategy (3 options as cards)
- Step 4: Notification preference (4 options as cards)
- Confirm → calls `AutotradeAPI.createBucket()` (mock)

**BudgetEditor** — edit total daily budget:
- Stepper for total $ (in $25 increments)
- "Reset all buckets" destructive button

**BucketDetail** — drill-in:
- Full P&L history chart (use Swift Charts)
- All trades for this bucket
- Edit / Pause / Delete buttons

### Mock data layer

Create `Sneakers/Autotrade/MockAutotradeAPI.swift`:

```swift
struct AutotradeBucket: Codable, Identifiable {
    let id: UUID
    let title: String
    let scopeType: String   // "game" | "time_window" | "category"
    let allocated: Decimal
    let spent: Decimal
    let strategy: String
    let notifyMode: String
    let pnl: Decimal
    let tradeCount: Int
    let createdAt: Date
}

struct AutotradeTrade: Codable, Identifiable {
    let id: UUID
    let bucketId: UUID
    let market: String
    let stake: Decimal
    let outcome: String  // "won" | "lost" | "pending"
    let pnl: Decimal?
    let placedAt: Date
}
```

Static fixtures: 3 buckets, 12 trades across them, mixed outcomes.

### Notification scaffolding

Don't wire APNS yet. Add `Sneakers/Autotrade/NotificationPrefs.swift` with:

```swift
enum NotifyMode: String, Codable, CaseIterable {
    case everyTrade = "every_trade"
    case hourlySummary = "hourly_summary"
    case thresholdOnly = "threshold_only"
    case dailyWrap = "daily_wrap"
}
```

Persist via `UserDefaults` for now (no Supabase round-trip). Add a `NotificationCenter`-based local-notification stub so simulator users see the UX even without push.

### Design constraints

- Match the existing app's monospaced eyebrows + emerald accent
- All money values: tabular-nums, monospaced
- All percentages: tabular-nums
- Use the existing `BankrollCard.swift` look as reference for the budget card
- iOS 17+ (Observation framework, Swift Charts)
- No external SDKs

### What NOT to build in Phase 1

- Real Supabase tables (Phase 2)
- APNS push tokens (Phase 2 — once Apple Dev account is set up)
- Actual trade execution (Phase 3 — needs Polymarket wallet integration)
- Cross-book arb scanner integration (already exists on web; wire later)

## Phase 2 — backend integration (separate prompt, after Phase 1)

When Phase 1 lands cleanly:
- Supabase tables: `autotrade_buckets`, `autotrade_trades` with RLS
- Replace MockAutotradeAPI with real PostgREST calls
- Cron (web side) executes the strategy + writes trades
- iOS polls every 30s for new trades + uses Supabase Realtime for live updates

## Phase 3 — actual execution

- Polymarket wallet integration (Privy/Turnkey on Polygon, USDC stake)
- Sportsbook integration is OUT OF SCOPE — each book's ToS prohibits 3rd-party automation
- Strategy compiler: natural-language rule → execution engine

## Acceptance criteria for THIS prompt's work

- New `AutotradeTab` visible as 5th tab in simulator build
- All 4 sheets (`BudgetCreator`, `BudgetEditor`, `BucketDetail`, `TradeDetail`) reachable + render with mock data
- Notification preference UI present, persists to UserDefaults
- One local notification fires when user creates a bucket (proves the path works)
- `xcodegen generate` + clean build + `pnpm` dev unaffected (no web-side changes)
- Commit message format: `feat(ios): autotrade tab — buckets + mock data + local notif scaffold`

## Boundaries

- Don't modify `apps/platform/` (web app) — out of scope for this work
- Don't modify scrapers
- Don't add real money flows — all data is local mock
- No new external pods/SwiftPM dependencies — use stdlib + Apple frameworks only
- If Xcode/xcodegen aren't installed, stop and ask — don't try to build without them

## Branch + PR

Work on a new branch `feat/ios-autotrade-m3.5`. When done, push and open a PR against `main` with screenshots of all 4 screens in simulator. Don't merge yourself — leave for review.
