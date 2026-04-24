import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            MoneyTab()
                .tabItem { Label("Money", systemImage: "dollarsign.circle") }

            OpportunitiesTab()
                .tabItem { Label("Markets", systemImage: "chart.line.uptrend.xyaxis") }

            PortfolioTab()
                .tabItem { Label("Trades", systemImage: "list.bullet.rectangle") }

            AutotradeTab()
                .tabItem { Label("Autotrade", systemImage: "bolt.shield.fill") }

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(.green)
    }
}
