import SwiftUI

struct MoneyTab: View {
    @Environment(AppState.self) private var state
    @State private var showCardDetail = false
    @State private var showAddCash = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    balanceHeader
                    cardSection
                    AddToWalletButton()
                    actionRow
                    referralBanner
                    activitySection
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .navigationTitle("Money")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {} label: {
                        Image(systemName: "questionmark.circle")
                            .foregroundStyle(.primary)
                    }
                }
            }
            .sheet(isPresented: $showCardDetail) {
                CardDetailView()
                    .environment(state)
            }
            .sheet(isPresented: $showAddCash) {
                AddCashSheet()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    private var balanceHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Cash balance")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
            Text("$0.00")
                .font(.system(size: 56, weight: .bold))
            HStack(spacing: 4) {
                Text("$0.00").font(.system(size: 14, weight: .semibold))
                Text("(0.00%)").font(.system(size: 14))
                Text("Today").font(.system(size: 14))
            }
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var cardSection: some View {
        Button {
            showCardDetail = true
        } label: {
            BankrollCard(cardholder: state.userEmail ?? "")
        }
        .buttonStyle(.plain)
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            actionButton(title: "Add cash", systemImage: "plus") { showAddCash = true }
            actionButton(title: "Apple Pay", systemImage: "applelogo") {}
            actionButton(title: "Transfer", systemImage: "arrow.left.arrow.right") {}
            actionButton(title: "Card", systemImage: "creditcard") { showCardDetail = true }
        }
    }

    private func actionButton(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Circle())
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .foregroundStyle(.primary)
        }
    }

    private var referralBanner: some View {
        Button {} label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Color.green.opacity(0.15))
                    Image(systemName: "gift.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.green)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Invite a friend, get $10")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.primary)
                    Text("When your friend funds their wallet")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var activitySection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Recent activity")
                    .font(.system(size: 20, weight: .semibold))
                Spacer()
                Button("See all") {}
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.green)
            }

            VStack(spacing: 4) {
                Text("No transactions yet")
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
                Text("Your deposits, card purchases, and transfers will show up here.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary.opacity(0.7))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
        }
    }
}

struct AddToWalletButton: View {
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "wallet.pass.fill")
                    .font(.system(size: 20, weight: .medium))
                Text("Add to Apple Wallet")
                    .font(.system(size: 17, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.black)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 0.75)
            )
        }
    }
}

#Preview {
    MoneyTab()
        .environment(AppState())
}
