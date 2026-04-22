import SwiftUI

struct PortfolioTab: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Image(systemName: "list.bullet.rectangle")
                    .font(.system(size: 40))
                    .foregroundStyle(.green)
                Text("TRADES")
                    .font(.system(.headline, design: .monospaced))
                Text("Trade journal lands next.\nManual entry + P&L.")
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Trades")
        }
    }
}

#Preview {
    PortfolioTab()
}
