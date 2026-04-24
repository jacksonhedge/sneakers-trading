import Foundation

enum AutotradeFormat {
    static func money(_ d: Decimal, fractionDigits: Int = 2) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = fractionDigits
        f.minimumFractionDigits = fractionDigits
        return f.string(from: NSDecimalNumber(decimal: d)) ?? "$0.00"
    }

    static func signedMoney(_ d: Decimal, fractionDigits: Int = 2) -> String {
        let n = NSDecimalNumber(decimal: d).doubleValue
        let prefix = n >= 0 ? "+" : "−"
        let abs = Swift.abs(n)
        return String(format: "\(prefix)$%.\(fractionDigits)f", abs)
    }

    static func compactMoney(_ d: Decimal) -> String {
        let n = NSDecimalNumber(decimal: d).doubleValue
        if n >= 1_000_000 { return String(format: "$%.1fM", n / 1_000_000) }
        if n >= 10_000 { return String(format: "$%.1fK", n / 1_000) }
        return String(format: "$%.0f", n)
    }

    static func relative(_ date: Date, now: Date = Date()) -> String {
        let delta = now.timeIntervalSince(date)
        if delta < 60 { return "now" }
        if delta < 3600 { return "\(Int(delta / 60))m ago" }
        if delta < 86400 { return "\(Int(delta / 3600))h ago" }
        return "\(Int(delta / 86400))d ago"
    }

    static func clockTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }
}
