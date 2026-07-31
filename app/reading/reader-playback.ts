import type { ScrollDisplay } from '../components/ScrollDisplay.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import type { ReaderViewport } from '../adaptive/reader-viewport.ts'
import {
  AudioController,
  type ActiveAudioSession,
} from './audio-controller.ts'
import { HighlightController } from './highlight-controller.ts'
import {
  createPlaybackTimeline,
  type PlaybackTimeline,
  type PlaybackTimelineChange,
  type PlaybackTimelineOptions,
} from './playback-timeline.ts'
import {
  createRecordingSession,
  type RecordingSession,
  type RecordingSessionOptions,
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

export interface ReaderPlaybackOptions {
  document: Document
  view: Window
  audioElement: HTMLAudioElement
  book: HTMLElement
  viewport: ReaderViewport
  initialPlaybackRate: number
  timeline: TimelineHostOptions
  recording: RecordingHostOptions
  playNetworkRecording(
    audioController: AudioController,
    retry?: () => Promise<void>
  ): Promise<boolean>
  replayNetworkRecordingFromStart(
    audioController: AudioController,
    retry?: () => Promise<void>
  ): Promise<boolean>
  onTimelineChange(
    change: PlaybackTimelineChange,
    audioController: AudioController
  ): void
  onSessionLoaded(
    session: ActiveAudioSession,
    audioController: AudioController
  ): void
}

export interface ReaderPlayback {
  readonly audioController: AudioController
  readonly highlightController: HighlightController
  readonly recordingSession: RecordingSession
  readonly timeline: PlaybackTimeline
  setDisplay(display: ScrollDisplay): void
  resetRoute(): void
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

  const timeline = createPlaybackTimeline(scope, {
    ...options.timeline,
    document: options.document,
    view: options.view,
    viewport: options.viewport,
    audioController,
    highlightController,
    playNetworkRecording: (retry) =>
      options.playNetworkRecording(audioController, retry),
    replayNetworkRecordingFromStart: (retry) =>
      options.replayNetworkRecordingFromStart(audioController, retry),
    onChange: (change) => options.onTimelineChange(change, audioController),
  })

  const recordingSession = createRecordingSession({
    ...options.recording,
    audioController,
    highlightController,
    presentation: {
      setCueIndex: (index) =>
        timeline.command({ type: 'set-cue-index', index }),
      sessionLoaded: (session) => {
        timeline.refresh()
        options.onSessionLoaded(session, audioController)
      },
    },
  })
  scope.own(() => recordingSession.reset())

  return {
    audioController,
    highlightController,
    recordingSession,
    timeline,
    setDisplay(display) {
      highlightController.setDisplay(display)
    },
    resetRoute() {
      audioController.clearSession()
      highlightController.clear()
      recordingSession.reset()
      timeline.refresh()
    },
  }
}
