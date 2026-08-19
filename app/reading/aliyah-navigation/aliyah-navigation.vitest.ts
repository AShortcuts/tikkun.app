import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../../lifecycle/mount.ts'
import {
  ALIYAH_RAIL_AUTO_HIDE_MS,
  createAliyahNavigation,
  getMobileAliyahCapsuleState,
  type AliyahNavigation,
  type AliyahNavigationOptions,
} from './aliyah-navigation.ts'
import type {
  AliyahNavigationPlayback,
  AliyahNavigationSnapshot,
  AliyahNavigationTarget,
} from './model.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

beforeEach(() => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <header class="app-toolbar">
      <div data-target-id="aliyah-toolbar-root"></div>
    </header>
    <div data-target-id="aliyah-navigation-layer-root"></div>
    <main data-target-id="reader" tabindex="-1"></main>
  `
  document.body.appendChild(fixture)
})

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty('--aliyah-rail-top')
  delete document.documentElement.dataset.aliyahRailVisibility
})

test('renders both navigation presentations behind one typed interface', async () => {
  const toolbar = required<HTMLElement>('.app-toolbar')
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(
    { bottom: 72 } as DOMRect
  )
  const selected: AliyahNavigationTarget[] = []
  const playedCurrent: AliyahNavigationTarget[] = []
  const navigation = mountNavigation({
    onSelect: (target) => selected.push(target),
    onPlayCurrent: async (target) => {
      playedCurrent.push(target)
    },
    loadCueStatus: async (item) =>
      item.target.aliyahIndex === 1 ? 'published' : 'none',
    loadDurationLabel: async () => '2:05',
  })

  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: false,
  })
  navigation.syncToolbar({
    current: {
      labelVisible: true,
      label: 'שני',
      target: { runId: 'run-a', aliyahIndex: 2 },
      audioAvailable: true,
      authoringAvailable: false,
      authoringEnabled: false,
      cueStatus: null,
      playing: false,
    },
    compact: {
      visible: true,
      target: { runId: 'run-a', aliyahIndex: 2 },
      label: 'שני',
      playbackState: 'loaded',
    },
  })
  await flushPromises()

  expect(requiredAll('.aliyah-rail-button')).toHaveLength(2)
  expect(required('[data-target-id="aliyah-rail"]').tagName).toBe('NAV')
  expect(requiredAll('.mobile-aliyah-segment')).toHaveLength(2)
  expect(requiredAll('.mobile-aliyah-card')).toHaveLength(2)
  expect(requiredAll('.mobile-aliyah-play')).toHaveLength(1)
  expect(
    required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus
  ).toBe('published')
  expect(
    requiredAll<HTMLButtonElement>('.aliyah-rail-button')[1].getAttribute(
      'aria-current'
    )
  ).toBe('location')
  expect(
    requiredAll<HTMLButtonElement>('.mobile-aliyah-card-main')[1].getAttribute(
      'aria-current'
    )
  ).toBe('location')
  expect(
    required<HTMLElement>('.mobile-aliyah-card-status').dataset.durationLabel
  ).toBe('2:05')
  expect(
    required('[data-target-id="mobile-current-aliyah"]').textContent
  ).toBe('שני')
  expect(
    required('[data-target-id="toolbar-current-aliyah-label"]').textContent
  ).toBe('שני')
  expect(
    document.documentElement.style.getPropertyValue('--aliyah-rail-top')
  ).toBe('72px')

  navigation.revealWide('expanded')
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe(
    'expanded'
  )
  expect(required('[data-target-id="aliyah-rail"]').getAttribute('aria-hidden')).toBe(
    'false'
  )

  required<HTMLButtonElement>('.aliyah-rail-button').click()
  required<HTMLButtonElement>(
    '[data-target-id="toolbar-current-aliyah-audio"]'
  ).click()
  await flushPromises()

  expect(selected).toEqual([{ runId: 'run-a', aliyahIndex: 1 }])
  expect(playedCurrent).toEqual([{ runId: 'run-a', aliyahIndex: 2 }])
  expect(
    getMobileAliyahCapsuleState({ loaded: true, playing: false })
  ).toBe('loaded')
})

test('preserves compact pause, navigation, close-before-play, and focus behavior', async () => {
  const selected: AliyahNavigationTarget[] = []
  const beforeOpen = vi.fn(() => pausedPlayback)
  const playDeferred = deferred<AliyahNavigationPlayback>()
  const playCompact = vi.fn(() => playDeferred.promise)
  const navigation = mountNavigation({
    onSelect: (target) => selected.push(target),
    onPlayCompact: playCompact,
    onBeforeCompactOpen: beforeOpen,
  })
  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: false,
  })
  navigation.syncToolbar({
    current: {
      labelVisible: false,
      label: '—',
      target: null,
      audioAvailable: false,
      authoringAvailable: false,
      authoringEnabled: false,
      cueStatus: null,
      playing: false,
    },
    compact: {
      visible: true,
      target: { runId: 'run-a', aliyahIndex: 2 },
      label: 'שני',
      playbackState: 'loaded',
    },
  })

  required<HTMLButtonElement>(
    '[data-target-id="mobile-aliyah-picker-toggle"]'
  ).click()
  expect(beforeOpen).toHaveBeenCalledOnce()
  expect(navigation.isCompactOpen()).toBe(true)
  expect(
    required('[data-target-id="mobile-aliyah-picker"]').getAttribute(
      'aria-hidden'
    )
  ).toBe('false')

  required<HTMLButtonElement>('.mobile-aliyah-segment').click()
  expect(selected).toEqual([{ runId: 'run-a', aliyahIndex: 1 }])

  required<HTMLButtonElement>('.mobile-aliyah-play').click()
  expect(playCompact).toHaveBeenCalledWith({
    runId: 'run-a',
    aliyahIndex: 1,
  })
  expect(navigation.isCompactOpen()).toBe(false)
  expect(
    required('[data-target-id="mobile-aliyah-picker"]').getAttribute(
      'aria-hidden'
    )
  ).toBe('true')
  expect(document.activeElement).toBe(
    required<HTMLElement>('[data-target-id="reader"]')
  )

  playDeferred.resolve(pausedPlayback)
  await flushPromises()
})

test('exposes missing-audio recording targets only while authoring is active', async () => {
  const playCompact = vi.fn(async () => idlePlayback)
  const playCurrent = vi.fn(async () => {})
  const navigation = mountNavigation({
    onPlayCompact: playCompact,
    onPlayCurrent: playCurrent,
  })
  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: true,
  })
  navigation.syncToolbar({
    current: {
      labelVisible: true,
      label: 'שני',
      target: { runId: 'run-a', aliyahIndex: 2 },
      audioAvailable: false,
      authoringAvailable: true,
      authoringEnabled: true,
      cueStatus: null,
      playing: false,
    },
    compact: {
      visible: true,
      target: { runId: 'run-a', aliyahIndex: 2 },
      label: 'שני',
      playbackState: 'default',
    },
  })

  const missingPlay = required<HTMLButtonElement>(
    '.mobile-aliyah-play[data-aliyah-index="2"]'
  )
  expect(requiredAll('.mobile-aliyah-play')).toHaveLength(2)
  expect(missingPlay.classList).toContain('is-missing-audio')
  expect(missingPlay.getAttribute('aria-label')).toBe(
    'Select שני for audio and cue recording'
  )

  const toolbarPlay = required<HTMLButtonElement>(
    '[data-target-id="toolbar-current-aliyah-audio"]'
  )
  expect(toolbarPlay.disabled).toBe(false)
  expect(toolbarPlay.classList).toContain('is-missing-audio')
  toolbarPlay.click()
  missingPlay.click()
  await flushPromises()

  expect(playCurrent).toHaveBeenCalledWith({
    runId: 'run-a',
    aliyahIndex: 2,
  })
  expect(playCompact).toHaveBeenCalledWith({
    runId: 'run-a',
    aliyahIndex: 2,
  })
})

test('shows cue status in every mode while keeping authoring actions admin-only', async () => {
  let recordedCueStatus: 'none' | 'pending' | 'published' = 'none'
  const navigation = mountNavigation({
    loadCueStatus: async (item) =>
      item.recordingKey ? recordedCueStatus : 'none',
  })

  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: true,
  })
  navigation.syncToolbar({
    current: {
      labelVisible: true,
      label: 'ראשון',
      target: { runId: 'run-a', aliyahIndex: 1 },
      audioAvailable: true,
      authoringAvailable: false,
      authoringEnabled: true,
      cueStatus: null,
      playing: false,
    },
    compact: {
      visible: true,
      target: { runId: 'run-a', aliyahIndex: 1 },
      label: 'ראשון',
      playbackState: 'default',
    },
  })
  await flushPromises()

  const recordedPlay = required<HTMLButtonElement>(
    '.mobile-aliyah-play[data-aliyah-index="1"]'
  )
  const missingPlay = required<HTMLButtonElement>(
    '.mobile-aliyah-play[data-aliyah-index="2"]'
  )
  const toolbarPlay = required<HTMLButtonElement>(
    '[data-target-id="toolbar-current-aliyah-audio"]'
  )

  expect(recordedPlay.classList).toContain('is-cue-incomplete')
  expect(recordedPlay.getAttribute('aria-label')).toBe(
    'Start ראשון cue recording'
  )
  expect(toolbarPlay.classList).toContain('is-cue-incomplete')
  expect(toolbarPlay.getAttribute('aria-label')).toBe(
    'Start ראשון cue recording'
  )
  expect(missingPlay.classList).toContain('is-missing-audio')
  expect(missingPlay.classList).not.toContain('is-cue-incomplete')

  recordedCueStatus = 'pending'
  navigation.invalidate()
  await flushPromises()
  expect(recordedPlay.classList).toContain('is-cue-incomplete')
  expect(recordedPlay.getAttribute('aria-label')).toBe(
    'Resume ראשון cue recording'
  )
  expect(toolbarPlay.getAttribute('aria-label')).toBe(
    'Resume ראשון cue recording'
  )

  recordedCueStatus = 'published'
  navigation.invalidate()
  await flushPromises()
  expect(recordedPlay.classList).not.toContain('is-cue-incomplete')
  expect(toolbarPlay.classList).not.toContain('is-cue-incomplete')

  recordedCueStatus = 'pending'
  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: false,
  })
  navigation.syncToolbar({
    current: {
      labelVisible: true,
      label: 'ראשון',
      target: { runId: 'run-a', aliyahIndex: 1 },
      audioAvailable: true,
      authoringAvailable: false,
      authoringEnabled: false,
      cueStatus: 'pending',
      playing: false,
    },
    compact: {
      visible: true,
      target: { runId: 'run-a', aliyahIndex: 1 },
      label: 'ראשון',
      playbackState: 'default',
    },
  })
  navigation.invalidate()
  await flushPromises()
  expect(recordedPlay.classList).toContain('is-cue-incomplete')
  expect(recordedPlay.getAttribute('aria-label')).toBe('Play ראשון')
  expect(toolbarPlay.classList).toContain('is-cue-incomplete')
  expect(toolbarPlay.getAttribute('aria-label')).toBe('Play ראשון')
})

test('closes the compact picker from its sheet handle', () => {
  const navigation = mountNavigation()
  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: false,
  })
  navigation.syncToolbar({
    current: {
      labelVisible: false,
      label: '—',
      target: null,
      audioAvailable: false,
      authoringAvailable: false,
      authoringEnabled: false,
      cueStatus: null,
      playing: false,
    },
    compact: {
      visible: true,
      target: { runId: 'run-a', aliyahIndex: 2 },
      label: 'שני',
      playbackState: 'default',
    },
  })

  const toggle = required<HTMLButtonElement>(
    '[data-target-id="mobile-aliyah-picker-toggle"]'
  )
  toggle.click()

  const handle = required<HTMLButtonElement>(
    '[data-target-id="mobile-aliyah-sheet-handle"]'
  )
  expect(handle.tagName).toBe('BUTTON')
  expect(handle.getAttribute('aria-label')).toBe('Close aliyah picker')
  handle.click()

  expect(navigation.isCompactOpen()).toBe(false)
  expect(
    required('[data-target-id="mobile-aliyah-picker"]').getAttribute(
      'aria-hidden'
    )
  ).toBe('true')
  expect(document.activeElement).toBe(toggle)
})

test('keeps the wide rail visible during interaction and hides it after four seconds', () => {
  vi.useFakeTimers()
  const onWideHidden = vi.fn()
  const navigation = mountNavigation({ onWideHidden })
  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: false,
  })

  navigation.revealWide('peek')
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('peek')
  vi.advanceTimersByTime(ALIYAH_RAIL_AUTO_HIDE_MS - 1)
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('peek')

  const rail = required<HTMLElement>('[data-target-id="aliyah-rail"]')
  rail.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe(
    'expanded'
  )
  vi.advanceTimersByTime(ALIYAH_RAIL_AUTO_HIDE_MS)
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe(
    'expanded'
  )

  rail.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
  vi.advanceTimersByTime(ALIYAH_RAIL_AUTO_HIDE_MS)
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('hidden')
  expect(onWideHidden).toHaveBeenCalled()
})

test('ignores stale cue status and duration requests after invalidation', async () => {
  const oldCue = deferred<'pending'>()
  const newCue = deferred<'published'>()
  const oldDuration = deferred<string>()
  const newDuration = deferred<string>()
  const cueLoads = [oldCue.promise, newCue.promise]
  const durationLoads = [oldDuration.promise, newDuration.promise]
  const navigation = mountNavigation({
    loadCueStatus: () => cueLoads.shift()!,
    loadDurationLabel: () => durationLoads.shift()!,
  })
  const singleItemSnapshot: AliyahNavigationSnapshot = {
    ...snapshot,
    signature: 'narrator-a:run-a:1:audio-1',
    active: snapshot.items[0].target,
    items: [snapshot.items[0]],
  }

  navigation.syncContent({
    desktop: singleItemSnapshot,
    compact: singleItemSnapshot,
    authoringEnabled: false,
  })
  navigation.invalidate()

  newCue.resolve('published')
  newDuration.resolve('2:05')
  await flushPromises()
  expect(
    required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus
  ).toBe('published')
  expect(
    required<HTMLElement>('.mobile-aliyah-card-status').dataset.durationLabel
  ).toBe('2:05')

  oldCue.resolve('pending')
  oldDuration.resolve('0:10')
  await flushPromises()
  expect(
    required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus
  ).toBe('published')
  expect(
    required<HTMLElement>('.mobile-aliyah-card-status').dataset.durationLabel
  ).toBe('2:05')
})

test('replacement mounts cleanly without duplicating actions', async () => {
  const mount = createMount()
  let playCount = 0
  const mountReplacement = () =>
    mount((scope) => {
      const navigation = createAliyahNavigation(scope, {
        ...createOptions(),
        onPlayCurrent: async () => {
          playCount += 1
        },
      })
      navigation.syncToolbar({
        current: {
          labelVisible: true,
          label: 'ראשון',
          target: { runId: 'run-a', aliyahIndex: 1 },
          audioAvailable: true,
          authoringAvailable: false,
          authoringEnabled: false,
          cueStatus: null,
          playing: false,
        },
        compact: {
          visible: false,
          target: null,
          label: '—',
          playbackState: 'default',
        },
      })
    })

  const destroyFirst = mountReplacement()
  required<HTMLButtonElement>(
    '[data-target-id="toolbar-current-aliyah-audio"]'
  ).click()
  await flushPromises()

  const destroySecond = mountReplacement()
  required<HTMLButtonElement>(
    '[data-target-id="toolbar-current-aliyah-audio"]'
  ).click()
  await flushPromises()

  expect(playCount).toBe(2)
  expect(
    requiredAll('[data-target-id="toolbar-current-aliyah-audio"]')
  ).toHaveLength(1)

  destroyFirst()
  expect(
    requiredAll('[data-target-id="toolbar-current-aliyah-audio"]')
  ).toHaveLength(1)
  destroySecond()
})

const idlePlayback: AliyahNavigationPlayback = {
  target: null,
  playing: false,
  progressLabel: '',
}

const pausedPlayback: AliyahNavigationPlayback = {
  target: { runId: 'run-a', aliyahIndex: 1 },
  playing: false,
  progressLabel: '0:10/2:05',
}

const snapshot: AliyahNavigationSnapshot = {
  signature: 'narrator-a:run-a:1:audio-1|run-a:2:',
  active: { runId: 'run-a', aliyahIndex: 2 },
  playback: idlePlayback,
  items: [
    {
      key: 'run-a:1',
      target: { runId: 'run-a', aliyahIndex: 1 },
      label: 'ראשון',
      compactLabel: '1',
      audioKey: 'audio-1',
      recordingKey: 'audio-1',
    },
    {
      key: 'run-a:2',
      target: { runId: 'run-a', aliyahIndex: 2 },
      label: 'שני',
      compactLabel: '2',
      audioKey: null,
      recordingKey: null,
    },
  ],
}

function mountNavigation(
  overrides: Partial<AliyahNavigationOptions> = {}
): AliyahNavigation {
  let navigation!: AliyahNavigation
  destroy = createMount()((scope) => {
    navigation = createAliyahNavigation(scope, {
      ...createOptions(),
      ...overrides,
    })
  })
  return navigation
}

function createOptions(): AliyahNavigationOptions {
  return {
    document,
    onSelect: vi.fn(),
    onPlayCompact: async () => idlePlayback,
    onPlayCurrent: async () => {},
    onBeforeCompactOpen: () => idlePlayback,
    onAfterNavigate: vi.fn(),
    onWideHidden: vi.fn(),
    restoreFocus: (target) => target?.focus(),
    getReaderFocusTarget: () =>
      required<HTMLElement>('[data-target-id="reader"]'),
    loadCueStatus: async () => 'none',
    onCueStatusChange: vi.fn(),
    loadDurationLabel: async () => 'Available',
    onCueStatusError: vi.fn(),
    onDurationError: vi.fn(),
  }
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = fixture?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function requiredAll<T extends Element = HTMLElement>(selector: string): T[] {
  return [...(fixture?.querySelectorAll<T>(selector) ?? [])]
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
