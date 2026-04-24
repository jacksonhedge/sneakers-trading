import SwiftUI

struct EyebrowLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(.caption2, design: .monospaced).weight(.bold))
            .tracking(1.2)
            .foregroundStyle(.secondary)
    }
}

struct MoneyText: View {
    let value: Decimal
    var size: CGFloat = 17
    var weight: Font.Weight = .semibold
    var fractionDigits: Int = 2

    var body: some View {
        Text(AutotradeFormat.money(value, fractionDigits: fractionDigits))
            .font(.system(size: size, weight: weight, design: .monospaced))
            .monospacedDigit()
    }
}

struct PnlText: View {
    let value: Decimal
    var size: CGFloat = 13

    var body: some View {
        let n = NSDecimalNumber(decimal: value).doubleValue
        let color: Color = n > 0 ? .green : (n < 0 ? .red : .secondary)
        Text(AutotradeFormat.signedMoney(value))
            .font(.system(size: size, weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .foregroundStyle(color)
    }
}

struct BudgetProgressBar: View {
    let progress: Double
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color(.tertiarySystemBackground))
                Capsule()
                    .fill(.green)
                    .frame(width: geo.size.width * CGFloat(progress.clamped()))
            }
        }
        .frame(height: height)
    }
}

private extension Double {
    func clamped() -> Double { min(1, max(0, self)) }
}

struct BucketCard: View {
    let bucket: AutotradeBucket

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: bucket.scopeType.icon)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.green)
                        Text(bucket.scopeType.label.uppercased())
                            .font(.system(.caption2, design: .monospaced).weight(.bold))
                            .tracking(1.0)
                            .foregroundStyle(.secondary)
                        if bucket.paused {
                            Text("PAUSED")
                                .font(.system(.caption2, design: .monospaced).weight(.bold))
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(.orange.opacity(0.2))
                                .foregroundStyle(.orange)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                        }
                    }
                    Text(bucket.title)
                        .font(.system(size: 16, weight: .semibold))
                        .lineLimit(1)
                }
                Spacer()
                PnlText(value: bucket.pnl, size: 14)
            }

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                MoneyText(value: bucket.spent, size: 13, weight: .semibold)
                Text("of")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                MoneyText(value: bucket.allocated, size: 13, weight: .regular)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(bucket.tradeCount) trade\(bucket.tradeCount == 1 ? "" : "s")")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            BudgetProgressBar(progress: bucket.progress)

            HStack(spacing: 6) {
                Image(systemName: bucket.strategy.icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(bucket.strategy.label)
                    .font(.system(.caption2, design: .monospaced))
                Spacer()
                Image(systemName: bucket.notifyMode.icon)
                    .font(.system(size: 10))
                Text(bucket.notifyMode.label)
                    .font(.system(.caption2, design: .monospaced))
            }
            .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct TradeRow: View {
    let trade: AutotradeTrade

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(AutotradeFormat.clockTime(trade.placedAt))
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                    outcomePill
                }
                Text(trade.market)
                    .font(.system(.footnote, design: .monospaced))
                    .lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                MoneyText(value: trade.stake, size: 12, weight: .semibold, fractionDigits: 0)
                if let pnl = trade.pnl {
                    PnlText(value: pnl, size: 11)
                } else {
                    Text("—")
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 6)
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
            .font(.system(.caption2, design: .monospaced).weight(.bold))
            .padding(.horizontal, 5).padding(.vertical, 1)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

struct ChoiceCard<Content: View>: View {
    let isSelected: Bool
    let action: () -> Void
    @ViewBuilder let label: () -> Content

    var body: some View {
        Button(action: action) {
            label()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(isSelected ? Color.green.opacity(0.12) : Color(.secondarySystemBackground))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(isSelected ? Color.green : Color.clear, lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
    }
}

struct ChoiceCardLabel: View {
    let icon: String
    let title: String
    let blurb: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.green)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)
                Text(blurb)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
            }
        }
    }
}
