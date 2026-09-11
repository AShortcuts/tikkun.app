import AVFAudio
import Capacitor
import MediaPlayer
import OSLog
import TikkunPlayback
import UIKit

@objc(TikkunPlaybackPlugin)
public class TikkunPlaybackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TikkunPlaybackPlugin"
    public let jsName = "TikkunPlayback"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private lazy var engine = PlaybackEngine()
    private var nowPlayingSessionStorage: AnyObject?
    @available(iOS 16.0, *)
    private var nowPlayingSession: MPNowPlayingSession {
        if let session = nowPlayingSessionStorage as? MPNowPlayingSession { return session }
        let session = engine.makeNowPlayingSession()
        nowPlayingSessionStorage = session
        return session
    }
    private var infoCenter: MPNowPlayingInfoCenter {
        if #available(iOS 16.0, *) { return nowPlayingSession.nowPlayingInfoCenter }
        return .default()
    }
    private var observers: [NSObjectProtocol] = []
    private var commands: [(MPRemoteCommand, Any)] = []
    private var title = "Tikkun"
    private var audioSessionActive = false
    private var resumeAfterInterruption = false
    private var lastNowPlayingKey = ""
    private let logger = Logger(subsystem: "com.adamn.tikkunreader", category: "playback")

    public override func load() {
        DispatchQueue.main.async { [weak self] in self?.configure() }
    }

    private func configure() {
        engine.onChange = { [weak self] state in self?.publish(state) }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification,
                                             object: nil, queue: .main) { [weak self] _ in
            guard let self else { return }
            self.publish(self.engine.snapshot)
        })
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification,
                                             object: nil, queue: .main) { [weak self] note in
            self?.interrupted(note)
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification,
                                             object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  raw == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
            self?.pausePlayback()
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification,
                                             object: nil, queue: .main) { [weak self] _ in
            self?.resetMediaServices()
        })
        configureRemoteCommands()
        publish(engine.snapshot)
    }

    private func configureRemoteCommands() {
        let remote: MPRemoteCommandCenter
        if #available(iOS 16.0, *) { remote = nowPlayingSession.remoteCommandCenter }
        else { remote = .shared() }
        register(remote.playCommand) { plugin, _ in try plugin.playPlayback() }
        register(remote.pauseCommand) { plugin, _ in plugin.pausePlayback() }
        register(remote.togglePlayPauseCommand) { plugin, _ in
            if plugin.engine.snapshot.paused { try plugin.playPlayback() }
            else { plugin.pausePlayback() }
        }
        register(remote.changePlaybackPositionCommand) { plugin, event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                throw PlaybackFailure.invalidSeek
            }
            try plugin.engine.seek(to: event.positionTime)
        }
    }

    private func resetMediaServices() {
        resumeAfterInterruption = false
        audioSessionActive = false
        commands.forEach { $0.0.removeTarget($0.1) }
        commands.removeAll()
        infoCenter.nowPlayingInfo = nil
        nowPlayingSessionStorage = nil
        lastNowPlayingKey = ""
        engine.resetMediaServices()
        configureRemoteCommands()
        lastNowPlayingKey = ""
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        } catch {
            reportCommandError(error)
        }
        publish(engine.snapshot)
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        commands.forEach { $0.0.removeTarget($0.1) }
    }

    private struct SessionRequest: Decodable {
        struct Segment: Decodable { let url: String; let start: Double; let end: Double? }
        let sessionID: String
        let title: String
        let segments: [Segment]
    }

    @objc func setSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                let data = try JSONSerialization.data(withJSONObject: call.options ?? [:])
                let request = try JSONDecoder().decode(SessionRequest.self, from: data)
                let segments = try request.segments.map { segment -> TikkunPlayback.PlaybackSegment in
                    guard let url = URL(string: segment.url) else { throw PlaybackFailure.invalidPlan }
                    if url.isFileURL {
                        // Only the app's owned download directory is exposed to JavaScript.
                        let root = try FileManager.default.url(for: .applicationSupportDirectory,
                            in: .userDomainMask, appropriateFor: nil, create: false)
                            .appendingPathComponent("TikkunMedia").resolvingSymlinksInPath()
                        guard url.resolvingSymlinksInPath().path.hasPrefix(root.path + "/") else {
                            throw PlaybackFailure.invalidPlan
                        }
                    }
                    return .init(url: url, start: segment.start, end: segment.end)
                }
                try self.engine.load(sessionID: request.sessionID, segments: segments)
                self.title = request.title
                self.lastNowPlayingKey = ""
                self.publish(self.engine.snapshot)
                self.resumeAfterInterruption = false
                self.deactivateAudioSession()
                call.resolve(self.payload(self.engine.snapshot))
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.payload(self.engine.snapshot)) }
    }

    private func perform(_ call: CAPPluginCall, _ action: @escaping () throws -> Void) {
        DispatchQueue.main.async {
            guard let id = call.getString("sessionID"), id == self.engine.snapshot.sessionID else {
                call.reject("Native playback session was replaced.")
                return
            }
            do {
                try action()
                call.resolve(self.payload(self.engine.snapshot))
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func play(_ call: CAPPluginCall) { perform(call) { try self.playPlayback() } }
    @objc func pause(_ call: CAPPluginCall) { perform(call) { self.pausePlayback() } }
    @objc func seek(_ call: CAPPluginCall) {
        perform(call) {
            guard let time = call.getDouble("time") else { throw PlaybackFailure.invalidSeek }
            try self.engine.seek(to: time)
        }
    }
    @objc func setRate(_ call: CAPPluginCall) {
        perform(call) {
            guard let rate = call.getDouble("rate") else { throw PlaybackFailure.invalidRate }
            try self.engine.setRate(rate)
        }
    }
    @objc func clear(_ call: CAPPluginCall) {
        perform(call) {
            self.resumeAfterInterruption = false
            self.engine.clear()
            self.deactivateAudioSession()
        }
    }

    private func playPlayback() throws {
        guard engine.snapshot.sessionID != nil else { throw PlaybackFailure.noSession }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio)
        try session.setActive(true)
        audioSessionActive = true
        try engine.play()
        if #available(iOS 16.0, *) {
            nowPlayingSession.becomeActiveIfPossible { [weak self] active in
                if !active { self?.logger.error("Now Playing session could not become active") }
            }
        }
    }

    private func pausePlayback() {
        resumeAfterInterruption = false
        engine.pause()
        deactivateAudioSession()
    }

    private func deactivateAudioSession() {
        guard audioSessionActive else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            audioSessionActive = false
        } catch { logger.error("Audio session deactivation failed: \(error.localizedDescription, privacy: .public)") }
    }

    private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began {
            resumeAfterInterruption = !engine.snapshot.paused
            audioSessionActive = false
            engine.pause()
        } else {
            let options = AVAudioSession.InterruptionOptions(
                rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            let resume = resumeAfterInterruption && options.contains(.shouldResume)
            resumeAfterInterruption = false
            if resume {
                do { try playPlayback() }
                catch { reportCommandError(error) }
            }
        }
    }

    private func register(_ command: MPRemoteCommand,
                          action: @escaping (TikkunPlaybackPlugin, MPRemoteCommandEvent) throws -> Void) {
        command.isEnabled = false
        let token = command.addTarget { [weak self] event in
            guard let self else { return .noSuchContent }
            DispatchQueue.main.async {
                do { try action(self, event) }
                catch { self.reportCommandError(error) }
            }
            return .success
        }
        commands.append((command, token))
    }

    private func reportCommandError(_ error: Error) {
        pausePlayback()
        engine.stopWithError(error.localizedDescription)
        logger.error("Native playback command failed: \(error.localizedDescription, privacy: .public)")
        notifyListeners("commandError", data: [
            "sessionID": engine.snapshot.sessionID ?? "", "message": error.localizedDescription
        ])
    }

    private func publish(_ state: PlaybackSnapshot) {
        if state.ended || state.phase == "error" { deactivateAudioSession() }
        if UIApplication.shared.applicationState == .active {
            notifyListeners("stateChanged", data: payload(state))
        }
        let key = "\(state.sessionID ?? ""): \(floor(state.currentTime)):\(state.paused):\(state.rate):\(state.duration ?? -1)"
        guard key != lastNowPlayingKey else { return }
        lastNowPlayingKey = key
        commands.forEach { $0.0.isEnabled = state.sessionID != nil }
        guard state.sessionID != nil else {
            infoCenter.nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: state.currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: state.paused ? 0 : state.rate,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: state.rate
        ]
        if let duration = state.duration { info[MPMediaItemPropertyPlaybackDuration] = duration }
        infoCenter.nowPlayingInfo = info
    }

    private func payload(_ state: PlaybackSnapshot) -> [String: Any] {
        ["revision": state.revision, "sessionID": state.sessionID as Any? ?? NSNull(), "segmentIndex": state.segmentIndex,
         "currentTime": state.currentTime, "duration": state.duration as Any? ?? NSNull(),
         "paused": state.paused, "ended": state.ended, "rate": state.rate,
         "phase": state.phase, "error": state.error as Any? ?? NSNull()]
    }
}
