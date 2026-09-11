import SwiftUI
import WidgetKit
import TikkunSystem

@main
struct TikkunWidgets: WidgetBundle {
    var body: some Widget { PracticeWidget() }
}

struct PracticeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: SystemIntegration.widgetKind, provider: PracticeProvider()) { entry in
            PracticeWidgetView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Parsha & Practice")
        .description("This week's Shabbat reading and your current practice place.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
