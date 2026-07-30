import { flushSync, mount, unmount } from 'svelte'
import type { AudioRecording } from '../audio/types.ts'
import { getCueProgress, getWordProgress } from '../audio/progress.ts'
import { iconMarkup, type IconName } from '../components/icons.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import { formatTokenKey } from '../reader/token-position.ts'
import { findVideoForRecording } from '../video/library.ts'
import type { ReaderViewport } from '../adaptive/reader-viewport.ts'
import { formatAliyahLabel } from './aliyah-navigation/model.ts'
import {
  type ActiveAudioSession,
  AudioController,
} from './audio-controller.ts'
import FloatingPlayerView from './FloatingPlayer.svelte'
import { HighlightController } from './highlight-controller.ts'

const PLAYBACK_RATE_MIN = 0.5
const PLAYBACK_RATE_MAX = 3
const PLAYBACK_RATE_MAGNET_THRESHOLD = 0.09
const PLAYBACK_RATE_MARKS = [0.5, 1, 1.5, 2, 3] as const
const UNTIMED_PLAYBACK_SKIP_SECONDS = 10
const FLOATING_PLAYER_VIEWPORT_MARGIN = 8
const FLOATING_PLAYER_SNAP_DISTANCE = 56

type FloatingPlayerPosition = {
  left: number
  top: number
}

export type PlaybackTimelineChange =
  | { type: 'reader-chrome' }
  | { type: 'aliyah-playback' }
  | { type: 'session-loaded'; session: ActiveAudioSession }
  | { type: 'segment-updated' }
  | { type: 'playback-error'; error: Error; recording: AudioRecording }
  | { type: 'offline-media-error'; retry: () => Promise<void> }

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
  playNetworkRecording(retry?: () => Promise<void>): Promise<boolean>
  replayNetworkRecordingFromStart(retry?: () => Promise<void>): Promise<boolean>
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

type PlayerElements = {
  player: HTMLElement
  cornerControls: HTMLElement | null
  previous: HTMLButtonElement
  play: HTMLButtonElement
  next: HTMLButtonElement
  replay: HTMLButtonElement
  dragHandle: HTMLButtonElement
  expand: HTMLButtonElement
  mobileExpand: HTMLButtonElement
  mobileClose: HTMLButtonElement
  backdrop: HTMLButtonElement
  download: HTMLAnchorElement
  videoDownload: HTMLAnchorElement
  desktopTitle: HTMLElement
  mobileTitle: HTMLElement
  subtitle: HTMLElement
  mobileReading: HTMLElement
  mode: HTMLElement
  cueProgress: HTMLElement
  wordProgress: HTMLElement
  mobileWordProgress: HTMLElement
  statusWrap: HTMLElement
  status: HTMLElement
  seek: HTMLInputElement
  currentTime: HTMLElement
  duration: HTMLElement
  speedToggle: HTMLButtonElement
  speedLabel: HTMLElement
  speedCompactLabel: HTMLElement
  speedPopover: HTMLElement
  speedSlider: HTMLInputElement
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
  mountFloatingPlayer(scope, document)
  const elements = getPlayerElements(document)
  let cueNavigationIndex: number | null = null
  let expanded = false
  let expansionReturnFocus: HTMLElement | null = null
  let resetPlayerPosition: (() => void) | null = null
  let scrubbing = false
  let scrubPreviewTime: number | null = null
  let scrubPointerId: number | null = null
  let focusFrame = 0

  const setControlIcon = (element: HTMLElement, icon: IconName) => {
    element.innerHTML = iconMarkup(icon)
  }

  const scheduleFocus = (focus: () => void) => {
    if (focusFrame) view.cancelAnimationFrame(focusFrame)
    focusFrame = view.requestAnimationFrame(() => {
      focusFrame = 0
      if (!scope.signal.aborted) focus()
    })
  }

  const closeSpeedPopover = () => {
    elements.speedPopover.classList.add('u-hidden')
    elements.speedToggle.setAttribute('aria-expanded', 'false')
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
    elements.player.style.setProperty('--audio-progress-ratio', `${progress}`)

    if (!scrubbing) {
      elements.seek.value = `${Math.round(progress * 1000)}`
      elements.seek.disabled =
        !audioController.session || !Number.isFinite(duration)
    }
    elements.seek.setAttribute(
      'aria-valuetext',
      `${formatPlaybackDuration(currentTime)} of ${formatPlaybackDuration(duration)}`
    )
    elements.currentTime.textContent = formatPlaybackDuration(currentTime)
    elements.duration.textContent = formatPlaybackDuration(duration)
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

    elements.player.style.setProperty(
      '--cue-progress-ratio',
      `${wordProgress.ratio}`
    )
    elements.wordProgress.textContent = wordProgress.label
    elements.cueProgress.textContent = cueProgress.label
    elements.cueProgress.classList.toggle('u-hidden', cueProgress.total === 0)
    elements.mobileWordProgress.textContent =
      `Word ${wordProgress.current} of ${wordProgress.total}`
    elements.mobileWordProgress.classList.toggle(
      'u-hidden',
      !session?.cues.length || wordProgress.total === 0
    )
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
      elements.desktopTitle.textContent = '—'
      elements.mobileTitle.textContent = '—'
      elements.subtitle.textContent = 'Audio'
      elements.mobileReading.textContent = '—'
      elements.mode.textContent = 'No cues'
      elements.wordProgress.textContent = '0 / 0'
      elements.statusWrap.classList.add('u-hidden')
      elements.status.textContent = ''
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

    elements.desktopTitle.textContent = `${readingLabel} · ${aliyahLabel}`
    elements.mobileTitle.textContent = aliyahLabel
    elements.subtitle.textContent = 'Audio'
    elements.mobileReading.textContent = readingLabel
    elements.mode.textContent = session.cues.length ? 'Word cues' : 'No cues'
    elements.statusWrap.classList.toggle('u-hidden', !statusLabel)
    elements.status.textContent = statusLabel
    elements.wordProgress.textContent = wordProgress.label
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

  const formatPlaybackRate = (rate: number) => {
    const rounded = Math.round(clampPlaybackRate(rate) * 100) / 100
    return `${rounded.toFixed(2).replace(/\.?0+$/, '')}x`
  }

  const syncPlaybackRateControl = () => {
    const rate = clampPlaybackRate(options.getPlaybackRate())
    const formattedRate = formatPlaybackRate(rate)
    elements.speedLabel.textContent = `${formattedRate} speed`
    elements.speedCompactLabel.textContent = formattedRate
    const buttonLabel = `Playback speed, ${formattedRate}`
    elements.speedToggle.title = buttonLabel
    elements.speedToggle.setAttribute('aria-label', buttonLabel)
    elements.speedSlider.value = `${rate}`
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
    const nextExpanded =
      next && !elements.player.classList.contains('u-hidden')

    if (nextExpanded && isCompact && !wasExpanded) {
      const activeElement =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null
      expansionReturnFocus = returnFocus ?? activeElement
    }
    expanded = nextExpanded

    elements.player.classList.toggle('is-expanded', nextExpanded)
    elements.player.classList.toggle(
      'mod-expandable',
      !elements.player.classList.contains('u-hidden')
    )
    if (!nextExpanded && wasExpanded && !isCompact) {
      resetPlayerPosition?.()
    }
    elements.player.removeAttribute('title')
    elements.player.setAttribute(
      'aria-label',
      nextExpanded && isCompact ? 'Expanded audio player' : 'Audio player'
    )
    document.documentElement.toggleAttribute(
      'data-mobile-player-expanded',
      nextExpanded && isCompact
    )

    const expandLabel = nextExpanded ? 'Collapse player' : 'Expand player'
    setControlIcon(elements.expand, nextExpanded ? 'minimize2' : 'expand')
    elements.expand.title = expandLabel
    elements.expand.setAttribute('aria-label', expandLabel)
    elements.expand.setAttribute('aria-expanded', `${nextExpanded}`)
    elements.mobileExpand.setAttribute(
      'aria-expanded',
      `${nextExpanded}`
    )
    elements.backdrop.setAttribute(
      'aria-hidden',
      `${!nextExpanded || !isCompact}`
    )

    if (nextExpanded && isCompact && !wasExpanded) {
      scheduleFocus(() => elements.mobileClose.focus({ preventScroll: true }))
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

    elements.player.classList.toggle('u-hidden', !session)
    elements.player.classList.toggle(
      'mod-untimed',
      Boolean(session && !hasTimedCues)
    )
    elements.player.dataset.cueMode = hasTimedCues ? 'timed' : 'untimed'
    if (!session) setExpanded(false, { restoreFocus: false })
    elements.cornerControls?.classList.toggle('mod-raised', Boolean(session))
    elements.player.classList.toggle(
      'is-playing',
      Boolean(session && !paused)
    )

    setControlIcon(elements.play, paused ? 'play' : 'pause')
    setControlIcon(
      elements.previous,
      hasTimedCues ? 'arrowRight' : 'rewind10'
    )
    setControlIcon(
      elements.next,
      hasTimedCues ? 'arrowLeft' : 'forward10'
    )
    const playLabel = paused ? 'Play' : 'Pause'
    const previousLabel = hasTimedCues
      ? 'Previous Word'
      : `Back ${UNTIMED_PLAYBACK_SKIP_SECONDS} seconds`
    const nextLabel = hasTimedCues
      ? 'Next Word'
      : `Forward ${UNTIMED_PLAYBACK_SKIP_SECONDS} seconds`

    elements.play.title = playLabel
    elements.play.setAttribute('aria-label', playLabel)
    for (const [button, label] of [
      [elements.previous, previousLabel],
      [elements.next, nextLabel],
      [elements.replay, 'Restart recording'],
    ] as const) {
      button.title = label
      button.setAttribute('aria-label', label)
    }
    for (const button of [
      elements.previous,
      elements.play,
      elements.next,
      elements.replay,
      elements.expand,
      elements.mobileExpand,
    ]) {
      button.disabled = !session
    }

    elements.download.classList.toggle('u-hidden', !hasDownload)
    elements.download.setAttribute(
      'aria-disabled',
      hasDownload ? 'false' : 'true'
    )
    elements.download.tabIndex = hasDownload ? 0 : -1
    if (session && hasDownload) {
      elements.download.href = session.recording.downloadSrc
      elements.download.download =
        `${session.recording.id}.${session.recording.format}`
    } else {
      elements.download.href = '#'
      elements.download.removeAttribute('download')
    }

    elements.videoDownload.classList.toggle('u-hidden', !activeVideo)
    elements.videoDownload.setAttribute(
      'aria-disabled',
      activeVideo ? 'false' : 'true'
    )
    elements.videoDownload.tabIndex = activeVideo ? 0 : -1
    if (activeVideo) {
      elements.videoDownload.href = activeVideo.downloadSrc
      elements.videoDownload.download =
        `${activeVideo.audioId}_${activeVideo.quality}.mp4`
    } else {
      elements.videoDownload.href = '#'
      elements.videoDownload.removeAttribute('download')
    }

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

    const played = await options.playNetworkRecording(retry)
    if (played) refresh()
  }

  const restart = async (restartAudio = true) => {
    const session = audioController.session
    if (!session) return

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

    if (restartAudio) {
      await options.replayNetworkRecordingFromStart(() =>
        restart(restartAudio)
      )
    }
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

  const seekTarget = () => {
    const { duration } = audioController
    if (!audioController.session || !Number.isFinite(duration) || duration <= 0) {
      return null
    }
    return (Number.parseFloat(elements.seek.value) / 1000) * duration
  }

  const previewSeek = () => {
    const targetTime = seekTarget()
    if (targetTime === null) return
    scrubPreviewTime = targetTime
    refresh('progress')
    void syncHighlight({
      currentTime: targetTime,
      scrollBehavior: 'auto',
    })
  }

  const commitSeek = (targetTime = seekTarget()) => {
    if (targetTime === null) return false
    audioController.seek(targetTime)
    refresh('progress')
    void syncHighlight({ currentTime: targetTime })
    return true
  }

  const seekFromPointer = (clientX: number) => {
    const rect = elements.seek.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    elements.seek.value = `${Math.round(ratio * 1000)}`
    previewSeek()
  }

  const finishSeek = () => {
    if (!scrubbing) return
    const targetTime = scrubPreviewTime ?? seekTarget()
    scrubbing = false
    scrubPreviewTime = null
    scrubPointerId = null
    if (commitSeek(targetTime)) options.saveReadingPosition()
  }

  const playbackRateFromPointer = (clientX: number) => {
    const rect = elements.speedSlider.getBoundingClientRect()
    const ratio = (clientX - rect.left) / Math.max(rect.width, 1)
    return (
      PLAYBACK_RATE_MIN +
      Math.max(0, Math.min(1, ratio)) *
        (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN)
    )
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
      elements.player.style.removeProperty('left')
      elements.player.style.removeProperty('top')
    }

    const setPosition = (left: number, top: number) => {
      const rect = elements.player.getBoundingClientRect()
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
      elements.player.style.left = `${position.left}px`
      elements.player.style.top = `${position.top}px`
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

    elements.dragHandle.addEventListener(
      'pointerdown',
      (event) => {
        if (options.viewport.isCompact() || event.button !== 0) return
        event.preventDefault()
        const rect = elements.player.getBoundingClientRect()
        if (!defaultPosition && !position) {
          defaultPosition = { left: rect.left, top: rect.top }
        }
        dragState = {
          pointerId: event.pointerId,
          pointerX: event.clientX,
          pointerY: event.clientY,
          playerLeft: rect.left,
          playerTop: rect.top,
        }
        elements.player.classList.add('is-dragging')
      },
      { signal: scope.signal }
    )
    view.addEventListener(
      'pointermove',
      (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return
        setPosition(
          dragState.playerLeft + event.clientX - dragState.pointerX,
          dragState.playerTop + event.clientY - dragState.pointerY
        )
      },
      { signal: scope.signal }
    )

    const finishDrag = (event: PointerEvent) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return
      dragState = null
      elements.player.classList.remove('is-dragging')
      if (!position || !defaultPosition) return
      if (
        Math.hypot(
          position.left - defaultPosition.left,
          position.top - defaultPosition.top
        ) <= FLOATING_PLAYER_SNAP_DISTANCE
      ) {
        resetPosition()
      }
    }
    view.addEventListener('pointerup', finishDrag, { signal: scope.signal })
    view.addEventListener('pointercancel', finishDrag, {
      signal: scope.signal,
    })
    view.addEventListener(
      'blur',
      () => {
        dragState = null
        elements.player.classList.remove('is-dragging')
      },
      { signal: scope.signal }
    )
    elements.dragHandle.addEventListener('dblclick', resetPosition, {
      signal: scope.signal,
    })
    elements.dragHandle.addEventListener(
      'keydown',
      (event) => {
        if (options.viewport.isCompact()) return
        if (event.key === 'Home') {
          event.preventDefault()
          resetPosition()
          return
        }
        const direction = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[event.key]
        if (!direction) return

        event.preventDefault()
        const rect = elements.player.getBoundingClientRect()
        if (!defaultPosition && !position) {
          defaultPosition = { left: rect.left, top: rect.top }
        }
        const distance = event.shiftKey ? 40 : 12
        setPosition(
          rect.left + direction[0] * distance,
          rect.top + direction[1] * distance
        )
      },
      { signal: scope.signal }
    )

    scope.own(options.viewport.onChange(syncPositionForViewport))
    view.addEventListener('resize', syncPositionForViewport, {
      signal: scope.signal,
    })
    const resizeObserver = new ResizeObserver(syncPositionForViewport)
    resizeObserver.observe(elements.player)
    scope.own(() => resizeObserver.disconnect())
    scope.own(() => {
      dragState = null
      elements.player.classList.remove('is-dragging')
      clearRenderedPosition()
      if (resetPlayerPosition === resetPosition) resetPlayerPosition = null
    })
  }

  const setupViewportInteractions = () => {
    elements.expand.addEventListener(
      'click',
      () => {
        if (!audioController.session || options.viewport.isCompact()) return
        setExpanded(!expanded)
      },
      { signal: scope.signal }
    )
    elements.mobileExpand.addEventListener(
      'click',
      () => {
        if (!audioController.session || !options.viewport.isCompact()) return
        setExpanded(true, { returnFocus: elements.mobileExpand })
      },
      { signal: scope.signal }
    )
    elements.mobileClose.addEventListener(
      'click',
      () => setExpanded(false),
      { signal: scope.signal }
    )
    elements.backdrop.addEventListener(
      'click',
      () => setExpanded(false),
      { signal: scope.signal }
    )
    scope.own(
      options.viewport.onChange(() => {
        setExpanded(false, { restoreFocus: false })
      })
    )
  }

  const setupControls = () => {
    elements.play.addEventListener(
      'click',
      async () => {
        await toggle(async () => {
          await options.playNetworkRecording()
        })
        options.saveReadingPosition()
        focusAfterAction()
      },
      { signal: scope.signal }
    )
    elements.previous.addEventListener(
      'click',
      () => {
        step(-1)
        options.saveReadingPosition()
        focusAfterAction()
      },
      { signal: scope.signal }
    )
    elements.next.addEventListener(
      'click',
      () => {
        step(1)
        options.saveReadingPosition()
        focusAfterAction()
      },
      { signal: scope.signal }
    )
    elements.replay.addEventListener(
      'click',
      async () => {
        await restart()
        options.saveReadingPosition()
        focusAfterAction()
      },
      { signal: scope.signal }
    )

    elements.seek.addEventListener(
      'input',
      () => {
        if (scrubbing) return
        if (commitSeek()) options.saveReadingPosition()
      },
      { signal: scope.signal }
    )
    elements.seek.addEventListener(
      'pointerdown',
      (event) => {
        if (
          event.button !== 0 ||
          elements.seek.disabled ||
          scrubPointerId !== null
        ) {
          return
        }
        event.preventDefault()
        scrubbing = true
        scrubPointerId = event.pointerId
        elements.seek.focus({ preventScroll: true })
        elements.seek.setPointerCapture(event.pointerId)
        seekFromPointer(event.clientX)
      },
      { signal: scope.signal }
    )
    elements.seek.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerId !== scrubPointerId) return
        seekFromPointer(event.clientX)
      },
      { signal: scope.signal }
    )
    elements.seek.addEventListener(
      'pointerup',
      (event) => {
        if (event.pointerId !== scrubPointerId) return
        seekFromPointer(event.clientX)
        finishSeek()
        if (elements.seek.hasPointerCapture(event.pointerId)) {
          elements.seek.releasePointerCapture(event.pointerId)
        }
      },
      { signal: scope.signal }
    )
    elements.seek.addEventListener(
      'pointercancel',
      (event) => {
        if (event.pointerId !== scrubPointerId) return
        finishSeek()
        if (elements.seek.hasPointerCapture(event.pointerId)) {
          elements.seek.releasePointerCapture(event.pointerId)
        }
      },
      { signal: scope.signal }
    )
    elements.seek.addEventListener(
      'lostpointercapture',
      () => {
        if (scrubbing) finishSeek()
      },
      { signal: scope.signal }
    )
    elements.seek.addEventListener(
      'change',
      () => {
        if (!scrubbing) updateAudioProgress()
      },
      { signal: scope.signal }
    )

    elements.speedToggle.addEventListener(
      'click',
      () => {
        const opening = elements.speedPopover.classList.contains('u-hidden')
        elements.speedPopover.classList.toggle('u-hidden', !opening)
        elements.speedToggle.setAttribute('aria-expanded', `${opening}`)
        syncPlaybackRateControl()
        if (opening) {
          elements.speedSlider.focus({ preventScroll: true })
        }
      },
      { signal: scope.signal }
    )
    document.addEventListener(
      'pointerdown',
      (event) => {
        const target = event.target as HTMLElement
        if (elements.speedPopover.classList.contains('u-hidden')) return
        if (target.closest('.floating-speed-control')) return
        closeSpeedPopover()
      },
      { signal: scope.signal }
    )
    elements.speedSlider.addEventListener(
      'input',
      () => {
        setPlaybackRate(Number.parseFloat(elements.speedSlider.value), true)
      },
      { signal: scope.signal }
    )
    elements.speedSlider.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault()
        elements.speedSlider.setPointerCapture(event.pointerId)
        setPlaybackRate(playbackRateFromPointer(event.clientX), true)
      },
      { signal: scope.signal }
    )
    elements.speedSlider.addEventListener(
      'pointermove',
      (event) => {
        if (!elements.speedSlider.hasPointerCapture(event.pointerId)) return
        setPlaybackRate(playbackRateFromPointer(event.clientX), true)
      },
      { signal: scope.signal }
    )
    elements.speedSlider.addEventListener(
      'pointerup',
      (event) => {
        if (elements.speedSlider.hasPointerCapture(event.pointerId)) {
          elements.speedSlider.releasePointerCapture(event.pointerId)
        }
        setPlaybackRate(playbackRateFromPointer(event.clientX), true)
      },
      { signal: scope.signal }
    )
    elements.speedSlider.addEventListener(
      'pointercancel',
      (event) => {
        if (elements.speedSlider.hasPointerCapture(event.pointerId)) {
          elements.speedSlider.releasePointerCapture(event.pointerId)
        }
      },
      { signal: scope.signal }
    )
    elements.speedSlider.addEventListener(
      'change',
      () => {
        setPlaybackRate(Number.parseFloat(elements.speedSlider.value), true)
      },
      { signal: scope.signal }
    )
  }

  setupDragging()
  setupViewportInteractions()
  setupControls()

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
  audioController.audio.addEventListener(
    'error',
    () => {
      if (view.navigator.onLine || !audioController.session) return
      options.onChange({
        type: 'offline-media-error',
        retry: async () => {
          await options.playNetworkRecording()
        },
      })
    },
    { signal: scope.signal }
  )

  scope.own(() => {
    if (focusFrame) view.cancelAnimationFrame(focusFrame)
    focusFrame = 0
    scrubbing = false
    scrubPreviewTime = null
    if (
      scrubPointerId !== null &&
      elements.seek.hasPointerCapture(scrubPointerId)
    ) {
      elements.seek.releasePointerCapture(scrubPointerId)
    }
    scrubPointerId = null
    expanded = false
    expansionReturnFocus = null
    closeSpeedPopover()
    elements.player.classList.remove('is-expanded', 'is-dragging')
    elements.player.style.removeProperty('--audio-progress-ratio')
    elements.player.style.removeProperty('--cue-progress-ratio')
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

function mountFloatingPlayer(scope: MountScope, document: Document) {
  const target = document.querySelector<HTMLElement>(
    '[data-target-id="floating-player-root"]'
  )
  if (!target) {
    throw new Error(
      'Missing Playback Timeline target: [data-target-id="floating-player-root"]'
    )
  }
  if (target.childNodes.length) {
    throw new Error('Playback Timeline requires an empty player root')
  }

  const component = mount(FloatingPlayerView, { target })
  flushSync()
  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Floating Player', error)
    })
  })
}

function getPlayerElements(document: Document): PlayerElements {
  const required = <ElementType extends Element>(selector: string) => {
    const element = document.querySelector<ElementType>(selector)
    if (!element) {
      throw new Error(`Missing Playback Timeline target: ${selector}`)
    }
    return element
  }

  return {
    player: required('[data-target-id="floating-player"]'),
    cornerControls: document.querySelector('.reader-corner-controls'),
    previous: required('[data-target-id="floating-prev"]'),
    play: required('[data-target-id="floating-play"]'),
    next: required('[data-target-id="floating-next"]'),
    replay: required('[data-target-id="floating-replay"]'),
    dragHandle: required('[data-target-id="floating-drag-handle"]'),
    expand: required('[data-target-id="floating-expand-toggle"]'),
    mobileExpand: required('[data-target-id="floating-mobile-expand"]'),
    mobileClose: required('[data-target-id="floating-mobile-close"]'),
    backdrop: required('[data-target-id="floating-player-backdrop"]'),
    download: required('[data-target-id="floating-download"]'),
    videoDownload: required('[data-target-id="floating-video-download"]'),
    desktopTitle: required(
      '[data-target-id="floating-player-title-desktop"]'
    ),
    mobileTitle: required(
      '[data-target-id="floating-player-title-mobile"]'
    ),
    subtitle: required('[data-target-id="floating-player-subtitle"]'),
    mobileReading: required('[data-target-id="floating-player-parsha"]'),
    mode: required('[data-target-id="floating-player-mode"]'),
    cueProgress: required(
      '[data-target-id="floating-player-cue-progress"]'
    ),
    wordProgress: required('[data-target-id="floating-meta-cues"]'),
    mobileWordProgress: required(
      '[data-target-id="mobile-player-word-progress"]'
    ),
    statusWrap: required('[data-target-id="floating-meta-status-wrap"]'),
    status: required('[data-target-id="floating-meta-status"]'),
    seek: required('[data-target-id="mobile-player-seek"]'),
    currentTime: required('[data-target-id="mobile-player-current-time"]'),
    duration: required('[data-target-id="mobile-player-duration"]'),
    speedToggle: required('[data-target-id="floating-speed-toggle"]'),
    speedLabel: required('[data-target-id="floating-speed-label"]'),
    speedCompactLabel: required(
      '[data-target-id="floating-speed-compact-label"]'
    ),
    speedPopover: required('[data-target-id="floating-speed-popover"]'),
    speedSlider: required('[data-target-id="floating-speed-slider"]'),
  }
}
