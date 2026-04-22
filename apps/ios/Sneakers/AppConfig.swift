import Foundation

enum AppConfig {
    static let supabaseURL: URL = {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SupabaseURL") as? String,
              !raw.hasPrefix("REPLACE_ME"),
              let url = URL(string: raw) else {
            fatalError("SupabaseURL is missing or unset in Info.plist. See apps/ios/README.md.")
        }
        return url
    }()

    static let supabaseAnonKey: String = {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SupabaseAnonKey") as? String,
              !key.hasPrefix("REPLACE_ME") else {
            fatalError("SupabaseAnonKey is missing or unset in Info.plist. See apps/ios/README.md.")
        }
        return key
    }()

    static let apiBaseURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "SneakersAPIBaseURL") as? String
            ?? "https://sneakersterminal.com"
        return URL(string: raw)!
    }()

    static let magicLinkRedirect = URL(string: "sneakers://auth/callback")!
}
