import SwiftUI

struct LoginView: View {
    @Environment(AppState.self) private var state
    @State private var email: String = ""
    @State private var sending = false
    @State private var sent = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("SNEAKERS")
                    .font(.system(size: 32, weight: .black, design: .monospaced))
                    .foregroundStyle(.green)
                Text("TERMINAL")
                    .font(.system(size: 14, weight: .regular, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            if sent {
                VStack(spacing: 8) {
                    Text("CHECK YOUR EMAIL")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Text(email)
                        .font(.system(.body, design: .monospaced))
                }
                Button("Use a different email") {
                    sent = false
                    email = ""
                }
                .font(.system(.footnote, design: .monospaced))
            } else {
                VStack(spacing: 12) {
                    TextField("you@example.com", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(.body, design: .monospaced))
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    Button {
                        Task {
                            sending = true
                            let ok = await state.sendMagicLink(to: email.trimmingCharacters(in: .whitespaces))
                            sending = false
                            sent = ok
                        }
                    } label: {
                        HStack {
                            if sending { ProgressView().tint(.black) }
                            Text(sending ? "SENDING…" : "SEND MAGIC LINK")
                                .font(.system(.body, design: .monospaced).weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(.green)
                        .foregroundStyle(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .disabled(email.isEmpty || sending)
                }
            }

            if let err = state.lastError {
                Text(err)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Spacer()
            Text("sneakersterminal.com")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .padding(24)
    }
}

#Preview {
    LoginView()
        .environment(AppState())
}
