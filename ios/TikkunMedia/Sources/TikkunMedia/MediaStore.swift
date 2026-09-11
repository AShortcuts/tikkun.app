import CryptoKit
import Foundation

public struct MediaAsset: Codable, Equatable, Sendable {
    public let audioId: String
    public let url: String
    public let digest: String
    public let byteLength: Int64

    public init(audioId: String, url: String, digest: String, byteLength: Int64) {
        self.audioId = audioId; self.url = url; self.digest = digest; self.byteLength = byteLength
    }

    var key: String { Self.hash(Data("\(url)\n\(digest)\n\(byteLength)".utf8)) }
    var filename: String { "recording." + (URL(string: url)?.pathExtension.lowercased() ?? "m4a") }
    static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    func validate(origin: URL) throws -> URL {
        guard !audioId.isEmpty, audioId.count <= 500,
              digest.count == 64, digest.allSatisfy({ "0123456789abcdef".contains($0) }),
              byteLength > 0, byteLength <= 9_007_199_254_740_991,
              let source = URL(string: url), Self.permits(source, origin: origin),
              ["m4a", "mp3", "aac", "wav", "ogg", "opus", "flac"].contains(source.pathExtension.lowercased())
        else { throw MediaFailure.invalidAsset }
        return source
    }

    static func permits(_ url: URL, origin: URL) -> Bool {
        url.scheme == "https" && url.host == origin.host && (url.port ?? 443) == (origin.port ?? 443) &&
        url.user == nil && url.password == nil && url.fragment == nil && url.path.hasPrefix("/audio/") &&
        !url.pathComponents.contains("..")
    }
}

public enum MediaFailure: LocalizedError {
    case invalidAsset, integrity, busy, unsafePath, invalidIntent, insufficientSpace, invalidResponse
    public var errorDescription: String? {
        switch self {
        case .invalidAsset: "Invalid recording identity or unapproved audio host."
        case .integrity: "Recording verification failed. Download it again."
        case .busy: "This recording already has an active download."
        case .unsafePath: "Recording storage contains an unsafe path."
        case .invalidIntent: "Saved download queue is invalid; existing data was not overwritten."
        case .insufficientSpace: "Not enough storage. Remove downloads or choose fewer recordings."
        case .invalidResponse: "The audio server did not return a complete recording."
        }
    }
}

public struct MediaMetrics: Codable, Sendable {
    public let appBytes: Int64
    public let audioBytes: Int64
    public let temporaryBytes: Int64
    public let metadataBytes: Int64
    public let availableBytes: Int64?
}

// One actor per application owns all downloaded files and metadata. URLSession
// writes outside the actor; verification and the directory commit are serialized.
public actor MediaStore {
    public let root: URL
    private let origin: URL
    private let bundle: URL
    private let files = FileManager.default
    private let session: URLSession
    private let capacity: @Sendable (URL) throws -> Int64?
    private var transfers: [String: Int64] = [:]
    private var reservedBytes: [String: Int64] = [:]
    private var generations: [String: UUID] = [:]
    private var lastReports: [String: Date] = [:]

    public init(root: URL, origin: URL, bundle: URL = Bundle.main.bundleURL,
                session: URLSession = .shared,
                capacity: @escaping @Sendable (URL) throws -> Int64? = {
                    try $0.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage
                }) throws {
        guard origin.scheme == "https", origin.host != nil, origin.user == nil,
              origin.password == nil, origin.query == nil, origin.fragment == nil,
              origin.path.isEmpty || origin.path == "/" else { throw MediaFailure.invalidAsset }
        let root = root.standardizedFileURL.resolvingSymlinksInPath()
        self.root = root
        self.origin = origin
        self.bundle = bundle
        self.session = session
        self.capacity = capacity
        try Self.makeDirectory(root)
        try Self.makeDirectory(root.appendingPathComponent("objects"))
        try Self.makeDirectory(root.appendingPathComponent("staging"))
    }

    private static func makeDirectory(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        guard url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw MediaFailure.unsafePath }
        var directory = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }

    private func directory(_ asset: MediaAsset) -> URL { root.appendingPathComponent("objects/" + asset.key) }
    private func ensureOwned(_ url: URL) throws {
        guard url.standardizedFileURL.path.hasPrefix(root.path + "/"),
              url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw MediaFailure.unsafePath }
    }

    private func verify(_ url: URL, asset: MediaAsset) throws {
        try ensureOwned(url)
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true, Int64(values.fileSize ?? -1) == asset.byteLength else { throw MediaFailure.integrity }
        let handle = try FileHandle(forReadingFrom: url)
        defer {
            do { try handle.close() }
            catch { NSLog("Could not close verified recording: %@", error.localizedDescription) }
        }
        var digest = SHA256()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
            try Task.checkCancellation()
            digest.update(data: chunk)
        }
        guard digest.finalize().map({ String(format: "%02x", $0) }).joined() == asset.digest else { throw MediaFailure.integrity }
    }

    public func localURL(for asset: MediaAsset) throws -> URL? {
        _ = try asset.validate(origin: origin)
        let folder = directory(asset)
        try ensureOwned(folder)
        guard files.fileExists(atPath: folder.path) else { return nil }
        let metadata = folder.appendingPathComponent("asset.json")
        try ensureOwned(metadata)
        let saved = try JSONDecoder().decode(MediaAsset.self, from: Data(contentsOf: metadata))
        guard saved.url == asset.url, saved.digest == asset.digest, saved.byteLength == asset.byteLength else { throw MediaFailure.integrity }
        let media = folder.appendingPathComponent(asset.filename)
        try verify(media, asset: asset)
        return media
    }

    public func inventory() throws -> [MediaAsset] {
        var result: [MediaAsset] = []
        let objects = root.appendingPathComponent("objects")
        try ensureOwned(objects)
        for folder in try files.contentsOfDirectory(at: objects, includingPropertiesForKeys: nil) {
            try Task.checkCancellation()
            try ensureOwned(folder)
            let metadata = folder.appendingPathComponent("asset.json")
            try ensureOwned(metadata)
            do {
                let asset = try JSONDecoder().decode(MediaAsset.self, from: Data(contentsOf: metadata))
                _ = try asset.validate(origin: origin)
                guard folder.lastPathComponent == asset.key else { throw MediaFailure.integrity }
                if try localURL(for: asset) != nil { result.append(asset) }
            } catch {
                let cocoa = error as NSError
                let invalid = error is DecodingError || (error as? MediaFailure) == .integrity ||
                    (error as? MediaFailure) == .invalidAsset ||
                    (cocoa.domain == NSCocoaErrorDomain && cocoa.code == NSFileReadNoSuchFileError)
                guard invalid, folder.lastPathComponent.count == 64,
                      folder.lastPathComponent.allSatisfy({ "0123456789abcdef".contains($0) }) else { throw error }
                try files.removeItem(at: folder)
                NSLog("Discarded a corrupt offline recording: %@", error.localizedDescription)
            }
        }
        return result.sorted { $0.url < $1.url }
    }

    public func preflight(_ assets: [MediaAsset]) throws {
        guard assets.count <= 10_000 else { throw MediaFailure.invalidAsset }
        // Reported transfer progress may lag the filesystem, so this remains
        // conservative. Already written bytes are not reserved a second time.
        var pending = reservedBytes
        for (key, bytes) in transfers {
            if let reserved = pending[key] { pending[key] = max(0, reserved - bytes) }
        }
        var seen = Set<String>()
        for asset in assets {
            try Task.checkCancellation()
            _ = try asset.validate(origin: origin)
            guard seen.insert(asset.key).inserted, pending[asset.key] == nil else { continue }
            if try localURL(for: asset) == nil { pending[asset.key] = asset.byteLength }
        }
        guard let available = availableCapacity() else { return }
        var remaining = max(0, max(0, available) - 33_554_432)
        for bytes in pending.values {
            guard bytes <= remaining else { throw MediaFailure.insufficientSpace }
            remaining -= bytes
        }
    }

    public func download(_ asset: MediaAsset, progress: @escaping @Sendable (Int64) -> Void) async throws -> MediaAsset {
        let source = try asset.validate(origin: origin)
        try Task.checkCancellation()
        if try localURL(for: asset) != nil { return asset }
        guard transfers[asset.key] == nil else { throw MediaFailure.busy }
        try preflight([asset])
        transfers[asset.key] = 0
        reservedBytes[asset.key] = asset.byteLength
        let generation = UUID()
        generations[asset.key] = generation
        defer {
            transfers.removeValue(forKey: asset.key); reservedBytes.removeValue(forKey: asset.key)
            generations.removeValue(forKey: asset.key); lastReports.removeValue(forKey: asset.key)
        }
        let delegate = MediaDownloadDelegate(origin: origin, expectedBytes: asset.byteLength) { bytes in
            Task { await self.recordProgress(asset.key, generation: generation, bytes: bytes, progress: progress) }
        }
        var request = URLRequest(url: source, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        let (temporary, response) = try await session.download(for: request, delegate: delegate)
        defer {
            do { if files.fileExists(atPath: temporary.path) { try files.removeItem(at: temporary) } }
            catch { NSLog("Could not clean temporary recording: %@", error.localizedDescription) }
        }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let finalURL = http.url, MediaAsset.permits(finalURL, origin: origin) else { throw MediaFailure.invalidResponse }
        try commitDownloadedFile(temporary, asset: asset)
        return asset
    }

    private func recordProgress(_ key: String, generation: UUID, bytes: Int64, progress: @Sendable (Int64) -> Void) {
        guard generations[key] == generation, let previous = transfers[key], bytes >= previous else { return }
        transfers[key] = bytes
        let now = Date()
        if (lastReports[key].map({ now.timeIntervalSince($0) >= 0.1 }) ?? true) || bytes == reservedBytes[key] {
            lastReports[key] = now
            progress(bytes)
        }
    }

    // The entire directory is the commit unit: media and its identity appear
    // together, with no metadata pointing at an unfinished transfer.
    func commitDownloadedFile(_ temporary: URL, asset: MediaAsset) throws {
        _ = try asset.validate(origin: origin)
        let stage = root.appendingPathComponent("staging/" + UUID().uuidString)
        try Self.makeDirectory(stage)
        do {
            let media = stage.appendingPathComponent(asset.filename)
            try files.moveItem(at: temporary, to: media)
            #if os(iOS)
            try files.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: media.path)
            #endif
            try verify(media, asset: asset)
            try JSONEncoder().encode(asset).write(to: stage.appendingPathComponent("asset.json"), options: .atomic)
            try Task.checkCancellation()
            let destination = directory(asset)
            try ensureOwned(destination)
            if files.fileExists(atPath: destination.path) {
                guard try localURL(for: asset) != nil else { throw MediaFailure.integrity }
                try files.removeItem(at: stage)
            } else { try files.moveItem(at: stage, to: destination) }
        } catch {
            do { if files.fileExists(atPath: stage.path) { try files.removeItem(at: stage) } }
            catch { throw error }
            throw error
        }
    }

    public func remove(_ asset: MediaAsset) throws {
        _ = try asset.validate(origin: origin)
        guard transfers[asset.key] == nil else { throw MediaFailure.busy }
        let folder = directory(asset)
        try ensureOwned(folder)
        if files.fileExists(atPath: folder.path) { try files.removeItem(at: folder) }
    }

    public func clearTemporary() throws {
        let staging = root.appendingPathComponent("staging")
        try ensureOwned(staging)
        // Transfers are staged only inside a non-suspending actor operation.
        for url in try files.contentsOfDirectory(at: staging, includingPropertiesForKeys: nil) {
            try ensureOwned(url)
            try files.removeItem(at: url)
        }
    }

    public func readIntent() throws -> [String] {
        let file = root.appendingPathComponent("intent.json")
        try ensureOwned(file)
        guard files.fileExists(atPath: file.path) else { return [] }
        let keys = try JSONDecoder().decode([String].self, from: Data(contentsOf: file))
        try validateIntent(keys)
        return keys
    }

    public func updateIntent(add: [String], remove: [String]) throws {
        try validateIntent(add); try validateIntent(remove)
        var keys = Set(try readIntent())
        keys.subtract(remove); keys.formUnion(add)
        let next = keys.sorted()
        try validateIntent(next)
        try JSONEncoder().encode(next).write(to: root.appendingPathComponent("intent.json"), options: .atomic)
    }

    private func validateIntent(_ keys: [String]) throws {
        guard keys.count <= 10_000, Set(keys).count == keys.count,
              keys.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 4096 }) else { throw MediaFailure.invalidIntent }
    }

    private func availableCapacity() -> Int64? {
        do { return try capacity(root) }
        catch {
            NSLog("Download capacity is unavailable: %@", error.localizedDescription)
            return nil
        }
    }

    private func bytes(in directory: URL) throws -> Int64 {
        var total: Int64 = 0
        let children = try files.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey])
        for child in children {
            let values = try child.resourceValues(forKeys: [.isDirectoryKey, .isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey])
            if values.isSymbolicLink == true { continue }
            if values.isDirectory == true { total += try bytes(in: child) }
            else if values.isRegularFile == true { total += Int64(values.fileSize ?? 0) }
        }
        return total
    }

    public func metrics() throws -> MediaMetrics {
        let audio = try inventory().reduce(Int64(0)) { $0 + $1.byteLength }
        let staged = try bytes(in: root.appendingPathComponent("staging"))
        let owned = try bytes(in: root)
        return MediaMetrics(appBytes: try bytes(in: bundle), audioBytes: audio,
            temporaryBytes: staged + transfers.values.reduce(0, +), metadataBytes: max(0, owned - audio - staged),
            availableBytes: availableCapacity())
    }
}

private final class MediaDownloadDelegate: NSObject, URLSessionDownloadDelegate {
    let origin: URL
    let expectedBytes: Int64
    let progress: @Sendable (Int64) -> Void
    init(origin: URL, expectedBytes: Int64, progress: @escaping @Sendable (Int64) -> Void) {
        self.origin = origin; self.expectedBytes = expectedBytes; self.progress = progress
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesWritten <= expectedBytes else { downloadTask.cancel(); return }
        progress(totalBytesWritten)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url.map { MediaAsset.permits($0, origin: origin) } == true ? request : nil)
    }
}
