import Foundation
import Observation
import WidgetKit

/// View-facing state for the autotrade surface.
/// Wraps MockAutotradeAPI today; Phase 2 swaps this internal for a Supabase client.
@Observable
@MainActor
final class AutotradeStore {
    var buckets: [AutotradeBucket] = []
    var trades: [AutotradeTrade] = []
    var totalDailyBudget: Decimal = 200
    var pausedAll: Bool = false

    private let api = MockAutotradeAPI.shared

    init() { reload() }

    // MARK: - Derived totals

    var totalAllocated: Decimal {
        buckets.reduce(0) { $0 + $1.allocated }
    }
    var totalSpent: Decimal {
        buckets.reduce(0) { $0 + $1.spent }
    }
    var totalReserved: Decimal {
        max(0, totalAllocated - totalSpent)
    }
    var totalAvailable: Decimal {
        max(0, totalDailyBudget - totalAllocated)
    }
    var pnlToday: Decimal {
        buckets.reduce(0) { $0 + $1.pnl }
    }
    var activeBuckets: [AutotradeBucket] {
        buckets.filter { !$0.paused }
    }

    // MARK: - Actions

    func reload() {
        buckets = api.fetchBuckets()
        trades = api.fetchTrades()
        totalDailyBudget = api.totalDailyBudget
        pausedAll = api.pausedAll
        publishSnapshot()
    }

    @discardableResult
    func createBucket(
        title: String,
        scopeType: BucketScope,
        allocated: Decimal,
        strategy: AutotradeStrategy,
        notifyMode: NotifyMode
    ) async -> AutotradeBucket {
        _ = await AutotradeNotifications.requestPermissionIfNeeded()
        let bucket = api.createBucket(
            title: title,
            scopeType: scopeType,
            allocated: allocated,
            strategy: strategy,
            notifyMode: notifyMode
        )
        AutotradeNotifications.scheduleBucketCreated(bucket)
        reload()
        return bucket
    }

    func update(_ bucket: AutotradeBucket) {
        api.update(bucket)
        reload()
    }

    func togglePause(_ id: UUID) {
        api.togglePause(id)
        reload()
    }

    func deleteBucket(_ id: UUID) {
        api.deleteBucket(id)
        reload()
    }

    func setTotalBudget(_ amount: Decimal) {
        api.setTotalBudget(amount)
        reload()
    }

    func setPausedAll(_ paused: Bool) {
        api.setPausedAll(paused)
        reload()
    }

    func resetAllBuckets() {
        api.resetAllBuckets()
        reload()
    }

    func recentTrades(limit: Int = 10) -> [AutotradeTrade] {
        api.recentTrades(limit: limit)
    }

    func trades(for bucketId: UUID) -> [AutotradeTrade] {
        api.trades(for: bucketId)
    }

    // MARK: - Widget snapshot

    private func publishSnapshot() {
        AutotradeSharedStore.writeSnapshot(api.snapshot())
        WidgetCenter.shared.reloadAllTimelines()
    }
}
