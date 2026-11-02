import Foundation
import XCTest
@testable import TikkunMedia

final class PublishedContentStoreTests: XCTestCase {
    var scratch: URL!
    let cue = "cues/" + String(repeating: "a", count: 64) + ".json"
    let other = "cues/" + String(repeating: "b", count: 64) + ".json"

    override func setUpWithError() throws {
        scratch = FileManager.default.temporaryDirectory.appendingPathComponent("PublishedContentTests-" + UUID().uuidString).resolvingSymlinksInPath()
    }
    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: scratch) }

    func testReadsWhatItWroteAcrossLaunches() async throws {
        let first = try PublishedContentStore(root: scratch)
        let missing = try await first.read("state.json")
        XCTAssertNil(missing)
        try await first.write("state.json", value: "{\"active\":null}")
        try await first.write(cue, value: "[1]")
        let relaunched = try PublishedContentStore(root: scratch)
        let state = try await relaunched.read("state.json")
        let saved = try await relaunched.read(cue)
        XCTAssertEqual(state, "{\"active\":null}")
        XCTAssertEqual(saved, "[1]")
        XCTAssertEqual(try scratch.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
    }

    func testRejectsNamesOutsideTheStore() async throws {
        let store = try PublishedContentStore(root: scratch)
        for name in ["../state.json", "cues/../../escape.json", "cues/abc.json", "other.json", "cues/" + String(repeating: "A", count: 64) + ".json"] {
            do {
                try await store.write(name, value: "{}")
                XCTFail("Accepted \(name)")
            } catch PublishedContentFailure.invalidName {}
        }
        do {
            try await store.prune(keeping: ["../state.json"])
            XCTFail("Accepted an unsafe prune name")
        } catch PublishedContentFailure.invalidName {}
    }

    func testRejectsOversizedFiles() async throws {
        let store = try PublishedContentStore(root: scratch)
        do {
            try await store.write(cue, value: String(repeating: "x", count: PublishedContentStore.maxFileBytes + 1))
            XCTFail("Accepted an oversized file")
        } catch PublishedContentFailure.tooLarge {}
    }

    func testPruneKeepsListedCueFilesAndState() async throws {
        let store = try PublishedContentStore(root: scratch)
        try await store.write("state.json", value: "{}")
        try await store.write(cue, value: "[1]")
        try await store.write(other, value: "[2]")
        try await store.prune(keeping: [cue])
        let kept = try await store.read(cue)
        let removed = try await store.read(other)
        let state = try await store.read("state.json")
        XCTAssertEqual(kept, "[1]")
        XCTAssertNil(removed)
        XCTAssertEqual(state, "{}")
    }
}
