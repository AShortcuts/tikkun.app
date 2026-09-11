import Foundation

public enum SystemIntegration {
    public static let appGroup = "group.com.adamn.tikkunreader"
    public static let widgetKind = "TikkunPractice"
}

public struct PracticeReading: Codable, Equatable {
    public let hash: String
    public let parshaName: String
    public let aliyahLabel: String?
    public init(hash: String, parshaName: String, aliyahLabel: String?) {
        self.hash = hash
        self.parshaName = parshaName
        self.aliyahLabel = aliyahLabel
    }
    public var url: URL { URL(string: "tikkunreader://reader/\(hash)")! }
    public var isValid: Bool {
        !parshaName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        hash.range(of: "^#/(run/[^/?#\\s]+(/[1-9][0-9]*-[1-9][0-9]*-[1-9][0-9]*)?|r/[1-9][0-9]*-[1-9][0-9]*-[1-9][0-9]*|torah/(parsha/[a-z0-9-]+(/[1-9][0-9]*-[1-9][0-9]*-[1-9][0-9]*)?|page/[1-9][0-9]*)|esther/([a-z0-9-]+(/[1-9][0-9]*-[1-9][0-9]*-[1-9][0-9]*)?|page/[1-9][0-9]*))$", options: .regularExpression) != nil
    }
}

public final class PracticeStore {
    private let defaults: UserDefaults
    public init(defaults: UserDefaults) { self.defaults = defaults }
    public static func shared() throws -> PracticeStore {
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SystemIntegration.appGroup) != nil,
              let defaults = UserDefaults(suiteName: SystemIntegration.appGroup) else {
            throw ScheduleError.sharedStorageUnavailable
        }
        return PracticeStore(defaults: defaults)
    }
    public var israel: Bool { defaults.bool(forKey: "calendar.israel") }
    public func reading() throws -> PracticeReading? {
        guard let data = defaults.data(forKey: "practice.reading") else { return nil }
        let reading = try JSONDecoder().decode(PracticeReading.self, from: data)
        guard reading.isValid else { throw ScheduleError.invalidPractice }
        return reading
    }
    @discardableResult public func update(israel: Bool?, reading: PracticeReading?) throws -> Bool {
        var changed = false
        if let reading {
            guard reading.isValid else { throw ScheduleError.invalidPractice }
            if try self.reading() != reading {
                defaults.set(try JSONEncoder().encode(reading), forKey: "practice.reading")
                changed = true
            }
        }
        if let israel, israel != self.israel {
            defaults.set(israel, forKey: "calendar.israel")
            changed = true
        }
        return changed
    }
}
