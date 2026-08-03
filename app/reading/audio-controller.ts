import { EventEmitter } from '../event-emitter.ts'
import type { AudioRecording, WordCue } from '../audio/types.ts'
import type { PlaybackSessionAliyahIndex } from './playback-session.ts'
import type {
  PlaybackPlan,
  PlaybackPlanStatus,
  PlaybackSegment,
} from './playback-plan.ts'

export interface ActivePlaybackSegment extends PlaybackSegment {
  logicalStart: number
  logicalEnd: number
}

export interface ActiveAudioSession {
  recording: AudioRecording
  cues: WordCue[]
  runId: string
  aliyahIndex: PlaybackSessionAliyahIndex
  tokenKeys: string[]
  segments: ActivePlaybackSegment[]
  status: PlaybackPlanStatus
}

type AudioControllerEvents = {
  'session-loaded': ActiveAudioSession
  'segment-updated': { index: number; segment: ActivePlaybackSegment }
  'playback-updated': { playing: boolean }
  'frame-updated': { currentTime: number }
  'time-updated': { currentTime: number }
  'duration-updated': { duration: number }
  'playback-error': { error: Error; recording: AudioRecording }
}

type SegmentActivationResult =
  | { status: 'ready' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: Error }

const MEDIA_METADATA_TIMEOUT_MS = 15_000

export interface AudioControllerOptions {
  signal?: AbortSignal
}

export class AudioController extends EventEmitter<AudioControllerEvents> {
  private activeSession: ActiveAudioSession | null = null
  private activeSegmentIndex = 0
  private playbackFrame = 0
  private nextSourcePreload: HTMLAudioElement | null = null
  private nextSourcePreloadCleanup: (() => void) | null = null
  private nextSourcePreloadKey: string | null = null
  private segmentTransitioning = false
  private activationGeneration = 0
  private segmentReady: Promise<SegmentActivationResult> = Promise.resolve({
    status: 'ready',
  })
  private cancelPendingActivation: (() => void) | null = null
  private failPendingActivation: ((error: Error) => void) | null = null
  private activationError: Error | null = null
  private activationNeedsReload = false
  private readonly mediaDurationsBySource = new Map<string, number>()
  private readonly lifetimeController = new AbortController()
  private destroyed = false

  private readonly pumpPlaybackFrame = () => {
    if (this.audio.paused || this.audio.ended) {
      this.playbackFrame = 0
      return
    }

    const segment = this.activeSession?.segments[this.activeSegmentIndex]
    const endTime = segment?.endTime
    if (
      typeof endTime === 'number' &&
      this.audio.currentTime >= endTime
    ) {
      if (!this.advanceSegment(true)) {
        this.audio.pause()
        this.audio.currentTime = endTime
        this.emit('frame-updated', { currentTime: this.currentTime })
      }
      return
    }

    this.emit('frame-updated', { currentTime: this.currentTime })
    this.playbackFrame = requestAnimationFrame(this.pumpPlaybackFrame)
  }

  constructor(
    readonly audio: HTMLAudioElement,
    { signal }: AudioControllerOptions = {}
  ) {
    super()
    const listenerOptions = { signal: this.lifetimeController.signal }
    audio.addEventListener('play', () => {
      this.startPlaybackFrameLoop()
      this.emit('playback-updated', { playing: true })
    }, listenerOptions)
    audio.addEventListener('pause', () => {
      this.stopPlaybackFrameLoop()
      this.emit('playback-updated', { playing: false })
    }, listenerOptions)
    audio.addEventListener('ended', () => {
      this.stopPlaybackFrameLoop()
      if (this.advanceSegment(true)) return
      this.emit('frame-updated', { currentTime: this.currentTime })
    }, listenerOptions)
    audio.addEventListener('seeked', () =>
      this.emit('frame-updated', { currentTime: this.currentTime }),
      listenerOptions
    )
    audio.addEventListener('timeupdate', () =>
      this.emit('time-updated', { currentTime: this.currentTime }),
      listenerOptions
    )
    const rememberActiveMediaDuration = () => this.rememberActiveMediaDuration()
    audio.addEventListener(
      'loadedmetadata',
      rememberActiveMediaDuration,
      listenerOptions
    )
    audio.addEventListener(
      'durationchange',
      rememberActiveMediaDuration,
      listenerOptions
    )
    audio.addEventListener('error', () => {
      if (!this.activeSession) return
      const error = this.mediaError()
      if (this.failPendingActivation) {
        this.failPendingActivation(error)
        return
      }
      this.reportPlaybackError(error, this.activationGeneration, true)
    }, listenerOptions)

    signal?.addEventListener('abort', () => this.destroy(), { once: true })
    if (signal?.aborted) this.destroy()
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.clearSession()
    this.stopPlaybackFrameLoop()
    this.lifetimeController.abort()
  }

  private startPlaybackFrameLoop() {
    if (this.playbackFrame) return
    this.playbackFrame = requestAnimationFrame(this.pumpPlaybackFrame)
  }

  private stopPlaybackFrameLoop() {
    if (!this.playbackFrame) return
    cancelAnimationFrame(this.playbackFrame)
    this.playbackFrame = 0
  }

  get session() {
    return this.activeSession
  }

  get error() {
    return this.activationError
  }

  get activeSegment() {
    return this.activeSession?.segments[this.activeSegmentIndex] ?? null
  }

  get currentTime() {
    const segment = this.activeSession?.segments[this.activeSegmentIndex]
    if (!segment) return this.audio.currentTime
    if (segment.recording.status === 'missing') return segment.logicalStart
    return Math.min(
      segment.logicalEnd,
      segment.logicalStart + Math.max(0, this.audio.currentTime - segment.startTime)
    )
  }

  get duration() {
    const segments = this.activeSession?.segments
    const lastSegment = segments?.[segments.length - 1]
    if (!lastSegment) return this.audio.duration
    if (Number.isFinite(lastSegment.logicalEnd)) return lastSegment.logicalEnd
    const mediaDuration = this.mediaDurationsBySource.get(
      this.sourceKey(lastSegment.recording.playSrc)
    )
    return mediaDuration === undefined
      ? Number.POSITIVE_INFINITY
      : lastSegment.logicalStart + Math.max(0, mediaDuration - lastSegment.startTime)
  }

  async loadSession(session: ActiveAudioSession) {
    this.activeSession = session
    this.activeSegmentIndex = 0
    this.activateSegment(0, session.segments[0]?.logicalStart ?? 0, false)
    this.emit('session-loaded', session)
    return session
  }

  waitForFiniteDuration({
    signal,
    timeoutMs = MEDIA_METADATA_TIMEOUT_MS,
  }: {
    signal?: AbortSignal
    timeoutMs?: number
  } = {}) {
    const currentDuration = this.duration
    if (Number.isFinite(currentDuration) && currentDuration > 0) {
      return Promise.resolve(currentDuration)
    }

    return new Promise<number>((resolve, reject) => {
      let settled = false
      const finish = (result: { duration: number } | { error: Error }) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.audio.removeEventListener('loadedmetadata', checkDuration)
        this.audio.removeEventListener('durationchange', checkDuration)
        this.audio.removeEventListener('error', mediaFailed)
        signal?.removeEventListener('abort', aborted)
        if ('error' in result) reject(result.error)
        else resolve(result.duration)
      }
      const checkDuration = () => {
        const duration = this.duration
        if (Number.isFinite(duration) && duration > 0) finish({ duration })
      }
      const mediaFailed = () => finish({ error: this.mediaError() })
      const aborted = () => finish({
        error: new DOMException('Audio duration wait cancelled', 'AbortError'),
      })
      const timeout = setTimeout(() => finish({
        error: new Error('Timed out waiting for a finite audio duration'),
      }), timeoutMs)
      this.audio.addEventListener('loadedmetadata', checkDuration)
      this.audio.addEventListener('durationchange', checkDuration)
      this.audio.addEventListener('error', mediaFailed)
      signal?.addEventListener('abort', aborted, { once: true })
      if (signal?.aborted) aborted()
      else checkDuration()
    })
  }

  clearSession() {
    this.audio.pause()
    this.cancelPendingActivation?.()
    this.activationGeneration += 1
    this.activeSession = null
    this.activeSegmentIndex = 0
    this.clearNextSourcePreload()
    this.segmentTransitioning = false
    this.segmentReady = Promise.resolve({ status: 'cancelled' })
    this.cancelPendingActivation = null
    this.failPendingActivation = null
    this.activationError = null
    this.activationNeedsReload = false
    this.audio.removeAttribute('src')
    this.audio.load()
    this.emit('playback-updated', { playing: false })
  }

  togglePlayback() {
    if (this.audio.paused) return this.play()
    this.audio.pause()
  }

  play(): Promise<void> {
    if (this.activeSegment?.recording.status === 'missing') {
      return Promise.reject(
        new Error('No source recording is available; record microphone audio first')
      )
    }
    if (this.activationNeedsReload && this.activeSession) {
      this.activateSegment(
        this.activeSegmentIndex,
        this.currentTime,
        false,
        true
      )
    } else {
      this.activationError = null
    }

    const generation = this.activationGeneration
    const ready = this.segmentReady
    return ready.then(async (result) => {
      if (result.status === 'cancelled' || generation !== this.activationGeneration) {
        return
      }
      if (result.status === 'failed') throw result.error
      try {
        await this.audio.play()
      } catch (error) {
        const playbackError = this.asError(error, 'Audio playback failed')
        this.reportPlaybackError(playbackError, generation, false)
        throw playbackError
      }
    })
  }

  pause() {
    this.audio.pause()
  }

  seek(time: number) {
    if (!Number.isFinite(time)) throw new TypeError('Seek time must be finite')
    const segments = this.activeSession?.segments
    if (!segments?.length) {
      this.audio.currentTime = time
      return
    }

    const duration = this.duration
    const clampedTime = Number.isFinite(duration)
      ? Math.max(0, Math.min(time, duration))
      : Math.max(0, time)
    const segmentIndex = Math.max(
      0,
      segments.findIndex(
        (segment, index) =>
          clampedTime >= segment.logicalStart &&
          (clampedTime < segment.logicalEnd || index === segments.length - 1)
      )
    )
    const segment = segments[segmentIndex]
    if (segment.recording.status === 'missing') {
      if (segmentIndex !== this.activeSegmentIndex || this.segmentTransitioning) {
        this.activateSegment(segmentIndex, segment.logicalStart, false)
      } else {
        this.emit('frame-updated', { currentTime: segment.logicalStart })
      }
      return
    }
    if (segmentIndex === this.activeSegmentIndex && !this.segmentTransitioning) {
      this.audio.currentTime =
        segment.startTime + Math.max(0, clampedTime - segment.logicalStart)
      this.emit('frame-updated', { currentTime: this.currentTime })
      return
    }
    this.activateSegment(segmentIndex, clampedTime, false)
  }

  replayFromStart() {
    const startTime = this.activeSession?.cues[0]?.timeStart ?? 0
    this.seek(startTime)
    return this.play()
  }

  replayCurrentCue() {
    if (!this.activeSession?.cues.length) return
    const current = this.currentTime
    let cueIndex = -1
    for (let i = this.activeSession.cues.length - 1; i >= 0; i--) {
      if (this.activeSession.cues[i].timeStart <= current) {
        cueIndex = i
        break
      }
    }
    const cue = this.activeSession.cues[Math.max(cueIndex, 0)]
    if (!cue) return
    this.seek(cue.timeStart)
    return this.play()
  }

  private advanceSegment(autoplay: boolean) {
    const nextIndex = this.activeSegmentIndex + 1
    if (!this.activeSession?.segments[nextIndex] || this.segmentTransitioning) {
      return false
    }
    this.activateSegment(
      nextIndex,
      this.activeSession.segments[nextIndex].logicalStart,
      autoplay
    )
    return true
  }

  private activateSegment(
    index: number,
    logicalTime: number,
    autoplay: boolean,
    forceReload = false
  ) {
    const segment = this.activeSession?.segments[index]
    if (!segment) return

    this.cancelPendingActivation?.()
    const generation = ++this.activationGeneration
    this.segmentTransitioning = true
    this.activationError = null
    this.activationNeedsReload = false
    this.activeSegmentIndex = index
    this.emit('segment-updated', { index, segment })
    const missingSource = segment.recording.status === 'missing'
    const absoluteSrc = missingSource
      ? ''
      : new URL(segment.recording.playSrc, window.location.href).href
    const sourceChanged = missingSource
      ? Boolean(this.audio.src)
      : forceReload || this.audio.src !== absoluteSrc
    if (missingSource) {
      this.audio.pause()
      if (sourceChanged) {
        this.audio.removeAttribute('src')
        this.audio.load()
      }
    } else if (sourceChanged) {
      this.audio.src = segment.recording.playSrc
      this.audio.load()
    }

    const physicalTime =
      segment.startTime + Math.max(0, logicalTime - segment.logicalStart)
    let resolveReady: (result: SegmentActivationResult) => void = () => {}
    this.segmentReady = new Promise<SegmentActivationResult>((resolve) => {
      resolveReady = resolve
    })
    let settled = false
    let metadataTimeout: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      if (metadataTimeout !== null) clearTimeout(metadataTimeout)
      this.audio.removeEventListener('loadedmetadata', loaded)
    }
    const finish = (result: SegmentActivationResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolveReady(result)
      if (generation !== this.activationGeneration) return

      this.cancelPendingActivation = null
      this.failPendingActivation = null
      this.segmentTransitioning = false
      if (result.status === 'failed') {
        this.reportPlaybackError(result.error, generation, true)
        return
      }
      if (result.status === 'cancelled') return

      if (!missingSource) {
        this.rememberMediaDuration(segment, this.audio)
        this.audio.currentTime = physicalTime
      }
      this.emit('frame-updated', { currentTime: this.currentTime })
      if (autoplay) void this.play().catch(() => {})
    }
    const loaded = () => finish({ status: 'ready' })
    this.cancelPendingActivation = () => finish({ status: 'cancelled' })
    this.failPendingActivation = (error) => finish({ status: 'failed', error })

    if (missingSource) {
      finish({ status: 'ready' })
    } else if (
      sourceChanged &&
      this.audio.readyState < HTMLMediaElement.HAVE_METADATA
    ) {
      this.audio.addEventListener('loadedmetadata', loaded, { once: true })
      metadataTimeout = setTimeout(() => {
        finish({
          status: 'failed',
          error: new Error(`Timed out loading audio metadata for ${segment.recording.id}`),
        })
      }, MEDIA_METADATA_TIMEOUT_MS)
    } else {
      finish({ status: 'ready' })
    }
    this.preloadNextSegment()
  }

  private preloadNextSegment() {
    const next = this.activeSession?.segments[this.activeSegmentIndex + 1]
    if (next?.recording.status === 'missing') {
      this.clearNextSourcePreload()
      return
    }
    const nextKey = next ? this.sourceKey(next.recording.playSrc) : null
    if (
      next &&
      nextKey === this.nextSourcePreloadKey &&
      this.nextSourcePreload
    ) {
      return
    }
    this.clearNextSourcePreload()
    if (!next || !nextKey) return
    const preload = new Audio()
    preload.preload = 'auto'
    preload.src = next.recording.playSrc
    this.nextSourcePreload = preload
    this.nextSourcePreloadKey = nextKey
    const loaded = () => {
      this.rememberMediaDuration(next, preload)
      cleanup()
    }
    const failed = () => cleanup()
    const cleanup = () => {
      preload.removeEventListener('loadedmetadata', loaded)
      preload.removeEventListener('error', failed)
      if (this.nextSourcePreloadCleanup === cleanup) {
        this.nextSourcePreloadCleanup = null
      }
    }
    this.nextSourcePreloadCleanup = cleanup
    preload.addEventListener('loadedmetadata', loaded, { once: true })
    preload.addEventListener('error', failed, { once: true })
    if (preload.readyState >= HTMLMediaElement.HAVE_METADATA) loaded()
  }

  private clearNextSourcePreload() {
    const preload = this.nextSourcePreload
    this.nextSourcePreloadCleanup?.()
    this.nextSourcePreloadCleanup = null
    this.nextSourcePreload = null
    this.nextSourcePreloadKey = null
    if (preload) {
      preload.pause()
      preload.removeAttribute('src')
      preload.load()
    }
  }

  private sourceKey(src: string) {
    return new URL(src, window.location.href).href
  }

  private rememberActiveMediaDuration() {
    const segment = this.activeSession?.segments[this.activeSegmentIndex]
    if (!segment || segment.recording.status === 'missing') return

    const mediaSource = this.audio.currentSrc || this.audio.src
    if (
      !mediaSource ||
      this.sourceKey(mediaSource) !== this.sourceKey(segment.recording.playSrc)
    ) {
      return
    }

    this.rememberMediaDuration(segment, this.audio)
  }

  private rememberMediaDuration(
    segment: ActivePlaybackSegment,
    media: HTMLAudioElement
  ) {
    if (!Number.isFinite(media.duration) || media.duration <= 0) return
    const key = this.sourceKey(segment.recording.playSrc)
    if (this.mediaDurationsBySource.get(key) === media.duration) return
    this.mediaDurationsBySource.set(key, media.duration)
    const duration = this.duration
    if (Number.isFinite(duration)) this.emit('duration-updated', { duration })
  }

  private reportPlaybackError(
    error: Error,
    generation: number,
    needsReload: boolean
  ) {
    if (generation !== this.activationGeneration || !this.activeSession) return
    this.activationError = error
    this.activationNeedsReload = needsReload
    this.emit('playback-error', {
      error,
      recording: this.activeSession.segments[this.activeSegmentIndex]?.recording ??
        this.activeSession.recording,
    })
  }

  private mediaError() {
    const code = this.audio.error?.code
    return new Error(
      code ? `Audio media failed with code ${code}` : 'Audio media failed to load'
    )
  }

  private asError(value: unknown, fallbackMessage: string) {
    return value instanceof Error ? value : new Error(fallbackMessage)
  }
}

export function createActiveAudioSession(plan: PlaybackPlan): ActiveAudioSession {
  validatePlaybackPlan(plan)
  let logicalOffset = 0
  const segments: ActivePlaybackSegment[] = plan.segments.map((segment) => {
    const duration = segment.endTime === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0.001, segment.endTime - segment.startTime)
    const prepared = {
      ...segment,
      logicalStart: logicalOffset,
      logicalEnd: logicalOffset + duration,
    }
    logicalOffset = prepared.logicalEnd
    return prepared
  })

  const cues = segments.flatMap((segment) =>
    segment.cues.map((cue) => ({
      ...cue,
      timeStart: segment.logicalStart + (cue.timeStart - segment.startTime),
      timeEnd:
        cue.timeEnd === undefined
          ? undefined
          : segment.logicalStart + (cue.timeEnd - segment.startTime),
    }))
  )
  const recording = segments[segments.length - 1]?.recording
  if (!recording) throw new Error('Playback plan must contain at least one segment')

  return {
    recording,
    cues,
    runId: plan.target.runId,
    aliyahIndex: plan.target.index,
    tokenKeys: plan.tokenKeys,
    segments,
    status: plan.status,
  }
}

export function validatePlaybackPlan(plan: PlaybackPlan) {
  if (!plan.segments.length) {
    throw new TypeError('Playback plan must contain at least one segment')
  }

  for (const [index, segment] of plan.segments.entries()) {
    if (!Number.isFinite(segment.startTime) || segment.startTime < 0) {
      throw new TypeError(`Playback segment ${index} has an invalid start time`)
    }
    if (segment.endTime === null) {
      if (index !== plan.segments.length - 1) {
        throw new TypeError('Only the final playback segment may be open-ended')
      }
    } else if (
      !Number.isFinite(segment.endTime) ||
      segment.endTime <= segment.startTime
    ) {
      throw new TypeError(`Playback segment ${index} has an invalid end time`)
    }

    let previousCueTime = Number.NEGATIVE_INFINITY
    for (const cue of segment.cues) {
      if (
        !Number.isFinite(cue.timeStart) ||
        cue.timeStart < segment.startTime ||
        (segment.endTime !== null && cue.timeStart > segment.endTime) ||
        cue.timeStart < previousCueTime ||
        (cue.timeEnd !== undefined &&
          (!Number.isFinite(cue.timeEnd) ||
            cue.timeEnd < cue.timeStart ||
            (segment.endTime !== null && cue.timeEnd > segment.endTime)))
      ) {
        throw new TypeError(`Playback segment ${index} has invalid cue ordering`)
      }
      previousCueTime = cue.timeStart
    }
  }
}
