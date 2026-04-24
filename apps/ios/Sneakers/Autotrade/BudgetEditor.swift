import SwiftUI

struct BudgetEditor: View {
    let store: AutotradeStore
    @Environment(\.dismiss) private var dismiss

    @State private var amount: Double = 200
    @State private var showResetConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 12) {
                        EyebrowLabel(text: "Daily total budget")
                        HStack {
                            Spacer()
                            VStack(spacing: 6) {
                                Text(AutotradeFormat.money(Decimal(amount), fractionDigits: 0))
                                    .font(.system(size: 56, weight: .bold, design: .monospaced))
                                    .monospacedDigit()
                                Text("Caps total autotrade dollars per day.")
                                    .font(.system(.caption2, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 24)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 14))

                        HStack(spacing: 10) {
                            stepperButton(systemImage: "minus", disabled: amount <= 25) {
                                amount = max(25, amount - 25)
                            }
                            stepperButton(systemImage: "plus", disabled: amount >= 5000) {
                                amount = min(5000, amount + 25)
                            }
                        }

                        Slider(value: $amount, in: 25...2000, step: 25)
                            .tint(.green)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        EyebrowLabel(text: "Currently allocated")
                        HStack(alignment: .firstTextBaseline) {
                            MoneyText(value: store.totalAllocated, size: 18)
                            Text("across \(store.buckets.count) bucket\(store.buckets.count == 1 ? "" : "s")")
                                .font(.system(.footnote, design: .monospaced))
                                .foregroundStyle(.secondary)
                            Spacer()
                        }

                        if Decimal(amount) < store.totalAllocated {
                            Text("New cap is below current allocations. Existing buckets will keep running until they finish or you reset.")
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.orange)
                                .padding(.top, 4)
                        }
                    }

                    Divider()

                    Button(role: .destructive) {
                        showResetConfirm = true
                    } label: {
                        HStack {
                            Image(systemName: "arrow.counterclockwise.circle.fill")
                            Text("Reset all buckets")
                                .font(.system(size: 15, weight: .semibold))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                        }
                        .padding(14)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .navigationTitle("Edit budget")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.secondary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        store.setTotalBudget(Decimal(amount))
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.green)
                }
            }
            .onAppear {
                amount = NSDecimalNumber(decimal: store.totalDailyBudget).doubleValue
            }
            .confirmationDialog(
                "Reset all buckets?",
                isPresented: $showResetConfirm,
                titleVisibility: .visible
            ) {
                Button("Reset all buckets", role: .destructive) {
                    store.resetAllBuckets()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Removes every bucket and its trades. The daily total stays.")
            }
        }
    }

    private func stepperButton(systemImage: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .opacity(disabled ? 0.4 : 1)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .foregroundStyle(.primary)
    }
}

#Preview {
    BudgetEditor(store: AutotradeStore())
}
