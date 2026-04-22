import SwiftUI

struct CardDetailView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var frozen = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    BankrollCard(cardholder: state.userEmail ?? "")
                    quickActions
                    spendingLimit
                    transactions
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 80)
            }
            .navigationTitle("Bankroll")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(.green)
                }
            }
            .safeAreaInset(edge: .bottom) {
                secureFooter
            }
        }
    }

    private var quickActions: some View {
        HStack(spacing: 8) {
            quick(
                title: frozen ? "Frozen" : "Freeze",
                systemImage: frozen ? "snowflake" : "snowflake",
                active: frozen
            ) { frozen.toggle() }

            quick(title: "Details", systemImage: "eye") {}
            quick(title: "Settings", systemImage: "gearshape") {}
            quick(title: "Report", systemImage: "exclamationmark.triangle") {}
        }
    }

    private func quick(title: String, systemImage: String, active: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .medium))
                    .frame(width: 52, height: 52)
                    .background(active ? Color.blue : Color(.secondarySystemBackground))
                    .foregroundStyle(active ? .white : .primary)
                    .clipShape(Circle())
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .foregroundStyle(.primary)
        }
    }

    private var spendingLimit: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Weekly limit")
                    .font(.system(size: 17, weight: .semibold))
                Spacer()
                Text("$0 / $500")
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(.tertiarySystemBackground))
                    Capsule()
                        .fill(Color.green)
                        .frame(width: geo.size.width * 0)
                }
            }
            .frame(height: 6)
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var transactions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Transactions")
                .font(.system(size: 20, weight: .semibold))

            VStack(spacing: 0) {
                txnRow(
                    logo: "P", logoColor: Color(red: 0.18, green: 0.31, blue: 1.0),
                    name: "Polymarket", sub: "Today · Card purchase",
                    amount: "−$250.00", positive: false
                )
                divider
                txnRow(
                    logo: "+", logoColor: Color.green.opacity(0.15), logoText: Color.green,
                    name: "Added cash", sub: "Yesterday · Apple Pay",
                    amount: "+$500.00", positive: true
                )
                divider
                txnRow(
                    logo: "K", logoColor: Color(red: 0.0, green: 0.64, blue: 0.44),
                    name: "Kalshi", sub: "Apr 20 · Card purchase",
                    amount: "−$100.00", positive: false
                )
            }
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private var divider: some View {
        Divider()
            .overlay(Color.white.opacity(0.06))
            .padding(.leading, 60)
    }

    private func txnRow(
        logo: String,
        logoColor: Color,
        logoText: Color = .white,
        name: String,
        sub: String,
        amount: String,
        positive: Bool
    ) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(logoColor)
                Text(logo)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(logoText)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 15, weight: .medium))
                Text(sub)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(amount)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(positive ? .green : .primary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var secureFooter: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill")
                .font(.system(size: 12, weight: .medium))
            Text("Secured by Face ID")
                .font(.system(size: 13, weight: .medium))
        }
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial)
    }
}

#Preview {
    CardDetailView()
        .environment(AppState())
}
