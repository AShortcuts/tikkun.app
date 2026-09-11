import SwiftUI
import WidgetKit
import OSLog
import TikkunSystem

@available(iOS 17.0, *)
struct PracticeEntry: TimelineEntry {
    let date: Date
    let reading: SystemReading?
    let practice: PracticeReading?
    var relevance: TimelineEntryRelevance? { TimelineEntryRelevance(score: 1) }
}

@available(iOS 17.0, *)
struct PracticeProvider: TimelineProvider {
    func placeholder(in context: Context) -> PracticeEntry {
        PracticeEntry(date: Date(), reading: .placeholder, practice: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PracticeEntry) -> Void) {
        completion(entries().first!)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PracticeEntry>) -> Void) {
        let values = entries()
        completion(Timeline(entries: values, policy: .atEnd))
    }

    func entries(now: Date = Date()) -> [PracticeEntry] {
        do {
            let store = try PracticeStore.shared()
            let readings = try ReadingSchedule.upcoming(from: now, israel: store.israel)
            let practice = try store.reading()
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = .current
            return (0...7).map { offset in
                let date = offset == 0 ? now : calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now))!
                let day = ReadingSchedule.day(date)
                return PracticeEntry(date: date, reading: readings.first { $0.shabbat && $0.day >= day }, practice: practice)
            }
        } catch {
            Logger(subsystem: "com.adamn.tikkunreader", category: "widget").error("Widget data failed: \(error.localizedDescription, privacy: .public)")
            return [PracticeEntry(date: now, reading: nil, practice: nil),
                    PracticeEntry(date: now.addingTimeInterval(3600), reading: nil, practice: nil)]
        }
    }
}

@available(iOS 17.0, *)
struct PracticeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: PracticeEntry

    var body: some View {
        Group {
            if family == .systemMedium {
                HStack(alignment: .top, spacing: 16) {
                    Link(destination: readingURL) { readingContent }
                    Divider()
                    Link(destination: entry.practice?.url ?? readingURL) { practiceContent }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            } else {
                readingContent.widgetURL(readingURL)
            }
        }
        .foregroundStyle(.primary)
    }

    private var readingURL: URL { entry.reading?.url ?? URL(string: "tikkunreader://reader/#/torah/parsha/beresheet")! }

    private var readingContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("This Shabbat", systemImage: "book.closed")
                .font(.caption.weight(.medium))
                .foregroundStyle(renderingMode == .fullColor ? Color.teal : Color.primary)
                .widgetAccentable()
            if let reading = entry.reading {
                Text(reading.hebrewName).font(.title3.weight(.semibold))
                    .lineLimit(2).minimumScaleFactor(0.75)
                    .environment(\.layoutDirection, .rightToLeft)
                Text(reading.name).font(.caption).lineLimit(2).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                Text(reading.date, format: .dateTime.month(.abbreviated).day())
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("Reading unavailable").font(.headline)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }

    private var practiceContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(entry.practice == nil ? "Start Practicing" : "Continue", systemImage: "bookmark")
                .font(.caption.weight(.medium)).widgetAccentable()
            Text(entry.practice?.parshaName ?? entry.reading?.hebrewName ?? "Torah Reader")
                .font(.headline).lineLimit(3).minimumScaleFactor(0.75)
            if let label = entry.practice?.aliyahLabel {
                Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.forward").font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}
