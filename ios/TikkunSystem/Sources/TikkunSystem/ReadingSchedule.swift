import Foundation
import JavaScriptCore

public struct SystemReading: Codable, Equatable {
    public static let placeholder = SystemReading(
        id: "2026-10-10:shacharis,main", day: "2026-10-10", name: "Parshat Bereshit",
        hebrewName: "פרשת בראשית", service: "שחרית", references: ["Genesis 1:1-6:8"],
        hash: "#/torah/parsha/beresheet", shabbat: true)
    public let id: String
    public let day: String
    public let name: String
    public let hebrewName: String
    public let service: String
    public let references: [String]
    public let hash: String
    public let shabbat: Bool

    public var url: URL { URL(string: "tikkunreader://reader/\(hash)")! }
    public var date: Date { ReadingSchedule.date(day)! }
}

public enum ReadingSchedule {
    public static func day(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    public static func date(_ day: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: day)
    }

    public static func upcoming(from date: Date = Date(), israel: Bool) throws -> [SystemReading] {
        guard let url = Bundle.module.url(forResource: "calendar", withExtension: "js"),
              let context = JSContext() else { throw ScheduleError.unavailable }
        context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
        guard context.exception == nil,
              let result = context.objectForKeyedSubscript("TikkunCalendar")?
                .invokeMethod("scheduleJSON", withArguments: [day(date), israel]),
              context.exception == nil, let json = result.toString()?.data(using: .utf8)
        else { throw ScheduleError.unavailable }
        let readings = try JSONDecoder().decode([SystemReading].self, from: json)
        guard !readings.isEmpty, readings.allSatisfy({ Self.date($0.day) != nil }) else {
            throw ScheduleError.unavailable
        }
        return readings
    }

    public static func summary(count: Int, from date: Date = Date(), israel: Bool) throws -> String {
        guard (1...5).contains(count) else { throw ScheduleError.invalidCount }
        let readings = try upcoming(from: date, israel: israel).prefix(count)
        return readings.map { reading in
            "\(reading.day) - \(reading.name) (\(reading.service))\n\(reading.references.joined(separator: "; "))"
        }.joined(separator: "\n\n")
    }
}

public enum ScheduleError: LocalizedError {
    case unavailable, invalidCount, sharedStorageUnavailable, invalidPractice
    public var errorDescription: String? {
        switch self {
        case .unavailable: return "The reading calendar could not be loaded."
        case .invalidCount: return "Choose between 1 and 5 readings."
        case .sharedStorageUnavailable: return "Shared widget storage is unavailable."
        case .invalidPractice: return "The practice reading is invalid."
        }
    }
}
