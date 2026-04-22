import SwiftUI

struct LockView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: state.biometrySymbol)
                .font(.system(size: 56))
                .foregroundStyle(.green)

            VStack(spacing: 6) {
                Text("SNEAKERS")
                    .font(.system(size: 24, weight: .black, design: .monospaced))
                    .foregroundStyle(.green)
                Text("LOCKED")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            if state.biometryUnlockFailed {
                Text("Unlock failed. Try again.")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.red)
            }

            Button {
                Task { await state.tryUnlock() }
            } label: {
                Text("UNLOCK")
                    .font(.system(.body, design: .monospaced).weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(.green)
                    .foregroundStyle(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .padding(.horizontal, 24)

            Button("Sign out") {
                Task { await state.signOut() }
            }
            .font(.system(.footnote, design: .monospaced))
            .foregroundStyle(.secondary)

            Spacer()
        }
        .padding(24)
    }
}

#Preview {
    LockView()
        .environment(AppState())
}
