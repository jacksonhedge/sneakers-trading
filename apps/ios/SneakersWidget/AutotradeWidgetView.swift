import WidgetKit
import SwiftUI

struct AutotradeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AutotradeEntry

    var body: some View {
        switch family {
        case .systemSmall:
            smallView
        default:
            mediumView
        }
    }

    private var pnlColor: Color {
        let n = NSDecimalNumber(decimal: entry.snapshot.pnlToday).doubleValue
        if n > 0 { return .green }
        if n < 0 { return .red }
        return .white.opacity(0.7)
    }

    // MARK: - Small

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Image(systemName: "bolt.shield.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.green)
                Text("AUTOTRADE")
                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
                if entry.snapshot.pausedAll {
                    Image(systemName: "pause.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.orange)
                }
            }

            Spacer()

            Text(AutotradeFormat.signedMoney(entry.snapshot.pnlToday))
                .font(.system(size: 26, weight: .bold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(pnlColor)
                .minimumScaleFactor(0.7)
                .lineLimit(1)

            Text("today's P&L")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.white.opacity(0.55))

            Spacer()

            HStack(spacing: 8) {
                tinyStat(value: "\(entry.snapshot.activeBucketCount)", label: "active")
                tinyStat(value: AutotradeFormat.compactMoney(entry.snapshot.totalSpent), label: "spent")
            }
        }
        .padding(2)
        .foregroundStyle(.white)
    }

    private func tinyStat(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(.white)
            Text(label.uppercased())
                .font(.system(size: 8, design: .monospaced))
                .tracking(1.0)
                .foregroundStyle(.white.opacity(0.5))
        }
    }

    // MARK: - Medium

    private var mediumView: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Image(systemName: "bolt.shield.fill")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.green)
                    Text("AUTOTRADE")
                        .font(.system(.caption2, design: .monospaced).weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(.white.opacity(0.7))
                }

                Spacer()

                Text(AutotradeFormat.signedMoney(entry.snapshot.pnlToday))
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(pnlColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Text("today's P&L")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.55))

                Spacer()

                HStack(spacing: 10) {
                    tinyStat(value: "\(entry.snapshot.activeBucketCount)", label: "active")
                    tinyStat(value: AutotradeFormat.compactMoney(entry.snapshot.totalSpent), label: "spent")
                    tinyStat(value: AutotradeFormat.compactMoney(entry.snapshot.totalBudget), label: "budget")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Divider().overlay(Color.white.opacity(0.15))

            VStack(alignment: .leading, spacing: 8) {
                Text("TOP BUCKET")
                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.55))

                if let title = entry.snapshot.topBucketTitle {
                    Text(title)
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.1))
                            Capsule()
                                .fill(.green)
                                .frame(width: geo.size.width * CGFloat(min(1.0, max(0.0, entry.snapshot.topBucketProgress))))
                        }
                    }
                    .frame(height: 4)

                    Text("\(Int(entry.snapshot.topBucketProgress * 100))% of cap")
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.55))
                } else {
                    Text("No buckets active")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.55))
                }

                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(.white)
    }
}

#Preview(as: .systemSmall) {
    AutotradeWidget()
} timeline: {
    AutotradeEntry(date: .now, snapshot: .placeholder)
}

#Preview(as: .systemMedium) {
    AutotradeWidget()
} timeline: {
    AutotradeEntry(date: .now, snapshot: .placeholder)
}
