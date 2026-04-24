import SwiftUI

struct BudgetCreator: View {
    let store: AutotradeStore
    @Environment(\.dismiss) private var dismiss

    @State private var step: Int = 0
    @State private var scope: BucketScope = .game
    @State private var title: String = ""
    @State private var amount: Double = 50
    @State private var strategy: AutotradeStrategy = .followOToole
    @State private var notifyMode: NotifyMode = .everyTrade
    @State private var submitting = false

    private let totalSteps = 4

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progressDots
                    .padding(.top, 8)
                    .padding(.bottom, 12)

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        switch step {
                        case 0: scopeStep
                        case 1: amountStep
                        case 2: strategyStep
                        default: notifyStep
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }

                bottomBar
            }
            .navigationTitle("New bucket")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.secondary)
                }
            }
            .onAppear {
                if title.isEmpty {
                    title = defaultTitle(for: scope)
                }
            }
        }
    }

    private var progressDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<totalSteps, id: \.self) { i in
                Capsule()
                    .fill(i <= step ? Color.green : Color(.tertiarySystemBackground))
                    .frame(width: i == step ? 24 : 8, height: 4)
            }
        }
    }

    // MARK: - Step 1: scope

    private var scopeStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            EyebrowLabel(text: "Step 1 · Scope")
            Text("What's this bucket for?")
                .font(.system(size: 22, weight: .semibold))

            VStack(spacing: 10) {
                ForEach(BucketScope.allCases) { s in
                    ChoiceCard(isSelected: scope == s) {
                        scope = s
                        title = defaultTitle(for: s)
                    } label: {
                        ChoiceCardLabel(icon: s.icon, title: s.label, blurb: s.blurb)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                EyebrowLabel(text: "Bucket name")
                TextField("e.g. Lakers @ Warriors", text: $title)
                    .font(.system(size: 16, design: .monospaced))
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .padding(.top, 4)
        }
    }

    // MARK: - Step 2: amount

    private var amountStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            EyebrowLabel(text: "Step 2 · Allocation")
            Text("How much can this bucket spend?")
                .font(.system(size: 22, weight: .semibold))

            VStack(spacing: 8) {
                Text(AutotradeFormat.money(Decimal(amount), fractionDigits: 0))
                    .font(.system(size: 48, weight: .bold, design: .monospaced))
                    .monospacedDigit()
                Text("of \(AutotradeFormat.money(store.totalDailyBudget, fractionDigits: 0)) daily total")
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Slider(value: $amount, in: 5...500, step: 5)
                .tint(.green)

            HStack {
                ForEach([10, 25, 50, 100, 250], id: \.self) { preset in
                    Button {
                        amount = Double(preset)
                    } label: {
                        Text("$\(preset)")
                            .font(.system(.footnote, design: .monospaced).weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(amount == Double(preset) ? Color.green.opacity(0.15) : Color(.secondarySystemBackground))
                            .foregroundStyle(amount == Double(preset) ? .green : .primary)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    // MARK: - Step 3: strategy

    private var strategyStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            EyebrowLabel(text: "Step 3 · Strategy")
            Text("When should it fire?")
                .font(.system(size: 22, weight: .semibold))

            VStack(spacing: 10) {
                ForEach(AutotradeStrategy.allCases) { s in
                    ChoiceCard(isSelected: strategy == s) {
                        strategy = s
                    } label: {
                        ChoiceCardLabel(icon: s.icon, title: s.label, blurb: s.blurb)
                    }
                }
            }
        }
    }

    // MARK: - Step 4: notify

    private var notifyStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            EyebrowLabel(text: "Step 4 · Notifications")
            Text("How should we ping you?")
                .font(.system(size: 22, weight: .semibold))

            VStack(spacing: 10) {
                ForEach(NotifyMode.allCases) { n in
                    ChoiceCard(isSelected: notifyMode == n) {
                        notifyMode = n
                    } label: {
                        ChoiceCardLabel(icon: n.icon, title: n.label, blurb: n.blurb)
                    }
                }
            }

            Text("You'll be asked for notification permission once. Local notifications fire in simulator until APNS is wired up.")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        }
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        HStack(spacing: 12) {
            if step > 0 {
                Button {
                    step -= 1
                } label: {
                    Text("Back")
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
            }

            Button {
                if step < totalSteps - 1 {
                    step += 1
                } else {
                    submit()
                }
            } label: {
                Text(step < totalSteps - 1 ? "Next" : (submitting ? "Arming…" : "Arm bucket"))
                    .font(.system(size: 15, weight: .semibold, design: .monospaced))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(canAdvance ? Color.green : Color.green.opacity(0.4))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!canAdvance || submitting)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.bar)
    }

    private var canAdvance: Bool {
        if step == 0 { return !title.trimmingCharacters(in: .whitespaces).isEmpty }
        return true
    }

    private func defaultTitle(for scope: BucketScope) -> String {
        switch scope {
        case .game: return "Tonight's game"
        case .timeWindow: return "8-10pm Live Markets"
        case .category: return "Crypto today"
        }
    }

    private func submit() {
        guard !submitting else { return }
        submitting = true
        Task {
            await store.createBucket(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                scopeType: scope,
                allocated: Decimal(amount),
                strategy: strategy,
                notifyMode: notifyMode
            )
            dismiss()
        }
    }
}

#Preview {
    BudgetCreator(store: AutotradeStore())
}
