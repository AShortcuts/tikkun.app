import XCTest
@testable import TikkunSystem

final class PracticeStoreTests: XCTestCase {
    func testReaderHashSyntaxMatchesWebRoutes() {
        let hashes = [
            "#/torah/parsha/beresheet",
            "#/torah/parsha/beresheet/1-2-4",
            "#/torah/parsha/beresheet/1-2-4/aliyah/2",
            "#/torah/parsha/beresheet/1-6-5/aliyah/7",
            "#/torah/parsha/beresheet/1-6-5/aliyah/Maftir",
            "#/torah/parsha/vezos-haberacha/5-34-1/aliyah/7",
            "#/run/2026-10-04:shacharis,main",
            "#/run/2026-10-04:shacharis,main/5-33-27",
            "#/run/2026-10-04:shacharis,main/5-33-27/aliyah/6",
            "#/run/2026-10-03:shacharis,last-aliyah/1-1-1/aliyah/8",
            "#/run/2026-10-04:shacharis,maftir/4-29-35/aliyah/Maftir",
            "#/torah/5-33-24",
            "#/r/5-33-24",
            "#/torah/page/245",
            "#/esther/megillah-esther",
            "#/esther/megillah-esther/1-1-1",
            "#/esther/page/1",
        ]
        for hash in hashes {
            XCTAssertTrue(reading(hash).isValid, hash)
        }
    }

    func testRejectsUnsupportedAndTrailingForms() {
        let hashes = [
            "", "#/about", "#/next", "/reader/#/torah/page/1",
            "#/torah/parsha/", "#/torah/parsha/-beresheet", "#/torah/parsha/beresheet-",
            "#/torah/parsha/beresheet/aliyah/1",
            "#/run/2026-10-04:shacharis,main/aliyah/1",
            "#/torah/parsha/beresheet/1-1-1/aliyah",
            "#/torah/parsha/beresheet/1-1-1/aliyah/0",
            "#/torah/parsha/beresheet/1-1-1/aliyah/9",
            "#/torah/parsha/beresheet/1-1-1/aliyah/01",
            "#/torah/parsha/beresheet/1-1-1/aliyah/1.0",
            "#/torah/parsha/beresheet/1-1-1/aliyah/maftir",
            "#/torah/parsha/beresheet/1-1-1/aliyah/M",
            "#/torah/parsha/beresheet/1-1-1/aliyah/1/extra",
            "#/torah/parsha/beresheet/1-1-1/aliyah//1",
            "#/torah/parsha/beresheet/1-1-1/aliyah/1/",
            "#/torah/parsha/beresheet/1-1-1/aliyah/1\n",
            "#/torah/parsha/beresheet/1-1-1/aliyah/1?x=1",
            "#/torah/parsha/beresheet/1-1-1/aliyah/1#extra",
            "#/torah/parsha/beresheet/1-1-1/extra",
            "#/torah/parsha/beresheet/1-1-1\n",
            "#/run/2026-10-04:shacharis,main/5-33-27/aliyah/6/extra",
            "#/torah/1-1-1/aliyah/1", "#/r/1-1-1/aliyah/1",
            "#/torah/page/1/aliyah/1", "#/esther/page/1/aliyah/1",
            "#/esther/megillah-esther/1-1-1/aliyah/1",
            "#/esther/parsha", "#/esther/parsha/1-1-1", "#/esther/page",
            "#/torah/5-33", "#/torah/0-1-1", "#/torah/5-33-24/extra",
            "#/r/1-1-1\n", "#/torah/page/0", "#/esther/page/-1",
        ]
        for hash in hashes {
            XCTAssertFalse(reading(hash).isValid, hash)
        }
        XCTAssertFalse(PracticeReading(hash: "#/torah/1-1-1", parshaName: " \n", aliyahLabel: nil).isValid)
    }

    func testCanonicalTorahReferencesPreviouslyRejectedSurviveSaveAndWidgetLink() throws {
        try withDefaults { defaults in
            let store = PracticeStore(defaults: defaults)
            for hash in ["#/torah/5-33-24", "#/r/5-33-24"] {
                let value = reading(hash)
                XCTAssertTrue(try store.update(israel: nil, reading: value))
                let restored = try XCTUnwrap(PracticeStore(defaults: defaults).reading())
                XCTAssertEqual(restored, value)
                XCTAssertEqual(restored.url.absoluteString, "tikkunreader://reader/\(hash)")
                XCTAssertEqual(restored.url.fragment, String(hash.dropFirst()))
            }
        }
    }

    func testExplicitTargetsRoundTripWithoutChangingStorageSchemaOrStoredBytes() throws {
        try withDefaults { defaults in
            let store = PracticeStore(defaults: defaults)
            let hashes = [
                "#/torah/parsha/beresheet/1-6-5/aliyah/7",
                "#/torah/parsha/beresheet/1-6-5/aliyah/Maftir",
                "#/run/2026-10-03:shacharis,last-aliyah/1-1-1/aliyah/8",
            ]
            for hash in hashes {
                let value = reading(hash)
                XCTAssertTrue(try store.update(israel: true, reading: value))
                let data = try XCTUnwrap(defaults.data(forKey: "practice.reading"))
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
                XCTAssertEqual(Set(json.keys), Set(["hash", "parshaName", "aliyahLabel"]))
                let reopened = PracticeStore(defaults: defaults)
                XCTAssertEqual(try reopened.reading(), value)
                XCTAssertEqual(try reopened.reading()?.url.fragment, String(hash.dropFirst()))
                XCTAssertTrue(reopened.israel)
                XCTAssertFalse(try reopened.update(israel: true, reading: value))
                XCTAssertEqual(defaults.data(forKey: "practice.reading"), data)
            }
        }
    }

    func testExistingRecordsLoadWithoutMigrationOrRewriting() throws {
        try withDefaults { defaults in
            let data = Data(##"{"hash":"#/r/1-1-1","parshaName":"Beresheet"}"##.utf8)
            defaults.set(data, forKey: "practice.reading")
            let restored = try XCTUnwrap(PracticeStore(defaults: defaults).reading())
            XCTAssertEqual(restored.hash, "#/r/1-1-1")
            XCTAssertNil(restored.aliyahLabel)
            XCTAssertEqual(defaults.data(forKey: "practice.reading"), data)
        }
    }

    func testInvalidSuffixCannotOverwriteExistingPractice() throws {
        try withDefaults { defaults in
            let store = PracticeStore(defaults: defaults)
            let original = reading("#/torah/parsha/beresheet/1-6-5/aliyah/Maftir")
            try store.update(israel: false, reading: original)
            let invalid = reading("#/torah/parsha/beresheet/1-6-5/aliyah/Maftir/extra")
            XCTAssertThrowsError(try store.update(israel: true, reading: invalid))
            XCTAssertEqual(try store.reading(), original)
            XCTAssertFalse(store.israel)
            defaults.set(try JSONEncoder().encode(invalid), forKey: "practice.reading")
            XCTAssertThrowsError(try store.reading())
        }
    }

    private func reading(_ hash: String) -> PracticeReading {
        PracticeReading(hash: hash, parshaName: "Beresheet", aliyahLabel: "Aliyah 1")
    }

    private func withDefaults(_ body: (UserDefaults) throws -> Void) throws {
        let suite = "PracticeStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        try body(defaults)
    }
}
