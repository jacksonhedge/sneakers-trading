import Foundation
import UserNotifications

/// Local-notification stub. Phase 2 swaps the body for APNS-driven payloads,
/// but the call sites stay the same: every event the cron would push, the
/// host app schedules a local notification so the UX is exercised in simulator.
enum AutotradeNotifications {
    static func requestPermissionIfNeeded() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .denied:
            return false
        case .notDetermined:
            do {
                return try await center.requestAuthorization(options: [.alert, .sound, .badge])
            } catch {
                return false
            }
        @unknown default:
            return false
        }
    }

    static func scheduleBucketCreated(_ bucket: AutotradeBucket) {
        let content = UNMutableNotificationContent()
        content.title = "Autotrade bucket armed"
        content.body = "\(bucket.title) · \(formatMoney(bucket.allocated)) · \(bucket.strategy.label)"
        content.sound = .default
        content.userInfo = ["bucketId": bucket.id.uuidString, "kind": "bucket_created"]

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "bucket-created-\(bucket.id.uuidString)",
            content: content,
            trigger: trigger
        )
        UNUserNotificationCenter.current().add(request)
    }

    static func scheduleTradeFired(_ trade: AutotradeTrade, bucketTitle: String) {
        let content = UNMutableNotificationContent()
        content.title = "Trade placed · \(bucketTitle)"
        content.body = "\(trade.market) · \(formatMoney(trade.stake))"
        content.sound = .default
        content.userInfo = ["tradeId": trade.id.uuidString, "kind": "trade_fired"]

        let request = UNNotificationRequest(
            identifier: "trade-\(trade.id.uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        )
        UNUserNotificationCenter.current().add(request)
    }

    private static func formatMoney(_ d: Decimal) -> String {
        let n = NSDecimalNumber(decimal: d).doubleValue
        return String(format: "$%.0f", n)
    }
}
