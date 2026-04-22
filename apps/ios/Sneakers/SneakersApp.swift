import SwiftUI

@main
struct SneakersApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .task { await appState.bootstrap() }
                .onOpenURL { url in
                    Task { await appState.handleIncomingURL(url) }
                }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        switch state.phase {
        case .loading:
            ProgressView().tint(.green)
        case .signedOut:
            LoginView()
        case .locked:
            LockView()
        case .signedIn:
            RootTabView()
        }
    }
}
