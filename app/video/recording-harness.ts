import type { MountScope } from '../lifecycle/mount.ts'
import { calculateCaptureRect } from '../recording-mode.ts'
import type {
  ActiveAudioSession,
  AudioController,
} from '../reading/audio-controller.ts'
import type { HighlightController } from '../reading/highlight-controller.ts'
import type { PlaybackTimeline } from '../reading/playback-timeline.ts'
import type { RecordingSession } from '../reading/recording-session.ts'

type RecordingHarnessAudio = Pick<
  AudioController,
  'session' | 'currentTime' | 'duration' | 'seek' | 'play' | 'pause'
>

type RecordingHarnessHighlight = Pick<
  HighlightController,
  'getActiveTokenKey' | 'getCueIndex' | 'clear' | 'activateCue'
>

type RecordingHarnessTimeline = Pick<PlaybackTimeline, 'syncHighlight'>
type RecordingHarnessSession = Pick<RecordingSession, 'loadByAudioId'>

export interface RecordingHarnessState {
  ready: boolean
  audioId: string | null
  duration: number
  currentTime: number
  activeTokenKey: string | null
  scrollTop: number
}

export interface RecordingHarnessRenderState {
  audioId: string
  currentTime: number
  duration: number
  activeTokenKey: string | null
}

export interface RecordingHarnessSettledState
  extends RecordingHarnessRenderState {
  scrollTop: number
}

export interface RecordingHarness {
  ready(): Promise<void>
  loadAudio(audioId: string): Promise<ActiveAudioSession | null>
  renderAt(seconds: number): Promise<RecordingHarnessRenderState | null>
  renderHighlightAnimationAt(
    seconds: number,
    elapsedMs: number,
    settleBeforeAnimation: boolean,
    scrollTransition: boolean,
    transitionWaitMs: number
  ): Promise<RecordingHarnessSettledState | null>
  settleAt(seconds: number): Promise<RecordingHarnessSettledState | null>
  play(): Promise<void>
  pause(): void
  state(): RecordingHarnessState
  captureRect(margin?: number): ReturnType<typeof calculateCaptureRect>
}

export interface RecordingHarnessOptions {
  document: Document
  view: Window
  audio: RecordingHarnessAudio
  highlight: RecordingHarnessHighlight
  timeline: RecordingHarnessTimeline
  recordingSession: RecordingHarnessSession
  isReaderReady(): boolean
  waitUntilReaderReady(): Promise<void>
  getBook(): HTMLElement
}

declare global {
  interface Window {
    tikkunRecorder?: RecordingHarness
  }
}

function waitForAnimationFrame(view: Window) {
  return new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()))
}

export function mountRecordingHarness(
  scope: MountScope,
  options: RecordingHarnessOptions
) {
  const {
    document,
    view,
    audio,
    highlight,
    timeline,
    recordingSession,
    isReaderReady,
    waitUntilReaderReady,
    getBook,
  } = options
  if (view.tikkunRecorder) {
    throw new Error('Recording Harness is already mounted')
  }

  const renderAt = async (
    seconds: number
  ): Promise<RecordingHarnessRenderState | null> => {
    const session = audio.session
    if (!session) return null

    document.documentElement.style.removeProperty(
      '--recording-highlight-animation-delay'
    )
    document.documentElement.style.removeProperty(
      '--recording-highlight-animation-play-state'
    )
    audio.seek(seconds)
    await timeline.syncHighlight()
    await waitForAnimationFrame(view)

    return {
      audioId: session.recording.id,
      currentTime: audio.currentTime,
      duration: audio.duration,
      activeTokenKey: highlight.getActiveTokenKey(),
    }
  }

  const settleAt = async (
    seconds: number
  ): Promise<RecordingHarnessSettledState | null> => {
    const session = audio.session
    if (!session) return null

    await renderAt(seconds)
    let stableFrames = 0
    let previousScrollTop = getBook().scrollTop

    for (let frame = 0; frame < 90; frame += 1) {
      await waitForAnimationFrame(view)
      if (scope.signal.aborted) return null
      const book = getBook()
      const scrollTop = book.scrollTop
      const activeWord = book.querySelector<HTMLElement>('.word.is-active-word')
      const activeRect = activeWord?.getBoundingClientRect()
      const highlightVisible = Boolean(
        activeRect &&
          activeRect.top >= 0 &&
          activeRect.bottom <= view.innerHeight &&
          activeRect.left >= 0 &&
          activeRect.right <= view.innerWidth
      )

      stableFrames =
        Math.abs(scrollTop - previousScrollTop) < 0.5 && highlightVisible
          ? stableFrames + 1
          : 0
      if (stableFrames >= 6) break
      previousScrollTop = scrollTop
    }

    return {
      audioId: session.recording.id,
      currentTime: audio.currentTime,
      duration: audio.duration,
      activeTokenKey: highlight.getActiveTokenKey(),
      scrollTop: getBook().scrollTop,
    }
  }

  const renderHighlightAnimationAt = async (
    seconds: number,
    elapsedMs: number,
    settleBeforeAnimation: boolean,
    scrollTransition: boolean,
    transitionWaitMs: number
  ): Promise<RecordingHarnessSettledState | null> => {
    const session = audio.session
    if (!session) return null

    if (settleBeforeAnimation) await settleAt(seconds)

    document.documentElement.style.setProperty(
      '--recording-highlight-animation-delay',
      `${-Math.max(0, elapsedMs)}ms`
    )
    document.documentElement.style.setProperty(
      '--recording-highlight-animation-play-state',
      'paused'
    )
    if (scrollTransition || settleBeforeAnimation) {
      audio.seek(seconds)
      const cueIndex = highlight.getCueIndex(session.cues, seconds)
      if (cueIndex >= 0) {
        highlight.clear()
        await highlight.activateCue(session.cues[cueIndex], {
          scroll: scrollTransition,
        })
      } else {
        await timeline.syncHighlight()
      }
    }
    await waitForAnimationFrame(view)
    if (transitionWaitMs > 0) {
      await new Promise<void>((resolve) =>
        view.setTimeout(resolve, transitionWaitMs)
      )
    }

    return {
      audioId: session.recording.id,
      currentTime: audio.currentTime,
      duration: audio.duration,
      activeTokenKey: highlight.getActiveTokenKey(),
      scrollTop: getBook().scrollTop,
    }
  }

  const captureRect = (margin = 240) => {
    const book = getBook()
    const isVisible = (rect: DOMRect) =>
      rect.left < view.innerWidth &&
      rect.right > 0 &&
      rect.top < view.innerHeight &&
      rect.bottom > 0
    const unionRects = (rects: DOMRect[]) => {
      if (!rects.length) return null
      const left = Math.min(...rects.map((rect) => rect.left))
      const top = Math.min(...rects.map((rect) => rect.top))
      const right = Math.max(...rects.map((rect) => rect.right))
      const bottom = Math.max(...rects.map((rect) => rect.bottom))
      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      }
    }
    const pageReadingRect = (page: HTMLElement | null) =>
      unionRects(
        page
          ? [...page.querySelectorAll<HTMLElement>('.line')]
              .map((line) => line.getBoundingClientRect())
              .filter(isVisible)
          : []
      )
    const activeWord = book.querySelector<HTMLElement>('.word.is-active-word')
    const activePage = activeWord?.closest<HTMLElement>('.tikkun-page')
    const activeTable = activePage?.querySelector<HTMLElement>('table') ?? null
    const activeTableRect = activeTable?.getBoundingClientRect()
    const visibleTables = [
      ...book.querySelectorAll<HTMLElement>('.tikkun-page table'),
    ]
      .map((table) => ({ table, rect: table.getBoundingClientRect() }))
      .filter(({ rect }) => isVisible(rect))
      .sort((left, right) => {
        const leftVisibleHeight =
          Math.min(left.rect.bottom, view.innerHeight) -
          Math.max(left.rect.top, 0)
        const rightVisibleHeight =
          Math.min(right.rect.bottom, view.innerHeight) -
          Math.max(right.rect.top, 0)
        return rightVisibleHeight - leftVisibleHeight
      })
    const table =
      activeTable && activeTableRect && isVisible(activeTableRect)
        ? activeTable
        : visibleTables[0]?.table ?? activeTable
    const visiblePage = table?.closest<HTMLElement>('.tikkun-page') ?? null
    const rect =
      pageReadingRect(activePage ?? null) ??
      pageReadingRect(visiblePage) ??
      table?.getBoundingClientRect()

    return calculateCaptureRect({
      contentRect: rect
        ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        : null,
      viewport: {
        width: view.innerWidth,
        height: view.innerHeight,
      },
      margin,
    })
  }

  const recorder: RecordingHarness = {
    ready: waitUntilReaderReady,
    loadAudio: (audioId) => recordingSession.loadByAudioId(audioId),
    renderAt,
    renderHighlightAnimationAt,
    settleAt,
    play: () => audio.play(),
    pause: () => audio.pause(),
    state: () => ({
      ready: isReaderReady(),
      audioId: audio.session?.recording.id ?? null,
      duration: audio.duration,
      currentTime: audio.currentTime,
      activeTokenKey: highlight.getActiveTokenKey(),
      scrollTop: getBook().scrollTop,
    }),
    captureRect,
  }

  view.tikkunRecorder = recorder
  scope.own(() => {
    if (view.tikkunRecorder === recorder) delete view.tikkunRecorder
    document.documentElement.style.removeProperty(
      '--recording-highlight-animation-delay'
    )
    document.documentElement.style.removeProperty(
      '--recording-highlight-animation-play-state'
    )
  })
}
