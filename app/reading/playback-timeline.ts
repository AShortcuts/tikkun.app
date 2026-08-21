import type { AudioRecording } from '../audio/types.ts'
import { getCueProgress, getWordProgress } from '../audio/progress.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import { formatTokenKey } from '../reader/token-position.ts'
import { findVideoForRecording } from '../video/library.ts'
import type { ReaderViewport } from '../adaptive/reader-viewport.ts'
import { formatAliyahLabel } from './aliyah-navigation/model.ts'
import {
  type ActiveAudioSession,
  AudioController,
} from './audio-controller.ts'
import {
  createFloatingPlayer,
  type FloatingPlayerAction,
  type FloatingPlayerPosition,
} from './floating-player.ts'
import { HighlightController } from './highlight-controller.ts'

const PLAYBACK_RATE_MIN = 0.5
const PLAYBACK_RATE_MAX = 3
const PLAYBACK_RATE_MAGNET_THRESHOLD = 0.09
const PLAYBACK_RATE_MARKS = [0.5, 1, 1.5, 2, 3] as const
const UNTIMED_PLAYBACK_SKIP_SECONDS = 10
const FLOATING_PLAYER_VIEWPORT_MARGIN = 8
const FLOATING_PLAYER_SNAP_DISTANCE = 56

export type PlaybackTimelineChange =
  | { type: 'reader-chrome' }
  | { type: 'aliyah-playback' }
  | { type: 'session-loaded'; session: ActiveAudioSession }
  | { type: 'segment-updated' }
  | { type: 'playback-error'; error: Error; recording: AudioRecording }

export type PlaybackCommand =
  | { type: 'toggle'; retry?: () => Promise<void> }
  | { type: 'step'; delta: -1 | 1 }
  | { type: 'set-rate'; rate: number; snap?: boolean }
  | { type: 'set-cue-index'; index: number | null }

export interface PlaybackTimelineOptions {
  document: Document
  view: Window
  audioController: AudioController
  highlightController: HighlightController
  viewport: ReaderViewport
  getAutoScroll(): boolean
  getPlaybackRate(): number
  onPlaybackRateChange(rate: number): void
  attemptPlayback(retry?: () => Promise<void>): Promise<boolean>
  attemptReplayFromStart(retry?: () => Promise<void>): Promise<boolean>
  isCueAuthoringRecording(): boolean
  saveReadingPosition(): void
  focusReader(): void
  restoreFocus(target: HTMLElement | null): void
  onChange(change: PlaybackTimelineChange): void
}

export interface PlaybackTimeline {
  readonly displayTime: number
  command(command: PlaybackCommand): Promise<void>
  refresh(scope?: 'all' | 'progress'): void
  syncHighlight(options?: {
    scroll?: boolean
    currentTime?: number
    scrollBehavior?: ScrollBehavior
  }): Promise<void>
  closeOverlay(): boolean
}

export function formatPlaybackDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--'
  if (seconds < 0) return '0:00'

  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function createPlaybackTimeline(
  scope: MountScope,
  options: PlaybackTimelineOptions
): PlaybackTimeline {
  const { audioController, highlightController, document, view } = options
  let handlePlayerAction: (action: FloatingPlayerAction) => void = () => {
    throw new Error('Floating Player action arrived before playback was ready')
  }
  const player = createFloatingPlayer(scope, {
    document,
    view,
    action: (action) => handlePlayerAction(action),
  })
  const cornerControls = document.querySelector<HTMLElement>(
    '.reader-corner-controls'
  )
  let cueNavigationIndex: number | null = null
  let expanded = false
  let expansionReturnFocus: HTMLElement | null = null
  let resetPlayerPosition: (() => void) | null = null
  let scrubbing = false
  let scrubPreviewTime: number | null = null
  let scrubPointerId: number | null = null
  let focusFrame = 0

  const scheduleFocus = (focus: () => void) => {
    if (focusFrame) view.cancelAnimationFrame(focusFrame)
    focusFrame = view.requestAnimationFrame(() => {
      focusFrame = 0
      if (!scope.signal.aborted) focus()
    })
  }

  const closeSpeedPopover = () => {
    player.closeSpeedPopover()
  }

  const displayTime = () =>
    scrubbing && scrubPreviewTime !== null
      ? scrubPreviewTime
      : audioController.currentTime

  const getAudioProgress = () => {
    const { duration } = audioController
    return audioController.session && Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(1, displayTime() / duration))
      : 0
  }

  const currentCueIndex = (
    session: ActiveAudioSession,
    currentTime: number
  ) => {
    let cueIndex = -1
    for (let index = 0; index < session.cues.length; index += 1) {
      if (session.cues[index].timeStart <= currentTime) cueIndex = index
      else break
    }
    return cueIndex
  }

  const updateTimeline = (progress = getAudioProgress()) => {
    const currentTime = displayTime()
    const { duration } = audioController
    player.syncProgress({
      audioRatio: progress,
      ...(!scrubbing ? { seekValue: Math.round(progress * 1000) } : {}),
      seekDisabled: !audioController.session || !Number.isFinite(duration),
      seekValueText: `${formatPlaybackDuration(currentTime)} of ${formatPlaybackDuration(duration)}`,
      currentTime: formatPlaybackDuration(currentTime),
      duration: formatPlaybackDuration(duration),
    })
  }

  const updateCueProgress = (
    cueIndex = audioController.session
      ? currentCueIndex(audioController.session, displayTime())
      : -1
  ) => {
    const session = audioController.session
    const wordProgress = getWordProgress({
      cueIndex,
      cueCount: session?.cues.length ?? 0,
      tokenCount: session?.tokenKeys.length ?? 0,
    })
    const cueProgress = getCueProgress({
      cueIndex,
      cueCount: session?.cues.length ?? 0,
    })

    player.syncProgress({
      cueRatio: wordProgress.ratio,
      wordProgress: wordProgress.label,
      cueProgress: cueProgress.label,
      cueProgressVisible: cueProgress.total > 0,
      mobileWordProgress: `Word ${wordProgress.current} of ${wordProgress.total}`,
      mobileWordProgressVisible:
        Boolean(session?.cues.length) && wordProgress.total > 0,
    })
  }

  const updateAudioProgress = () => {
    updateTimeline()
    updateCueProgress()
    options.onChange({ type: 'aliyah-playback' })
  }

  const previousAliyahLabel = (
    index: ActiveAudioSession['aliyahIndex']
  ) => {
    if (index === 'Maftir') return formatAliyahLabel(7)
    return index > 1 ? formatAliyahLabel(index - 1) : 'previous aliyah'
  }

  const updateMeta = () => {
    const session = audioController.session
    if (!session) {
      player.sync({
        desktopTitle: '—',
        mobileTitle: '—',
        subtitle: 'Audio',
        mobileReading: '—',
        mode: 'No cues',
        status: '',
      })
      player.syncProgress({ wordProgress: '0 / 0' })
      return
    }

    const cueIndex = currentCueIndex(session, displayTime())
    const wordProgress = getWordProgress({
      cueIndex,
      cueCount: session.cues.length,
      tokenCount: session.tokenKeys.length,
    })
    const statusLabel = audioController.error
      ? 'Recording unavailable'
      : {
          'current-only': '',
          'previous-opening': `Opening from ${previousAliyahLabel(
            session.aliyahIndex
          )}`,
          'partial-start': 'Starts at first available cue',
          'overlap-only': 'Partial: shared opening only',
        }[session.status]
    const readingLabel = session.recording.reading.name
    const aliyahLabel = formatAliyahLabel(session.aliyahIndex)

    player.sync({
      desktopTitle: `${readingLabel} · ${aliyahLabel}`,
      mobileTitle: aliyahLabel,
      subtitle: 'Audio',
      mobileReading: readingLabel,
      mode: session.cues.length ? 'Word cues' : 'No cues',
      status: statusLabel,
    })
    player.syncProgress({ wordProgress: wordProgress.label })
  }

  const clampPlaybackRate = (rate: number) => {
    const fallback = options.getPlaybackRate()
    if (!Number.isFinite(rate)) return fallback
    return Math.max(PLAYBACK_RATE_MIN, Math.min(PLAYBACK_RATE_MAX, rate))
  }

  const snapPlaybackRate = (
    rate: number,
    threshold = PLAYBACK_RATE_MAGNET_THRESHOLD
  ) => {
    const clampedRate = clampPlaybackRate(rate)
    const nearestMark = PLAYBACK_RATE_MARKS.reduce((nearest, mark) =>
      Math.abs(mark - clampedRate) < Math.abs(nearest - clampedRate)
        ? mark
        : nearest
    )
    return Math.abs(nearestMark - clampedRate) <= threshold
      ? nearestMark
      : clampedRate
  }

  const syncPlaybackRateControl = () => {
    const rate = clampPlaybackRate(options.getPlaybackRate())
    player.sync({ playbackRate: rate })
    audioController.audio.playbackRate = rate
  }

  const setPlaybackRate = (requestedRate: number, snap = false) => {
    const rate = snap
      ? snapPlaybackRate(requestedRate)
      : clampPlaybackRate(requestedRate)
    options.onPlaybackRateChange(rate)
    audioController.audio.playbackRate = rate
    syncPlaybackRateControl()
  }

  const setExpanded = (
    next: boolean,
    {
      returnFocus,
      restoreFocus = true,
    }: {
      returnFocus?: HTMLElement | null
      restoreFocus?: boolean
    } = {}
  ) => {
    const isCompact = options.viewport.isCompact()
    const wasExpanded = expanded
    const nextExpanded = next && Boolean(audioController.session)

    if (nextExpanded && isCompact && !wasExpanded) {
      const activeElement =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null
      expansionReturnFocus = returnFocus ?? activeElement
    }
    expanded = nextExpanded

    if (!nextExpanded && wasExpanded && !isCompact) {
      resetPlayerPosition?.()
    }
    player.sync({ expanded: nextExpanded, compact: isCompact })

    if (nextExpanded && isCompact && !wasExpanded) {
      scheduleFocus(() => player.focusMobileClose())
      return
    }

    if (!nextExpanded && wasExpanded) {
      closeSpeedPopover()
      const focusTarget = restoreFocus ? expansionReturnFocus : null
      expansionReturnFocus = null
      if (focusTarget) scheduleFocus(() => options.restoreFocus(focusTarget))
    }
  }

  const refresh = (refreshScope: 'all' | 'progress' = 'all') => {
    if (refreshScope === 'progress') {
      updateAudioProgress()
      updateMeta()
      return
    }

    const session = audioController.session
    const activeVideo = session
      ? findVideoForRecording(session.recording.id)
      : null
    const hasDownload = Boolean(session && session.status !== 'overlap-only')
    const hasTimedCues = Boolean(session?.cues.length)
    const paused = audioController.audio.paused

    if (!session) setExpanded(false, { restoreFocus: false })
    cornerControls?.classList.toggle('mod-raised', Boolean(session))
    player.sync({
      visible: Boolean(session),
      untimed: Boolean(session && !hasTimedCues),
      playing: Boolean(session && !paused),
      compact: options.viewport.isCompact(),
      audioDownload:
        session && hasDownload
          ? {
              href: session.recording.downloadSrc,
              fileName: `${session.recording.id}.${session.recording.format}`,
            }
          : null,
      videoDownload: activeVideo
        ? {
            href: activeVideo.downloadSrc,
            fileName: `${activeVideo.audioId}_${activeVideo.quality}.mp4`,
          }
        : null,
    })

    syncPlaybackRateControl()
    updateAudioProgress()
    updateMeta()
    options.onChange({ type: 'reader-chrome' })
  }

  const syncHighlight: PlaybackTimeline['syncHighlight'] = async (
    syncOptions = {}
  ) => {
    const session = audioController.session
    if (!session) return
    const scroll = syncOptions.scroll ?? options.getAutoScroll()

    if (session.cues.length) {
      const cueIndex = highlightController.getCueIndex(
        session.cues,
        syncOptions.currentTime ?? audioController.currentTime
      )
      if (cueIndex >= 0) {
        cueNavigationIndex = cueIndex
        await highlightController.activateCue(session.cues[cueIndex], {
          scroll,
          scrollBehavior: syncOptions.scrollBehavior,
        })
      }
      return
    }

    const activeTokenKey = highlightController.getActiveTokenKey()
    if (!activeTokenKey && session.tokenKeys[0]) {
      await highlightController.activateTokenKey(session.tokenKeys[0], {
        scroll,
        scrollBehavior: syncOptions.scrollBehavior,
      })
    }
  }

  const step = (delta: -1 | 1) => {
    const session = audioController.session
    if (!session) return

    if (session.cues.length) {
      const currentIndex =
        cueNavigationIndex ??
        highlightController.getCueIndex(
          session.cues,
          audioController.currentTime
        )
      const targetCue = session.cues[Math.max(0, currentIndex + delta)]
      if (!targetCue) return
      cueNavigationIndex = session.cues.indexOf(targetCue)
      audioController.seek(targetCue.timeStart)
      void highlightController.activateCue(targetCue, {
        scroll: options.getAutoScroll(),
      })
      return
    }

    audioController.seek(
      audioController.currentTime + delta * UNTIMED_PLAYBACK_SKIP_SECONDS
    )
    refresh('progress')
  }

  const toggle = async (retry?: () => Promise<void>) => {
    if (!audioController.audio.paused) {
      audioController.pause()
      refresh()
      return
    }

    const played = await options.attemptPlayback(retry)
    if (played) refresh()
  }

  const restart = async (restartAudio = true) => {
    const session = audioController.session
    if (!session) return

    const playback = restartAudio
      ? options.attemptReplayFromStart(() => restart(restartAudio))
      : null

    if (session.cues.length) {
      cueNavigationIndex = 0
      await highlightController.activateCue(session.cues[0], {
        scroll: true,
      })
    } else if (session.tokenKeys[0]) {
      await highlightController.activateTokenKey(session.tokenKeys[0], {
        scroll: true,
      })
    }

    if (playback) await playback
  }

  const command: PlaybackTimeline['command'] = async (nextCommand) => {
    switch (nextCommand.type) {
      case 'toggle':
        await toggle(nextCommand.retry)
        return
      case 'step':
        step(nextCommand.delta)
        return
      case 'set-rate':
        setPlaybackRate(nextCommand.rate, nextCommand.snap)
        return
      case 'set-cue-index':
        cueNavigationIndex = nextCommand.index
    }
  }

  const focusAfterAction = () => {
    if (expanded && options.viewport.isCompact()) return
    options.focusReader()
  }

  const seekTarget = (ratio: number) => {
    const { duration } = audioController
    if (!audioController.session || !Number.isFinite(duration) || duration <= 0) {
      return null
    }
    return Math.max(0, Math.min(1, ratio)) * duration
  }

  const previewSeek = (ratio: number) => {
    const targetTime = seekTarget(ratio)
    if (targetTime === null) return
    scrubPreviewTime = targetTime
    refresh('progress')
    void syncHighlight({
      currentTime: targetTime,
      scrollBehavior: 'auto',
    })
  }

  const commitSeek = (ratio: number) => {
    const targetTime = seekTarget(ratio)
    if (targetTime === null) return false
    audioController.seek(targetTime)
    refresh('progress')
    void syncHighlight({ currentTime: targetTime })
    return true
  }

  const finishSeek = () => {
    if (!scrubbing) return
    const targetTime = scrubPreviewTime
    scrubbing = false
    scrubPreviewTime = null
    scrubPointerId = null
    if (targetTime === null) return
    audioController.seek(targetTime)
    refresh('progress')
    void syncHighlight({ currentTime: targetTime })
    options.saveReadingPosition()
  }

  const setupDragging = () => {
    let position: FloatingPlayerPosition | null = null
    let defaultPosition: FloatingPlayerPosition | null = null
    let dragState: {
      pointerId: number
      pointerX: number
      pointerY: number
      playerLeft: number
      playerTop: number
    } | null = null

    const clearRenderedPosition = () => {
      player.setPosition(null)
    }

    const setPosition = (left: number, top: number) => {
      const rect = player.measure()
      const maxLeft = Math.max(
        FLOATING_PLAYER_VIEWPORT_MARGIN,
        view.innerWidth - rect.width - FLOATING_PLAYER_VIEWPORT_MARGIN
      )
      const maxTop = Math.max(
        FLOATING_PLAYER_VIEWPORT_MARGIN,
        view.innerHeight - rect.height - FLOATING_PLAYER_VIEWPORT_MARGIN
      )
      position = {
        left: Math.max(
          FLOATING_PLAYER_VIEWPORT_MARGIN,
          Math.min(left, maxLeft)
        ),
        top: Math.max(
          FLOATING_PLAYER_VIEWPORT_MARGIN,
          Math.min(top, maxTop)
        ),
      }
      player.setPosition(position)
    }

    const syncPositionForViewport = () => {
      if (options.viewport.isCompact()) {
        clearRenderedPosition()
        return
      }
      if (position) setPosition(position.left, position.top)
    }

    const resetPosition = () => {
      position = null
      clearRenderedPosition()
    }
    resetPlayerPosition = resetPosition

    const handleDragAction = (action: FloatingPlayerAction) => {
      switch (action.type) {
        case 'drag-start': {
          if (options.viewport.isCompact()) return
          const rect = action.playerRect
          if (!defaultPosition && !position) {
            defaultPosition = { left: rect.left, top: rect.top }
          }
          dragState = {
            pointerId: action.pointerId,
            pointerX: action.clientX,
            pointerY: action.clientY,
            playerLeft: rect.left,
            playerTop: rect.top,
          }
          player.setDragging(true)
          return
        }
        case 'drag-move':
          if (!dragState || dragState.pointerId !== action.pointerId) return
          setPosition(
            dragState.playerLeft + action.clientX - dragState.pointerX,
            dragState.playerTop + action.clientY - dragState.pointerY
          )
          return
        case 'drag-finish':
          if (!dragState || dragState.pointerId !== action.pointerId) return
          dragState = null
          player.setDragging(false)
          if (
            position &&
            defaultPosition &&
            Math.hypot(
              position.left - defaultPosition.left,
              position.top - defaultPosition.top
            ) <= FLOATING_PLAYER_SNAP_DISTANCE
          ) {
            resetPosition()
          }
          return
        case 'drag-cancel':
          dragState = null
          player.setDragging(false)
          return
        case 'drag-reset':
          resetPosition()
          return
        case 'drag-key': {
          if (options.viewport.isCompact()) return
          const rect = action.playerRect
          if (!defaultPosition && !position) {
            defaultPosition = { left: rect.left, top: rect.top }
          }
          const distance = action.shiftKey ? 40 : 12
          setPosition(
            rect.left + action.direction[0] * distance,
            rect.top + action.direction[1] * distance
          )
          return
        }
        case 'layout':
          syncPositionForViewport()
      }
    }

    scope.own(options.viewport.onChange(syncPositionForViewport))
    scope.own(() => {
      dragState = null
      player.setDragging(false)
      clearRenderedPosition()
      if (resetPlayerPosition === resetPosition) resetPlayerPosition = null
    })

    return handleDragAction
  }

  const setupViewportInteractions = () => {
    scope.own(
      options.viewport.onChange(() => {
        setExpanded(false, { restoreFocus: false })
      })
    )
  }

  const handleDragAction = setupDragging()
  setupViewportInteractions()
  handlePlayerAction = (action) => {
    switch (action.type) {
      case 'toggle-playback':
        void (async () => {
          await toggle(async () => {
            await options.attemptPlayback()
          })
          options.saveReadingPosition()
          focusAfterAction()
        })()
        return
      case 'step':
        step(action.delta)
        options.saveReadingPosition()
        focusAfterAction()
        return
      case 'restart':
        void (async () => {
          await restart()
          options.saveReadingPosition()
          focusAfterAction()
        })()
        return
      case 'seek-commit':
        if (!scrubbing && commitSeek(action.ratio)) {
          options.saveReadingPosition()
        }
        return
      case 'seek-preview':
        if (action.phase === 'start') {
          if (scrubPointerId !== null) return
          scrubbing = true
          scrubPointerId = action.pointerId
        }
        if (action.pointerId !== scrubPointerId) return
        previewSeek(action.ratio)
        return
      case 'seek-finish':
        if (action.pointerId !== scrubPointerId) return
        previewSeek(action.ratio)
        finishSeek()
        return
      case 'set-rate':
        setPlaybackRate(action.rate, action.snap)
        return
      case 'set-expanded':
        if (!audioController.session && action.expanded) return
        if (action.source === 'desktop' && options.viewport.isCompact()) return
        if (action.source === 'mobile' && !options.viewport.isCompact()) return
        setExpanded(action.expanded, { returnFocus: action.returnFocus })
        return
      case 'drag-start':
      case 'drag-move':
      case 'drag-finish':
      case 'drag-cancel':
      case 'drag-reset':
      case 'drag-key':
      case 'layout':
        handleDragAction(action)
    }
  }

  scope.own(
    audioController.on('playback-updated', () => {
      refresh()
    })
  )
  scope.own(
    audioController.on('session-loaded', (session) => {
      cueNavigationIndex = session.cues.length ? 0 : null
      highlightController.setSequence(session.tokenKeys)
      options.onChange({ type: 'session-loaded', session })
      refresh()
    })
  )
  scope.own(
    audioController.on('segment-updated', () => {
      options.onChange({ type: 'segment-updated' })
      refresh()
    })
  )
  scope.own(
    audioController.on('time-updated', () => {
      refresh('progress')
    })
  )
  scope.own(
    audioController.on('duration-updated', () => {
      refresh('progress')
    })
  )
  scope.own(
    audioController.on('playback-error', ({ error, recording }) => {
      options.onChange({ type: 'playback-error', error, recording })
      refresh()
    })
  )
  scope.own(
    audioController.on('frame-updated', ({ currentTime }) => {
      updateTimeline()
      if (options.isCueAuthoringRecording() || scrubbing) return
      const session = audioController.session
      if (!session?.cues.length) return

      const cueIndex = highlightController.getCueIndex(
        session.cues,
        currentTime
      )
      if (cueIndex < 0) return
      cueNavigationIndex = cueIndex
      const cue = session.cues[cueIndex]
      updateCueProgress(cueIndex)
      if (highlightController.getActiveTokenKey() === formatTokenKey(cue)) {
        return
      }
      void highlightController.activateCue(cue, {
        scroll: options.getAutoScroll(),
      })
    })
  )

  for (const eventName of [
    'loadedmetadata',
    'durationchange',
    'emptied',
  ] as const) {
    audioController.audio.addEventListener(
      eventName,
      () => refresh('progress'),
      { signal: scope.signal }
    )
  }
  scope.own(() => {
    if (focusFrame) view.cancelAnimationFrame(focusFrame)
    focusFrame = 0
    scrubbing = false
    scrubPreviewTime = null
    scrubPointerId = null
    expanded = false
    expansionReturnFocus = null
    closeSpeedPopover()
    player.sync({ expanded: false, compact: false })
    player.setDragging(false)
    document.documentElement.removeAttribute('data-mobile-player-expanded')
  })

  refresh()

  return {
    get displayTime() {
      return displayTime()
    },
    command,
    refresh,
    syncHighlight,
    closeOverlay() {
      if (expanded) {
        setExpanded(false)
        return true
      }
      closeSpeedPopover()
      return false
    },
  }
}
