import WidgetKit
import SwiftUI

struct AutotradeWidget: Widget {
    let kind = "AutotradeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AutotradeProvider()) { entry in
            AutotradeWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    Color(red: 0.04, green: 0.04, blue: 0.05)
                }
        }
        .configurationDisplayName("Autotrade")
        .description("Today's P&L and active buckets at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct AutotradeEntry: TimelineEntry {
    let date: Date
    let snapshot: AutotradeSnapshot
}

struct AutotradeProvider: TimelineProvider {
    func placeholder(in context: Context) -> AutotradeEntry {
        AutotradeEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (AutotradeEntry) -> Void) {
        let snap = AutotradeSharedStore.readSnapshot() ?? .placeholder
        completion(AutotradeEntry(date: Date(), snapshot: snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AutotradeEntry>) -> Void) {
        let snap = AutotradeSharedStore.readSnapshot() ?? .placeholder
        let entry = AutotradeEntry(date: Date(), snapshot: snap)
        let next = Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}
