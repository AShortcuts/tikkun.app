import type { AudioRecording, WordCue } from '../audio/types.ts'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { ScrollDisplay } from '../components/ScrollDisplay.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import { formatTokenKey } from '../reader/token-position.ts'
import type { ReaderViewport } from '../adaptive/reader-viewport.ts'
import {
  AudioController,
  type ActiveAudioSession,
} from './audio-controller.ts'
import type { PlaybackAliyahIndex } from './aliyah-dom-target.ts'
import { HighlightController } from './highlight-controller.ts'
import { isActivePlaybackTarget } from './playback-session.ts'
import {
  createPlaybackTimeline,
  type PlaybackTimeline,
  type PlaybackTimelineChange,
  type PlaybackTimelineOptions,
} from './playback-timeline.ts'
import {
  createRecordingSession,
  type RecordingAvailability,
  type RecordingSession,
  type RecordingSessionOptions,
  type RecordingTarget,
} from './recording-session.ts'

type TimelineHostOptions = Omit<
  PlaybackTimelineOptions,
  | 'audioController'
  | 'highlightController'
  | 'document'
  | 'view'
  | 'viewport'
  | 'playNetworkRecording'
  | 'replayNetworkRecordingFromStart'
  | 'onChange'
>

type RecordingHostOptions = Omit<
  RecordingSessionOptions,
  'audioController' | 'highlightController' | 'presentation'
>

type HighlightActivationOptions = {
  scroll?: boolean
  scrollBehavior?: ScrollBehavior
}

type DeepReadonly<T> = T extends object
  ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T

export type ReaderPlaybackRecordingSnapshot = DeepReadonly<AudioRecording>

export interface ReaderPlaybackOptions {
  document: Document
  view: Window
  audioElement: HTMLAudioElement
  book: HTMLElement
  viewport: ReaderViewport
  initialPlaybackRate: number
  timeline: TimelineHostOptions
  recording: RecordingHostOptions
  canUseNetwork(retry?: () => Promise<void>): boolean
}

export interface ReaderPlaybackSessionSnapshot {
  readonly recording: ReaderPlaybackRecordingSnapshot
  readonly activeRecording: ReaderPlaybackRecordingSnapshot
  readonly runId: string
  readonly aliyahIndex: ActiveAudioSession['aliyahIndex']
  readonly status: ActiveAudioSession['status']
  readonly cueCount: number
  readonly tokenCount: number
  readonly tokenKeys: readonly string[]
}

export interface ReaderPlaybackSnapshot {
  readonly sessionRevision: number
  readonly session: ReaderPlaybackSessionSnapshot | null
  readonly activeTokenKey: string | null
  readonly activeTokenIndex: number
  readonly currentCueIndex: number
  readonly currentTime: number
  readonly displayTime: number
  readonly duration: number
  readonly paused: boolean
  readonly ended: boolean
  readonly playing: boolean
  readonly error: Error | null
  readonly tokenCacheSize: number
}

export type ReaderPlaybackChange =
  | Exclude<PlaybackTimelineChange, { type: 'session-loaded' }>
  | { type: 'session-loaded' }
  | { type: 'active-token-changed'; tokenKey: string | null }
  | { type: 'route-reset' }

export interface ReaderPlaybackCueAuthoringAdapter {
  readonly audioController: AudioController
  readonly highlightController: HighlightController
  prepareAuthoringSession(): Promise<void>
  restoreReaderSession(): Promise<void>
  playNetworkRecording(retry?: () => Promise<void>): Promise<boolean>
  getDisplayTime(): number
  refresh(scope?: 'all' | 'progress'): void
  setCueIndex(index: number | null): Promise<void>
}

export interface ReaderPlaybackRecordingHarnessAdapter {
  readonly audio: AudioController
  readonly highlight: HighlightController
  readonly timeline: PlaybackTimeline
  readonly recordingSession: RecordingSession
}

export interface ReaderPlayback {
  snapshot(): ReaderPlaybackSnapshot
  subscribe(
    listener: (
      change: ReaderPlaybackChange,
      snapshot: ReaderPlaybackSnapshot
    ) => void
  ): () => void
  setDisplay(display: ScrollDisplay): void
  resetRoute(): void
  resetRecordingCache(): void
  lookupRecording(
    run: LeiningRun,
    aliyahIndex: PlaybackAliyahIndex
  ): RecordingAvailability
  loadRecording(
    target: RecordingTarget,
    options?: { mode?: 'reader' | 'authoring' }
  ): Promise<ReaderPlaybackSessionSnapshot | null>
  isTargetActive(target: {
    recordingId?: string
    runId: string
    aliyahIndex: PlaybackAliyahIndex
  }): boolean
  authorizePlayback(
    ...recordings: Array<AudioRecording | null | undefined>
  ): boolean
  pause(): void
  play(retry?: () => Promise<void>): Promise<boolean>
  replayCurrentCue(): Promise<void>
  toggle(retry?: () => Promise<void>): Promise<void>
  step(delta: -1 | 1): Promise<void>
  seek(time: number): void
  setPlaybackRate(rate: number, snap?: boolean): Promise<void>
  syncHighlight(options?: {
    scroll?: boolean
    currentTime?: number
    scrollBehavior?: ScrollBehavior
  }): Promise<void>
  restoreActiveHighlight(
    options?: HighlightActivationOptions
  ): Promise<HTMLElement | null>
  activateToken(
    tokenKey: string,
    options?: HighlightActivationOptions
  ): Promise<HTMLElement | null>
  activateSessionToken(
    tokenKey: string,
    options?: HighlightActivationOptions & {
      play?: boolean
      seekToCue?: boolean
      retry?: () => Promise<void>
    }
  ): Promise<HTMLElement | null>
  cueForToken(tokenKey: string): Readonly<WordCue> | null
  tokenIndex(tokenKey: string): number
  protectedCuePageNumbers(forwardPageCount: number): readonly number[]
  closeOverlay(): boolean
  cueAuthoringAdapter(): ReaderPlaybackCueAuthoringAdapter
  recordingHarnessAdapter(): ReaderPlaybackRecordingHarnessAdapter
}

export function createReaderPlayback(
  scope: MountScope,
  options: ReaderPlaybackOptions
): ReaderPlayback {
  const audioController = new AudioController(options.audioElement, {
    signal: scope.signal,
  })
  scope.own(() => audioController.destroy())
  audioController.audio.playbackRate = options.initialPlaybackRate

  const highlightController = new HighlightController(options.book)
  scope.own(() => highlightController.clear())

  const listeners = new Set<
    (
      change: ReaderPlaybackChange,
      snapshot: ReaderPlaybackSnapshot
    ) => void
  >()
  let sessionRevision = 0
  let timeline: PlaybackTimeline | null = null
  let recordingSession: RecordingSession | null = null
  const recordingSnapshots = new WeakMap<
    AudioRecording,
    ReaderPlaybackRecordingSnapshot
  >()

  const recordingSnapshot = (
    recording: AudioRecording
  ): ReaderPlaybackRecordingSnapshot => {
    const cached = recordingSnapshots.get(recording)
    if (cached) return cached
    const frozen: ReaderPlaybackRecordingSnapshot =
      'range' in recording
        ? Object.freeze({
            ...recording,
            reading: Object.freeze({ ...recording.reading }),
            ...(recording.mediaIdentity
              ? {
                  mediaIdentity: Object.freeze({
                    ...recording.mediaIdentity,
                  }),
                }
              : {}),
            range: Object.freeze({
              start: Object.freeze({ ...recording.range.start }),
              end: Object.freeze({ ...recording.range.end }),
            }),
          })
        : Object.freeze({
            ...recording,
            reading: Object.freeze({ ...recording.reading }),
            ...(recording.mediaIdentity
              ? {
                  mediaIdentity: Object.freeze({
                    ...recording.mediaIdentity,
                  }),
                }
              : {}),
          })
    recordingSnapshots.set(recording, frozen)
    return frozen
  }

  const sessionSnapshot = (): ReaderPlaybackSessionSnapshot | null => {
    const session = audioController.session
    if (!session) return null
    return Object.freeze({
      recording: recordingSnapshot(session.recording),
      activeRecording: recordingSnapshot(
        audioController.activeSegment?.recording ?? session.recording
      ),
      runId: session.runId,
      aliyahIndex: session.aliyahIndex,
      status: session.status,
      cueCount: session.cues.length,
      tokenCount: session.tokenKeys.length,
      tokenKeys: Object.freeze([...session.tokenKeys]),
    })
  }

  const snapshot = (): ReaderPlaybackSnapshot => {
    const session = audioController.session
    const currentCueIndex = session?.cues.length
      ? highlightController.getCueIndex(
          session.cues,
          audioController.currentTime
        )
      : -1
    return Object.freeze({
      sessionRevision,
      session: sessionSnapshot(),
      activeTokenKey: highlightController.getActiveTokenKey(),
      activeTokenIndex: highlightController.getActiveIndex(),
      currentCueIndex,
      currentTime: audioController.currentTime,
      displayTime: timeline?.displayTime ?? audioController.currentTime,
      duration: audioController.duration,
      paused: audioController.audio.paused,
      ended: audioController.audio.ended,
      playing: Boolean(
        session &&
          !audioController.audio.paused &&
          !audioController.audio.ended
      ),
      error: audioController.error,
      tokenCacheSize: recordingSession?.tokenCacheSize() ?? 0,
    })
  }

  const emit = (change: ReaderPlaybackChange) => {
    if (!listeners.size) return
    const nextSnapshot = snapshot()
    for (const listener of listeners) listener(change, nextSnapshot)
  }

  const startPlayback = async () => {
    try {
      await audioController.play()
      return true
    } catch {
      return false
    }
  }

  const play = async (retry?: () => Promise<void>) => {
    if (audioController.audio.paused && !options.canUseNetwork(retry)) {
      return false
    }
    return startPlayback()
  }

  const replayFromStart = async (retry?: () => Promise<void>) => {
    if (!options.canUseNetwork(retry)) return false
    try {
      await audioController.replayFromStart()
      return true
    } catch {
      return false
    }
  }

  timeline = createPlaybackTimeline(scope, {
    ...options.timeline,
    document: options.document,
    view: options.view,
    viewport: options.viewport,
    audioController,
    highlightController,
    playNetworkRecording: play,
    replayNetworkRecordingFromStart: replayFromStart,
    onChange: (change) => {
      if (change.type === 'session-loaded') {
        sessionRevision += 1
        emit({ type: 'session-loaded' })
        return
      }
      emit(change)
    },
  })

  recordingSession = createRecordingSession({
    ...options.recording,
    audioController,
    highlightController,
    presentation: {
      setCueIndex: (index) =>
        timeline?.command({ type: 'set-cue-index', index }),
      sessionLoaded: () => timeline?.refresh(),
    },
  })
  scope.own(() => recordingSession?.reset())

  scope.own(
    highlightController.onActiveTokenChanged((tokenKey) => {
      emit({ type: 'active-token-changed', tokenKey })
    })
  )
  scope.own(() => listeners.clear())

  const loadRecording: ReaderPlayback['loadRecording'] = async (
    target,
    loadOptions
  ) => {
    const loaded = await recordingSession?.load(target, loadOptions)
    return loaded ? sessionSnapshot() : null
  }

  const activateToken: ReaderPlayback['activateToken'] = (
    tokenKey,
    activationOptions
  ) => highlightController.activateTokenKey(tokenKey, activationOptions)

  const activateSessionToken: ReaderPlayback['activateSessionToken'] = async (
    tokenKey,
    {
      play: shouldPlay = false,
      seekToCue = false,
      retry,
      ...activationOptions
    } = {}
  ) => {
    const session = audioController.session
    const cueIndex =
      session?.cues.findIndex(
        (cue) => formatTokenKey(cue) === tokenKey
      ) ?? -1
    const cue = cueIndex >= 0 ? session?.cues[cueIndex] ?? null : null

    if (
      shouldPlay &&
      cue &&
      audioController.audio.paused &&
      !options.canUseNetwork(retry)
    ) {
      return null
    }

    if (cue && seekToCue) {
      await timeline?.command({ type: 'set-cue-index', index: cueIndex })
      audioController.seek(cue.timeStart)
    }
    if (shouldPlay && cue) await startPlayback()

    return cue
      ? highlightController.activateCue(cue, activationOptions)
      : highlightController.activateTokenKey(tokenKey, activationOptions)
  }

  const restoreActiveHighlight: ReaderPlayback['restoreActiveHighlight'] = async (
    activationOptions = {}
  ) => {
    const session = audioController.session
    if (!session) return null
    const activeTokenKey = highlightController.getActiveTokenKey()
    const cueIndex = session.cues.length
      ? highlightController.getCueIndex(session.cues, audioController.currentTime)
      : -1

    if (session.cues.length && cueIndex >= 0) {
      return highlightController.activateCue(
        session.cues[cueIndex],
        activationOptions
      )
    }
    if (activeTokenKey) {
      return highlightController.activateTokenKey(
        activeTokenKey,
        activationOptions
      )
    }
    if (session.cues[0]) {
      return highlightController.activateCue(
        session.cues[0],
        activationOptions
      )
    }
    return session.tokenKeys[0]
      ? highlightController.activateTokenKey(
          session.tokenKeys[0],
          activationOptions
        )
      : null
  }

  const cueAuthoringAdapter = Object.freeze({
    audioController,
    highlightController,
    prepareAuthoringSession: () => recordingSession!.enterAuthoring(),
    restoreReaderSession: () => recordingSession!.leaveAuthoring(),
    playNetworkRecording: play,
    getDisplayTime: () => timeline!.displayTime,
    refresh: (refreshScope?: 'all' | 'progress') =>
      timeline!.refresh(refreshScope),
    setCueIndex: (index: number | null) =>
      timeline!.command({ type: 'set-cue-index', index }),
  }) satisfies ReaderPlaybackCueAuthoringAdapter

  const recordingHarnessAdapter = Object.freeze({
    audio: audioController,
    highlight: highlightController,
    timeline,
    recordingSession,
  }) satisfies ReaderPlaybackRecordingHarnessAdapter

  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setDisplay(display) {
      highlightController.setDisplay(display)
    },
    resetRoute() {
      audioController.clearSession()
      highlightController.clear()
      recordingSession.reset()
      timeline.refresh()
      sessionRevision += 1
      emit({ type: 'route-reset' })
    },
    resetRecordingCache: () => recordingSession.reset(),
    lookupRecording: (run, aliyahIndex) =>
      recordingSession.lookup(run, aliyahIndex),
    loadRecording,
    isTargetActive: (target) =>
      isActivePlaybackTarget(audioController.session, target),
    authorizePlayback(...recordings) {
      const recording = recordings.find(
        (candidate): candidate is AudioRecording =>
          Boolean(candidate && candidate.status !== 'missing')
      )
      return recording ? audioController.authorizePlayback(recording) : false
    },
    pause: () => audioController.pause(),
    play,
    async replayCurrentCue() {
      await audioController.replayCurrentCue()
    },
    toggle: (retry) => timeline.command({ type: 'toggle', retry }),
    step: (delta) => timeline.command({ type: 'step', delta }),
    seek(time) {
      audioController.seek(time)
      timeline.refresh('progress')
    },
    setPlaybackRate: (rate, snap) =>
      timeline.command({ type: 'set-rate', rate, snap }),
    syncHighlight: (syncOptions) => timeline.syncHighlight(syncOptions),
    restoreActiveHighlight,
    activateToken,
    activateSessionToken,
    cueForToken(tokenKey) {
      const cue = audioController.session?.cues.find(
        (candidate) => formatTokenKey(candidate) === tokenKey
      )
      return cue ? Object.freeze({ ...cue }) : null
    },
    tokenIndex: (tokenKey) =>
      audioController.session?.tokenKeys.indexOf(tokenKey) ?? -1,
    protectedCuePageNumbers(forwardPageCount) {
      const session = audioController.session
      if (!session?.cues.length) return []
      const cueIndex = Math.max(
        0,
        highlightController.getCueIndex(
          session.cues,
          audioController.currentTime
        )
      )
      const protectedPages: number[] = []
      for (
        let index = cueIndex;
        index < session.cues.length &&
        protectedPages.length <= forwardPageCount;
        index += 1
      ) {
        const pageNumber = session.cues[index]?.pageNumber
        if (
          Number.isInteger(pageNumber) &&
          pageNumber > 0 &&
          !protectedPages.includes(pageNumber)
        ) {
          protectedPages.push(pageNumber)
        }
      }
      return Object.freeze(protectedPages)
    },
    closeOverlay: () => timeline.closeOverlay(),
    cueAuthoringAdapter: () => cueAuthoringAdapter,
    recordingHarnessAdapter: () => recordingHarnessAdapter,
  }
}
