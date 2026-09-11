import AppIntents
import TikkunSystem

@available(iOS 16.0, *)
struct UpcomingReadingsIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Upcoming Readings"
    static let description = IntentDescription("Return 1 to 5 upcoming Shabbat and special-day Torah readings, with dates and verse references. Uses the app's Israel or Diaspora calendar setting. Includes today's readings; regular weekday readings are not included.")
    static let openAppWhenRun = false

    @Parameter(title: "Number of Readings", default: 1, inclusiveRange: (1, 5))
    var count: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Get \(\.$count) upcoming readings")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let text = try ReadingSchedule.summary(count: count, israel: PracticeStore.shared().israel)
        return .result(value: text, dialog: "\(text)")
    }
}

@available(iOS 16.0, *)
struct TikkunShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: UpcomingReadingsIntent(), phrases: [
            "Get upcoming readings in \(.applicationName)",
            "What's the next reading in \(.applicationName)"
        ], shortTitle: "Upcoming Readings", systemImageName: "book")
    }
}
