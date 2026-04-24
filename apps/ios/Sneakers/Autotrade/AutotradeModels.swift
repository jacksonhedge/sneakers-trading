import Foundation

enum BucketScope: String, Codable, CaseIterable, Identifiable {
    case game = "game"
    case timeWindow = "time_window"
    case category = "category"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .game: return "Single game"
        case .timeWindow: return "Time window"
        case .category: return "Category"
        }
    }

    var icon: String {
        switch self {
        case .game: return "sportscourt.fill"
        case .timeWindow: return "clock.fill"
        case .category: return "square.grid.2x2.fill"
        }
    }

    var blurb: String {
        switch self {
        case .game: return "Cap dollars on one event"
        case .timeWindow: return "Cap dollars across a window"
        case .category: return "Cap dollars across a market type"
        }
    }
}

enum AutotradeStrategy: String, Codable, CaseIterable, Identifiable {
    case followOToole = "follow_otoole"
    case arbScanner = "arb_scanner"
    case driftDetector = "drift_detector"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .followOToole: return "Follow O'Toole"
        case .arbScanner: return "Arb scanner"
        case .driftDetector: return "Drift detector"
        }
    }

    var blurb: String {
        switch self {
        case .followOToole: return "Use the model's recommended bets."
        case .arbScanner: return "Fire only on cross-book divergence > 5pp."
        case .driftDetector: return "Fire only when implied prob moves > 10pp in 10m."
        }
    }

    var icon: String {
        switch self {
        case .followOToole: return "brain.head.profile"
        case .arbScanner: return "arrow.left.arrow.right"
        case .driftDetector: return "waveform.path.ecg"
        }
    }
}

enum NotifyMode: String, Codable, CaseIterable, Identifiable {
    case everyTrade = "every_trade"
    case hourlySummary = "hourly_summary"
    case thresholdOnly = "threshold_only"
    case dailyWrap = "daily_wrap"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .everyTrade: return "Every trade"
        case .hourlySummary: return "Hourly summary"
        case .thresholdOnly: return "Threshold only"
        case .dailyWrap: return "Daily wrap"
        }
    }

    var blurb: String {
        switch self {
        case .everyTrade: return "Push for every fill."
        case .hourlySummary: return "One push per hour with P&L + fills."
        case .thresholdOnly: return "Push only on -10% / +10% swings."
        case .dailyWrap: return "One push at 11pm with the day's P&L."
        }
    }

    var icon: String {
        switch self {
        case .everyTrade: return "bell.badge.fill"
        case .hourlySummary: return "clock.badge.fill"
        case .thresholdOnly: return "exclamationmark.triangle.fill"
        case .dailyWrap: return "moon.stars.fill"
        }
    }
}

enum TradeOutcome: String, Codable {
    case won
    case lost
    case pending

    var label: String {
        switch self {
        case .won: return "WON"
        case .lost: return "LOST"
        case .pending: return "PENDING"
        }
    }
}

struct AutotradeBucket: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var scopeType: BucketScope
    var allocated: Decimal
    var spent: Decimal
    var strategy: AutotradeStrategy
    var notifyMode: NotifyMode
    var pnl: Decimal
    var tradeCount: Int
    var paused: Bool
    let createdAt: Date

    var remaining: Decimal {
        max(0, allocated - spent)
    }

    var progress: Double {
        guard allocated > 0 else { return 0 }
        let s = NSDecimalNumber(decimal: spent).doubleValue
        let a = NSDecimalNumber(decimal: allocated).doubleValue
        return min(1.0, max(0.0, s / a))
    }
}

struct AutotradeTrade: Codable, Identifiable, Hashable {
    let id: UUID
    let bucketId: UUID
    let market: String
    let stake: Decimal
    let outcome: TradeOutcome
    let pnl: Decimal?
    let placedAt: Date
}

/// Compact snapshot serialized into the App Group for the widget.
struct AutotradeSnapshot: Codable {
    let totalBudget: Decimal
    let totalSpent: Decimal
    let totalReserved: Decimal
    let pnlToday: Decimal
    let activeBucketCount: Int
    let pausedAll: Bool
    let topBucketTitle: String?
    let topBucketProgress: Double
    let recentTrades: [AutotradeTrade]
    let updatedAt: Date

    static let placeholder = AutotradeSnapshot(
        totalBudget: 200,
        totalSpent: 67,
        totalReserved: 50,
        pnlToday: 12.40,
        activeBucketCount: 3,
        pausedAll: false,
        topBucketTitle: "Lakers @ Warriors",
        topBucketProgress: 0.6,
        recentTrades: [],
        updatedAt: Date()
    )
}
