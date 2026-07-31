import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AudioNarrator } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import {
  defaultReaderPreferences,
  mergeReaderPreferences,
  type ReaderPreferences,
} from '../reader-preferences.ts'
import {
  createReaderSettings,
  type ReaderSettings,
  type ReaderSettingsOptions,
} from './reader-settings.ts'

let fixture: HTMLElement
let destroy: (() => void) | null = null

beforeEach(() => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <button data-target-id="settings-toggle" aria-expanded="false"></button>
    <button data-test-id="outside">Outside</button>
    <div data-target-id="settings-root"></div>
  `
  document.body.appendChild(fixture)
})

afterEach(() => {
  destroy?.()
  destroy = null
  fixture.remove()
  document.documentElement.classList.remove('mod-theme-transition')
  vi.restoreAllMocks()
})

test('replacement mounts keep one settings lifetime and preserve focus behavior', async () => {
  const mount = createMount()
  const first = createState()
  const second = createState()
  let settings: ReaderSettings | null = null

  const staleDestroy = mount((scope) => {
    createReaderSettings(scope, createOptions(first))
  })
  destroy = mount((scope) => {
    settings = createReaderSettings(scope, createOptions(second))
  })

  const narrator = required<HTMLSelectElement>(
    '[data-target-id="settings-narrator"]'
  )
  narrator.value = 'second-reader'
  narrator.dispatchEvent(new Event('change', { bubbles: true }))
  expect(first.updatePreferences).not.toHaveBeenCalled()
  expect(second.updatePreferences).toHaveBeenCalledTimes(1)

  const toggle = required<HTMLButtonElement>(
    '[data-target-id="settings-toggle"]'
  )
  const pane = required<HTMLElement>('[data-target-id="settings-pane"]')
  settings!.open({ returnFocus: toggle })
  await nextAnimationFrame()
  expect(pane.classList.contains('u-hidden')).toBe(false)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(
    required('[data-target-id="settings-close"]')
  )

  required<HTMLButtonElement>('[data-target-id="settings-close"]').click()
  expect(pane.classList.contains('u-hidden')).toBe(true)
  expect(second.restoreFocus).toHaveBeenLastCalledWith(toggle)

  const outside = required<HTMLButtonElement>('[data-test-id="outside"]')
  settings!.open({ returnFocus: outside })
  outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(pane.classList.contains('u-hidden')).toBe(true)
  expect(second.restoreFocus).toHaveBeenCalledTimes(1)

  staleDestroy()
  settings!.open({ returnFocus: toggle })
  expect(pane.classList.contains('u-hidden')).toBe(false)

  destroy()
  destroy = null
  expect(pane.classList.contains('u-hidden')).toBe(true)
  narrator.dispatchEvent(new Event('change', { bubbles: true }))
  expect(second.updatePreferences).toHaveBeenCalledTimes(1)
})

test('settings synchronize representative controls and release scheduled effects', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
  } as MediaQueryList)
  const state = createState()
  let settings: ReaderSettings | null = null

  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, createOptions(state))
  })

  expect(
    [...required<HTMLSelectElement>('[data-target-id="settings-narrator"]').options]
      .map((option) => option.textContent)
  ).toEqual(['First Reader', 'Second Reader'])

  const opacity = required<HTMLInputElement>(
    '[data-target-id="settings-highlight-opacity"]'
  )
  opacity.value = '0.3'
  opacity.dispatchEvent(new Event('input', { bubbles: true }))
  expect(state.preferences.highlightOpacity).toBe(0.3)
  expect(
    required<HTMLInputElement>(
      '[data-target-id="settings-highlight-opacity-value"]'
    ).value
  ).toBe('0.3')

  const highlightFill = required<HTMLInputElement>(
    '[data-target-id="settings-highlight-fill"]'
  )
  highlightFill.value = '#00ff00'
  highlightFill.dispatchEvent(new Event('input', { bubbles: true }))
  expect(state.preferences.highlightFill).toBe('#00ff00')
  required<HTMLButtonElement>(
    '[data-target-id="settings-reset-highlight"]'
  ).click()
  expect(state.preferences.highlightFill).toBe(
    defaultReaderPreferences.highlightFill
  )
  expect(state.preferences.highlightOpacity).toBe(
    defaultReaderPreferences.highlightOpacity
  )

  required<HTMLButtonElement>('[data-theme-mode="dark"]').click()
  expect(state.preferences.themeMode).toBe('dark')
  expect(
    document.documentElement.classList.contains('mod-theme-transition')
  ).toBe(true)

  required<HTMLButtonElement>('[data-focal-point-mode="browser"]').click()
  expect(state.preferences.focalPointMode).toBe('browser')

  const autoScroll = required<HTMLInputElement>(
    '[data-target-id="settings-auto-scroll"]'
  )
  autoScroll.checked = false
  autoScroll.dispatchEvent(new Event('change', { bubbles: true }))
  expect(state.preferences.autoScrollWithPlayback).toBe(false)

  state.preferences = mergeReaderPreferences(state.preferences, {
    playbackRate: 1.75,
  })
  settings!.sync()
  const playbackRate = required<HTMLInputElement>(
    '[data-target-id="settings-playback-rate"]'
  )
  expect(playbackRate.value).toBe('1.75')
  playbackRate.value = '1.4'
  playbackRate.dispatchEvent(new Event('change', { bubbles: true }))
  expect(state.setPlaybackRate).toHaveBeenLastCalledWith(1.4)
  expect(state.preferences.playbackRate).toBe(1.4)

  destroy()
  destroy = null
  expect(
    document.documentElement.classList.contains('mod-theme-transition')
  ).toBe(false)
})

function createState() {
  const state: {
    preferences: ReaderPreferences
    updatePreferences: ReturnType<
      typeof vi.fn<(updates: Partial<ReaderPreferences>) => void>
    >
    setPlaybackRate: ReturnType<typeof vi.fn<(rate: number) => void>>
    restoreFocus: ReturnType<
      typeof vi.fn<(target: HTMLElement | null) => void>
    >
  } = {
    preferences: { ...defaultReaderPreferences },
    updatePreferences: vi.fn(),
    setPlaybackRate: vi.fn(),
    restoreFocus: vi.fn(),
  }
  state.updatePreferences.mockImplementation((updates) => {
    state.preferences = mergeReaderPreferences(state.preferences, updates)
  })
  state.setPlaybackRate.mockImplementation((playbackRate) => {
    state.preferences = mergeReaderPreferences(state.preferences, {
      playbackRate,
    })
  })
  return state
}

function createOptions(
  state: ReturnType<typeof createState>
): ReaderSettingsOptions {
  return {
    document,
    view: window,
    narrators,
    getPreferences: () => state.preferences,
    updatePreferences: state.updatePreferences,
    setPlaybackRate: state.setPlaybackRate,
    restoreFocus: state.restoreFocus,
    animateThemeChanges: true,
  }
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = fixture.querySelector<T>(selector)
  if (!element) throw new Error(`Missing fixture element: ${selector}`)
  return element
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

const narrators: AudioNarrator[] = [
  {
    id: 'yoni-davidov',
    displayName: 'First Reader',
    credit: 'First Reader',
  },
  {
    id: 'second-reader',
    displayName: 'Second Reader',
    credit: 'Second Reader',
  },
]
