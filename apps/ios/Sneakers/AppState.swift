import Foundation
import Observation
import Supabase

enum AuthPhase {
    case loading
    case signedOut
    case locked
    case signedIn
}

@Observable
final class AppState {
    var phase: AuthPhase = .loading
    var userEmail: String?
    var lastError: String?
    var biometryUnlockFailed = false

    private let client = SupabaseClientProvider.shared
    private let biometry = BiometryGate()
    private var authTask: Task<Void, Never>?

    var biometrySymbol: String {
        switch biometry.biometryType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
        default: return "lock.fill"
        }
    }

    func bootstrap() async {
        authTask?.cancel()
        authTask = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in self.client.auth.authStateChanges {
                await self.handle(event: event, session: session)
            }
        }
    }

    @MainActor
    private func handle(event: AuthChangeEvent, session: Session?) async {
        switch event {
        case .initialSession:
            if let session {
                userEmail = session.user.email
                if biometry.isAvailable {
                    phase = .locked
                    await tryUnlock()
                } else {
                    phase = .signedIn
                }
            } else {
                phase = .signedOut
            }
        case .signedIn, .tokenRefreshed, .userUpdated:
            if let session {
                userEmail = session.user.email
                phase = .signedIn
            }
        case .signedOut:
            userEmail = nil
            phase = .signedOut
        default:
            break
        }
    }

    func tryUnlock() async {
        let ok = await biometry.authenticate(reason: "Unlock Sneakers")
        await MainActor.run {
            if ok {
                self.phase = .signedIn
                self.biometryUnlockFailed = false
            } else {
                self.biometryUnlockFailed = true
            }
        }
    }

    func sendMagicLink(to email: String) async -> Bool {
        lastError = nil
        do {
            try await client.auth.signInWithOTP(
                email: email,
                redirectTo: AppConfig.magicLinkRedirect
            )
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func handleIncomingURL(_ url: URL) async {
        do {
            try await client.auth.session(from: url)
        } catch {
            await MainActor.run { self.lastError = error.localizedDescription }
        }
    }

    func signOut() async {
        try? await client.auth.signOut()
    }
}
