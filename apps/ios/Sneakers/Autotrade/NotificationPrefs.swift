import Foundation
import Observation

@Observable
@MainActor
final class NotificationPrefs {
    static let shared = NotificationPrefs()

    private let defaults = UserDefaults.standard
    private let modeKey = "autotrade.notify.defaultMode.v1"
    private let permissionAskedKey = "autotrade.notify.permissionAsked.v1"

    var defaultMode: NotifyMode {
        didSet {
            defaults.set(defaultMode.rawValue, forKey: modeKey)
        }
    }

    var permissionAsked: Bool {
        didSet {
            defaults.set(permissionAsked, forKey: permissionAskedKey)
        }
    }

    private init() {
        if let raw = defaults.string(forKey: modeKey),
           let m = NotifyMode(rawValue: raw) {
            self.defaultMode = m
        } else {
            self.defaultMode = .everyTrade
        }
        self.permissionAsked = defaults.bool(forKey: permissionAskedKey)
    }
}
