import AVFoundation
import Foundation
#if os(iOS)
import MediaPlayer
#endif

public struct PlaybackSegment {
    public let url: URL
    public let start: Double
    public let end: Double?

    public init(url: URL, start: Double, end: Double?) {
        self.url = url
        self.start = start
        self.end = end
    }
}

public struct PlaybackSnapshot {
    public let revision: Int
    public let sessionID: String?
    public let segmentIndex: Int
    public let currentTime: Double
    public let duration: Double?
    public let paused: Bool
    public let ended: Bool
    public let rate: Double
    public let phase: String
    public let error: String?
}

public enum PlaybackFailure: LocalizedError {
    case invalidPlan, invalidSeek, invalidRate, noSession

    public var errorDescription: String? {
        switch self {
        case .invalidPlan: return "Invalid native playback plan."
        case .invalidSeek: return "Seek time must be finite."
        case .invalidRate: return "Playback rate must be between 0.25 and 3."
        case .noSession: return "No native playback session is loaded."
        }
    }
}

// All state and AVPlayer callbacks are confined to the main queue. Segment
// progression never depends on the WebView's event loop or animation frames.
public final class PlaybackEngine {
    public var onChange: ((PlaybackSnapshot) -> Void)?
    private var player = AVPlayer()
    private var segments: [PlaybackSegment] = []
    private var offsets: [Double] = []
    private var sessionID: String?
    private var index = 0
    private var wantsPlayback = false
    private var ended = false
    private var rate: Double = 1
    private var phase = "idle"
    private var errorMessage: String?
    private var revision = 0
    private var pendingPosition: Double = 0
    private var lastDuration: Double?
    private var activation = UUID()
    private var timeout: DispatchWorkItem?
    private var statusObservation: NSKeyValueObservation?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var failureObserver: NSObjectProtocol?

    public init() {
        configurePlayer()
    }

    private func configurePlayer() {
        player.actionAtItemEnd = .pause
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.05, preferredTimescale: 600), queue: .main
        ) { [weak self] _ in self?.publish() }
    }

    deinit {
        timeout?.cancel()
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        if let failureObserver { NotificationCenter.default.removeObserver(failureObserver) }
        player.pause()
    }

    public var snapshot: PlaybackSnapshot {
        dispatchPrecondition(condition: .onQueue(.main))
        let physical = player.currentTime().seconds
        let current: Double
        if phase == "loading" || phase == "error" || ended {
            current = pendingPosition
        } else if segments.indices.contains(index), physical.isFinite {
            let segment = segments[index]
            let elapsed = max(0, physical - segment.start)
            current = offsets[index] + min(elapsed, segment.end.map { $0 - segment.start } ?? elapsed)
        } else {
            current = pendingPosition
        }
        let duration = segments.last.flatMap { segment -> Double? in
            if let end = segment.end { return (offsets.last ?? 0) + end - segment.start }
            return lastDuration.map { (offsets.last ?? 0) + max(0, $0 - segment.start) }
        }
        return PlaybackSnapshot(
            revision: revision, sessionID: sessionID, segmentIndex: index, currentTime: current,
            duration: duration, paused: !wantsPlayback, ended: ended,
            rate: rate, phase: phase, error: errorMessage
        )
    }

    public func load(sessionID: String, segments: [PlaybackSegment]) throws {
        dispatchPrecondition(condition: .onQueue(.main))
        guard !sessionID.isEmpty, !segments.isEmpty else { throw PlaybackFailure.invalidPlan }
        for (index, segment) in segments.enumerated() {
            guard segment.start.isFinite, segment.start >= 0,
                  ["https", "file"].contains(segment.url.scheme),
                  segment.url.user == nil, segment.url.password == nil else {
                throw PlaybackFailure.invalidPlan
            }
            if let end = segment.end {
                guard end.isFinite, end > segment.start else { throw PlaybackFailure.invalidPlan }
            } else if index != segments.count - 1 {
                throw PlaybackFailure.invalidPlan
            }
        }
        clear()
        self.sessionID = sessionID
        self.segments = segments
        var offset: Double = 0
        offsets = segments.map { segment in
            defer { offset += segment.end.map { $0 - segment.start } ?? 0 }
            return offset
        }
        activate(index: 0, position: 0)
    }

    public func play() throws {
        dispatchPrecondition(condition: .onQueue(.main))
        guard sessionID != nil else { throw PlaybackFailure.noSession }
        wantsPlayback = true
        if ended { try seek(to: 0) }
        else if phase == "error" { activate(index: index, position: snapshot.currentTime) }
        else if phase == "ready" { player.playImmediately(atRate: Float(rate)) }
        publish()
    }

    public func pause() {
        dispatchPrecondition(condition: .onQueue(.main))
        wantsPlayback = false
        player.pause()
        publish()
    }

    public func stopWithError(_ message: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        fail(message)
    }

    public func resetMediaServices() {
        dispatchPrecondition(condition: .onQueue(.main))
        let position = snapshot.currentTime
        activation = UUID()
        removeItemObservers()
        player.pause()
        player.replaceCurrentItem(with: nil)
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        timeObserver = nil
        player = AVPlayer()
        configurePlayer()
        wantsPlayback = false
        pendingPosition = position
        // Keep the plan and logical position, but create no new item until Play.
        phase = sessionID == nil ? "idle" : "error"
        errorMessage = sessionID == nil ? nil : "Audio service restarted. Tap Play to continue."
        publish()
    }

    #if os(iOS)
    @available(iOS 16.0, *)
    public func makeNowPlayingSession() -> MPNowPlayingSession {
        dispatchPrecondition(condition: .onQueue(.main))
        return MPNowPlayingSession(players: [player])
    }
    #endif

    public func setRate(_ rate: Double) throws {
        dispatchPrecondition(condition: .onQueue(.main))
        guard rate.isFinite, (0.25...3).contains(rate) else { throw PlaybackFailure.invalidRate }
        self.rate = rate
        if wantsPlayback && phase == "ready" { player.rate = Float(rate) }
        publish()
    }

    public func seek(to time: Double) throws {
        dispatchPrecondition(condition: .onQueue(.main))
        guard time.isFinite else { throw PlaybackFailure.invalidSeek }
        guard sessionID != nil else { throw PlaybackFailure.noSession }
        let target = max(0, min(time, snapshot.duration ?? time))
        let targetIndex = offsets.lastIndex(where: { $0 <= target }) ?? 0
        activate(index: targetIndex, position: target)
    }

    public func clear() {
        dispatchPrecondition(condition: .onQueue(.main))
        activation = UUID()
        removeItemObservers()
        player.pause()
        player.replaceCurrentItem(with: nil)
        segments = []
        offsets = []
        sessionID = nil
        index = 0
        wantsPlayback = false
        ended = false
        phase = "idle"
        errorMessage = nil
        pendingPosition = 0
        lastDuration = nil
        publish()
    }

    private func activate(index: Int, position: Double) {
        activation = UUID()
        let generation = activation
        removeItemObservers()
        player.pause()
        self.index = index
        pendingPosition = position
        phase = "loading"
        errorMessage = nil
        ended = false
        let segment = segments[index]
        let item = AVPlayerItem(url: segment.url)
        item.audioTimePitchAlgorithm = .timeDomain
        if let end = segment.end {
            item.forwardPlaybackEndTime = CMTime(seconds: end, preferredTimescale: 600)
        }
        let physicalTarget = segment.start + max(0, position - offsets[index])
        statusObservation = item.observe(\.status, options: [.new]) { [weak self, weak item] _, _ in
            DispatchQueue.main.async {
                guard let self, let item, self.activation == generation else { return }
                switch item.status {
                case .readyToPlay:
                    guard self.phase == "loading" else { return }
                    let duration = item.duration.seconds
                    guard duration.isFinite, duration > segment.start,
                          segment.end.map({ $0 <= duration + 0.05 }) ?? true else {
                        self.fail("Recording duration does not contain the requested segment.")
                        return
                    }
                    if index == self.segments.count - 1 { self.lastDuration = duration }
                    item.seek(to: CMTime(seconds: min(physicalTarget, duration), preferredTimescale: 600),
                              toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
                        DispatchQueue.main.async {
                            guard let self, self.activation == generation else { return }
                            guard finished else { self.fail("Native audio seek was interrupted."); return }
                            self.timeout?.cancel()
                            self.timeout = nil
                            self.phase = "ready"
                            if self.wantsPlayback { self.player.playImmediately(atRate: Float(self.rate)) }
                            self.publish()
                        }
                    }
                case .failed:
                    self.fail(item.error?.localizedDescription ?? "Native audio failed to load.")
                default: break
                }
            }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main
        ) { [weak self] _ in
            guard let self, self.activation == generation, self.phase == "ready" else { return }
            if index + 1 < self.segments.count {
                self.activate(index: index + 1, position: self.offsets[index + 1])
            } else {
                self.pendingPosition = self.snapshot.duration ?? self.snapshot.currentTime
                self.ended = true
                self.wantsPlayback = false
                self.publish()
            }
        }
        failureObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.failedToPlayToEndTimeNotification, object: item, queue: .main
        ) { [weak self] note in
            guard let self, self.activation == generation else { return }
            let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
            self.fail(error?.localizedDescription ?? "Native audio playback failed.")
        }
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.activation == generation else { return }
            self.fail("Timed out loading native audio.")
        }
        self.timeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
        player.replaceCurrentItem(with: item)
        publish()
    }

    private func removeItemObservers() {
        timeout?.cancel()
        timeout = nil
        statusObservation = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        if let failureObserver { NotificationCenter.default.removeObserver(failureObserver) }
        endObserver = nil
        failureObserver = nil
        player.currentItem?.cancelPendingSeeks()
    }

    private func fail(_ message: String) {
        pendingPosition = snapshot.currentTime
        activation = UUID()
        removeItemObservers()
        wantsPlayback = false
        player.pause()
        phase = "error"
        errorMessage = message
        publish()
    }

    private func publish() {
        revision += 1
        onChange?(snapshot)
    }
}
