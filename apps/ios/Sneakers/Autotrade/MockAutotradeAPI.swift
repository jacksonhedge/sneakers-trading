import Foundation

/// In-memory mock backing the autotrade UI in Phase 1.
/// Persists to standard UserDefaults so simulator state survives relaunch.
/// Phase 2 will swap this for Supabase PostgREST + cron-driven trade rows.
@MainActor
final class MockAutotradeAPI {
    static let shared = MockAutotradeAPI()

    private(set) var totalDailyBudget: Decimal = 200
    private(set) var pausedAll: Bool = false
    private(set) var buckets: [AutotradeBucket] = []
    private(set) var trades: [AutotradeTrade] = []

    private let defaults = UserDefaults.standard
    private let bucketsKey = "autotrade.buckets.v1"
    private let tradesKey = "autotrade.trades.v1"
    private let totalKey = "autotrade.total.v1"
    private let pausedKey = "autotrade.paused.v1"

    private init() {
        load()
        if buckets.isEmpty && trades.isEmpty {
            seedFixtures()
            persist()
        }
    }

    // MARK: - Reads

    func fetchBuckets() -> [AutotradeBucket] { buckets }
    func fetchTrades() -> [AutotradeTrade] {
        trades.sorted { $0.placedAt > $1.placedAt }
    }
    func recentTrades(limit: Int = 10) -> [AutotradeTrade] {
        Array(fetchTrades().prefix(limit))
    }
    func trades(for bucketId: UUID) -> [AutotradeTrade] {
        fetchTrades().filter { $0.bucketId == bucketId }
    }

    // MARK: - Writes

    @discardableResult
    func createBucket(
        title: String,
        scopeType: BucketScope,
        allocated: Decimal,
        strategy: AutotradeStrategy,
        notifyMode: NotifyMode
    ) -> AutotradeBucket {
        let bucket = AutotradeBucket(
            id: UUID(),
            title: title,
            scopeType: scopeType,
            allocated: allocated,
            spent: 0,
            strategy: strategy,
            notifyMode: notifyMode,
            pnl: 0,
            tradeCount: 0,
            paused: false,
            createdAt: Date()
        )
        buckets.append(bucket)
        persist()
        return bucket
    }

    func update(_ bucket: AutotradeBucket) {
        guard let idx = buckets.firstIndex(where: { $0.id == bucket.id }) else { return }
        buckets[idx] = bucket
        persist()
    }

    func deleteBucket(_ id: UUID) {
        buckets.removeAll { $0.id == id }
        trades.removeAll { $0.bucketId == id }
        persist()
    }

    func togglePause(_ id: UUID) {
        guard let idx = buckets.firstIndex(where: { $0.id == id }) else { return }
        buckets[idx].paused.toggle()
        persist()
    }

    func setPausedAll(_ paused: Bool) {
        pausedAll = paused
        persist()
    }

    func setTotalBudget(_ amount: Decimal) {
        totalDailyBudget = max(0, amount)
        persist()
    }

    func resetAllBuckets() {
        buckets.removeAll()
        trades.removeAll()
        persist()
    }

    // MARK: - Snapshot

    func snapshot() -> AutotradeSnapshot {
        let activeBuckets = buckets.filter { !$0.paused }
        let totalSpent: Decimal = buckets.reduce(0) { $0 + $1.spent }
        let totalAllocated: Decimal = buckets.reduce(0) { $0 + $1.allocated }
        let reserved = max(0, totalAllocated - totalSpent)
        let pnlToday: Decimal = buckets.reduce(0) { $0 + $1.pnl }
        let top = buckets.max { lhs, rhs in
            NSDecimalNumber(decimal: lhs.allocated).doubleValue
                < NSDecimalNumber(decimal: rhs.allocated).doubleValue
        }
        return AutotradeSnapshot(
            totalBudget: totalDailyBudget,
            totalSpent: totalSpent,
            totalReserved: reserved,
            pnlToday: pnlToday,
            activeBucketCount: activeBuckets.count,
            pausedAll: pausedAll,
            topBucketTitle: top?.title,
            topBucketProgress: top?.progress ?? 0,
            recentTrades: Array(fetchTrades().prefix(3)),
            updatedAt: Date()
        )
    }

    // MARK: - Persistence

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(buckets) {
            defaults.set(data, forKey: bucketsKey)
        }
        if let data = try? encoder.encode(trades) {
            defaults.set(data, forKey: tradesKey)
        }
        defaults.set(NSDecimalNumber(decimal: totalDailyBudget).doubleValue, forKey: totalKey)
        defaults.set(pausedAll, forKey: pausedKey)
    }

    private func load() {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let data = defaults.data(forKey: bucketsKey),
           let decoded = try? decoder.decode([AutotradeBucket].self, from: data) {
            buckets = decoded
        }
        if let data = defaults.data(forKey: tradesKey),
           let decoded = try? decoder.decode([AutotradeTrade].self, from: data) {
            trades = decoded
        }
        if defaults.object(forKey: totalKey) != nil {
            totalDailyBudget = Decimal(defaults.double(forKey: totalKey))
        }
        pausedAll = defaults.bool(forKey: pausedKey)
    }

    private func seedFixtures() {
        let now = Date()
        let lakersId = UUID()
        let liveId = UUID()
        let cryptoId = UUID()

        buckets = [
            AutotradeBucket(
                id: lakersId,
                title: "Lakers @ Warriors",
                scopeType: .game,
                allocated: 50,
                spent: 32,
                strategy: .followOToole,
                notifyMode: .everyTrade,
                pnl: 8.20,
                tradeCount: 4,
                paused: false,
                createdAt: now.addingTimeInterval(-3600 * 5)
            ),
            AutotradeBucket(
                id: liveId,
                title: "8-10pm Live Markets",
                scopeType: .timeWindow,
                allocated: 100,
                spent: 22,
                strategy: .driftDetector,
                notifyMode: .hourlySummary,
                pnl: -3.10,
                tradeCount: 3,
                paused: false,
                createdAt: now.addingTimeInterval(-3600 * 2)
            ),
            AutotradeBucket(
                id: cryptoId,
                title: "Crypto today",
                scopeType: .category,
                allocated: 50,
                spent: 13,
                strategy: .arbScanner,
                notifyMode: .thresholdOnly,
                pnl: 7.30,
                tradeCount: 2,
                paused: false,
                createdAt: now.addingTimeInterval(-3600 * 8)
            )
        ]

        trades = [
            AutotradeTrade(id: UUID(), bucketId: lakersId, market: "LAL ML +3.5", stake: 8, outcome: .won, pnl: 7.20, placedAt: now.addingTimeInterval(-3600 * 4)),
            AutotradeTrade(id: UUID(), bucketId: lakersId, market: "Curry over 28.5 pts", stake: 8, outcome: .lost, pnl: -8, placedAt: now.addingTimeInterval(-3600 * 3 - 1200)),
            AutotradeTrade(id: UUID(), bucketId: lakersId, market: "LeBron over 6.5 ast", stake: 8, outcome: .won, pnl: 6.40, placedAt: now.addingTimeInterval(-3600 * 3)),
            AutotradeTrade(id: UUID(), bucketId: lakersId, market: "Q4 total over 54.5", stake: 8, outcome: .pending, pnl: nil, placedAt: now.addingTimeInterval(-1800)),

            AutotradeTrade(id: UUID(), bucketId: liveId, market: "DAL +4 live", stake: 7, outcome: .won, pnl: 5.30, placedAt: now.addingTimeInterval(-3600)),
            AutotradeTrade(id: UUID(), bucketId: liveId, market: "BOS -1.5 live", stake: 8, outcome: .lost, pnl: -8, placedAt: now.addingTimeInterval(-2200)),
            AutotradeTrade(id: UUID(), bucketId: liveId, market: "MIA total over 218", stake: 7, outcome: .pending, pnl: nil, placedAt: now.addingTimeInterval(-700)),

            AutotradeTrade(id: UUID(), bucketId: cryptoId, market: "BTC > $73k by 4pm", stake: 6, outcome: .won, pnl: 4.10, placedAt: now.addingTimeInterval(-3600 * 6)),
            AutotradeTrade(id: UUID(), bucketId: cryptoId, market: "ETH < $4k EOD", stake: 7, outcome: .won, pnl: 3.20, placedAt: now.addingTimeInterval(-3600 * 5 - 600)),

            AutotradeTrade(id: UUID(), bucketId: liveId, market: "PHI -3.5 live", stake: 8, outcome: .pending, pnl: nil, placedAt: now.addingTimeInterval(-300)),
            AutotradeTrade(id: UUID(), bucketId: lakersId, market: "1H total over 110", stake: 8, outcome: .won, pnl: 6.60, placedAt: now.addingTimeInterval(-3600 * 4 - 1200)),
            AutotradeTrade(id: UUID(), bucketId: cryptoId, market: "SOL > $200 today", stake: 8, outcome: .pending, pnl: nil, placedAt: now.addingTimeInterval(-900))
        ]
    }
}
