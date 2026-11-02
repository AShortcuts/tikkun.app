import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createMount } from '../../lifecycle/mount.ts'
import { formatAliyahLabel } from './model.ts'
import { createAliyahNavigation, type AliyahNavigation, type AliyahNavigationOptions } from './aliyah-navigation.ts'
import type { AliyahNavigationPlayback, AliyahNavigationSnapshot } from './model.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null
let stylesheet: HTMLStyleElement | null = null

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

afterEach(async () => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty('--aliyah-rail-top')
  delete document.documentElement.dataset.aliyahRailVisibility
  delete document.documentElement.dataset.readerIsolated
  delete document.documentElement.dataset.readerPhone
  if (stylesheet) {
    stylesheet.remove()
    stylesheet = null
    await page.viewport(1280, 900)
  }
})

test('isolated navigation retains every division and waits for the authoritative selection', () => {
  const onSelect = vi.fn()
  const onAfterNavigate = vi.fn()
  const navigation = mountNavigation({ onSelect, onAfterNavigate })
  navigation.syncContent({
    desktop: completeSnapshot,
    compact: completeSnapshot,
    authoringEnabled: false,
    isolated: true,
  })
  const next = required<HTMLButtonElement>('[data-target-id="isolated-aliyah-next"]')
  const previous = required<HTMLButtonElement>('[data-target-id="isolated-aliyah-previous"]')

  expect(requiredAll('.mobile-aliyah-segment')).toHaveLength(9)
  expect(previous.disabled).toBe(true)
  expect(next.disabled).toBe(false)
  expect(next.getAttribute('aria-label')).toBe(`Next aliyah: ${completeSnapshot.items[1].label}`)
  previous.click()
  expect(onSelect).not.toHaveBeenCalled()
  expect(onAfterNavigate).not.toHaveBeenCalled()

  next.click()
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(completeSnapshot.items[1].target)
  expect(onAfterNavigate).toHaveBeenCalledOnce()
  expect(required<HTMLElement>('.mobile-aliyah-segment[aria-current="location"]').dataset.aliyahIndex).toBe('1')
  expect(previous.disabled).toBe(true)

  navigation.setActive(completeSnapshot.items[1].target)
  expect(previous.disabled).toBe(false)
  expect(required<HTMLElement>('.mobile-aliyah-segment[aria-current="location"]').dataset.aliyahIndex).toBe('2')
  previous.click()
  expect(onSelect).toHaveBeenLastCalledWith(completeSnapshot.items[0].target)

  navigation.setActive(completeSnapshot.items[7].target)
  next.click()
  expect(onSelect).toHaveBeenLastCalledWith({ runId: 'run-maftir', aliyahIndex: 'Maftir' })
  navigation.setActive(completeSnapshot.items[8].target)
  expect(next.disabled).toBe(true)
  next.click()
  expect(onSelect).toHaveBeenCalledTimes(3)
  previous.click()
  expect(onSelect).toHaveBeenLastCalledWith(completeSnapshot.items[7].target)
})

test('keeps missing-audio targets selectable while authoring is active', async () => {
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
  expect(toolbarPlay.dataset.audioTone).toBe('empty')
  expect(toolbarPlay.dataset.audioDimmed).toBe('true')
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

test('only published cue status makes admin play controls blue, including after invalidation', async () => {
  const loads = [deferred<'local-draft'>(), deferred<'none'>(), deferred<'published'>()] as const
  let loadIndex = 0
  const navigation = mountNavigation({ loadCueStatus: () => loads[loadIndex++].promise })
  const single = { ...snapshot, items: [snapshot.items[0]] }
  navigation.syncToolbar({
    current: {
      labelVisible: true, label: 'ראשון', target: single.items[0].target,
      audioAvailable: true, authoringAvailable: false, authoringEnabled: true,
      cueStatus: null, playing: false,
    },
    compact: {
      visible: true, label: 'ראשון', target: single.items[0].target,
      playbackState: 'default', audioAvailable: true, cueIncomplete: true,
    },
  })
  navigation.syncContent({ desktop: single, compact: single, authoringEnabled: true })
  const expectTone = (tone: string) => {
    for (const selector of ['.mobile-aliyah-play', '.toolbar-current-aliyah-audio', '.mobile-aliyah-play-toggle']) {
      expect(required<HTMLElement>(selector).dataset.audioTone).toBe(tone)
      expect(required<HTMLElement>(selector).getAttribute('aria-disabled')).toBe('false')
    }
  }
  expectTone('cue')
  loads[0].resolve('local-draft')
  await flushPromises()
  expect(required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus).toBe('local-draft')
  expectTone('cue')
  navigation.invalidate()
  expectTone('cue')
  loads[1].resolve('none')
  await flushPromises()
  expect(required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus).toBe('none')
  expectTone('cue')
  navigation.invalidate()
  loads[2].resolve('published')
  await flushPromises()
  expect(required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus).toBe('published')
  expectTone('normal')
})

test('rejects late cue results after the current recording has changed', async () => {
  const previous = deferred<'local-draft'>()
  const onCueStatusChange = vi.fn()
  const navigation = mountNavigation({
    loadCueStatus: async (item) => item.recordingKey === 'audio-1' ? previous.promise : 'published',
    onCueStatusChange,
  })
  const first = { ...snapshot, items: [snapshot.items[0]] }
  navigation.syncContent({ desktop: first, compact: first, authoringEnabled: false })
  const replacement = { ...first, items: [{ ...first.items[0], audioKey: 'audio-new', recordingKey: 'audio-new' }] }
  navigation.syncContent({ desktop: replacement, compact: replacement, authoringEnabled: false })
  await flushPromises()
  previous.resolve('local-draft')
  await flushPromises()
  expect(required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus).toBe('published')
  expect(onCueStatusChange).toHaveBeenCalledTimes(1)
  expect(onCueStatusChange).toHaveBeenCalledWith(replacement.items[0], 'published')
})

const idlePlayback: AliyahNavigationPlayback = {
  target: null,
  playing: false,
  progressLabel: '',
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

const completeSnapshot: AliyahNavigationSnapshot = {
  signature: 'run-a:1-8|run-maftir:Maftir',
  active: { runId: 'run-a', aliyahIndex: 1 },
  playback: idlePlayback,
  items: ([1, 2, 3, 4, 5, 6, 7, 8, 'Maftir'] as const).map((aliyahIndex) => {
    const runId = aliyahIndex === 'Maftir' ? 'run-maftir' : 'run-a'
    return {
      key: `${runId}:${aliyahIndex}`,
      target: { runId, aliyahIndex },
      label: formatAliyahLabel(aliyahIndex),
      compactLabel: String(aliyahIndex),
      audioKey: null,
      recordingKey: null,
    }
  }),
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
