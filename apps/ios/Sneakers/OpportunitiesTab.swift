import SwiftUI

struct OpportunitiesTab: View {
    @State private var opportunities: [Opportunity] = []
    @State private var lastUpdated: String?
    @State private var isLoading = false
    @State private var error: String?
    @State private var emptyNote: String?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Markets")
                .toolbar {
                    if let lastUpdated {
                        ToolbarItem(placement: .topBarTrailing) {
                            Text(shortTime(lastUpdated))
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .refreshable { await load() }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && opportunities.isEmpty {
            ProgressView().tint(.green)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error {
            errorView(error)
        } else if let emptyNote, opportunities.isEmpty {
            emptyView(emptyNote)
        } else {
            List(opportunities) { opp in
                OpportunityRow(opportunity: opp)
                    .listRowSeparator(.hidden)
                    .listRowInsets(.init(top: 8, leading: 16, bottom: 8, trailing: 16))
            }
            .listStyle(.plain)
        }
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)
            Text("COULDN'T LOAD")
                .font(.system(.caption, design: .monospaced))
            Text(message)
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") { Task { await load() } }
                .font(.system(.footnote, design: .monospaced))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func emptyView(_ note: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text("NO OPPORTUNITIES")
                .font(.system(.caption, design: .monospaced))
            Text(note)
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func load() async {
        isLoading = true
        error = nil
        do {
            let response = try await OpportunitiesAPI.fetch()
            opportunities = response.opportunities
            lastUpdated = response.lastUpdated
            emptyNote = response.opportunities.isEmpty ? response.note : nil
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func shortTime(_ iso: String) -> String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fmt.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return "" }
        let out = DateFormatter()
        out.dateFormat = "HH:mm"
        return out.string(from: date)
    }
}

struct OpportunityRow: View {
    let opportunity: Opportunity

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(opportunity.platform.uppercased())
                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.green.opacity(0.15))
                    .foregroundStyle(.green)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                if let sport = opportunity.sport {
                    Text(sport.uppercased())
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                Text(opportunity.phase.uppercased())
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                Spacer()
                if let over = opportunity.overround {
                    Text(String(format: "%.1f%%", over * 100))
                        .font(.system(.caption, design: .monospaced).weight(.semibold))
                        .foregroundStyle(overroundColor(over))
                }
            }

            Text(opportunity.question)
                .font(.system(.footnote, design: .monospaced))
                .lineLimit(2)

            HStack(spacing: 10) {
                ForEach(opportunity.outcomes.prefix(3), id: \.self) { outcome in
                    outcomeChip(outcome)
                }
            }

            if let vol = opportunity.volume {
                Text("vol \(formatMoney(vol))")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func outcomeChip(_ o: Outcome) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(o.name)
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(o.bestAsk.map { String(format: "%.2f", $0) } ?? "—")
                .font(.system(.caption, design: .monospaced).weight(.semibold))
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(Color(.tertiarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func overroundColor(_ o: Double) -> Color {
        if o > 1.08 { return .orange }
        if o > 1.05 { return .yellow }
        return .green
    }

    private func formatMoney(_ v: Double) -> String {
        if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
        if v >= 1_000 { return String(format: "$%.1fK", v / 1_000) }
        return String(format: "$%.0f", v)
    }
}

#Preview {
    OpportunitiesTab()
}
