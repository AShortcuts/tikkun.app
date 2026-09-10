import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import type {
  ReaderViewport,
  ReaderViewportMode,
} from '../adaptive/reader-viewport.ts'
import {
  AudioController,
  createActiveAudioSession,
  type ActiveAudioSession,
} from './audio-controller.ts'
import { HighlightController } from './highlight-controller.ts'
import { buildPlaybackPlan } from './playback-plan.ts'
import {
  createPlaybackTimeline,
  formatPlaybackDuration,
  type PlaybackTimeline,
  type PlaybackTimelineOptions,
} from './playback-timeline.ts'

const tokenKeys = ['1:0:0:0', '1:0:0:1']

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  document.documentElement.removeAttribute('data-mobile-player-expanded')
  vi.restoreAllMocks()
})

test('replacement mounts own one set of playback listeners and release them', async () => {
  const { audioController, highlightController } = createFixture()
  const viewport = createViewport()
  const mount = createMount()
  const firstPlay = vi.fn(async () => true)
  const secondPlay = vi.fn(async () => true)

  mount((scope) => {
    createPlaybackTimeline(
      scope,
      createOptions(audioController, highlightController, viewport, {
        attemptPlayback: firstPlay,
      })
    )
  })
  await audioController.loadSession(createSession())

  destroy = mount((scope) => {
    createPlaybackTimeline(
      scope,
      createOptions(audioController, highlightController, viewport, {
        attemptPlayback: secondPlay,
      })
    )
  })

  const activePlayButton = required<HTMLButtonElement>(
    '[data-target-id="floating-play"]'
  )
  activePlayButton.click()
  await flushPromises()

  expect(firstPlay).not.toHaveBeenCalled()
  expect(secondPlay).toHaveBeenCalledTimes(1)
  expect(viewport.listenerCount).toBe(2)

  destroy()
  destroy = null
  expect(activePlayButton.isConnected).toBe(false)
  activePlayButton.click()
  await flushPromises()

  expect(secondPlay).toHaveBeenCalledTimes(1)
  expect(viewport.listenerCount).toBe(0)
})

test('timed playback keeps controls, cue progress, highlighting, and speed in sync', async () => {
  const { audio, audioController, highlightController } = createFixture()
  const viewport = createViewport()
  const playbackRate = { value: 1 }
  const onPlaybackRateChange = vi.fn((rate: number) => {
    playbackRate.value = rate
  })
  let timeline: PlaybackTimeline | null = null

  destroy = createMount()((scope) => {
    timeline = createPlaybackTimeline(
      scope,
      createOptions(audioController, highlightController, viewport, {
        getPlaybackRate: () => playbackRate.value,
        onPlaybackRateChange,
      })
    )
  })
  await audioController.loadSession(createSession())

  const player = required<HTMLElement>('[data-target-id="floating-player"]')
  expect(player.classList.contains('u-hidden')).toBe(false)
  expect(player.dataset.cueMode).toBe('timed')
  expect(
    required('[data-target-id="floating-player-title-desktop"]').textContent
  ).toContain('Beresheet')
  expect(required('[data-target-id="floating-player-mode"]').textContent).toBe(
    'Word cues'
  )
  expect(required('[data-target-id="mobile-player-word-progress"]').textContent).toBe(
    'Word 1 of 2'
  )

  required<HTMLButtonElement>('[data-target-id="floating-next"]').click()
  await flushPromises()

  expect(audio.currentTime).toBe(3.25)
  expect(highlightController.getActiveTokenKey()).toBe(tokenKeys[1])
  expect(required('[data-target-id="mobile-player-word-progress"]').textContent).toBe(
    'Word 2 of 2'
  )

  await timeline!.command({ type: 'set-rate', rate: 1.47, snap: true })
  expect(onPlaybackRateChange).toHaveBeenLastCalledWith(1.5)
  expect(audio.playbackRate).toBe(1.5)
  expect(required('[data-target-id="floating-speed-compact-label"]').textContent).toBe(
    '1.5x'
  )
})

test('restart begins playback before asynchronous highlighting completes', async () => {
  const { audioController, highlightController } = createFixture()
  const viewport = createViewport()
  const attemptReplayFromStart = vi.fn(async () => true)
  let finishHighlight!: () => void
  const highlightPending = new Promise<void>((resolve) => {
    finishHighlight = resolve
  })

  destroy = createMount()((scope) => {
    createPlaybackTimeline(
      scope,
      createOptions(audioController, highlightController, viewport, {
        attemptReplayFromStart,
      })
    )
  })
  await audioController.loadSession(createSession())
  vi.spyOn(highlightController, 'activateCue').mockImplementation(async () => {
    await highlightPending
    return null
  })

  required<HTMLButtonElement>('[data-target-id="floating-replay"]').click()

  expect(attemptReplayFromStart).toHaveBeenCalledTimes(1)
  finishHighlight()
  await flushPromises()
})

test('untimed playback steps by ten seconds and compact expansion cleans up', async () => {
  const { audio, audioController, highlightController } = createFixture()
  const viewport = createViewport('compact')
  let timeline: PlaybackTimeline | null = null

  destroy = createMount()((scope) => {
    timeline = createPlaybackTimeline(
      scope,
      createOptions(audioController, highlightController, viewport)
    )
  })
  await audioController.loadSession(createSession([]))

  const player = required<HTMLElement>('[data-target-id="floating-player"]')
  expect(player.dataset.cueMode).toBe('untimed')
  expect(player.classList.contains('mod-untimed')).toBe(true)
  expect(
    required<HTMLButtonElement>('[data-target-id="floating-next"]').ariaLabel
  ).toBe('Forward 10 seconds')

  required<HTMLButtonElement>('[data-target-id="floating-next"]').click()
  expect(audio.currentTime).toBe(10)

  required<HTMLButtonElement>('[data-target-id="floating-mobile-expand"]').click()
  expect(player.classList.contains('is-expanded')).toBe(true)
  expect(
    document.documentElement.hasAttribute('data-mobile-player-expanded')
  ).toBe(true)

  viewport.setMode('wide')
  expect(player.classList.contains('is-expanded')).toBe(false)
  expect(
    document.documentElement.hasAttribute('data-mobile-player-expanded')
  ).toBe(false)

  viewport.setMode('compact')
  required<HTMLButtonElement>('[data-target-id="floating-mobile-expand"]').click()
  expect(timeline!.closeOverlay()).toBe(true)
  expect(player.classList.contains('is-expanded')).toBe(false)

  destroy()
  destroy = null
  expect(viewport.listenerCount).toBe(0)
  expect(player.classList.contains('is-dragging')).toBe(false)
})

test('formats finite, invalid, and hour-long playback durations', () => {
  expect(formatPlaybackDuration(65.9)).toBe('1:05')
  expect(formatPlaybackDuration(3661)).toBe('1:01:01')
  expect(formatPlaybackDuration(Number.POSITIVE_INFINITY)).toBe('--:--')
})

test('passage playback clears highlights in untimed gaps and keeps the selected reading title', async () => {
  const { audio, audioController, highlightController } = createFixture()
  const viewport = createViewport()
  destroy = createMount()(scope => {
    createPlaybackTimeline(scope, createOptions(audioController, highlightController, viewport))
  })
  const session = createSession([{ ...cue(tokenKeys[0], 0), timeEnd: 1 }])
  session.status = 'partial-passage'
  session.readingLabel = 'Nitzavim-Vayelech'
  const range = { start: { scroll: 'torah' as const, b: 5, c: 31, v: 1 }, end: { scroll: 'torah' as const, b: 5, c: 31, v: 6 } }
  session.passage = { range, requestedRange: range, cueComplete: false }
  await audioController.loadSession(session)
  audioController.seek(0.5)
  await flushPromises()
  expect(highlightController.getActiveTokenKey()).toBe(tokenKeys[0])
  audioController.seek(2)
  await flushPromises()
  expect(highlightController.getActiveTokenKey()).toBeNull()
  expect(required('[data-target-id="floating-player-title-desktop"]').textContent).toContain('Nitzavim-Vayelech')
  expect(required('[data-target-id="floating-player-title-mobile"]').textContent).toContain('available portion')
  expect(audio.currentTime).toBe(2)
})

test('passage word progress uses the actual word position after missing cues', async () => {
  const { audioController, highlightController } = createFixture()
  destroy = createMount()(scope => {
    createPlaybackTimeline(scope, createOptions(audioController, highlightController, createViewport()))
  })
  const range = { start: { scroll: 'torah' as const, b: 5, c: 31, v: 1 }, end: { scroll: 'torah' as const, b: 5, c: 31, v: 6 } }
  const session = createActiveAudioSession({
    target: { runId: 'run', index: 1 }, tokenKeys, status: 'passage',
    passage: { range, requestedRange: range, cueComplete: false },
    segments: [{ recording, tokenKeys, cues: [cue(tokenKeys[1], 3)], startTime: 0, endTime: null }],
  })
  await audioController.loadSession(session)
  audioController.seek(0)
  await flushPromises()
  expect(required('[data-target-id="mobile-player-word-progress"]').textContent).toBe('Word 0 of 2')
  audioController.seek(3)
  await flushPromises()
  expect(required('[data-target-id="mobile-player-word-progress"]').textContent).toBe('Word 2 of 2')
})

function createFixture() {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <div class="reader-corner-controls"></div>
    <main data-target-id="tikkun-book" tabindex="-1">
      <span class="word" data-token-key="${tokenKeys[0]}">First</span>
      <span class="word" data-token-key="${tokenKeys[1]}">Second</span>
    </main>
    <div data-target-id="floating-player-root"></div>
    <audio data-target-id="reader-audio"></audio>
  `
  document.body.appendChild(fixture)

  const audio = required<HTMLAudioElement>('[data-target-id="reader-audio"]')
  let currentTime = 0
  Object.defineProperties(audio, {
    currentTime: {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value
      },
    },
    duration: {
      configurable: true,
      get: () => 20,
    },
    readyState: {
      configurable: true,
      get: () => HTMLMediaElement.HAVE_METADATA,
    },
  })
  vi.spyOn(audio, 'load').mockImplementation(() => {})

  const audioController = new AudioController(audio)
  const highlightController = new HighlightController(
    required('[data-target-id="tikkun-book"]')
  )
  return { audio, audioController, highlightController }
}

function createOptions(
  audioController: AudioController,
  highlightController: HighlightController,
  viewport: TestViewport,
  overrides: Partial<PlaybackTimelineOptions> = {}
): PlaybackTimelineOptions {
  const playbackRate = { value: 1 }
  return {
    document,
    view: window,
    audioController,
    highlightController,
    viewport,
    getAutoScroll: () => false,
    getPlaybackRate: () => playbackRate.value,
    onPlaybackRateChange: (rate) => {
      playbackRate.value = rate
    },
    attemptPlayback: async () => true,
    attemptReplayFromStart: async () => true,
    isCueAuthoringRecording: () => false,
    saveReadingPosition: () => {},
    focusReader: () => {},
    restoreFocus: () => {},
    onChange: () => {},
    ...overrides,
  }
}

function createSession(cues: WordCue[] = timedCues()): ActiveAudioSession {
  const plan = buildPlaybackPlan({
    target: { runId: 'run', index: 1 },
    tokenKeys,
    current: {
      recording,
      cues,
    },
  })
  if (!plan) throw new Error('Test playback plan was not created')
  return createActiveAudioSession(plan)
}

function timedCues(): WordCue[] {
  return [
    cue(tokenKeys[0], 0),
    cue(tokenKeys[1], 3.25),
  ]
}

function cue(tokenKey: string, timeStart: number): WordCue {
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = tokenKey
    .split(':')
    .map(Number)
  return {
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
    timeStart,
  }
}

const recording: ParshaAudioRecording = {
  id: 'beresheet-1-test',
  narratorId: 'test-reader',
  reading: {
    kind: 'parsha',
    id: 'beresheet',
    name: 'Beresheet',
  },
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
  aliyah: 1,
  title: 'Beresheet 1',
  playSrc: '/beresheet-1-test.mp3',
  downloadSrc: '/beresheet-1-test.mp3',
  format: 'mp3',
  status: 'available',
}

type TestViewport = ReaderViewport & {
  readonly listenerCount: number
  setMode(mode: ReaderViewportMode): void
}

function createViewport(
  initialMode: ReaderViewportMode = 'wide'
): TestViewport {
  let mode = initialMode
  const listeners = new Set<(mode: ReaderViewportMode) => void>()

  return {
    get mode() {
      return mode
    },
    get listenerCount() {
      return listeners.size
    },
    isCompact: () => mode === 'compact',
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setMode(nextMode) {
      if (mode === nextMode) return
      mode = nextMode
      for (const listener of [...listeners]) listener(mode)
    },
  }
}

function required<ElementType extends Element = HTMLElement>(selector: string) {
  const element = fixture?.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
