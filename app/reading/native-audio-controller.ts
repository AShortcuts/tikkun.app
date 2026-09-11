import type { PluginListenerHandle } from '@capacitor/core'
import type { AudioRecording } from '../audio/types.ts'
import { EventEmitter } from '../event-emitter.ts'
import { getNativePlayback, parseNativePlaybackState, type NativePlaybackPlugin, type NativePlaybackState } from '../platform/native-playback.ts'
import { AudioController, type ActiveAudioSession, type AudioControllerEvents, type PlaybackController } from './audio-controller.ts'

// Published recordings use native playback. Microphone/blob authoring sessions
// retain the existing browser implementation and never enter the native bridge.
export class NativeAudioController extends EventEmitter<AudioControllerEvents> implements PlaybackController {
  private readonly web: AudioController
  private useWeb = false
  private activeSession: ActiveAudioSession | null = null
  private id: string | null = null
  private installedID: string | null = null
  private state: NativePlaybackState | null = null
  private failure: Error | null = null
  private rate = 1
  private destroyed = false
  private tail: Promise<void> = Promise.resolve()
  private clearing: Promise<void> | null = null
  private readonly registrations: Promise<PluginListenerHandle>[]
  private readonly bridgeReady: Promise<PluginListenerHandle[]>

  constructor(audio: HTMLAudioElement, private readonly bridge: NativePlaybackPlugin = getNativePlayback(),
    private readonly resolveSource: (recording: AudioRecording) => Promise<string> = async (recording) => recording.playSrc) {
    super()
    this.web = new AudioController(audio)
    const forward = <Name extends keyof AudioControllerEvents>(name: Name) => {
      this.web.on(name, (value) => { if (this.useWeb) this.emit(name, value) })
    }
    forward('session-loaded'); forward('segment-updated'); forward('playback-updated')
    forward('frame-updated'); forward('time-updated'); forward('duration-updated')
    forward('metadata-updated'); forward('playback-error')
    this.registrations = [
      bridge.addListener('stateChanged', (value) => {
        try { this.accept(value) } catch (error) { this.report(error) }
      }),
      bridge.addListener('commandError', (value) => {
        if (value && typeof value === 'object' && 'sessionID' in value && value.sessionID === this.id &&
            'message' in value && typeof value.message === 'string') this.report(new Error(value.message))
      }),
    ]
    this.bridgeReady = Promise.all(this.registrations)
    void this.bridgeReady.catch((error: unknown) => this.report(error))
  }

  get session() { return this.useWeb ? this.web.session : this.activeSession }
  get error() { return this.useWeb ? this.web.error : this.failure }
  get activeSegment() { return this.useWeb ? this.web.activeSegment : this.activeSession?.segments[this.state?.segmentIndex ?? 0] ?? null }
  get currentTime() { return this.useWeb ? this.web.currentTime : this.state?.currentTime ?? 0 }
  get duration() { return this.useWeb ? this.web.duration : this.state?.duration ?? this.activeSession?.segments.at(-1)?.logicalEnd ?? Infinity }
  get paused() { return this.useWeb ? this.web.paused : this.state?.paused ?? true }
  get ended() { return this.useWeb ? this.web.ended : this.state?.ended ?? false }
  get playbackRate() { return this.rate }
  set playbackRate(rate: number) {
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 3) throw new TypeError('Invalid playback rate')
    if (rate === this.rate) return
    this.rate = rate
    this.web.playbackRate = rate
    const id = this.id
    if (id) this.background(this.command(id, () => this.bridge.setRate({ sessionID: id, rate })))
  }

  async loadSession(session: ActiveAudioSession) {
    if (this.destroyed) throw new Error('Playback controller was destroyed')
    this.clearSession()
    this.useWeb = session.segments.some(({ recording }) => recording.status === 'missing' || recording.playSrc.startsWith('blob:'))
    if (this.useWeb) {
      await this.clearing
      if (this.destroyed) throw new Error('Playback controller was destroyed')
      return this.web.loadSession(session)
    }
    this.activeSession = session
    const id = crypto.randomUUID()
    this.id = id
    this.emit('session-loaded', session)
    await this.command(id, async () => {
      await this.bridgeReady
      const segments = await Promise.all(session.segments.map(async ({ recording, startTime, endTime }) => ({
        url: await this.resolveSource(recording), start: startTime, end: endTime,
      })))
      if (this.destroyed || this.id !== id) throw new DOMException('Playback session was replaced.', 'AbortError')
      const state = await this.bridge.setSession({
        sessionID: id,
        title: session.readingLabel ?? session.recording.title,
        segments,
      })
      this.installedID = id
      this.accept(state)
      return this.bridge.setRate({ sessionID: id, rate: this.rate })
    })
    return session
  }

  clearSession() {
    const previousID = this.id
    this.id = null
    this.activeSession = null
    this.state = null
    this.failure = null
    this.web.clearSession()
    this.useWeb = false
    if (previousID) {
      const clear = this.tail.then(async () => {
        if (this.installedID !== previousID) return
        await this.bridge.clear({ sessionID: previousID })
        this.installedID = null
      })
      this.clearing = clear
      this.tail = clear.catch((error: unknown) => {
        console.error('Could not clear native playback', error)
        this.report(error)
      })
    }
    this.emit('playback-updated', { playing: false })
    this.emit('metadata-updated', undefined)
  }

  authorizePlayback(recording: AudioRecording) {
    if (recording.status === 'missing' || recording.playSrc.startsWith('blob:')) {
      return this.web.authorizePlayback(recording)
    }
    return !this.destroyed
  }

  play(): Promise<void> {
    if (this.useWeb) return this.web.play()
    const id = this.id
    if (!id) return Promise.resolve()
    return this.command(id, () => this.bridge.play({ sessionID: id }))
  }

  pause() {
    if (this.useWeb) { this.web.pause(); return }
    const id = this.id
    if (id) this.background(this.command(id, () => this.bridge.pause({ sessionID: id })))
  }

  togglePlayback() {
    if (this.paused) return this.play()
    this.pause()
  }

  seek(time: number) {
    if (!Number.isFinite(time)) throw new TypeError('Seek time must be finite')
    if (this.useWeb) { this.web.seek(time); return }
    const id = this.id
    if (id) this.background(this.command(id, () => this.bridge.seek({ sessionID: id, time })))
  }

  replayFromStart() {
    this.seek(this.session?.passage ? 0 : this.session?.cues[0]?.timeStart ?? 0)
    return this.play()
  }

  replayCurrentCue() {
    const cues = this.session?.cues
    if (!cues?.length) return
    const cue = cues.findLast((cue) => cue.timeStart <= this.currentTime) ?? cues[0]
    this.seek(cue.timeStart)
    return this.play()
  }

  waitForFiniteDuration({ signal, timeoutMs = 15_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}) {
    if (this.useWeb) return this.web.waitForFiniteDuration({ signal, timeoutMs })
    const id = this.id
    return new Promise<number>((resolve, reject) => {
      const cleanups: (() => void)[] = []
      const finish = (error?: Error) => {
        cleanups.forEach((cleanup) => cleanup())
        if (error) reject(error)
        else resolve(this.duration)
      }
      const check = () => {
        if (this.destroyed || this.id !== id || signal?.aborted) finish(new DOMException('Audio duration wait cancelled', 'AbortError'))
        else if (this.failure) finish(this.failure)
        else if (Number.isFinite(this.duration) && this.duration > 0) finish()
      }
      cleanups.push(this.on('metadata-updated', check), this.on('playback-error', check))
      const timeout = setTimeout(() => finish(new Error('Timed out waiting for a finite audio duration')), timeoutMs)
      cleanups.push(() => clearTimeout(timeout))
      signal?.addEventListener('abort', check, { once: true })
      cleanups.push(() => signal?.removeEventListener('abort', check))
      check()
    })
  }

  whenCleared(): Promise<void> {
    return this.clearing ?? Promise.resolve()
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.clearSession()
    this.web.destroy()
    for (const registration of this.registrations) {
      void registration.then((handle) => handle.remove())
        .catch((error: unknown) => console.error('Could not release native playback listener', error))
    }
  }

  private command(id: string, action: () => Promise<NativePlaybackState>): Promise<void> {
    const request = this.tail.then(async () => {
      if (this.destroyed || this.id !== id) return
      this.accept(await action())
    })
    this.tail = request.catch((error: unknown) => { if (this.id === id) this.report(error) })
    return request
  }

  private background(request: Promise<void>) {
    // command() already reports failures through the Reader's playback-error path.
    void request.catch(() => {})
  }

  private accept(value: unknown) {
    const state = parseNativePlaybackState(value)
    if (this.destroyed || !this.id || state.sessionID !== this.id || this.useWeb) return
    if (!this.activeSession?.segments[state.segmentIndex]) throw new Error('Native playback returned an invalid segment')
    const previous = this.state
    if (previous && state.revision < previous.revision) return
    this.state = state
    if (state.error) {
      if (this.failure?.message !== state.error) this.report(new Error(state.error))
    } else this.failure = null
    if (previous?.segmentIndex !== state.segmentIndex) this.emit('segment-updated', { index: state.segmentIndex, segment: this.activeSegment! })
    if (previous?.paused !== state.paused || previous?.ended !== state.ended) this.emit('playback-updated', { playing: !state.paused && !state.ended })
    if (previous?.duration !== state.duration) {
      this.emit('duration-updated', { duration: this.duration })
      this.emit('metadata-updated', undefined)
    }
    this.emit('time-updated', { currentTime: state.currentTime })
    this.emit('frame-updated', { currentTime: state.currentTime })
  }

  private report(value: unknown) {
    if (this.destroyed) return
    const error = value instanceof Error ? value : new Error('Native playback failed')
    this.failure = error
    const recording = this.activeSegment?.recording ?? this.activeSession?.recording
    if (recording) this.emit('playback-error', { error, recording })
    else console.error('Native playback is unavailable', error)
  }
}
