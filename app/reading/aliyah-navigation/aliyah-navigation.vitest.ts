import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import readerStyles from '../../../css/master.css?inline'
import { createMount } from '../../lifecycle/mount.ts'
import { formatAliyahLabel } from './model.ts'
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

test('isolated rail and controls share selection; the current segment asks to return to its start', () => {
  const onSelect = vi.fn()
  const onAfterNavigate = vi.fn()
  const navigation = mountNavigation({ onSelect, onAfterNavigate })
  navigation.syncContent({
    desktop: completeSnapshot, compact: completeSnapshot,
    authoringEnabled: false, isolated: true,
  })
  const maftir = required<HTMLButtonElement>('.mobile-aliyah-segment[data-aliyah-index="Maftir"]')
  maftir.click()
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(completeSnapshot.items[8].target)
  navigation.setActive(completeSnapshot.items[8].target)
  maftir.click()
  // The reader handles a repeated selection by scrolling back to the passage start.
  expect(onSelect).toHaveBeenCalledTimes(2)
  expect(onSelect).toHaveBeenLastCalledWith(completeSnapshot.items[8].target)
  expect(maftir.getAttribute('aria-current')).toBe('location')

  navigation.setActive({ runId: 'different-run', aliyahIndex: 1 })
  expect(required<HTMLButtonElement>('[data-target-id="isolated-aliyah-next"]').disabled).toBe(true)
  expect(required<HTMLButtonElement>('[data-target-id="isolated-aliyah-previous"]').disabled).toBe(true)
  navigation.setActive(null)
  expect(required<HTMLButtonElement>('[data-target-id="isolated-aliyah-next"]').disabled).toBe(true)
  expect(required<HTMLButtonElement>('[data-target-id="isolated-aliyah-previous"]').disabled).toBe(true)
})

test('tapping a rail segment shows aliyah starts until the rail timer hides them', () => {
  vi.useFakeTimers()
  const onSelect = vi.fn()
  const navigation = mountNavigation({ onSelect })
  const content = { desktop: completeSnapshot, compact: completeSnapshot, authoringEnabled: false }
  navigation.syncContent(content)
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('hidden')

  required<HTMLButtonElement>('.mobile-aliyah-segment[data-aliyah-index="3"]').click()
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(completeSnapshot.items[2].target)
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('peek')
  vi.advanceTimersByTime(ALIYAH_RAIL_AUTO_HIDE_MS)
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('hidden')

  // Isolated Reading has no aliyah starts to reveal.
  navigation.syncContent({ ...content, isolated: true })
  required<HTMLButtonElement>('.mobile-aliyah-segment[data-aliyah-index="3"]').click()
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('hidden')
})

test('isolation suppresses only the wide rail and restores existing navigation on exit', () => {
  const onSelect = vi.fn()
  const navigation = mountNavigation({ onSelect })
  const content = { desktop: completeSnapshot, compact: completeSnapshot, authoringEnabled: false }
  navigation.syncContent(content)
  expect(requiredAll('.mobile-aliyah-segment')).toHaveLength(7)
  expect(requiredAll('.isolated-aliyah-controls')).toHaveLength(0)
  required<HTMLButtonElement>('.mobile-aliyah-segment[aria-current="location"]').click()
  expect(onSelect).toHaveBeenCalledOnce()
  navigation.revealWide('expanded')
  expect(required('.aliyah-rail').getAttribute('aria-hidden')).toBe('false')

  navigation.syncContent({ ...content, isolated: true })
  navigation.revealWide('expanded')
  expect(required('.aliyah-rail').classList.contains('u-hidden')).toBe(true)
  expect(required('.aliyah-rail').getAttribute('aria-hidden')).toBe('true')
  expect(required<HTMLElement>('.aliyah-rail').inert).toBe(true)

  navigation.syncContent(content)
  expect(requiredAll('.mobile-aliyah-segment')).toHaveLength(7)
  expect(requiredAll('.isolated-aliyah-controls')).toHaveLength(0)
  expect(required('.aliyah-rail').classList.contains('u-hidden')).toBe(false)
  navigation.revealWide('expanded')
  expect(required('.aliyah-rail').getAttribute('aria-hidden')).toBe('false')
  navigation.clearContent()
  expect(requiredAll('.mobile-aliyah-segment')).toHaveLength(0)
  expect(requiredAll('.isolated-aliyah-controls')).toHaveLength(0)
})

test('isolated single and empty readings cannot navigate beyond their indexed boundaries', () => {
  const navigation = mountNavigation()
  const single = { ...completeSnapshot, items: [completeSnapshot.items[0]] }
  navigation.syncContent({ desktop: single, compact: single, authoringEnabled: false, isolated: true })
  expect(required<HTMLButtonElement>('[data-target-id="isolated-aliyah-next"]').disabled).toBe(true)
  expect(required<HTMLButtonElement>('[data-target-id="isolated-aliyah-previous"]').disabled).toBe(true)
  navigation.syncContent({ desktop: null, compact: null, authoringEnabled: false, isolated: true })
  expect(requiredAll('.isolated-aliyah-controls')).toHaveLength(0)
})

test('isolated rail and smaller edge controls reserve clearance in portrait and landscape', async () => {
  stylesheet = document.createElement('style')
  stylesheet.textContent = readerStyles
  document.head.append(stylesheet)
  document.documentElement.dataset.readerIsolated = 'true'
  fixture!.classList.add('app')
  required('[data-target-id="aliyah-navigation-layer-root"]').classList.add('aliyah-navigation-root')
  required('[data-target-id="reader"]').classList.add('app-body')
  const navigation = mountNavigation()
  navigation.syncContent({
    desktop: completeSnapshot, compact: completeSnapshot,
    authoringEnabled: false, isolated: true,
  })
  const rail = required<HTMLElement>('.mobile-aliyah-segments')
  const row = required<HTMLElement>('.mobile-aliyah-row')
  const next = required<HTMLButtonElement>('[data-target-id="isolated-aliyah-next"]')
  const previous = required<HTMLButtonElement>('[data-target-id="isolated-aliyah-previous"]')

  for (const [width, height] of [[390, 844], [844, 390], [320, 568]]) {
    await page.viewport(width, height)
    const railBounds = rail.getBoundingClientRect()
    const rowBounds = row.getBoundingClientRect()
    const nextBounds = next.getBoundingClientRect()
    const previousBounds = previous.getBoundingClientRect()
    expect(getComputedStyle(rail).display).toBe('flex')
    expect(rowBounds.width).toBe(width)
    expect(rowBounds.height).toBe(44)
    // Both buttons share the rail's row: previous at the left edge, next at the right edge.
    for (const bounds of [railBounds, nextBounds, previousBounds]) {
      expect(bounds.top).toBeGreaterThanOrEqual(rowBounds.top - 0.5)
      expect(bounds.bottom).toBeLessThanOrEqual(rowBounds.bottom + 0.5)
    }
    expect(previousBounds.left).toBeCloseTo(rowBounds.left + parseFloat(getComputedStyle(row).paddingLeft))
    expect(nextBounds.right).toBeCloseTo(rowBounds.right - parseFloat(getComputedStyle(row).paddingRight))
    expect(railBounds.left).toBeGreaterThanOrEqual(previousBounds.right - 0.5)
    expect(railBounds.right).toBeLessThanOrEqual(nextBounds.left + 0.5)
    expect(required('[data-target-id="reader"]').getBoundingClientRect().top).toBeGreaterThanOrEqual(rowBounds.bottom)
    expect(getComputedStyle(document.documentElement).getPropertyValue('--isolated-aliyah-navigation-height').trim()).toBe('44px')
    for (const button of [next, previous, ...requiredAll<HTMLButtonElement>('.mobile-aliyah-segment')]) {
      expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
    expect(required('.isolated-aliyah-step-surface').getBoundingClientRect().width).toBe(32)
    expect(required('.isolated-aliyah-step-surface').getBoundingClientRect().height).toBe(32)
    expect(required('.isolated-aliyah-step .ui-icon').getBoundingClientRect().width).toBe(16)
    expect(required('.isolated-aliyah-step .ui-icon').getBoundingClientRect().height).toBe(16)
    expect(getComputedStyle(required('.aliyah-rail')).display).toBe('none')
    if (width === 320) expect(rail.scrollWidth).toBeGreaterThan(rail.clientWidth)
    expect(document.documentElement.scrollWidth).toBe(width)
    const selected = required('.mobile-aliyah-segment[aria-current="location"]')
    await expect.poll(() => getComputedStyle(selected, '::before').backgroundColor).toBe('rgb(10, 132, 255)')
    navigation.syncPlayback({ target: completeSnapshot.items[0].target, playing: true, progressLabel: '0:10/2:05' })
    await expect.poll(() => getComputedStyle(selected, '::before').backgroundColor).toBe('rgb(245, 197, 66)')
    navigation.syncPlayback(idlePlayback)
    next.focus()
    expect(document.activeElement).toBe(next)
    expect(getComputedStyle(next.querySelector('.isolated-aliyah-step-surface')!).outlineWidth).toBe('2px')
    next.blur()
    navigation.setActive(completeSnapshot.items[8].target)
    const maftirBounds = required('.mobile-aliyah-segment[data-aliyah-index="Maftir"]').getBoundingClientRect()
    expect(maftirBounds.left).toBeGreaterThanOrEqual(railBounds.left - 0.5)
    expect(maftirBounds.right).toBeLessThanOrEqual(railBounds.right + 0.5)
    navigation.setActive(completeSnapshot.items[0].target)
    if (width !== 320) {
      await page.screenshot({ path: `../../../.vitest-attachments/isolated-navigation-${width}.png` })
    }
  }

  await page.viewport(844, 390)
  navigation.syncContent({ desktop: completeSnapshot, compact: completeSnapshot, authoringEnabled: false })
  delete document.documentElement.dataset.readerIsolated
  expect(getComputedStyle(rail).display).toBe('none')
  expect(requiredAll('.isolated-aliyah-controls')).toHaveLength(0)
  navigation.revealWide('expanded')
  expect(getComputedStyle(required('.aliyah-rail')).display).toBe('flex')
  await page.viewport(390, 844)
  expect(getComputedStyle(rail).display).toBe('flex')
  expect(rail.getBoundingClientRect().height).toBe(32)
  expect(requiredAll('.mobile-aliyah-segment')).toHaveLength(7)
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
      audioAvailable: true,
    },
  })
  await flushPromises()

  expect(requiredAll('.aliyah-rail-button')).toHaveLength(2)
  expect(required('[data-target-id="aliyah-rail"]').tagName).toBe('NAV')
  expect(requiredAll('.mobile-aliyah-segment')).toHaveLength(2)
  expect(requiredAll('.mobile-aliyah-card')).toHaveLength(2)
  expect(requiredAll('.mobile-aliyah-play')).toHaveLength(2)
  const unavailable = required<HTMLButtonElement>('.mobile-aliyah-play[data-aliyah-index="2"]')
  expect(unavailable.getAttribute('aria-disabled')).toBe('true')
  expect(unavailable.dataset.audioTone).toBe('empty')
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
  required<HTMLButtonElement>(
    '[data-target-id="mobile-aliyah-play-toggle"]'
  ).click()
  await flushPromises()

  expect(selected).toEqual([{ runId: 'run-a', aliyahIndex: 1 }])
  expect(playedCurrent).toEqual([
    { runId: 'run-a', aliyahIndex: 2 },
    { runId: 'run-a', aliyahIndex: 2 },
  ])
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

test('marks only unavailable compact audio as neutral and keeps its picker usable', async () => {
  const pendingPlay = deferred<void>()
  const playCurrent = vi.fn(() => pendingPlay.promise)
  const navigation = mountNavigation({ onPlayCurrent: playCurrent })
  navigation.syncContent({
    desktop: snapshot,
    compact: snapshot,
    authoringEnabled: false,
  })
  const syncAvailability = (audioAvailable: boolean) => navigation.syncToolbar({
    current: {
      labelVisible: true,
      label: 'שני',
      target: { runId: 'run-a', aliyahIndex: 2 },
      audioAvailable,
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
      audioAvailable,
    },
  })

  syncAvailability(false)
  const capsule = required('[data-target-id="mobile-aliyah-capsule"]')
  const play = required<HTMLButtonElement>('[data-target-id="mobile-aliyah-play-toggle"]')
  const picker = required<HTMLButtonElement>('[data-target-id="mobile-aliyah-picker-toggle"]')
  expect(capsule.classList).toContain('is-unavailable')
  expect(play.getAttribute('aria-disabled')).toBe('true')
  expect(play.getAttribute('aria-label')).toBe('Recording unavailable for שני')
  play.click()
  expect(playCurrent).not.toHaveBeenCalled()
  expect(picker.disabled).toBe(false)
  picker.click()
  expect(navigation.isCompactOpen()).toBe(true)
  picker.click()

  syncAvailability(true)
  expect(capsule.classList).not.toContain('is-unavailable')
  expect(play.getAttribute('aria-disabled')).toBe('false')
  play.click()
  await flushPromises()
  expect(playCurrent).toHaveBeenCalledOnce()
  expect(play.getAttribute('aria-disabled')).toBe('true')
  expect(capsule.classList).toContain('is-loading')
  expect(capsule.classList).not.toContain('is-unavailable')

  pendingPlay.resolve()
  await flushPromises()
  expect(play.getAttribute('aria-disabled')).toBe('false')
  syncAvailability(false)
  expect(capsule.classList).toContain('is-unavailable')
  expect(play.getAttribute('aria-disabled')).toBe('true')
})

test('keeps mobile aliyah text beside Play and lets long statuses wrap', async () => {
  const preferencesKey = 'tikkun.reader-preferences'
  const previousPreferences = localStorage.getItem(preferencesKey)
  const frame = document.createElement('iframe')
  frame.title = 'Mobile aliyah picker layout'
  frame.style.cssText = 'width:390px;height:844px;border:0'
  localStorage.setItem(preferencesKey, JSON.stringify({ themeMode: 'dark' }))
  frame.src = '/reader/#/torah/parsha/nitzavim-vayelech/5-29-9'
  fixture?.appendChild(frame)

  try {
    await vi.waitFor(() => {
      expect(frame.contentDocument?.querySelector('[data-reader-boot-state="ready"]')).not.toBeNull()
      expect(frame.contentDocument?.querySelectorAll('.mobile-aliyah-card')).toHaveLength(8)
    }, { timeout: 15_000 })
    const doc = frame.contentDocument!
    const view = frame.contentWindow!
    const get = (selector: string) => {
      const element = doc.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing picker element: ${selector}`)
      return element
    }
    await doc.fonts.ready
    const picker = get('[data-target-id="mobile-aliyah-picker-toggle"]')
    picker.click()
    await vi.waitFor(() => {
      expect(get('.mobile-aliyah-picker').getAttribute('aria-hidden')).toBe('false')
      expect(get('.mobile-aliyah-card.is-unavailable .mobile-aliyah-play').getAttribute('aria-disabled')).toBe('true')
    })
    for (const width of [320, 390, 550]) {
      frame.style.width = `${width}px`
      await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()))
      // Exercise long status copy independently of the fixture's recording coverage.
      const longStatus = get('.mobile-aliyah-card[data-aliyah-index="5"] .mobile-aliyah-card-status')
      longStatus.textContent = 'Full audio available. Some highlighting is missing.'
      get('.mobile-aliyah-card[data-aliyah-index="5"]').classList.remove('is-unavailable')
      for (const card of doc.querySelectorAll<HTMLElement>('.mobile-aliyah-card')) {
        const main = card.querySelector<HTMLElement>('.mobile-aliyah-card-main')!
        const play = card.querySelector<HTMLElement>('.mobile-aliyah-play')!
        const mainBox = main.getBoundingClientRect()
        const playBox = play.getBoundingClientRect()
        expect(playBox.left, `Play stays right at ${width}px`).toBeGreaterThan(mainBox.right)
        expect(playBox.top).toBeGreaterThanOrEqual(mainBox.top - 1)
        expect(playBox.bottom).toBeLessThanOrEqual(mainBox.bottom + 1)
        for (const text of main.querySelectorAll<HTMLElement>('span')) {
          expect(view.getComputedStyle(text).whiteSpace).toBe('normal')
          expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth + 1)
          expect(text.scrollHeight).toBeLessThanOrEqual(text.clientHeight + 1)
        }
      }
      const sheet = get('.mobile-aliyah-sheet')
      expect(longStatus.clientHeight).toBeGreaterThan(parseFloat(view.getComputedStyle(longStatus).lineHeight))
      expect(sheet.scrollWidth).toBeLessThanOrEqual(sheet.clientWidth)
      expect(view.getComputedStyle(picker).opacity).toBe('1')
      expect(view.getComputedStyle(picker).color).toBe(view.getComputedStyle(sheet).color)
    }
  } finally {
    frame.remove()
    if (previousPreferences === null) localStorage.removeItem(preferencesKey)
    else localStorage.setItem(preferencesKey, previousPreferences)
  }
}, 20_000)

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

test('refreshes a cue dot when audio coverage finishes without saving cues', async () => {
  const loadCueStatus = vi.fn<AliyahNavigationOptions['loadCueStatus']>(
    async (item) => item.audioState?.problem === null ? 'published' : 'none'
  )
  const navigation = mountNavigation({ loadCueStatus })
  const checking: AliyahNavigationSnapshot = {
    ...snapshot,
    items: [{ ...snapshot.items[0], audioState: {
      problem: 'checking', message: 'Checking audio coverage', recording: null,
    } }],
  }
  navigation.syncContent({ desktop: checking, compact: checking, authoringEnabled: false })
  await flushPromises()
  expect(required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus).toBe('none')

  const ready: AliyahNavigationSnapshot = {
    ...checking,
    items: [{ ...checking.items[0], audioState: {
      problem: null, message: '', recording: null, canPlay: true,
    } }],
  }
  navigation.syncContent({ desktop: ready, compact: ready, authoringEnabled: false })
  await flushPromises()
  expect(required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus).toBe('published')
  expect(loadCueStatus).toHaveBeenCalledTimes(2)
})

test('refreshes cue status when entering authoring without a save', async () => {
  let authoring = false
  const navigation = mountNavigation({
    loadCueStatus: async () => authoring ? 'local-draft' : 'published',
  })
  const single = { ...snapshot, items: [snapshot.items[0]] }
  navigation.syncContent({ desktop: single, compact: single, authoringEnabled: false })
  await flushPromises()
  authoring = true
  navigation.syncContent({ desktop: single, compact: single, authoringEnabled: true })
  await flushPromises()
  expect(required<HTMLElement>('.aliyah-rail-button').dataset.cueStatus).toBe('local-draft')
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
