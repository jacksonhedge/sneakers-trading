import Foundation

/// Bridge between the host app and the widget extension via the App Group.
/// The widget cannot read the app's mock API directly; it reads a JSON snapshot
/// the app writes whenever autotrade state changes.
enum AutotradeSharedStore {
    static let appGroupID = "group.com.sneakersterminal.ios"
    private static let snapshotKey = "autotrade.snapshot.v1"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    static func writeSnapshot(_ snapshot: AutotradeSnapshot) {
        guard let defaults else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(snapshot) else { return }
        defaults.set(data, forKey: snapshotKey)
    }

    static func readSnapshot() -> AutotradeSnapshot? {
        guard let defaults, let data = defaults.data(forKey: snapshotKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(AutotradeSnapshot.self, from: data)
    }
}
