import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import readerStyles from '../../css/master.css?inline'
import { createMount } from '../lifecycle/mount.ts'
import {
  createFloatingPlayer,
  type FloatingPlayerAction,
} from './floating-player.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null
let stylesheet: HTMLStyleElement | null = null

afterEach(async () => {
  vi.useRealTimers()
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  document.documentElement.removeAttribute('data-mobile-player-expanded')
  document.documentElement.removeAttribute('data-mobile-player-minimized')
  document.documentElement.removeAttribute('data-reader-isolated')
  if (stylesheet) {
    stylesheet.remove()
    stylesheet = null
    await page.viewport(1280, 900)
  }
})

test('owns player presentation behind one connected interface', () => {
  const actions: FloatingPlayerAction[] = []
  fixture = document.createElement('section')
  fixture.innerHTML = '<div data-target-id="floating-player-root"></div>'
  document.body.appendChild(fixture)

  let player: ReturnType<typeof createFloatingPlayer> | null = null
  destroy = createMount()((scope) => {
    player = createFloatingPlayer(scope, {
      document,
      view: window,
      action: (action) => actions.push(action),
    })
  })

  player!.sync({
    visible: true,
    untimed: false,
    playing: true,
    expanded: true,
    compact: true,
    desktopTitle: 'Beresheet · First Aliyah',
    mobileTitle: 'First Aliyah',
    mobileReading: 'Beresheet',
    mode: 'Word cues',
    status: 'Starts at first available cue',
    playbackRate: 1.5,
    audioDownload: {
      href: '/beresheet.mp3',
      fileName: 'beresheet.mp3',
    },
  })
  player!.syncProgress({
    audioRatio: 0.25,
    cueRatio: 0.5,
    seekValue: 250,
    seekDisabled: false,
    seekValueText: '0:05 of 0:20',
    currentTime: '0:05',
    duration: '0:20',
    wordProgress: '2 / 4',
    cueProgress: 'Cue 2 / 4',
    cueProgressVisible: true,
    mobileWordProgress: 'Word 2 of 4',
    mobileWordProgressVisible: true,
  })

  const root = required<HTMLElement>('[data-target-id="floating-player"]')
  expect(root.classList.contains('u-hidden')).toBe(false)
  expect(root.classList.contains('is-playing')).toBe(true)
  expect(root.classList.contains('is-expanded')).toBe(true)
  expect(root.getAttribute('role')).toBe('dialog')
  expect(root.getAttribute('aria-modal')).toBe('true')
  expect(root.dataset.cueMode).toBe('timed')
  expect(root.style.getPropertyValue('--audio-progress-ratio')).toBe('0.25')
  expect(root.style.getPropertyValue('--cue-progress-ratio')).toBe('0.5')
  expect(document.documentElement.dataset.mobilePlayerExpanded).toBe('')
  expect(required('[data-target-id="floating-player-title-desktop"]').textContent).toBe(
    'Beresheet · First Aliyah'
  )
  expect(required('[data-target-id="mobile-player-word-progress"]').textContent).toBe(
    'Word 2 of 4'
  )
  expect(required<HTMLInputElement>('[data-target-id="mobile-player-seek"]').value).toBe(
    '250'
  )
  expect(required('[data-target-id="floating-speed-compact-label"]').textContent).toBe(
    '1.5x'
  )
  expect(required<HTMLAnchorElement>('[data-target-id="floating-download"]').download).toBe(
    'beresheet.mp3'
  )

  required<HTMLButtonElement>('[data-target-id="floating-next"]').click()
  expect(actions).toContainEqual({ type: 'step', delta: 1 })

  const speedToggle = required<HTMLButtonElement>(
    '[data-target-id="floating-speed-toggle"]'
  )
  speedToggle.click()
  expect(speedToggle.getAttribute('aria-expanded')).toBe('true')
  player!.closeSpeedPopover()
  expect(speedToggle.getAttribute('aria-expanded')).toBe('false')

  player!.focusMobileClose()
  expect(document.activeElement).toBe(
    required('[data-target-id="floating-mobile-close"]')
  )
  const focusable = [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), a[href]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter(
    (element) =>
      element.offsetParent !== null && !element.closest('.u-hidden')
  )
  const firstFocusable = focusable[0]
  const lastFocusable = focusable[focusable.length - 1]
  if (!firstFocusable || !lastFocusable) {
    throw new Error('Expected focusable expanded-player controls')
  }
  lastFocusable.focus()
  lastFocusable.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
  )
  expect(document.activeElement).toBe(firstFocusable)

  root.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  expect(actions).toContainEqual({
    type: 'set-expanded',
    expanded: false,
    source: 'close',
    returnFocus: null,
  })

  destroy()
  destroy = null
  expect(root.isConnected).toBe(false)
  expect(document.documentElement.hasAttribute('data-mobile-player-expanded')).toBe(
    false
  )
})

test('rejects missing and occupied mount roots', () => {
  const mount = createMount()
  expect(() =>
    mount((scope) =>
      createFloatingPlayer(scope, {
        document,
        view: window,
        action: vi.fn(),
      })
    )
  ).toThrow('Floating Player requires its mount root')

  fixture = document.createElement('section')
  fixture.innerHTML =
    '<div data-target-id="floating-player-root"><span>occupied</span></div>'
  document.body.appendChild(fixture)
  expect(() =>
    mount((scope) =>
      createFloatingPlayer(scope, {
        document,
        view: window,
        action: vi.fn(),
      })
    )
  ).toThrow('Floating Player requires an empty mount root')
})

test('settles an idle mobile player into one compact transport and restores it', async () => {
  vi.useFakeTimers()
  const action = vi.fn()
  fixture = document.createElement('section')
  fixture.innerHTML = '<div data-target-id="floating-player-root"></div>'
  document.body.appendChild(fixture)

  let player: ReturnType<typeof createFloatingPlayer> | null = null
  destroy = createMount()((scope) => {
    player = createFloatingPlayer(scope, {
      document,
      view: window,
      action,
    })
  })

  player!.sync({
    visible: true,
    compact: true,
    expanded: false,
    playing: true,
    mobileTitle: 'First Aliyah',
    mobileReading: 'Beresheet',
  })

  const root = required<HTMLElement>('[data-target-id="floating-player"]')
  await vi.advanceTimersByTimeAsync(2_000)
  player!.sync({ playing: true })
  player!.syncProgress({ audioRatio: 0.2, currentTime: '0:02' })
  await vi.advanceTimersByTimeAsync(1_999)
  expect(root.classList.contains('is-minimized')).toBe(false)

  await vi.advanceTimersByTimeAsync(1)
  expect(root.classList.contains('is-minimized')).toBe(true)
  expect(root.getAttribute('aria-label')).toBe('Compact audio player')
  expect(document.documentElement.dataset.mobilePlayerMinimized).toBe('')

  const playButton = required<HTMLButtonElement>('[data-target-id="floating-play"]')
  for (const playing of [false, true]) {
    playButton.click()
    expect(action).toHaveBeenLastCalledWith({ type: 'toggle-playback' })
    player!.sync({ playing })
    expect(playButton.getAttribute('aria-label')).toBe(playing ? 'Pause' : 'Play')
    expect(root.classList.contains('is-minimized')).toBe(true)
    expect(document.documentElement.dataset.mobilePlayerMinimized).toBe('')
  }

  required<HTMLButtonElement>(
    '[data-target-id="floating-minimized-summary"]'
  ).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  expect(root.classList.contains('is-minimized')).toBe(false)
  expect(root.getAttribute('aria-label')).toBe('Audio player')

  await vi.advanceTimersByTimeAsync(4_000)
  expect(root.classList.contains('is-minimized')).toBe(true)

  player!.sync({ expanded: true })
  expect(root.classList.contains('is-minimized')).toBe(false)
  expect(
    document.documentElement.hasAttribute('data-mobile-player-minimized')
  ).toBe(false)

  player!.sync({ expanded: false, compact: false })
  await vi.advanceTimersByTimeAsync(4_000)
  expect(root.classList.contains('is-minimized')).toBe(false)
})

test('isolated landscape player clears navigation and keeps transport and speed reachable', async () => {
  stylesheet = document.createElement('style')
  stylesheet.textContent = readerStyles
  document.head.append(stylesheet)
  await page.viewport(844, 390)
  document.documentElement.dataset.readerIsolated = 'true'
  fixture = document.createElement('section')
  fixture.className = 'app'
  fixture.innerHTML = `
    <header class="app-toolbar"><button class="toolbar-button">Reading</button></header>
    <div class="mobile-aliyah-row is-isolated">
    <nav class="mobile-aliyah-segments is-isolated"></nav>
    <nav class="isolated-aliyah-controls">
      <button class="isolated-aliyah-step" data-target-id="isolated-aliyah-next" aria-label="Next aliyah">
        <span class="isolated-aliyah-step-surface">Next</span>
      </button>
      <button class="isolated-aliyah-step" data-target-id="isolated-aliyah-previous" aria-label="Previous aliyah">
        <span class="isolated-aliyah-step-surface">Prev</span>
      </button>
    </nav>
    </div>
    <div data-target-id="floating-player-root"></div>
  `
  document.body.append(fixture)
  let player: ReturnType<typeof createFloatingPlayer> | null = null
  const action = vi.fn((next: FloatingPlayerAction) => {
    if (next.type === 'set-expanded') player!.sync({ expanded: next.expanded })
    if (next.type === 'set-rate') player!.sync({ playbackRate: next.rate })
  })
  destroy = createMount()((scope) => {
    player = createFloatingPlayer(scope, { document, view: window, action })
  })
  player!.sync({
    visible: true, compact: false, expanded: false, untimed: false,
    desktopTitle: 'Beresheet', mobileTitle: 'First Aliyah',
  })

  const root = required('[data-target-id="floating-player"]')
  const controls = required('.floating-player-controls')
  const expand = required<HTMLButtonElement>('[data-target-id="floating-expand-toggle"]')
  const speed = required<HTMLButtonElement>('[data-target-id="floating-speed-toggle"]')
  const transport: [string, FloatingPlayerAction][] = [
    ['floating-replay', { type: 'restart' }],
    ['floating-prev', { type: 'step', delta: -1 }],
    ['floating-play', { type: 'toggle-playback' }],
    ['floating-next', { type: 'step', delta: 1 }],
  ]
  for (const [index, expanded] of [false, true, false].entries()) {
    await expect.poll(() => root.getAnimations({ subtree: true })
      .some(animation => animation.playState === 'running')).toBe(false)
    expect(root.classList.contains('is-expanded')).toBe(expanded)
    expect(expand.getAttribute('aria-expanded')).toBe(String(expanded))
    expectInViewport(root)
    expect(root.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      required('.mobile-aliyah-row').getBoundingClientRect().bottom
    )
    if (!expanded) {
      expect(getComputedStyle(root).flexDirection).toBe('row')
      expect(getComputedStyle(controls).flexDirection).toBe('row')
    }
    for (const id of ['isolated-aliyah-next', 'isolated-aliyah-previous']) {
      const button = required<HTMLButtonElement>(`[data-target-id="${id}"]`)
      expectReachable(button)
      expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
      const navigate = vi.fn()
      button.addEventListener('click', navigate, { once: true })
      await page.elementLocator(button).click()
      expect(navigate).toHaveBeenCalledOnce()
    }
    for (const [id, expectedAction] of transport) {
      const button = required<HTMLButtonElement>(`[data-target-id="${id}"]`)
      expectReachable(button)
      action.mockClear()
      await page.elementLocator(button).click()
      expect(action).toHaveBeenCalledWith(expectedAction)
    }
    expectReachable(speed)
    await page.elementLocator(speed).click()
    expect(speed.getAttribute('aria-expanded')).toBe('true')
    const popover = required('[data-target-id="floating-speed-popover"]')
    await expect.poll(() => popover.getAnimations()
      .some(animation => animation.playState === 'running')).toBe(false)
    expectInViewport(popover)
    const slider = required<HTMLInputElement>('[data-target-id="floating-speed-slider"]')
    expectReachable(slider)
    action.mockClear()
    await page.elementLocator(slider).click()
    expect(action).toHaveBeenCalledWith({ type: 'set-rate', rate: expect.closeTo(1.75, 1), snap: true })
    player!.closeSpeedPopover()
    expect(speed.getAttribute('aria-expanded')).toBe('false')
    expectReachable(expand)
    if (index < 2) {
      action.mockClear()
      await page.elementLocator(expand).click()
      expect(action).toHaveBeenCalledWith(expect.objectContaining({
        type: 'set-expanded', expanded: !expanded, source: 'desktop',
      }))
    }
  }

  document.documentElement.removeAttribute('data-reader-isolated')
  for (const [width, height] of [[844, 390], [1280, 900]]) {
    await page.viewport(width, height)
    expect(getComputedStyle(root).flexDirection).toBe('column')
    expect(getComputedStyle(controls).flexDirection).toBe('column')
    const previous = required('[data-target-id="floating-prev"]').getBoundingClientRect()
    const next = required('[data-target-id="floating-next"]').getBoundingClientRect()
    expect(previous.left).toBeCloseTo(next.left)
    expect(previous.bottom).toBeLessThan(next.top)
  }
})

function expectInViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const label = element.dataset.targetId || element.className
  expect(rect.width, label).toBeGreaterThan(0)
  expect(rect.height, label).toBeGreaterThan(0)
  expect(rect.left, label).toBeGreaterThanOrEqual(0)
  expect(rect.top, label).toBeGreaterThanOrEqual(0)
  expect(rect.right, label).toBeLessThanOrEqual(window.innerWidth)
  expect(rect.bottom, label).toBeLessThanOrEqual(window.innerHeight)
  return rect
}

function expectReachable(element: HTMLElement) {
  const rect = expectInViewport(element)
  for (const [x, y] of [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.1], [0.5, 0.9]]) {
    expect(element.contains(document.elementFromPoint(
      rect.left + rect.width * x, rect.top + rect.height * y
    )), element.dataset.targetId).toBe(true)
  }
}

function required<ElementType extends Element = HTMLElement>(selector: string) {
  const element = fixture?.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
