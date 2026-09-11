import XCTest
@testable import TikkunPlayback

@MainActor
final class PlaybackEngineTests: XCTestCase {
    private func fixture() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("tikkun-\(UUID()).wav")
        let samples = 16_000
        var data = Data()
        func text(_ value: String) { data.append(contentsOf: value.utf8) }
        func integer<T: FixedWidthInteger>(_ value: T) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        text("RIFF"); integer(UInt32(36 + samples * 2)); text("WAVEfmt ")
        integer(UInt32(16)); integer(UInt16(1)); integer(UInt16(1))
        integer(UInt32(16_000)); integer(UInt32(32_000)); integer(UInt16(2)); integer(UInt16(16))
        text("data"); integer(UInt32(samples * 2))
        data.append(Data(count: samples * 2))
        try data.write(to: url)
        addTeardownBlock { try FileManager.default.removeItem(at: url) }
        return url
    }

    private func waitFor(_ engine: PlaybackEngine, timeout: Double = 5,
                         condition: (PlaybackSnapshot) -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(engine.snapshot) {
            if let error = engine.snapshot.error { XCTFail(error); return }
            guard Date() < deadline else {
                XCTFail("Timed out: \(engine.snapshot)")
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    func testNativeProgressionSkipsPhysicalGapsWithoutJavaScript() async throws {
        let url = try fixture()
        let engine = PlaybackEngine()
        defer { engine.clear() }
        var visited = Set<Int>()
        engine.onChange = { visited.insert($0.segmentIndex) }
        try engine.load(sessionID: "segments", segments: [
            .init(url: url, start: 0.1, end: 0.3),
            .init(url: url, start: 0.7, end: 0.9)
        ])
        try engine.play()
        try await waitFor(engine) { $0.ended }
        XCTAssertEqual(visited, [0, 1])
        XCTAssertEqual(engine.snapshot.currentTime, 0.4, accuracy: 0.01)
        XCTAssertEqual(engine.snapshot.duration ?? -1, 0.4, accuracy: 0.01)
        XCTAssertTrue(engine.snapshot.paused)
    }

    func testSeekUsesLogicalTimelineAndRemainsPaused() async throws {
        let url = try fixture()
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "seek", segments: [
            .init(url: url, start: 0, end: 0.2),
            .init(url: url, start: 0.6, end: 0.9)
        ])
        try engine.seek(to: 0.35)
        try await waitFor(engine) { $0.phase == "ready" }
        XCTAssertEqual(engine.snapshot.segmentIndex, 1)
        XCTAssertEqual(engine.snapshot.currentTime, 0.35, accuracy: 0.01)
        XCTAssertTrue(engine.snapshot.paused)
    }

    func testOpenEndedFinalSegmentDiscoversDuration() async throws {
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "open", segments: [.init(url: try fixture(), start: 0.4, end: nil)])
        try await waitFor(engine) { $0.phase == "ready" }
        XCTAssertEqual(engine.snapshot.duration ?? -1, 0.6, accuracy: 0.01)
    }

    func testReplacementAndClearRejectStaleCallbacks() async throws {
        let url = try fixture()
        let engine = PlaybackEngine()
        try engine.load(sessionID: "old", segments: [.init(url: url, start: 0, end: 0.9)])
        try engine.play()
        try engine.load(sessionID: "new", segments: [.init(url: url, start: 0.2, end: 0.4)])
        try await waitFor(engine) { $0.phase == "ready" }
        XCTAssertEqual(engine.snapshot.sessionID, "new")
        XCTAssertTrue(engine.snapshot.paused)
        engine.clear()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertNil(engine.snapshot.sessionID)
        XCTAssertEqual(engine.snapshot.phase, "idle")
        XCTAssertTrue(engine.snapshot.paused)
    }

    func testRejectsInvalidPlansWithoutReplacingValidSession() throws {
        let url = try fixture()
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "valid", segments: [.init(url: url, start: 0, end: 1)])
        let invalid: [[PlaybackSegment]] = [
            [], [.init(url: url, start: -.infinity, end: 1)],
            [.init(url: url, start: 1, end: 1)],
            [.init(url: url, start: 0, end: nil), .init(url: url, start: 0, end: 1)],
            [.init(url: URL(string: "http://example.org/audio")!, start: 0, end: 1)]
        ]
        for segments in invalid {
            XCTAssertThrowsError(try engine.load(sessionID: "bad", segments: segments))
            XCTAssertEqual(engine.snapshot.sessionID, "valid")
        }
        XCTAssertThrowsError(try engine.seek(to: .nan))
        XCTAssertThrowsError(try engine.setRate(.infinity))
    }

    func testPauseDuringLoadPreventsDelayedAutoplay() async throws {
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "pause", segments: [.init(url: try fixture(), start: 0, end: 1)])
        try engine.play()
        engine.pause()
        try await waitFor(engine) { $0.phase == "ready" }
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(engine.snapshot.paused)
        XCTAssertEqual(engine.snapshot.currentTime, 0, accuracy: 0.01)
    }

    func testSegmentOutsideSourceReportsError() async throws {
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "bounds", segments: [.init(url: try fixture(), start: 2, end: 3)])
        let deadline = Date().addingTimeInterval(5)
        while engine.snapshot.error == nil && Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertEqual(engine.snapshot.phase, "error")
        XCTAssertNotNil(engine.snapshot.error)
        XCTAssertTrue(engine.snapshot.paused)
    }

    func testExternalFailureCannotBeOverwrittenByLateReadiness() async throws {
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "interrupted", segments: [.init(url: try fixture(), start: 0, end: 1)])
        try engine.play()
        engine.stopWithError("Audio route failed")
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(engine.snapshot.phase, "error")
        XCTAssertEqual(engine.snapshot.error, "Audio route failed")
        XCTAssertTrue(engine.snapshot.paused)
        try engine.play()
        try await waitFor(engine) { $0.phase == "ready" }
        XCTAssertNil(engine.snapshot.error)
    }

    func testMediaResetPreservesLogicalSeekAndRequiresExplicitPlay() async throws {
        let url = try fixture()
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "reset", segments: [
            .init(url: url, start: 0.1, end: 0.3),
            .init(url: url, start: 0.6, end: 1)
        ])
        try engine.setRate(0.5)
        try engine.play()
        try engine.seek(to: 0.35)
        let revision = engine.snapshot.revision
        engine.resetMediaServices()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(engine.snapshot.sessionID, "reset")
        XCTAssertEqual(engine.snapshot.segmentIndex, 1)
        XCTAssertEqual(engine.snapshot.currentTime, 0.35, accuracy: 0.01)
        XCTAssertEqual(engine.snapshot.duration ?? -1, 0.6, accuracy: 0.01)
        XCTAssertEqual(engine.snapshot.rate, 0.5)
        XCTAssertTrue(engine.snapshot.paused)
        XCTAssertEqual(engine.snapshot.phase, "error")
        XCTAssertNotNil(engine.snapshot.error)
        XCTAssertGreaterThan(engine.snapshot.revision, revision)
        try engine.play()
        try await waitFor(engine) { $0.phase == "ready" && $0.currentTime > 0.36 }
        XCTAssertFalse(engine.snapshot.paused)
        XCTAssertNil(engine.snapshot.error)
    }

    func testMediaResetOfReadyPausedPlayerKeepsPositionAcrossRepeatedResets() async throws {
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "paused-reset", segments: [.init(url: try fixture(), start: 0, end: nil)])
        try engine.seek(to: 0.4)
        try await waitFor(engine) { $0.phase == "ready" }
        engine.resetMediaServices()
        engine.resetMediaServices()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(engine.snapshot.currentTime, 0.4, accuracy: 0.01)
        XCTAssertEqual(engine.snapshot.duration ?? -1, 1, accuracy: 0.01)
        XCTAssertTrue(engine.snapshot.paused)
        try engine.play()
        try await waitFor(engine) { $0.phase == "ready" && $0.currentTime > 0.41 }
    }

    func testResetOfEmptyOrClearedPlayerStaysIdle() async throws {
        let engine = PlaybackEngine()
        engine.resetMediaServices()
        XCTAssertNil(engine.snapshot.sessionID)
        XCTAssertNil(engine.snapshot.error)
        XCTAssertEqual(engine.snapshot.phase, "idle")
        try engine.load(sessionID: "cleared", segments: [.init(url: try fixture(), start: 0, end: 1)])
        engine.clear()
        engine.resetMediaServices()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertNil(engine.snapshot.sessionID)
        XCTAssertNil(engine.snapshot.error)
        XCTAssertEqual(engine.snapshot.phase, "idle")
    }

    func testMediaResetStopsActiveAudioAndEndedAudioReplaysOnlyOnPlay() async throws {
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "active-reset", segments: [.init(url: try fixture(), start: 0, end: 1)])
        try engine.play()
        try await waitFor(engine) { $0.phase == "ready" && $0.currentTime > 0.1 }
        let position = engine.snapshot.currentTime
        engine.resetMediaServices()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(engine.snapshot.paused)
        XCTAssertEqual(engine.snapshot.currentTime, position, accuracy: 0.02)
        try engine.play()
        try await waitFor(engine) { $0.ended }
        engine.resetMediaServices()
        XCTAssertTrue(engine.snapshot.ended)
        XCTAssertTrue(engine.snapshot.paused)
        XCTAssertEqual(engine.snapshot.currentTime, 1, accuracy: 0.01)
        try engine.play()
        try await waitFor(engine) { $0.phase == "ready" && !$0.ended }
        XCTAssertLessThan(engine.snapshot.currentTime, 0.2)
        XCTAssertFalse(engine.snapshot.paused)
    }

    func testFailureDuringSeekRetainsPendingLogicalPositionForRetry() async throws {
        let engine = PlaybackEngine()
        defer { engine.clear() }
        try engine.load(sessionID: "seek-failure", segments: [.init(url: try fixture(), start: 0, end: 1)])
        try await waitFor(engine) { $0.phase == "ready" }
        try engine.seek(to: 0.6)
        engine.stopWithError("Audio service failed")
        XCTAssertEqual(engine.snapshot.currentTime, 0.6, accuracy: 0.01)
        try engine.play()
        try await waitFor(engine) { $0.phase == "ready" && $0.currentTime > 0.61 }
    }
}
