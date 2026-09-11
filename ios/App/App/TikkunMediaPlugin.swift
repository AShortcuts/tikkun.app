import Capacitor
import Foundation
import TikkunMedia

@objc(TikkunMediaPlugin)
public class TikkunMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TikkunMediaPlugin"
    public let jsName = "TikkunMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "inventory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preflight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolve", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "metrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearTemporary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readIntent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateIntent", returnType: CAPPluginReturnPromise)
    ]

    // Plugin state is main-queue confined; filesystem work runs on MediaStore.
    private static var sharedStore: MediaStore?
    private var downloads: [String: Task<Void, Never>] = [:]

    private func store() throws -> MediaStore {
        if let store = Self.sharedStore { return store }
        guard let host = getConfig().getString("mediaOrigin"), let origin = URL(string: host) else {
            throw MediaFailure.invalidAsset
        }
        let root = try FileManager.default.url(for: .applicationSupportDirectory,
            in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("TikkunMedia")
        let store = try MediaStore(root: root, origin: origin)
        Self.sharedStore = store
        return store
    }

    private func asset(_ call: CAPPluginCall) throws -> MediaAsset {
        guard let object = call.getObject("asset") else { throw MediaFailure.invalidAsset }
        return try JSONDecoder().decode(MediaAsset.self, from: JSONSerialization.data(withJSONObject: object))
    }
    private func payload(_ asset: MediaAsset) -> JSObject {
        ["audioId": asset.audioId, "url": asset.url, "digest": asset.digest, "byteLength": Int(asset.byteLength)]
    }
    private func perform(_ call: CAPPluginCall, action: @escaping (MediaStore) async throws -> JSObject) {
        DispatchQueue.main.async {
            do {
                let store = try self.store()
                Task { @MainActor in
                    do { call.resolve(try await action(store)) }
                    catch { call.reject(error.localizedDescription) }
                }
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func inventory(_ call: CAPPluginCall) {
        perform(call) { store in ["recordings": try await store.inventory().map(self.payload)] }
    }
    @objc func preflight(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let objects = call.getArray("assets", JSObject.self), objects.count <= 10_000 else {
                throw MediaFailure.invalidAsset
            }
            let assets = try JSONDecoder().decode([MediaAsset].self, from: JSONSerialization.data(withJSONObject: objects))
            try await store.preflight(assets)
            return [:]
        }
    }
    @objc func resolve(_ call: CAPPluginCall) {
        perform(call) { store in
            let url = try await store.localURL(for: self.asset(call))
            let value: JSValue = url.map { $0.absoluteString as JSValue } ?? NSNull()
            return ["url": value]
        }
    }
    @objc func remove(_ call: CAPPluginCall) {
        perform(call) { store in try await store.remove(self.asset(call)); return [:] }
    }
    @objc func clearTemporary(_ call: CAPPluginCall) {
        perform(call) { store in try await store.clearTemporary(); return [:] }
    }
    @objc func readIntent(_ call: CAPPluginCall) {
        perform(call) { store in ["keys": try await store.readIntent()] }
    }
    @objc func updateIntent(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let add = call.getArray("add", String.self), let remove = call.getArray("remove", String.self) else {
                throw MediaFailure.invalidIntent
            }
            try await store.updateIntent(add: add, remove: remove)
            return [:]
        }
    }
    @objc func metrics(_ call: CAPPluginCall) {
        perform(call) { store in
            let result = try await store.metrics()
            let available: JSValue = result.availableBytes.map { Int($0) as JSValue } ?? NSNull()
            return ["appBytes": Int(result.appBytes), "audioBytes": Int(result.audioBytes),
                "temporaryBytes": Int(result.temporaryBytes), "metadataBytes": Int(result.metadataBytes),
                "availableBytes": available]
        }
    }
    @objc func download(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                guard let id = call.getString("requestId"), UUID(uuidString: id) != nil,
                      self.downloads[id] == nil else { throw MediaFailure.busy }
                let asset = try self.asset(call)
                let store = try self.store()
                self.downloads[id] = Task { @MainActor in
                    defer { self.downloads.removeValue(forKey: id) }
                    do {
                        let report: @MainActor @Sendable (Int64) -> Void = { bytes in
                            self.notifyListeners("progress", data: ["requestId": id, "bytes": Int(bytes)])
                        }
                        let stored = try await store.download(asset) { bytes in
                            Task { @MainActor in report(bytes) }
                        }
                        call.resolve(self.payload(stored))
                    } catch { call.reject(error.localizedDescription) }
                }
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func cancelDownload(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("requestId"), UUID(uuidString: id) != nil else {
                call.reject("Invalid download request identifier."); return
            }
            self.downloads[id]?.cancel()
            call.resolve()
        }
    }
}
