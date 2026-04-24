import SwiftUI
import Charts

struct BucketDetail: View {
    let store: AutotradeStore
    let bucket: AutotradeBucket
    @Environment(\.dismiss) private var dismiss

    @State private var showDeleteConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    headerCard
                    chartCard
                    actionsRow
                    tradesSection
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .navigationTitle(bucket.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(.green)
                }
            }
            .confirmationDialog(
                "Delete bucket?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    store.deleteBucket(bucket.id)
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This bucket and its \(bucket.tradeCount) trade\(bucket.tradeCount == 1 ? "" : "s") will be removed.")
            }
        }
    }

    // MARK: - Header

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                EyebrowLabel(text: bucket.scopeType.label)
                Spacer()
                if bucket.paused {
                    Text("PAUSED")
                        .font(.system(.caption2, design: .monospaced).weight(.bold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.orange.opacity(0.2))
                        .foregroundStyle(.orange)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                MoneyText(value: bucket.spent, size: 36, weight: .bold)
                Text("of")
                    .font(.system(.subheadline, design: .monospaced))
                    .foregroundStyle(.secondary)
                MoneyText(value: bucket.allocated, size: 22, weight: .regular)
                    .foregroundStyle(.secondary)
            }

            BudgetProgressBar(progress: bucket.progress, height: 8)

            HStack(spacing: 14) {
                statBlock(label: "P&L", view: AnyView(PnlText(value: bucket.pnl, size: 18)))
                Divider().frame(height: 28)
                statBlock(label: "Trades", view: AnyView(
                    Text("\(bucket.tradeCount)")
                        .font(.system(size: 18, weight: .semibold, design: .monospaced))
                ))
                Divider().frame(height: 28)
                statBlock(label: "Remaining", view: AnyView(MoneyText(value: bucket.remaining, size: 18)))
            }
            .padding(.top, 4)

            HStack(spacing: 6) {
                Image(systemName: bucket.strategy.icon)
                    .foregroundStyle(.green)
                Text(bucket.strategy.label)
                    .font(.system(.footnote, design: .monospaced))
                Spacer()
                Image(systemName: bucket.notifyMode.icon)
                Text(bucket.notifyMode.label)
                    .font(.system(.footnote, design: .monospaced))
            }
            .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func statBlock(label: String, view: AnyView) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(.caption2, design: .monospaced))
                .tracking(1.0)
                .foregroundStyle(.secondary)
            view
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Chart

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            EyebrowLabel(text: "P&L over time")

            let series = pnlSeries
            if series.isEmpty {
                Text("No trades yet — chart will appear once this bucket fires.")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 28)
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                Chart(series) { point in
                    LineMark(
                        x: .value("Time", point.date),
                        y: .value("P&L", point.cumulative)
                    )
                    .foregroundStyle(.green)
                    .interpolationMethod(.monotone)

                    AreaMark(
                        x: .value("Time", point.date),
                        y: .value("P&L", point.cumulative)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.green.opacity(0.3), .green.opacity(0.0)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .interpolationMethod(.monotone)
                }
                .frame(height: 160)
                .padding(12)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private struct PnlPoint: Identifiable {
        let id = UUID()
        let date: Date
        let cumulative: Double
    }

    private var pnlSeries: [PnlPoint] {
        let bucketTrades = store.trades(for: bucket.id).sorted { $0.placedAt < $1.placedAt }
        var running: Double = 0
        return bucketTrades.compactMap { trade in
            guard let pnl = trade.pnl else { return nil }
            running += NSDecimalNumber(decimal: pnl).doubleValue
            return PnlPoint(date: trade.placedAt, cumulative: running)
        }
    }

    // MARK: - Actions

    private var actionsRow: some View {
        HStack(spacing: 10) {
            actionButton(
                title: bucket.paused ? "Resume" : "Pause",
                icon: bucket.paused ? "play.fill" : "pause.fill",
                tint: bucket.paused ? .green : .orange
            ) {
                store.togglePause(bucket.id)
                dismiss()
            }

            actionButton(title: "Delete", icon: "trash", tint: .red) {
                showDeleteConfirm = true
            }
        }
    }

    private func actionButton(title: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                Text(title)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(tint.opacity(0.12))
            .foregroundStyle(tint)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Trades

    private var tradesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            EyebrowLabel(text: "Trades")

            let bucketTrades = store.trades(for: bucket.id)
            if bucketTrades.isEmpty {
                Text("No fills yet.")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(bucketTrades.enumerated()), id: \.element.id) { idx, trade in
                        TradeRow(trade: trade)
                            .padding(.horizontal, 12)
                        if idx < bucketTrades.count - 1 {
                            Divider().padding(.leading, 12)
                        }
                    }
                }
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}
