import Foundation
import XCTest
@testable import TikkunMedia

final class MediaStoreTests: XCTestCase {
    let origin = URL(string: "https://tikkunreader.com")!
    var scratch: URL!

    override func setUpWithError() throws {
        scratch = FileManager.default.temporaryDirectory.appendingPathComponent("TikkunMediaTests-" + UUID().uuidString).resolvingSymlinksInPath()
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: scratch) }

    func store() throws -> MediaStore {
        try MediaStore(root: scratch.appendingPathComponent("owned"), origin: origin, bundle: scratch.appendingPathComponent("bundle"))
    }
    func asset(_ bytes: Data, name: String = "one") -> MediaAsset {
        MediaAsset(audioId: name, url: "https://tikkunreader.com/audio/\(name).m4a", digest: MediaAsset.hash(bytes), byteLength: Int64(bytes.count))
    }
    func temporary(_ bytes: Data) throws -> URL {
        let file = scratch.appendingPathComponent(UUID().uuidString)
        try bytes.write(to: file)
        return file
    }

    func testAtomicCommitInventoryAndRelaunch() async throws {
        let bytes = Data([1, 3, 5, 7])
        let asset = asset(bytes)
        let first = try store()
        try await first.commitDownloadedFile(temporary(bytes), asset: asset)
        let inventory = try await first.inventory()
        XCTAssertEqual(inventory, [asset])
        let local = try await first.localURL(for: asset)
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(local)), bytes)
        let restarted = try store()
        let after = try await restarted.inventory()
        XCTAssertEqual(after, [asset])
        try await restarted.remove(asset)
        let empty = try await restarted.inventory()
        XCTAssertTrue(empty.isEmpty)
    }

    func testInvalidDownloadCannotReplaceVerifiedVersion() async throws {
        let original = Data([1, 2, 3, 4])
        let asset = asset(original)
        let store = try store()
        try await store.commitDownloadedFile(temporary(original), asset: asset)
        do {
            try await store.commitDownloadedFile(temporary(Data([4, 3, 2, 1])), asset: asset)
            XCTFail("Expected checksum failure")
        } catch { XCTAssertEqual(error as? MediaFailure, .integrity) }
        let local = try await store.localURL(for: asset)
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(local)), original)
    }

    func testRejectsTruncationAndChangedFileOnDisk() async throws {
        let bytes = Data([1, 2, 3, 4])
        let asset = asset(bytes)
        let store = try store()
        do {
            try await store.commitDownloadedFile(temporary(Data([1])), asset: asset)
            XCTFail("Expected size failure")
        } catch { XCTAssertEqual(error as? MediaFailure, .integrity) }
        try await store.commitDownloadedFile(temporary(bytes), asset: asset)
        let local = try await store.localURL(for: asset)
        try Data([8, 8, 8, 8]).write(to: XCTUnwrap(local))
        let reconciled = try await store.inventory()
        XCTAssertTrue(reconciled.isEmpty, "Corrupt file must not count as downloaded")
        try await store.remove(asset)
        let empty = try await store.inventory()
        XCTAssertTrue(empty.isEmpty)
    }

    func testRejectsForeignHostsTraversalAndSymlinkFiles() async throws {
        let valid = asset(Data([1]))
        for url in ["http://tikkunreader.com/audio/one.m4a", "https://evil.test/audio/one.m4a",
                    "https://tikkunreader.com/audio/../private.m4a", "file:///tmp/one.m4a"] {
            let invalid = MediaAsset(audioId: valid.audioId, url: url, digest: valid.digest, byteLength: valid.byteLength)
            XCTAssertThrowsError(try invalid.validate(origin: origin))
        }
        let store = try store()
        try await store.commitDownloadedFile(temporary(Data([1])), asset: valid)
        let resolved = try await store.localURL(for: valid)
        let file = try XCTUnwrap(resolved)
        try FileManager.default.removeItem(at: file)
        let external = try temporary(Data([1]))
        try FileManager.default.createSymbolicLink(at: file, withDestinationURL: external)
        do { _ = try await store.localURL(for: valid); XCTFail("Symlinks must not escape owned media") }
        catch { XCTAssertEqual(error as? MediaFailure, .unsafePath) }
        XCTAssertTrue(FileManager.default.fileExists(atPath: external.path))
    }

    func testQueueUpdatesAreSerializedAndPreserveCorruptState() async throws {
        let store = try store()
        async let one: Void = store.updateIntent(add: ["one"], remove: [])
        async let two: Void = store.updateIntent(add: ["two"], remove: [])
        _ = try await (one, two)
        let saved = try await store.readIntent()
        XCTAssertEqual(saved, ["one", "two"])
        let file = await store.root.appendingPathComponent("intent.json")
        let bad = Data("{broken".utf8)
        try bad.write(to: file)
        do { try await store.updateIntent(add: ["three"], remove: []); XCTFail("Corrupt queue must not be overwritten") }
        catch { XCTAssertTrue(error is DecodingError) }
        XCTAssertEqual(try Data(contentsOf: file), bad)
    }

    func testTemporaryCleanupDoesNotRemovePersonalDataOrCommittedAudio() async throws {
        let store = try store()
        let bytes = Data([1, 2, 3])
        let asset = asset(bytes)
        try await store.commitDownloadedFile(temporary(bytes), asset: asset)
        let root = await store.root
        try Data([8, 9]).write(to: root.appendingPathComponent("staging/interrupted"))
        let personal = try temporary(Data([7, 7]))
        try await store.clearTemporary()
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent("staging").path), [])
        XCTAssertTrue(FileManager.default.fileExists(atPath: personal.path))
        let inventory = try await store.inventory()
        XCTAssertEqual(inventory, [asset])
    }

    func testMetricsUseMeasuredBytesWithoutCountingAudioTwice() async throws {
        let bundle = scratch.appendingPathComponent("bundle")
        try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
        try Data([0, 1, 2, 3, 4]).write(to: bundle.appendingPathComponent("app"))
        let store = try store()
        let bytes = Data([1, 2, 3])
        try await store.commitDownloadedFile(temporary(bytes), asset: asset(bytes))
        let root = await store.root
        try Data([8, 9]).write(to: root.appendingPathComponent("staging/interrupted"))
        let metrics = try await store.metrics()
        XCTAssertEqual(metrics.appBytes, 5)
        XCTAssertEqual(metrics.audioBytes, 3)
        XCTAssertEqual(metrics.temporaryBytes, 2)
        XCTAssertGreaterThan(metrics.metadataBytes, 0)
        if let available = metrics.availableBytes { XCTAssertGreaterThanOrEqual(available, 0) }
    }

    func testProductionDownloadWhenExplicitlyEnabled() async throws {
        guard let json = ProcessInfo.processInfo.environment["TIKKUN_MEDIA_NETWORK_ASSET"] else {
            throw XCTSkip("Enable explicitly with an asset from the generated recording catalog.")
        }
        let asset = try JSONDecoder().decode(MediaAsset.self, from: Data(json.utf8))
        let store = try store()
        let result = try await store.download(asset, progress: { _ in })
        XCTAssertEqual(result, asset)
        let local = try await store.localURL(for: asset)
        XCTAssertNotNil(local)
        let relaunched = try self.store()
        let inventory = try await relaunched.inventory()
        XCTAssertEqual(inventory, [asset])
        try await relaunched.remove(asset)
        let empty = try await relaunched.inventory()
        XCTAssertTrue(empty.isEmpty)
    }

    func testCancellationStopsAnActiveURLSessionTransferWithoutCommitting() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [IncompleteMediaProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let store = try MediaStore(root: scratch.appendingPathComponent("owned"), origin: origin, session: session)
        let asset = asset(Data(repeating: 0, count: 1_048_576))
        let transfer = Task { try await store.download(asset, progress: { _ in }) }
        var active = false
        for _ in 0..<100 {
            let tasks: [URLSessionTask] = await withCheckedContinuation { continuation in
                session.getAllTasks { continuation.resume(returning: $0) }
            }
            active = tasks.contains { $0.state == .running && $0.response != nil }
            if active { break }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(active, "Cancel only after the native request has received its response")
        transfer.cancel()
        do { _ = try await transfer.value; XCTFail("Cancelled transfer must not commit") }
        catch { XCTAssertTrue(error is CancellationError || (error as? URLError)?.code == .cancelled) }
        let inventory = try await store.inventory()
        XCTAssertTrue(inventory.isEmpty)
    }

    func testHTTPErrorDoesNotCreateAnOfflineAsset() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [IncompleteMediaProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let store = try MediaStore(root: scratch.appendingPathComponent("owned"), origin: origin, session: session)
        do { _ = try await store.download(asset(Data([1]), name: "error"), progress: { _ in }); XCTFail("HTTP error must not commit") }
        catch { XCTAssertEqual(error as? MediaFailure, .invalidResponse) }
        let inventory = try await store.inventory()
        XCTAssertTrue(inventory.isEmpty)
    }

    func testLowSpaceStopsDownloadButUnknownCapacityDoesNot() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [IncompleteMediaProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let low = try MediaStore(root: scratch.appendingPathComponent("low"), origin: origin, session: session, capacity: { _ in 0 })
        do { _ = try await low.download(asset(Data([1])), progress: { _ in }); XCTFail("Low space must prevent downloading") }
        catch { XCTAssertEqual(error as? MediaFailure, .insufficientSpace) }
        let unknown = try MediaStore(root: scratch.appendingPathComponent("unknown"), origin: origin, session: session,
            capacity: { _ in throw CocoaError(.featureUnsupported) })
        do { _ = try await unknown.download(asset(Data([1]), name: "error"), progress: { _ in }); XCTFail("Fixture should return an HTTP error") }
        catch { XCTAssertEqual(error as? MediaFailure, .invalidResponse, "Unknown capacity must allow the request to reach the server") }
    }

    func testBatchPreflightCountsMissingAssetsOnceAndRetainsOldVersions() async throws {
        let store = try MediaStore(root: scratch.appendingPathComponent("owned"), origin: origin,
            capacity: { _ in 33_554_432 + 4 })
        let one = asset(Data([1, 2, 3, 4]))
        let alias = MediaAsset(audioId: "alias", url: one.url, digest: one.digest, byteLength: one.byteLength)
        let two = asset(Data([5, 6, 7, 8]), name: "two")
        try await store.preflight([one, alias])
        try await store.preflight([two])
        do { try await store.preflight([one, two]); XCTFail("Individually fitting files must still fit as a whole batch") }
        catch { XCTAssertEqual(error as? MediaFailure, .insufficientSpace) }
        let empty = try await store.inventory()
        XCTAssertTrue(empty.isEmpty, "Preflight cannot write audio")
        let intent = try await store.readIntent()
        XCTAssertTrue(intent.isEmpty, "Preflight cannot change retry intent")
        try await store.commitDownloadedFile(temporary(Data([1, 2, 3, 4])), asset: one)
        try await store.preflight([one, alias, two])
        let replacement = asset(Data([4, 3, 2, 1]))
        do { try await store.preflight([replacement, two]); XCTFail("Old versions do not release space before replacement succeeds") }
        catch { XCTAssertEqual(error as? MediaFailure, .insufficientSpace) }
        let inventory = try await store.inventory()
        XCTAssertEqual(inventory, [one])
    }

    func testPreflightUnknownCapacityStillValidatesAssetsAndZeroSpaceAllowsSavedCopies() async throws {
        let unknown = try MediaStore(root: scratch.appendingPathComponent("unknown"), origin: origin, capacity: { _ in nil })
        let one = asset(Data([1]))
        try await unknown.preflight([one])
        let invalid = MediaAsset(audioId: one.audioId, url: "https://evil.test/audio/one.m4a", digest: one.digest, byteLength: 1)
        do { try await unknown.preflight([invalid]); XCTFail("Unknown capacity cannot bypass identity validation") }
        catch { XCTAssertEqual(error as? MediaFailure, .invalidAsset) }
        let low = try MediaStore(root: scratch.appendingPathComponent("low"), origin: origin, capacity: { _ in 0 })
        try await low.commitDownloadedFile(temporary(Data([1])), asset: one)
        try await low.preflight([one])
        do { try await low.preflight([asset(Data([2]), name: "two")]); XCTFail("New bytes require capacity") }
        catch { XCTAssertEqual(error as? MediaFailure, .insufficientSpace) }
    }

    func testPreflightRejectsAnOverflowingBatchWithoutIntegerOverflow() async throws {
        let store = try MediaStore(root: scratch.appendingPathComponent("owned"), origin: origin, capacity: { _ in Int64.max })
        let batch = (0..<1025).map { index in
            MediaAsset(audioId: String(index), url: "https://tikkunreader.com/audio/\(index).m4a",
                digest: String(repeating: "a", count: 64), byteLength: 9_007_199_254_740_991)
        }
        do { try await store.preflight(batch); XCTFail("Batch total exceeds Int64 capacity") }
        catch { XCTAssertEqual(error as? MediaFailure, .insufficientSpace) }
    }

    func testPreflightIncludesActiveReservationsOnceAndReleasesThemAfterCancellation() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [IncompleteMediaProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let store = try MediaStore(root: scratch.appendingPathComponent("owned"), origin: origin, session: session,
            capacity: { _ in 33_554_432 + 1_048_576 + 100 })
        let one = asset(Data(repeating: 0, count: 1_048_576))
        let transfer = Task { try await store.download(one, progress: { _ in }) }
        defer { transfer.cancel() }
        var active = false
        for _ in 0..<100 {
            let tasks: [URLSessionTask] = await withCheckedContinuation { continuation in
                session.getAllTasks { continuation.resume(returning: $0) }
            }
            active = tasks.contains { $0.state == .running && $0.response != nil }
            if active { break }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(active)
        try await store.preflight([one, one, asset(Data(repeating: 1, count: 100), name: "small")])
        let next = asset(Data(repeating: 2, count: 1_048_576), name: "next")
        do { try await store.preflight([next]); XCTFail("Existing active transfers reserve space even when not in the new batch") }
        catch { XCTAssertEqual(error as? MediaFailure, .insufficientSpace) }
        transfer.cancel()
        do { _ = try await transfer.value; XCTFail("Cancelled transfer must not commit") }
        catch { XCTAssertTrue(error is CancellationError || (error as? URLError)?.code == .cancelled) }
        try await store.preflight([next])
    }
}

private final class IncompleteMediaProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let failure = request.url!.lastPathComponent == "error.m4a"
        let response = HTTPURLResponse(url: request.url!, statusCode: failure ? 503 : 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Length": failure ? "0" : "1048576"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if failure { client?.urlProtocolDidFinishLoading(self) }
        else { client?.urlProtocol(self, didLoad: Data(repeating: 0, count: 32_768)) }
    }
    override func stopLoading() {}
}
