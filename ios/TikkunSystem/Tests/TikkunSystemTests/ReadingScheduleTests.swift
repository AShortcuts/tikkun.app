import XCTest
@testable import TikkunSystem

final class ReadingScheduleTests: XCTestCase {
    func testOfflineCalendarAndFiveReadingSummary() throws {
        let date = try XCTUnwrap(ReadingSchedule.date("2026-09-10"))
        let readings = try ReadingSchedule.upcoming(from: date, israel: false)
        XCTAssertGreaterThan(readings.count, 5)
        XCTAssertEqual(readings.first?.day, "2026-09-12")
        XCTAssertTrue(readings.first?.name.contains("Rosh Hashana") == true)
        XCTAssertTrue(readings.first?.references.first?.contains("Genesis 21:") == true)
        for count in 1...5 {
            let summary = try ReadingSchedule.summary(count: count, from: date, israel: false)
            XCTAssertEqual(summary.components(separatedBy: "\n\n").count, count)
        }
        XCTAssertThrowsError(try ReadingSchedule.summary(count: 0, from: date, israel: false))
        XCTAssertThrowsError(try ReadingSchedule.summary(count: 6, from: date, israel: false))
    }

    func testRegionAndCivilDayRollover() throws {
        let date = try XCTUnwrap(ReadingSchedule.date("2026-05-23"))
        let israel = try ReadingSchedule.upcoming(from: date, israel: true)
        let diaspora = try ReadingSchedule.upcoming(from: date, israel: false)
        XCTAssertNotEqual(israel.first?.name, diaspora.first?.name)
        XCTAssertEqual(israel.first?.day, "2026-05-23")
        let nextDay = try XCTUnwrap(ReadingSchedule.date("2026-05-24"))
        XCTAssertTrue(try ReadingSchedule.upcoming(from: nextDay, israel: true).allSatisfy { $0.day >= "2026-05-24" })
    }

    func testSharedPracticeSurvivesNewStoreAndCalendarUpdates() throws {
        let suite = "TikkunSystemTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = PracticeStore(defaults: defaults)
        let reading = PracticeReading(hash: "#/torah/parsha/beresheet/1-1-1", parshaName: "Beresheet", aliyahLabel: "Aliyah 1")
        XCTAssertTrue(try store.update(israel: false, reading: reading))
        XCTAssertFalse(try store.update(israel: false, reading: reading))
        XCTAssertTrue(try store.update(israel: true, reading: nil))
        let reopened = PracticeStore(defaults: defaults)
        XCTAssertEqual(try reopened.reading(), reading)
        XCTAssertTrue(reopened.israel)
        XCTAssertEqual(reading.url.scheme, "tikkunreader")
        XCTAssertThrowsError(try store.update(israel: nil, reading: PracticeReading(hash: "#/about", parshaName: "Invalid", aliyahLabel: nil)))
    }
}
