import type { MountScope } from '../lifecycle/mount.ts'
import { calculateCaptureRect } from '../recording-mode.ts'
import { RecordingClock } from './recording-clock.ts'
import type {
  ReaderPlaybackRecordingHarnessAdapter,
  ReaderPlaybackRecordingHarnessSessionSnapshot,
  ReaderPlaybackRecordingHarnessSnapshot,
} from '../reading/reader-playback.ts'

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
  scrollTop: number
  stableUntil: number | null
}

export interface RecordingHarness {
  ready(): Promise<void>
  loadAudio(
    audioId: string
  ): Promise<ReaderPlaybackRecordingHarnessSessionSnapshot | null>
  renderAt(seconds: number): Promise<RecordingHarnessRenderState | null>
  prepare(): Promise<RecordingHarnessRenderState>
  play(): Promise<void>
  pause(): void
  state(): RecordingHarnessState
  captureRect(margin?: number): ReturnType<typeof calculateCaptureRect>
}

export interface RecordingHarnessOptions {
  document: Document
  view: Window
  playback: ReaderPlaybackRecordingHarnessAdapter
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
    playback,
    isReaderReady,
    waitUntilReaderReady,
    getBook,
  } = options
  if (view.tikkunRecorder) {
    throw new Error('Recording Harness is already mounted')
  }

  let clock: RecordingClock | null = null
  let clockSession: ReaderPlaybackRecordingHarnessSessionSnapshot | null = null
  let busy = false
  let commandRevision = 0
  const checkCommand = (revision: number) => {
    scope.signal.throwIfAborted()
    if (revision !== commandRevision) throw new Error('Recording command was cancelled')
  }
  const releaseClock = () => {
    clock?.dispose()
    clock = null
    clockSession = null
    playback.releaseFrames()
  }
  const exclusively = async <T>(action: () => Promise<T>): Promise<T> => {
    if (busy) throw new Error('Concurrent recording commands are not supported')
    busy = true
    const revision = ++commandRevision
    let deadline = 0
    const timeout = new Promise<never>((_, reject) => {
      deadline = view.setTimeout(() => {
        if (commandRevision === revision) commandRevision += 1
        reject(new Error('Recording frame preparation timed out'))
      }, 30000)
    })
    try {
      return await Promise.race([action(), timeout])
    } catch (error) {
      releaseClock()
      throw error
    } finally {
      view.clearTimeout(deadline)
      busy = false
    }
  }

  const hasSessionIdentity = (
    expected: ReaderPlaybackRecordingHarnessSessionSnapshot,
    snapshot: ReaderPlaybackRecordingHarnessSnapshot
  ) =>
    snapshot.session?.sessionRevision === expected.sessionRevision &&
    snapshot.session.recording.id === expected.recording.id

  const prepareClock = async () => {
    releaseClock()
    const revision = commandRevision
    await waitUntilReaderReady()
    checkCommand(revision)
    const snapshot = playback.snapshot()
    const session = snapshot.session
    if (!session) throw new Error('No recording session is loaded')
    await playback.prepareFrames()
    await document.fonts.ready
    checkCommand(revision)
    let previous = ''
    let stableFrames = 0
    for (let frame = 0; frame < 90; frame += 1) {
      await waitForAnimationFrame(view)
      checkCommand(revision)
      const book = getBook()
      const key = [book.scrollHeight, book.scrollWidth, book.clientWidth, book.clientHeight,
        ...[...book.querySelectorAll('.tikkun-page')].map(page => page.getBoundingClientRect().height)].join(':')
      stableFrames = key === previous && document.fonts.status === 'loaded' ? stableFrames + 1 : 0
      if (stableFrames >= 3) break
      previous = key
    }
    if (stableFrames < 3) throw new Error('Recording layout did not settle before capture')
    if (!hasSessionIdentity(session, playback.snapshot())) throw new Error('Recording session changed during preparation')
    clockSession = session
    clock = new RecordingClock({
      book: getBook(), cues: session.cues, duration: snapshot.duration, signal: scope.signal,
      activate: seconds => playback.activateHighlightAt(seconds, { scroll: false }),
      clearHighlight: () => playback.clearHighlight(),
    })
    await clock.prepare()
  }

  const render = async (seconds: number): Promise<RecordingHarnessRenderState> => {
    const revision = commandRevision
    if (!clock || !clockSession || !hasSessionIdentity(clockSession, playback.snapshot())) await prepareClock()
    const activeClock = clock
    const session = clockSession
    if (!activeClock || !session) throw new Error('Recording clock could not be prepared')
    const frame = await activeClock.renderAt(seconds)
    checkCommand(revision)
    playback.seek(seconds)
    await waitForAnimationFrame(view)
    checkCommand(revision)
    const snapshot = playback.snapshot()
    if (!hasSessionIdentity(session, snapshot)) throw new Error('Recording session changed while capturing')
    if (snapshot.activeTokenKey !== frame.activeTokenKey || Math.abs(snapshot.currentTime - seconds) > 0.001) {
      throw new Error(`Recording cue or audio time mismatch at ${seconds}s`)
    }
    activeClock.validateFrame()
    // The opening Play button changes on the next frame, even when the text is still.
    return { ...frame, stableUntil: seconds === 0 ? null : frame.stableUntil,
      audioId: session.recording.id, currentTime: snapshot.currentTime, duration: snapshot.duration }
  }
  const renderAt = (seconds: number) => exclusively(() => render(seconds))

  const captureRect = (margin = 240) => {
    const book = getBook()
    if (clock) {
      const rects = [...book.querySelectorAll('.tikkun-page .line')]
        .map(line => line.getBoundingClientRect())
        .filter(rect => rect.width > 0)
      if (!rects.length) throw new Error('Recording pages have no measurable reading area')
      const left = Math.min(...rects.map(rect => rect.left))
      const right = Math.max(...rects.map(rect => rect.right))
      return calculateCaptureRect({
        contentRect: { x: left, y: 0, width: right - left, height: view.innerHeight },
        viewport: { width: view.innerWidth, height: view.innerHeight }, margin,
      })
    }
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
    loadAudio: (audioId) => exclusively(async () => {
      releaseClock()
      return playback.loadByAudioId(audioId)
    }),
    renderAt,
    prepare: () => exclusively(async () => {
      await prepareClock()
      return render(0)
    }),
    play: () => exclusively(async () => {
      releaseClock()
      await playback.play()
    }),
    pause: () => playback.pause(),
    state: () => {
      const snapshot = playback.snapshot()
      return {
        ready: isReaderReady(),
        audioId: snapshot.session?.recording.id ?? null,
        duration: snapshot.duration,
        currentTime: snapshot.currentTime,
        activeTokenKey: snapshot.activeTokenKey,
        scrollTop: getBook().scrollTop,
      }
    },
    captureRect,
  }

  view.tikkunRecorder = recorder
  scope.own(() => {
    commandRevision += 1
    if (view.tikkunRecorder === recorder) delete view.tikkunRecorder
    releaseClock()
  })
}
