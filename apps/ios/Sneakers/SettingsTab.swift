import SwiftUI

struct SettingsTab: View {
    @Environment(AppState.self) private var state

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    if let email = state.userEmail {
                        LabeledContent("Email", value: email)
                            .font(.system(.body, design: .monospaced))
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: Bundle.main.shortVersion)
                        .font(.system(.body, design: .monospaced))
                    Link(destination: URL(string: "https://sneakersterminal.com")!) {
                        LabeledContent("Website", value: "sneakersterminal.com")
                            .font(.system(.body, design: .monospaced))
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await state.signOut() }
                    } label: {
                        Text("Sign out")
                            .font(.system(.body, design: .monospaced))
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

private extension Bundle {
    var shortVersion: String {
        (infoDictionary?["CFBundleShortVersionString"] as? String) ?? "—"
    }
}

#Preview {
    SettingsTab()
        .environment(AppState())
}
