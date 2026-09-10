import type { RecordingIssue } from '../audio/recording-issues.ts'
import { recordingIssueReaderLabel } from '../audio/recording-issues.ts'
import type { WaveformSummary } from '../audio/waveform-summary.ts'
import {
  decodeWaveformSummary,
  WaveformSummaryLoader,
} from '../audio/waveform-summary-loader.ts'
import type { WordCue } from '../audio/types.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import type { ReaderPlaybackCueAuthoringSessionSnapshot } from '../reading/reader-playback.ts'

const MAX_WAVEFORM_SUMMARY_CACHE_ENTRIES = 6
const WAVEFORM_AUTO_WINDOW_SECONDS = 24
const WAVEFORM_FULL_VIEW_MAX_SECONDS = 30
const WAVEFORM_WINDOW_STEP_SECONDS = 1
const WAVEFORM_FOLLOW_LEFT_RATIO = 0.38
const WAVEFORM_FOLLOW_RIGHT_RATIO = 0.68
const WAVEFORM_FOLLOW_BACKWARD_TARGET_RATIO = 0.48
const WAVEFORM_FOLLOW_FORWARD_TARGET_RATIO = 0.58

export interface CueWaveformWindow {
  start: number
  end: number
  zoomed: boolean
}

export interface CueWaveformSnapshot {
  session: ReaderPlaybackCueAuthoringSessionSnapshot | null
  currentTime: number
  duration: number
  paused: boolean
  ended: boolean
  cues: readonly WordCue[]
  issues: readonly RecordingIssue[]
  microphoneState: 'recording' | 'ready' | null
}

export interface CueWaveformOptions {
  document: Document
  view: Window
  getSnapshot(): CueWaveformSnapshot
  formatDuration(seconds: number): string
  seek(time: number): void
}

export interface CueWaveform {
  setVisible(visible: boolean): void
  schedule(): void
  contentChanged(): void
}

export function getCenteredCueWaveformWindow(
  focusTime: number,
  duration: number
): CueWaveformWindow {
  const windowDuration = Math.min(duration, WAVEFORM_AUTO_WINDOW_SECONDS)
  const unclampedStart = focusTime - windowDuration / 2
  const steppedStart =
    Math.floor(unclampedStart / WAVEFORM_WINDOW_STEP_SECONDS) *
    WAVEFORM_WINDOW_STEP_SECONDS
  const start = Math.max(
    0,
    Math.min(duration - windowDuration, steppedStart)
  )
  return {
    start,
    end: start + windowDuration,
    zoomed: true,
  }
}

export function getFollowedCueWaveformWindow({
  previousWindow,
  focusTime,
  duration,
}: {
  previousWindow: CueWaveformWindow
  focusTime: number
  duration: number
}): CueWaveformWindow {
  const windowDuration = previousWindow.end - previousWindow.start
  if (
    windowDuration <= 0 ||
    focusTime < previousWindow.start ||
    focusTime > previousWindow.end
  ) {
    return getCenteredCueWaveformWindow(focusTime, duration)
  }
  const focusRatio = (focusTime - previousWindow.start) / windowDuration
  const targetRatio =
    focusRatio < WAVEFORM_FOLLOW_LEFT_RATIO
      ? WAVEFORM_FOLLOW_BACKWARD_TARGET_RATIO
      : focusRatio > WAVEFORM_FOLLOW_RIGHT_RATIO
        ? WAVEFORM_FOLLOW_FORWARD_TARGET_RATIO
        : null
  if (targetRatio === null) return previousWindow
  const unclampedStart = focusTime - windowDuration * targetRatio
  const steppedStart =
    Math.floor(unclampedStart / WAVEFORM_WINDOW_STEP_SECONDS) *
    WAVEFORM_WINDOW_STEP_SECONDS
  const start = Math.max(
    0,
    Math.min(duration - windowDuration, steppedStart)
  )
  return {
    start,
    end: start + windowDuration,
    zoomed: true,
  }
}

export function cueWaveformTimeRatio(
  time: number,
  window: CueWaveformWindow
) {
  const duration = window.end - window.start
  if (!Number.isFinite(time) || duration <= 0 || time < window.start || time > window.end) {
    return null
  }
  return (time - window.start) / duration
}

export function getCueWaveformWindowColumns(
  summary: WaveformSummary,
  window: CueWaveformWindow,
  pixelWidth: number
) {
  const span = window.end - window.start
  if (!Number.isFinite(pixelWidth) || pixelWidth < 1 || !Number.isFinite(span) || span <= 0) {
    return []
  }
  const count = Math.floor(pixelWidth)
  return Array.from({ length: count }, (_, pixel) => {
    // Sample positions stay on the decoded audio clock, even when media
    // metadata reports a different duration. Each column covers [start, end).
    const start = Math.max(0, (window.start + pixel / count * span) * summary.sampleRate)
    const end = Math.min(
      summary.sampleCount,
      (window.start + (pixel + 1) / count * span) * summary.sampleRate
    )
    if (start >= end) return { min: 0, max: 0 }
    const first = Math.floor(start / summary.stepSamples)
    const last = Math.min(summary.min.length, Math.ceil(end / summary.stepSamples))
    let min = Infinity
    let max = -Infinity
    for (let bin = first; bin < last; bin += 1) {
      min = Math.min(min, summary.min[bin])
      max = Math.max(max, summary.max[bin])
    }
    return { min, max }
  })
}

export function createCueWaveform(
  scope: MountScope,
  options: CueWaveformOptions
): CueWaveform {
  const { document, view } = options
  const lane = requiredElement<HTMLElement>(
    document,
    '[data-target-id="admin-waveform-lane"]'
  )
  const bars = requiredElement<HTMLElement>(
    document,
    '[data-target-id="admin-waveform-bars"]'
  )
  const status = requiredElement<HTMLElement>(
    document,
    '[data-target-id="admin-waveform-status"]'
  )
  const summaryCache = new Map<string, WaveformSummary>()
  const canvas = document.createElement('canvas')
  canvas.className = 'admin-waveform-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  bars.appendChild(canvas)
  const context = canvas.getContext('2d')
  const summaryLoaders = new Map<string, WaveformSummaryLoader>()
  const windowCache = new Map<string, CueWaveformWindow>()
  let visible = false
  let renderFrame = 0
  let contentRevision = 0
  let lastDrawKey = ''

  const summaryKey = (session: ReaderPlaybackCueAuthoringSessionSnapshot) => {
    const mediaIdentity = session.recording.mediaIdentity
    const mediaVersion = mediaIdentity
      ? `${mediaIdentity.algorithm}:${mediaIdentity.digest}:${mediaIdentity.byteLength}`
      : session.recording.playSrc
    return `${session.recording.id}:${mediaVersion}`
  }

  const getSummaryLoader = (
    session: ReaderPlaybackCueAuthoringSessionSnapshot
  ) => {
    const key = summaryKey(session)
    const existing = summaryLoaders.get(key)
    if (existing) return existing
    const loader = new WaveformSummaryLoader((signal) =>
      decodeWaveformSummary({
        audioId: session.recording.id,
        src: session.recording.playSrc,
        signal,
      })
    )
    summaryLoaders.set(key, loader)
    return loader
  }

  const rememberSummary = (key: string, summary: WaveformSummary) => {
    summaryCache.delete(key)
    summaryCache.set(key, summary)
    while (summaryCache.size > MAX_WAVEFORM_SUMMARY_CACHE_ENTRIES) {
      const oldestKey = summaryCache.keys().next().value
      if (!oldestKey) break
      const oldestSummary = summaryCache.get(oldestKey)
      summaryCache.delete(oldestKey)
      if (oldestSummary) windowCache.delete(oldestSummary.audioId)
    }
  }

  const cancelObsoleteLoads = (activeKey: string | null) => {
    for (const [key, loader] of summaryLoaders) {
      if (key === activeKey) continue
      loader.cancel(key)
      summaryLoaders.delete(key)
    }
  }

  const requestSummaryRender = (
    session: ReaderPlaybackCueAuthoringSessionSnapshot,
    { retry = false }: { retry?: boolean } = {}
  ) => {
    const key = summaryKey(session)
    cancelObsoleteLoads(key)
    const loader = getSummaryLoader(session)
    const request = retry ? loader.retry(key) : loader.load(key)
    void request.then((summary) => {
      if (scope.signal.aborted) return
      if (summary) rememberSummary(key, summary)
      const activeSession = options.getSnapshot().session
      if (
        visible &&
        activeSession &&
        summaryKey(activeSession) === key
      ) {
        render()
      }
    })
  }

  const getVisibleWindow = (
    snapshot: CueWaveformSnapshot,
    duration: number
  ): CueWaveformWindow => {
    const audioId = snapshot.session?.recording.id ?? null
    if (duration <= WAVEFORM_FULL_VIEW_MAX_SECONDS) {
      if (audioId) windowCache.delete(audioId)
      return { start: 0, end: duration, zoomed: false }
    }
    const focusTime = clampTime(snapshot.currentTime, duration)
    if (!audioId || snapshot.paused || snapshot.ended) {
      const centeredWindow = getCenteredCueWaveformWindow(focusTime, duration)
      if (audioId) windowCache.set(audioId, centeredWindow)
      return centeredWindow
    }
    const previousWindow = windowCache.get(audioId)
    const nextWindow = previousWindow
      ? getFollowedCueWaveformWindow({
          previousWindow,
          focusTime,
          duration,
        })
      : getCenteredCueWaveformWindow(focusTime, duration)
    windowCache.set(audioId, nextWindow)
    return nextWindow
  }

  const clearCanvas = () => {
    context?.clearRect(0, 0, canvas.width, canvas.height)
    lastDrawKey = ''
  }

  const drawSummary = (summary: WaveformSummary, window: CueWaveformWindow, key: string) => {
    if (!context) return
    const rect = bars.getBoundingClientRect()
    const scale = view.devicePixelRatio || 1
    const width = Math.round(rect.width * scale)
    const height = Math.round(rect.height * scale)
    const color = view.getComputedStyle(canvas).color
    const drawKey = `${key}:${window.start}:${window.end}:${width}:${height}:${scale}:${color}`
    if (drawKey === lastDrawKey) return
    lastDrawKey = drawKey
    canvas.width = width
    canvas.height = height
    if (!width || !height) return
    const columns = getCueWaveformWindowColumns(summary, window, width)
    const middle = height / 2
    const amplitude = Math.max(0, middle - 2 * scale)
    context.fillStyle = color
    for (let pixel = 0; pixel < columns.length; pixel += 1) {
      const column = columns[pixel]
      const top = middle - Math.max(-1, Math.min(1, column.max)) * amplitude
      const bottom = middle - Math.max(-1, Math.min(1, column.min)) * amplitude
      context.fillRect(pixel, top, 1, Math.max(1, bottom - top))
    }
  }

  const clearWaveform = () => {
    bars.replaceChildren(canvas)
    clearCanvas()
    delete bars.dataset.audioId
    delete bars.dataset.windowStart
    delete bars.dataset.windowEnd
    delete lane.dataset.windowStart
    delete lane.dataset.windowEnd
    delete bars.dataset.contentRevision
    delete bars.dataset.summaryAudioId
    delete bars.dataset.summaryKey
    status.removeAttribute('role')
    status.removeAttribute('tabindex')
  }

  function render() {
    if (!visible || scope.signal.aborted) return
    const snapshot = options.getSnapshot()
    const { session } = snapshot
    if (!session) {
      cancelObsoleteLoads(null)
      clearWaveform()
      status.textContent = 'Load a recording to show the waveform.'
      return
    }

    if (snapshot.microphoneState) {
      cancelObsoleteLoads(null)
      clearWaveform()
      status.textContent =
        snapshot.microphoneState === 'recording'
          ? 'Recording live microphone audio. Stop or Export to finish the new audio file.'
          : 'The new microphone audio is ready to export; the catalog waveform is hidden for this pass.'
      return
    }

    const key = summaryKey(session)
    cancelObsoleteLoads(key)
    const loader = getSummaryLoader(session)
    const summaryState = loader.state(key)
    const summary = summaryCache.get(key)
    const duration =
      Number.isFinite(snapshot.duration) && snapshot.duration > 0
        ? snapshot.duration
        : summary?.duration
    const safeDuration = duration && duration > 0 ? duration : 1
    const visibleWindow = getVisibleWindow(snapshot, safeDuration)
    lane.dataset.windowStart = `${visibleWindow.start}`
    lane.dataset.windowEnd = `${visibleWindow.end}`
    const windowChanged =
      bars.dataset.audioId !== session.recording.id ||
      bars.dataset.windowStart !== lane.dataset.windowStart ||
      bars.dataset.windowEnd !== lane.dataset.windowEnd
    const summaryChanged = bars.dataset.summaryKey !== (summary ? key : '')

    if (windowChanged || summaryChanged) {
      bars.replaceChildren(canvas)
      clearCanvas()
      bars.dataset.audioId = session.recording.id
      bars.dataset.windowStart = lane.dataset.windowStart
      bars.dataset.windowEnd = lane.dataset.windowEnd
      bars.dataset.summaryAudioId = summary?.audioId ?? ''
      bars.dataset.summaryKey = summary ? key : ''
      delete bars.dataset.contentRevision
    }
    if (summary) drawSummary(summary, visibleWindow, key)

    status.textContent = !context
      ? 'Waveform drawing is unavailable in this browser.'
      : summary
      ? visibleWindow.zoomed
        ? `Waveform lane - ${options.formatDuration(
            visibleWindow.start
          )}-${options.formatDuration(visibleWindow.end)}`
        : 'Waveform lane - full recording'
      : summaryState.status === 'failed'
        ? 'Waveform unavailable - activate to retry'
        : 'Preparing waveform...'
    if (summaryState.status === 'failed') {
      status.setAttribute('role', 'button')
      status.tabIndex = 0
    } else {
      status.removeAttribute('role')
      status.removeAttribute('tabindex')
    }
    if (!summary && summaryState.status === 'idle') {
      requestSummaryRender(session)
    }

    if (bars.dataset.contentRevision !== `${contentRevision}`) {
      bars
        .querySelectorAll('.admin-waveform-cue, .admin-waveform-issue')
        .forEach((node) => node.remove())
      for (const cue of snapshot.cues) {
        const ratio = cueWaveformTimeRatio(cue.timeStart, visibleWindow)
        if (ratio === null) continue
        const marker = document.createElement('span')
        marker.className = 'admin-waveform-cue'
        marker.style.setProperty('--timeline-ratio', `${clampRatio(ratio)}`)
        bars.appendChild(marker)
      }
      for (const issue of snapshot.issues) {
        if (issue.timeStart === undefined) continue
        const ratio = cueWaveformTimeRatio(issue.timeStart, visibleWindow)
        if (ratio === null) continue
        const marker = document.createElement('span')
        marker.className = 'admin-waveform-issue'
        marker.title = recordingIssueReaderLabel(issue)
        marker.style.setProperty('--timeline-ratio', `${clampRatio(ratio)}`)
        bars.appendChild(marker)
      }
      bars.dataset.contentRevision = `${contentRevision}`
    }

    const playheadRatio = cueWaveformTimeRatio(
      snapshot.currentTime,
      visibleWindow
    )
    const existingPlayhead = bars.querySelector<HTMLElement>(
      '.admin-waveform-playhead'
    )
    if (playheadRatio === null) {
      existingPlayhead?.remove()
    } else {
      const playhead = existingPlayhead ?? document.createElement('span')
      playhead.className = 'admin-waveform-playhead'
      playhead.style.setProperty(
        '--timeline-ratio',
        `${clampRatio(playheadRatio)}`
      )
      if (!existingPlayhead) bars.appendChild(playhead)
    }
  }

  const schedule = () => {
    if (!visible || renderFrame) return
    renderFrame = view.requestAnimationFrame(() => {
      renderFrame = 0
      render()
    })
  }

  const setVisible = (nextVisible: boolean) => {
    visible = nextVisible
    if (visible) {
      render()
      return
    }
    if (renderFrame) {
      view.cancelAnimationFrame(renderFrame)
      renderFrame = 0
    }
    cancelObsoleteLoads(null)
  }

  const retryFailedSummary = () => {
    const session = options.getSnapshot().session
    if (!session) return
    const key = summaryKey(session)
    if (getSummaryLoader(session).state(key).status !== 'failed') return
    requestSummaryRender(session, { retry: true })
  }

  lane.addEventListener(
    'click',
    (event) => {
      const snapshot = options.getSnapshot()
      if (!snapshot.session || !Number.isFinite(snapshot.duration)) return
      const rect = bars.getBoundingClientRect()
      const ratio = clampRatio(
        (event.clientX - rect.left) / Math.max(rect.width, 1)
      )
      const windowStart = Number(lane.dataset.windowStart)
      const windowEnd = Number(lane.dataset.windowEnd)
      const duration =
        Number.isFinite(windowStart) &&
        Number.isFinite(windowEnd) &&
        windowEnd > windowStart
          ? windowEnd - windowStart
          : snapshot.duration
      const start = Number.isFinite(windowStart) ? windowStart : 0
      options.seek(
        Math.max(
          0,
          Math.min(snapshot.duration, start + ratio * duration)
        )
      )
      schedule()
    },
    { signal: scope.signal }
  )
  status.addEventListener('click', retryFailedSummary, {
    signal: scope.signal,
  })
  status.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (status.getAttribute('role') !== 'button') return
      event.preventDefault()
      retryFailedSummary()
    },
    { signal: scope.signal }
  )
  view.addEventListener('resize', schedule, { signal: scope.signal })
  view.visualViewport?.addEventListener('resize', schedule, {
    signal: scope.signal,
  })
  const resizeObserver = new ResizeObserver(schedule)
  resizeObserver.observe(bars)
  const themeObserver = new MutationObserver(schedule)
  for (const element of [document.documentElement, document.body]) {
    themeObserver.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
  }
  view.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule, {
    signal: scope.signal,
  })

  scope.own(() => {
    visible = false
    if (renderFrame) view.cancelAnimationFrame(renderFrame)
    renderFrame = 0
    cancelObsoleteLoads(null)
    resizeObserver.disconnect()
    themeObserver.disconnect()
    canvas.remove()
  })

  return {
    setVisible,
    schedule,
    contentChanged() {
      contentRevision += 1
      schedule()
    },
  }
}

function requiredElement<ElementType extends Element>(
  document: Document,
  selector: string
) {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Cue Waveform requires ${selector}`)
  return element
}

function clampTime(value: number, duration: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(duration, value))
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value))
}
