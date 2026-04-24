import SwiftUI

struct AutotradeTab: View {
    @State private var store = AutotradeStore()
    @State private var showCreator = false
    @State private var showEditor = false
    @State private var selectedBucket: AutotradeBucket?
    @State private var selectedTrade: AutotradeTrade?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    budgetHeader
                    bucketsSection
                    recentTradesSection
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 40)
            }
            .navigationTitle("Autotrade")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreator = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 17, weight: .semibold))
                    }
                }
            }
            .sheet(isPresented: $showCreator) {
                BudgetCreator(store: store)
            }
            .sheet(isPresented: $showEditor) {
                BudgetEditor(store: store)
            }
            .sheet(item: $selectedBucket) { bucket in
                BucketDetail(store: store, bucket: bucket)
            }
            .sheet(item: $selectedTrade) { trade in
                TradeDetail(trade: trade, bucketTitle: bucketTitle(for: trade))
            }
        }
    }

    private func bucketTitle(for trade: AutotradeTrade) -> String {
        store.buckets.first { $0.id == trade.bucketId }?.title ?? "—"
    }

    // MARK: - Budget header

    private var budgetHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                EyebrowLabel(text: "Today's budget")
                Spacer()
                Button("Edit") { showEditor = true }
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(.green)
            }

            MoneyText(value: store.totalDailyBudget, size: 44, weight: .bold)
                .foregroundStyle(.primary)

            HStack(spacing: 12) {
                budgetStat(label: "spent", value: store.totalSpent, accent: .primary)
                Divider().frame(height: 18)
                budgetStat(label: "reserved", value: store.totalReserved, accent: .secondary)
                Divider().frame(height: 18)
                budgetStat(label: "available", value: store.totalAvailable, accent: .green)
            }

            HStack {
                Image(systemName: store.pausedAll ? "pause.circle.fill" : "play.circle.fill")
                    .foregroundStyle(store.pausedAll ? .orange : .green)
                Text(store.pausedAll ? "All buckets paused" : "All buckets armed")
                    .font(.system(.footnote, design: .monospaced))
                Spacer()
                Toggle("", isOn: Binding(
                    get: { store.pausedAll },
                    set: { store.setPausedAll($0) }
                ))
                .labelsHidden()
                .tint(.orange)
                .disabled(store.buckets.isEmpty)
            }
            .padding(.top, 4)
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func budgetStat(label: String, value: Decimal, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .tracking(1.0)
            MoneyText(value: value, size: 14, weight: .semibold)
                .foregroundStyle(accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Buckets

    private var bucketsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                EyebrowLabel(text: "Active buckets")
                Spacer()
                if !store.buckets.isEmpty {
                    Text("\(store.buckets.count)")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            if store.buckets.isEmpty {
                emptyBucketsCard
            } else {
                VStack(spacing: 10) {
                    ForEach(store.buckets) { bucket in
                        Button {
                            selectedBucket = bucket
                        } label: {
                            BucketCard(bucket: bucket)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var emptyBucketsCard: some View {
        VStack(spacing: 10) {
            Image(systemName: "bolt.shield")
                .font(.system(size: 28))
                .foregroundStyle(.green)
            Text("No active buckets")
                .font(.system(.subheadline, design: .monospaced))
            Text("Tap + to start. Cap dollars on a game,\na time window, or a category.")
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                showCreator = true
            } label: {
                Text("New bucket")
                    .font(.system(.footnote, design: .monospaced).weight(.semibold))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.green.opacity(0.15))
                    .foregroundStyle(.green)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: - Recent trades

    private var recentTradesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                EyebrowLabel(text: "Recent trades · 24h")
                Spacer()
                if !store.trades.isEmpty {
                    Text("\(store.trades.count)")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            let recent = store.recentTrades(limit: 10)
            if recent.isEmpty {
                Text("No trades yet. Buckets that fire will show up here.")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(recent.enumerated()), id: \.element.id) { idx, trade in
                        Button {
                            selectedTrade = trade
                        } label: {
                            TradeRow(trade: trade)
                                .padding(.horizontal, 12)
                        }
                        .buttonStyle(.plain)
                        if idx < recent.count - 1 {
                            Divider().padding(.leading, 12)
                        }
                    }
                }
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }
}

#Preview {
    AutotradeTab()
}
