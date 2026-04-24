import SwiftUI

struct TradeDetail: View {
    let trade: AutotradeTrade
    let bucketTitle: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    headerCard
                    detailsSection
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .navigationTitle("Trade detail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(.green)
                }
            }
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                EyebrowLabel(text: bucketTitle)
                Spacer()
                outcomePill
            }

            Text(trade.market)
                .font(.system(size: 22, weight: .semibold, design: .monospaced))

            HStack(alignment: .firstTextBaseline, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("STAKE")
                        .font(.system(.caption2, design: .monospaced))
                        .tracking(1.0)
                        .foregroundStyle(.secondary)
                    MoneyText(value: trade.stake, size: 22)
                }
                Divider().frame(height: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text("P&L")
                        .font(.system(.caption2, design: .monospaced))
                        .tracking(1.0)
                        .foregroundStyle(.secondary)
                    if let pnl = trade.pnl {
                        PnlText(value: pnl, size: 22)
                    } else {
                        Text("Pending")
                            .font(.system(size: 16, weight: .semibold, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var outcomePill: some View {
        let color: Color = {
            switch trade.outcome {
            case .won: return .green
            case .lost: return .red
            case .pending: return .secondary
            }
        }()
        return Text(trade.outcome.label)
            .font(.system(.caption, design: .monospaced).weight(.bold))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private var detailsSection: some View {
        VStack(spacing: 0) {
            row(label: "Placed", value: AutotradeFormat.relative(trade.placedAt))
            Divider().padding(.leading, 12)
            row(label: "Time", value: AutotradeFormat.clockTime(trade.placedAt))
            Divider().padding(.leading, 12)
            row(label: "Bucket", value: bucketTitle)
            Divider().padding(.leading, 12)
            row(label: "Trade ID", value: trade.id.uuidString.prefix(8).lowercased() + "…")
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func row(label: String, value: String) -> some View {
        HStack {
            Text(label.uppercased())
                .font(.system(.caption2, design: .monospaced))
                .tracking(1.0)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(.footnote, design: .monospaced))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }
}
