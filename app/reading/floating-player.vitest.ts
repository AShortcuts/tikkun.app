import { afterEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  createFloatingPlayer,
  type FloatingPlayerAction,
} from './floating-player.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  vi.useRealTimers()
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  document.documentElement.removeAttribute('data-mobile-player-expanded')
  document.documentElement.removeAttribute('data-mobile-player-minimized')
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
  fixture = document.createElement('section')
  fixture.innerHTML = '<div data-target-id="floating-player-root"></div>'
  document.body.appendChild(fixture)

  let player: ReturnType<typeof createFloatingPlayer> | null = null
  destroy = createMount()((scope) => {
    player = createFloatingPlayer(scope, {
      document,
      view: window,
      action: vi.fn(),
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

function required<ElementType extends Element = HTMLElement>(selector: string) {
  const element = fixture?.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
