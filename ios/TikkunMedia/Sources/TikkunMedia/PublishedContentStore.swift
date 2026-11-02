import Foundation

public enum PublishedContentFailure: Error, LocalizedError {
    case invalidName, tooLarge, invalidText, unsafePath

    public var errorDescription: String? {
        switch self {
        case .invalidName: "Saved content name is not allowed."
        case .tooLarge: "Saved content is larger than allowed."
        case .invalidText: "Saved content is not valid text."
        case .unsafePath: "Saved content storage is not a private app folder."
        }
    }
}

// Recordings and cues published by the website, kept for offline use. JavaScript
// verifies every file's fingerprint; this store only reads, writes and prunes.
public actor PublishedContentStore {
    public static let maxFileBytes = 8 * 1024 * 1024
    private let root: URL
    private let files = FileManager.default

    public init(root: URL) throws {
        for directory in [root, root.appendingPathComponent("cues", isDirectory: true)] {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            guard directory.standardizedFileURL.path == directory.resolvingSymlinksInPath().path else {
                throw PublishedContentFailure.unsafePath
            }
        }
        var excluded = root
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
        self.root = root
    }

    public static func isValidName(_ name: String) -> Bool {
        name == "state.json" || name.range(of: "^cues/[0-9a-f]{64}\\.json$", options: .regularExpression) != nil
    }

    private func file(_ name: String) throws -> URL {
        guard Self.isValidName(name) else { throw PublishedContentFailure.invalidName }
        return root.appendingPathComponent(name)
    }

    public func read(_ name: String) throws -> String? {
        let url = try file(name)
        guard files.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) else { throw PublishedContentFailure.invalidText }
        return text
    }

    public func write(_ name: String, value: String) throws {
        let url = try file(name)
        let data = Data(value.utf8)
        guard data.count <= Self.maxFileBytes else { throw PublishedContentFailure.tooLarge }
        try data.write(to: url, options: .atomic)
        #if os(iOS)
        try files.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        #endif
    }

    public func prune(keeping names: [String]) throws {
        guard names.allSatisfy(Self.isValidName) else { throw PublishedContentFailure.invalidName }
        let keep = Set(names)
        let cues = root.appendingPathComponent("cues", isDirectory: true)
        for url in try files.contentsOfDirectory(at: cues, includingPropertiesForKeys: nil) where !keep.contains("cues/" + url.lastPathComponent) {
            try files.removeItem(at: url)
        }
    }
}
