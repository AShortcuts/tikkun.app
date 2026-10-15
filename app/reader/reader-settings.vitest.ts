import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
import '../../css/master.css'
import type {
  AudioNarrator,
  ParshaAudioRecording,
} from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import { mountAudioButtonTooltip } from '../reading/audio-button-tooltip.ts'
import { createDownloadLibrary } from '../offline/download-library.ts'
import { descriptorForRecording } from '../offline/recording-download.ts'
import { resolveRecordingAsset, type RecordingStorage } from '../offline/recording-storage.ts'
import type { StoredRecording } from '../offline/recording-inventory.ts'
import { hexToOklch, oklchToHex } from './oklch-color.ts'
import { serializeReaderTheme } from '../reader-themes.ts'
import {
  applyReaderPreferences,
  defaultReaderPreferences,
  mergeReaderPreferences,
  colorContrastRatio,
  themeModes,
  type ReaderPreferences,
} from '../reader-preferences.ts'
import {
  createReaderSettings,
  type ReaderSettings,
  type ReaderSettingsOptions,
} from './reader-settings.ts'

let fixture: HTMLElement
let destroy: (() => void) | null = null
let clipboardDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
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
  document.documentElement.dataset.readerTheme = 'automatic'
  document.documentElement.style.removeProperty(
    '--reader-custom-background-color'
  )
  document.documentElement.style.removeProperty('--reader-custom-text-color')
  document.documentElement.style.removeProperty('--reader-custom-ui-text-color')
  document.documentElement.style.removeProperty('--reader-custom-ui-secondary-color')
  delete document.documentElement.dataset.readerCustomScheme
  document.documentElement.style.colorScheme = ''
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
})

test.each([390, 1280])('adjusts Reading font size and retains it across layout changes at %ipx', async (width) => {
  await page.viewport(width, 900)
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
  settings!.open()
  expect(fixture.querySelector('[data-target-id="settings-reading-font-scale"]')).toBeNull()
  required<HTMLButtonElement>('[data-reader-text-layout="reading"]').click()
  await vi.waitFor(() => expect(fixture.querySelector('[data-target-id="settings-reading-font-scale"]')).not.toBeNull())
  const slider = required<HTMLInputElement>('[data-target-id="settings-reading-font-scale"]')
  slider.value = '1.25'
  slider.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(slider.getAttribute('aria-valuetext')).toBe('125%'))
  expect(state.preferences.readingFontScale).toBe(1.25)
  await page.screenshot({ path: `../../.vitest-attachments/reading-font-settings-${width}.png` })
  required<HTMLButtonElement>('[data-reader-text-layout="match"]').click()
  await vi.waitFor(() => expect(fixture.querySelector('[data-target-id="settings-reading-font-scale"]')).toBeNull())
  required<HTMLButtonElement>('[data-reader-text-layout="reading"]').click()
  await vi.waitFor(() => expect(required<HTMLInputElement>('[data-target-id="settings-reading-font-scale"]').value).toBe('1.25'))
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

test.each([390, 1280])('More keeps print in one row and explains unavailable storage at %ipx', async (width) => {
  await page.viewport(width, 900)
  const openPrint = vi.fn()
  const openMedia = vi.fn()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    mountAudioButtonTooltip(scope, document)
    settings = createReaderSettings(scope, { ...createOptions(createState()), openPrint, openMedia })
  })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="more"]').click()
  await nextAnimationFrame()

  const print = required<HTMLButtonElement>('button[aria-label="Print passage"]')
  const label = required('.settings-action-row .settings-field-label')
  const printRect = print.getBoundingClientRect()
  const labelRect = label.getBoundingClientRect()
  expect(Math.abs(printRect.top + printRect.height / 2 - labelRect.top - labelRect.height / 2)).toBeLessThan(1)
  expect(printRect.width).toBeGreaterThanOrEqual(44)
  expect(printRect.height).toBeGreaterThanOrEqual(44)

  const media = page.getByRole('button', { name: 'Media & Storage', exact: true })
  const mediaButton = media.element()
  expect(mediaButton.getAttribute('aria-disabled')).toBe('true')
  await media.click({ force: true })
  const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!
  await vi.waitFor(() => expect(tip.hidden).toBe(false))
  expect(tip.textContent).toBe('Offline downloads are unavailable in this browser.')
  expect(mediaButton.getAttribute('aria-describedby')).toBe(tip.id)
  expect(openMedia).not.toHaveBeenCalled()
  expect(required('[data-target-id="settings-pane"]').classList.contains('u-hidden')).toBe(false)

  await page.getByRole('button', { name: 'Print passage', exact: true }).click()
  expect(openPrint).toHaveBeenCalledOnce()
  expect(tip.hidden).toBe(true)
  expect(required('[data-target-id="settings-pane"]').classList.contains('u-hidden')).toBe(true)
})

test.each(['browser', 'device'] as const)('supported %s storage opens even without a selected recording', async (location) => {
  const library = createDownloadLibrary({
    assets: [],
    backend: { supported: true, location, inventory: async () => [],
      download: vi.fn(), remove: vi.fn(), destroy: vi.fn() },
    intent: { read: async () => [], update: async () => {} },
  })
  const openMedia = vi.fn()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    scope.own(() => library.destroy())
    settings = createReaderSettings(scope, { ...createOptions(createState()), downloadLibrary: library, openMedia })
  })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="more"]').click()
  const media = page.getByRole('button', { name: 'Media & Storage', exact: true })
  await vi.waitFor(() => expect(media.element().getAttribute('aria-disabled')).toBe('false'))
  expect(media.element().hasAttribute('data-reader-tooltip')).toBe(false)
  await media.click()
  expect(openMedia).toHaveBeenCalledOnce()
  expect(required('[data-target-id="settings-pane"]').classList.contains('u-hidden')).toBe(true)
})

test('moves settings without changing preferences, keeps them reachable, and restores the mobile layout', async () => {
  await page.viewport(1280, 900)
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, createOptions(state))
  })
  settings!.open()
  await nextAnimationFrame()
  const pane = required<HTMLElement>('[data-target-id="settings-pane"]')
  const handle = required<HTMLButtonElement>('[data-target-id="settings-drag-handle"]')
  const original = pane.getBoundingClientRect()
  const drag = (dx: number, dy: number) => {
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 1, button: 0, clientX: 100, clientY: 100,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 1, clientX: 100 + dx, clientY: 100 + dy,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }))
  }
  drag(-200, 20)
  await nextAnimationFrame()
  expect(pane.getBoundingClientRect().left).toBeCloseTo(original.left - 200)
  expect(pane.classList.contains('is-dragging')).toBe(false)
  expect(document.activeElement).toBe(handle)
  settings!.close()
  settings!.open()
  await nextAnimationFrame()
  expect(pane.getBoundingClientRect().left).toBeCloseTo(original.left - 200)

  handle.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, key: 'ArrowLeft', shiftKey: true,
  }))
  await nextAnimationFrame()
  expect(pane.getBoundingClientRect().left).toBeCloseTo(original.left - 240)
  handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }))
  await nextAnimationFrame()
  expect(pane.style.left).toBe('')
  expect(pane.getBoundingClientRect().left).toBeCloseTo(original.left)

  drag(-2000, 2000)
  await nextAnimationFrame()
  expect(pane.getBoundingClientRect().left).toBe(8)
  expect(pane.getBoundingClientRect().bottom).toBeLessThanOrEqual(892)
  await page.viewport(700, 700)
  await nextAnimationFrame()
  expect(pane.getBoundingClientRect().right).toBeLessThanOrEqual(700)
  expect(pane.getBoundingClientRect().bottom).toBeLessThanOrEqual(700)
  await page.viewport(390, 844)
  await vi.waitFor(() => expect(handle.hidden).toBe(true))
  expect(pane.style.left).toBe('')
  expect(pane.classList.contains('is-positioned')).toBe(false)

  await page.viewport(1280, 900)
  await vi.waitFor(() => expect(handle.hidden).toBe(false))
  handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await nextAnimationFrame()
  expect(pane.style.left).toBe('')
  drag(-10, 0)
  await nextAnimationFrame()
  expect(pane.style.left).toBe('')
  expect(state.updatePreferences).not.toHaveBeenCalled()
})

test('switches four accessible icon-only settings categories', async () => {
  const state = createState()
  let settings: ReaderSettings | null = null

  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, createOptions(state))
  })
  settings!.open()

  const categoryButtons = Array.from(
    fixture.querySelectorAll<HTMLButtonElement>('[data-settings-category]')
  )
  expect(categoryButtons).toHaveLength(4)
  expect(categoryButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
    'Reading',
    'Appearance',
    'Playback',
    'More',
  ])
  expect(categoryButtons.every((button) => button.textContent?.trim() === '')).toBe(
    true
  )

  const reading = required<HTMLButtonElement>(
    '[data-settings-category="reading"]'
  )
  const appearance = required<HTMLButtonElement>(
    '[data-settings-category="appearance"]'
  )
  const playback = required<HTMLButtonElement>(
    '[data-settings-category="playback"]'
  )
  const readingPanel = required<HTMLElement>('#reader-settings-reading-panel')
  const playbackPanel = required<HTMLElement>('#reader-settings-playback-panel')
  expect(reading.getAttribute('aria-pressed')).toBe('true')
  expect(readingPanel.hasAttribute('hidden')).toBe(false)
  expect(
    required('[data-target-id="settings-disable-shift-hide"]').closest(
      '[data-settings-panel]'
    )
  ).toBe(readingPanel)
  expect(
    required('[data-target-id="settings-focal-point-mode"]').closest(
      '[data-settings-panel]'
    )
  ).toBe(readingPanel)
  expect(
    required('[data-target-id="settings-narrator"]').closest(
      '[data-settings-panel]'
    )
  ).toBe(playbackPanel)
  expect(
    required('[data-target-id="settings-playback-rate"]').closest(
      '[data-settings-panel]'
    )
  ).toBe(playbackPanel)
  const focalPointMode = required('[data-target-id="settings-focal-point-mode"]')
  const disableShift = required('[data-target-id="settings-disable-shift-hide"]')
  const focalMeasure = required<HTMLButtonElement>(
    '[data-target-id="debug-focal-measure-toggle"]'
  )
  const sectionTitle = readingPanel.querySelector<HTMLElement>(
    '.settings-section-title'
  )
  expect(sectionTitle).not.toBeNull()
  if (!sectionTitle) throw new Error('Reading section title unavailable')
  const sectionTitleStyle = getComputedStyle(sectionTitle)
  expect(sectionTitleStyle.textTransform).toBe('uppercase')
  expect(Number.parseFloat(sectionTitleStyle.letterSpacing)).toBeGreaterThan(0)
  const readingChoices = readingPanel.querySelectorAll('.settings-reader-choice')
  expect(readingChoices).toHaveLength(3)
  expect(
    focalPointMode.closest('.settings-reader-choice')?.classList
  ).toContain('mod-position')
  expect(focalMeasure.classList).toContain('settings-secondary-action')
  expect(focalMeasure.closest('.settings-reader-tool')).not.toBeNull()
  expect(readingPanel.textContent).toContain('Where the active word sits.')
  expect(readingPanel.textContent).toContain('Keep Shift from hiding vowels.')
  expect(disableShift.getAttribute('role')).toBe('switch')
  expect(disableShift.closest('.settings-field')?.classList).toContain(
    'mod-switch'
  )
  expect(
    focalPointMode.compareDocumentPosition(disableShift) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).not.toBe(0)
  expect(disableShift.closest('.settings-field')?.classList).toContain(
    'mod-card'
  )
  expect(fixture.querySelector('.settings-advanced-link')).toBeNull()
  expect(fixture.querySelector('.settings-instant-status')).toBeNull()
  expect(fixture.querySelector('.settings-selected-check')).toBeNull()
  expect(
    required('[data-target-id="settings-reset-highlight"]').classList
  ).toContain('settings-header-action')
  expect(required('[data-target-id="settings-close"]').classList).toContain(
    'settings-header-action'
  )

  appearance.click()
  await vi.waitFor(() => {
    expect(appearance.getAttribute('aria-pressed')).toBe('true')
    expect(reading.getAttribute('aria-pressed')).toBe('false')
    expect(
      required('#reader-settings-reading-panel').hasAttribute('hidden')
    ).toBe(true)
    expect(
      required('#reader-settings-appearance-panel').hasAttribute('hidden')
    ).toBe(false)
  })

  playback.click()
  await vi.waitFor(() => {
    expect(playback.getAttribute('aria-pressed')).toBe('true')
    expect(playbackPanel.hasAttribute('hidden')).toBe(false)
    expect(readingPanel.hasAttribute('hidden')).toBe(true)
  })
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

  required<HTMLButtonElement>('[data-theme-mode="custom"]').click()
  expect(state.preferences.themeMode).toBe('custom')
  expect(required('[data-target-id="settings-custom-theme"]')).toBeTruthy()
  for (const group of fixture.querySelectorAll('.settings-custom-color')) {
    expect([...group.querySelectorAll('label > span')].map((label) => label.textContent))
      .toEqual(['Hue', 'Chroma', 'Lightness'])
    expect([...group.querySelectorAll('input[type="range"]')].map((input) => input.getAttribute('aria-label')?.split(' ').at(-1)))
      .toEqual(['hue', 'chroma', 'lightness'])
  }
  expect(required('#reader-settings-reading-panel').textContent).toContain('Reading center')
  expect([...fixture.querySelectorAll('[data-theme-mode] > span')].every((sample) => sample.textContent === 'אָב')).toBe(true)
  expect(fixture.querySelectorAll('[data-custom-theme-preset]')).toHaveLength(6)
  required<HTMLButtonElement>('[data-custom-theme-preset="night"]').click()
  expect(state.preferences.customBackgroundColor).toBe('#191c22')
  expect(state.preferences.customTextColor).toBe('#f8f7f3')
  const backgroundTone = required<HTMLInputElement>(
    '[data-target-id="settings-custom-background-tone"]'
  )
  backgroundTone.value = '30'
  backgroundTone.dispatchEvent(new Event('input', { bubbles: true }))
  const previewedBackground = document.documentElement.style.getPropertyValue(
    '--reader-custom-background-color'
  )
  expect(previewedBackground).not.toBe('#191c22')
  backgroundTone.dispatchEvent(new Event('change', { bubbles: true }))
  expect(state.preferences.customBackgroundColor).toBe(previewedBackground)

  const chroma = required<HTMLInputElement>('[data-target-id="settings-custom-background-chroma"]')
  chroma.value = '0.4'
  chroma.dispatchEvent(new Event('input', { bubbles: true }))
  chroma.dispatchEvent(new Event('change', { bubbles: true }))
  expect(state.preferences.customBackgroundColor).not.toBe(previewedBackground)
  const colorPicker = required<HTMLInputElement>('input[aria-label="Text color"]')
  colorPicker.value = '#008877'
  colorPicker.dispatchEvent(new Event('input', { bubbles: true }))
  colorPicker.dispatchEvent(new Event('change', { bubbles: true }))
  expect(state.preferences.customTextColor).toBe('#008877')

  state.preferences = mergeReaderPreferences(state.preferences, {
    customBackgroundColor: '#aaaaaa',
    customTextColor: '#999999',
  })
  settings!.sync()
  const caption = required<HTMLElement>('[data-theme-mode="custom"] small')
  const rgb = getComputedStyle(caption).color.match(/\d+/g)!.slice(0, 3)
  const captionColor = '#' + rgb.map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')
  expect(colorContrastRatio('#aaaaaa', captionColor)).toBeGreaterThanOrEqual(4.5)
  expect(
    required('[data-target-id="settings-custom-contrast"]').textContent
  ).toContain('Current colors remain allowed')
  required<HTMLButtonElement>(
    '[data-target-id="settings-custom-contrast"] button'
  ).click()
  expect(state.preferences.customTextColor).not.toBe('#999999')

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

test.each(themeModes)('opening the editor preserves saved colors and the %s theme', async (themeMode) => {
  const state = createState()
  state.preferences = mergeReaderPreferences(state.preferences, {
    themeMode,
    customBackgroundColor: '#ABCDEF',
    customTextColor: '#123456',
  })
  const original = { ...state.preferences }
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, createOptions(state))
  })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="appearance"]').click()
  settings!.close()
  settings!.open()
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(state.preferences).toEqual(original)
  expect(state.updatePreferences).not.toHaveBeenCalled()
  if (themeMode !== 'custom') required<HTMLButtonElement>('[data-theme-mode="custom"]').click()
  expect(state.preferences.customBackgroundColor).toBe('#ABCDEF')
  expect(state.preferences.customTextColor).toBe('#123456')
  expect(Number(required<HTMLInputElement>('[aria-label="Background lightness"]').value))
    .toBeCloseTo(hexToOklch('#ABCDEF').lightness * 100, 0)
})

test('keeps OKLCH slider intent through gray, gamut fitting, commits and external colors', async () => {
  const state = createState()
  state.preferences = mergeReaderPreferences(state.preferences, {
    themeMode: 'custom', customBackgroundColor: '#888888', customTextColor: '#123456',
  })
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, createOptions(state))
  })
  settings!.open()
  const setRange = (label: string, value: string, commit = true) => {
    const input = required<HTMLInputElement>(`[aria-label="${label}"]`)
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    if (commit) input.dispatchEvent(new Event('change', { bubbles: true }))
    return Number(input.value)
  }
  setRange('Background hue', '280')
  expect(state.preferences.customBackgroundColor).toBe('#888888')
  await new Promise((resolve) => setTimeout(resolve, 100))
  setRange('Background chroma', '0.08')
  expect(state.preferences.customBackgroundColor).toBe(oklchToHex({
    ...hexToOklch('#888888'), hue: 280, chroma: 0.08,
  }))
  setRange('Background lightness', '60')
  const chosenChroma = setRange('Background chroma', '0.4')
  const fitted = state.preferences.customBackgroundColor
  setRange('Background lightness', '0')
  expect(state.preferences.customBackgroundColor).toBe('#000000')
  setRange('Background lightness', '60')
  expect(state.preferences.customBackgroundColor).toBe(fitted)
  expect(state.preferences.customTextColor).toBe('#123456')
  expect(Number(required<HTMLInputElement>('[aria-label="Background chroma"]').value)).toBe(chosenChroma)

  const picker = required<HTMLInputElement>('input[aria-label="Background color"]')
  picker.value = '#008877'
  picker.dispatchEvent(new Event('input', { bubbles: true }))
  picker.dispatchEvent(new Event('change', { bubbles: true }))
  const picked = hexToOklch('#008877')
  setRange('Background hue', '120', false)
  settings!.close()
  expect(state.preferences.customBackgroundColor).toBe(oklchToHex({ ...picked, hue: 120 }))

  state.preferences = mergeReaderPreferences(state.preferences, { customTextColor: '#ff8800' })
  settings!.sync()
  setRange('Text lightness', '50')
  expect(state.preferences.customTextColor).toBe(oklchToHex({ ...hexToOklch('#ff8800'), lightness: 0.5 }))
})

test.each([390, 1280])('shared downloads survive closing Settings and announce deferred deletion at %ipx', async (width) => {
  await page.viewport(width, 900)
  const asset = resolveRecordingAsset(descriptorForRecording(activeRecording)!, document.baseURI)
  let stored: StoredRecording[] = []
  let finish: (() => void) | undefined
  let inUse = true
  const backend: RecordingStorage = {
    supported: true,
    inventory: async () => stored,
    download: () => new Promise((resolve) => { finish = () => { stored = [asset]; resolve(asset) } }),
    remove: vi.fn(async () => { stored = [] }),
    destroy: vi.fn(),
  }
  const library = createDownloadLibrary({
    assets: [asset], backend, inUse: () => inUse,
    intent: { read: async () => [], update: async () => {} },
  })
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    scope.own(() => library.destroy())
    settings = createReaderSettings(scope, {
      ...createOptions(createState()), downloadLibrary: library, getCurrentRecording: () => activeRecording,
    })
  })
  settings!.open()
  const button = required<HTMLButtonElement>('[data-target-id="settings-offline-recording-download"]')
  await vi.waitFor(() => expect(button.disabled).toBe(false))
  button.click()
  await vi.waitFor(() => expect(button.textContent).toBe('Downloading recording…'))
  settings!.close()
  expect(backend.destroy).not.toHaveBeenCalled()
  finish!()
  await vi.waitFor(() => expect(library.snapshot().inventory).toHaveLength(1))
  settings!.open()
  await vi.waitFor(() => {
    expect(library.snapshot().phase).toBe('ready')
    expect(button.textContent).toBe('Remove offline recording')
    expect(button.disabled).toBe(false)
  })
  button.click()
  await vi.waitFor(() => expect(library.snapshot().entries[0]).toMatchObject({ phase: 'removal-pending', error: null }))
  await vi.waitFor(() => expect(button.textContent).toBe('Removal pending'))
  expect(button.disabled).toBe(true)
  expect(backend.remove).not.toHaveBeenCalled()
  expect(required('[data-target-id="settings-offline-recording-status"]').textContent).toContain('playback releases')
  expect(required('[data-target-id="settings-offline-recording-announcement"]').textContent).not.toContain('was removed')
  inUse = false
  await library.releasePlayback()
  await vi.waitFor(() => expect(button.textContent).toBe('Download current recording'))
  expect(backend.remove).toHaveBeenCalledOnce()
})

test('native Settings distinguishes bundled Torah and device downloads from browser cache', async () => {
  const asset = resolveRecordingAsset(descriptorForRecording(activeRecording)!, document.baseURI)
  const library = createDownloadLibrary({
    assets: [asset],
    backend: { supported: true, location: 'device', inventory: async () => [asset],
      download: async () => asset, remove: async () => {}, destroy() {} },
    intent: { read: async () => [], update: async () => {} },
  })
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    scope.own(() => library.destroy())
    settings = createReaderSettings(scope, { ...createOptions(createState()), downloadLibrary: library,
      getCurrentRecording: () => activeRecording })
  })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="more"]').click()
  await vi.waitFor(() => expect(required('[data-target-id="settings-offline-recording-status"]').textContent).toContain('on this device'))
  expect(required('[data-target-id="settings-offline-status"]').textContent).toBe('Core Torah pages are included in this app.')
  expect(fixture.querySelector('[data-target-id="settings-offline-download"]')).toBeNull()
})

test.each([390, 1280])('repairs missing offline content without deleting or re-downloading saved audio at %ipx', async (width) => {
  await page.viewport(width, 900)
  const asset = resolveRecordingAsset(descriptorForRecording(activeRecording)!, document.baseURI)
  const download = vi.fn(async () => asset)
  const remove = vi.fn(async () => {})
  let ready = false
  const library = createDownloadLibrary({
    assets: [asset],
    backend: { supported: true, inventory: async () => [asset], download, remove, destroy() {} },
    dependencies: { check: async () => ready ? 'ready' : 'missing', prepare: async () => { ready = true; return 'ready' } },
    intent: { read: async () => [], update: async () => {} },
  })
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    scope.own(() => library.destroy())
    settings = createReaderSettings(scope, { ...createOptions(createState()), downloadLibrary: library, getCurrentRecording: () => activeRecording })
  })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="more"]').click()
  const button = required<HTMLButtonElement>('[data-target-id="settings-offline-recording-download"]')
  await vi.waitFor(() => expect(button.textContent).toBe('Repair offline download'))
  expect(button.disabled).toBe(false)
  expect(required('[data-target-id="settings-offline-recording-status"]').textContent).toContain('timings are missing')
  expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth)
  await page.screenshot({ path: `../../.vitest-attachments/offline-repair-${width}.png` })
  button.click()
  await vi.waitFor(() => expect(button.textContent).toBe('Remove offline recording'))
  expect(download).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
  expect(library.snapshot().inventory).toHaveLength(1)
})

test('downloads and removes only the active recording after explicit requests', async () => {
  const state = createState()
  const commands: string[] = []
  let finishDownload = () => {}
  const worker = {
    postMessage(
      message: { type: string; recording?: { audioId: string } },
      transfer: Transferable[]
    ) {
      commands.push(message.type)
      const port = transfer[0] as MessagePort
      if (message.type === 'GET_TORAH_DOWNLOAD_STATUS') {
        port.postMessage({
          type: 'TORAH_DOWNLOAD_STATUS',
          state: 'idle',
          downloaded: 0,
          total: 1,
          complete: false,
        })
        return
      }
      const audioId = message.recording?.audioId
      if (!audioId) throw new Error('Missing recording command payload')
      const send = (
        phase: 'idle' | 'downloading' | 'complete' | 'removing',
        downloadedBytes: number
      ) =>
        port.postMessage({
          type: 'RECORDING_DOWNLOAD_STATUS',
          audioId,
          state: phase,
          downloadedBytes,
          totalBytes: 12,
          otherCount: 0,
          otherBytes: 0,
          exactStored: phase === 'complete',
          complete: phase === 'complete',
        })
      if (message.type === 'GET_RECORDING_DOWNLOAD_STATUS') {
        send('idle', 0)
      } else if (message.type === 'DOWNLOAD_RECORDING') {
        send('downloading', 6)
        finishDownload = () => send('complete', 12)
      } else {
        send('removing', 12)
        send('idle', 0)
      }
    },
  }
  const registration = { active: worker }
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  } as unknown as ServiceWorkerContainer
  let settings: ReaderSettings | null = null

  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, {
      ...createOptions(state),
      serviceWorker,
      getCurrentRecording: () => activeRecording,
    })
  })
  settings!.open()
  await flushMessages()

  const button = required<HTMLButtonElement>(
    '[data-target-id="settings-offline-recording-download"]'
  )
  await vi.waitFor(() => {
    expect(commands).toEqual([
      'GET_TORAH_DOWNLOAD_STATUS',
      'GET_RECORDING_DOWNLOAD_STATUS',
    ])
    expect(button.textContent).toBe('Download current recording')
    expect(
      required('[data-target-id="settings-offline-recording-status"]')
        .textContent
    ).toContain('Saved only when you request it')
  })

  button.click()
  await vi.waitFor(() => {
    expect(commands).toContain('DOWNLOAD_RECORDING')
    expect(button.textContent).toBe('Downloading recording…')
    expect(
      required<HTMLProgressElement>(
        '[aria-label="Offline recording download progress"]'
      ).value
    ).toBe(6)
    expect(
      required('[data-target-id="settings-offline-recording-announcement"]')
        .textContent
    ).toContain('Saving Beresheet Aliyah 1 for offline playback')
    expect(
      required('[data-target-id="settings-offline-recording-announcement"]')
        .textContent
    ).not.toContain('6')
  })

  finishDownload()
  await vi.waitFor(() => {
    expect(button.textContent).toBe('Remove offline recording')
  })

  button.click()
  await vi.waitFor(() => {
    expect(commands).toContain('REMOVE_RECORDING_DOWNLOAD')
    expect(button.textContent).toBe('Download current recording')
    expect(
      required('[data-target-id="settings-offline-recording-announcement"]')
        .textContent
    ).toContain('Beresheet Aliyah 1 was removed from offline storage')
  })
})

test('shows and explicitly removes offline recordings outside the current catalog entry', async () => {
  const state = createState()
  const commands: string[] = []
  const worker = {
    postMessage(
      message: { type: string; recording?: { audioId: string } },
      transfer: Transferable[]
    ) {
      commands.push(message.type)
      const port = transfer[0] as MessagePort
      if (message.type === 'GET_TORAH_DOWNLOAD_STATUS') {
        port.postMessage({
          type: 'TORAH_DOWNLOAD_STATUS',
          state: 'idle',
          downloaded: 0,
          total: 1,
          complete: false,
        })
        return
      }
      const audioId = message.recording?.audioId
      if (!audioId) throw new Error('Missing recording command payload')
      const send = (state: 'idle' | 'removing', otherCount: number) =>
        port.postMessage({
          type: 'RECORDING_DOWNLOAD_STATUS',
          audioId,
          state,
          downloadedBytes: 0,
          totalBytes: 12,
          otherCount,
          otherBytes: otherCount > 0 ? 24 : 0,
          exactStored: false,
          complete: false,
        })
      if (message.type === 'REMOVE_OTHER_RECORDING_DOWNLOADS') {
        send('removing', 1)
        send('idle', 0)
      } else {
        send('idle', 1)
      }
    },
  }
  const registration = { active: worker }
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  } as unknown as ServiceWorkerContainer
  let settings: ReaderSettings | null = null

  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, {
      ...createOptions(state),
      serviceWorker,
      getCurrentRecording: () => activeRecording,
    })
  })
  settings!.open()
  await flushMessages()

  await vi.waitFor(() => {
    expect(
      fixture.querySelector(
        '[data-target-id="settings-offline-recording-remove-others"]'
      )
    ).not.toBeNull()
  })
  const removeOthers = required<HTMLButtonElement>(
    '[data-target-id="settings-offline-recording-remove-others"]'
  )
  expect(
    required('[data-target-id="settings-offline-recording-other-status"]')
      .textContent
  ).toContain('1 other offline recording copy')

  removeOthers.click()
  await vi.waitFor(() => {
    expect(commands).toContain('REMOVE_OTHER_RECORDING_DOWNLOADS')
    expect(
      fixture.querySelector(
        '[data-target-id="settings-offline-recording-remove-others"]'
      )
    ).toBeNull()
    expect(
      required('[data-target-id="settings-offline-recording-announcement"]')
        .textContent
    ).toContain('1 other offline recording was removed')
  })
})

test('shows and removes stored recordings without an active recording', async () => {
  const state = createState()
  const commands: string[] = []
  let storedCount = 2
  let storedBytes = 24
  const worker = {
    postMessage(message: { type: string }, transfer: Transferable[]) {
      commands.push(message.type)
      const port = transfer[0] as MessagePort
      if (message.type === 'GET_TORAH_DOWNLOAD_STATUS') {
        port.postMessage({
          type: 'TORAH_DOWNLOAD_STATUS',
          state: 'idle',
          downloaded: 0,
          total: 1,
          complete: false,
        })
        return
      }
      const send = (phase: 'idle' | 'removing') =>
        port.postMessage({
          type: 'RECORDING_DOWNLOAD_INVENTORY_STATUS',
          state: phase,
          count: storedCount,
          totalBytes: storedBytes,
          complete: phase === 'idle' && storedCount === 0,
        })
      if (message.type === 'REMOVE_ALL_RECORDING_DOWNLOADS') {
        send('removing')
        storedCount = 0
        storedBytes = 0
      }
      send('idle')
    },
  }
  const registration = { active: worker }
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  } as unknown as ServiceWorkerContainer
  let settings: ReaderSettings | null = null

  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, {
      ...createOptions(state),
      serviceWorker,
      getCurrentRecording: () => null,
    })
  })
  settings!.open()
  await flushMessages()

  await vi.waitFor(() => {
    expect(
      fixture.querySelector(
        '[data-target-id="settings-offline-recording-remove-all"]'
      )
    ).not.toBeNull()
  })
  const removeAll = required<HTMLButtonElement>(
    '[data-target-id="settings-offline-recording-remove-all"]'
  )
  expect(
    required('[data-target-id="settings-offline-recording-status"]')
      .textContent
  ).toContain('2 offline recording copies use')

  removeAll.click()
  await vi.waitFor(() => {
    expect(commands).toContain('REMOVE_ALL_RECORDING_DOWNLOADS')
    expect(
      fixture.querySelector(
        '[data-target-id="settings-offline-recording-remove-all"]'
      )
    ).toBeNull()
    expect(
      required('[data-target-id="settings-offline-recording-announcement"]')
        .textContent
    ).toContain('2 offline recordings were removed')
  })
})

test.each([390, 1280])('custom themes keep strong themed controls independent of reader text lightness at %ipx', async (width) => {
  await page.viewport(width, 900)
  fixture.dataset.themeContrastFixture = ''
  fixture.insertAdjacentHTML('beforeend', `
    <style>[data-theme-contrast-fixture] * { transition: none !important; }</style>
    <header class="app-toolbar"><button class="toolbar-button"><svg class="ui-icon"></svg></button></header>
    <article class="tikkun-page"><span class="word">Reader text</span><div class="aliyah-start-popup">Reading menu</div></article>
  `)
  const state = createState()
  state.preferences = {
    ...state.preferences,
    themeMode: 'custom',
    savedThemes: Array.from({ length: 5 }, (_, index) => ({
      id: `theme-${index}`,
      background: ['#112233', '#e6ede5', '#777777', '#dcd3ea', '#382322'][index],
      text: '#999999',
    })),
  }
  state.updatePreferences.mockImplementation((updates) => {
    state.preferences = mergeReaderPreferences(state.preferences, updates)
    applyReaderPreferences(state.preferences)
  })
  applyReaderPreferences(state.preferences)
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => {
    settings = createReaderSettings(scope, { ...createOptions(state), animateThemeChanges: false })
  })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="appearance"]').click()
  const controls = ['.app-toolbar', '.toolbar-button .ui-icon', '.settings-pane', '.settings-pane-title h2',
    '[data-target-id="settings-close"]', '[data-settings-category="reading"]', '.aliyah-start-popup']
  const readControls = () => controls.map((selector) => {
    const style = getComputedStyle(required(selector))
    return { background: style.backgroundColor, text: style.color, border: style.borderColor }
  })
  const themes = [
    { selector: '[data-theme-mode="custom"]', background: state.preferences.customBackgroundColor },
    ...state.preferences.savedThemes.map((theme) => ({ ...theme, selector: `[data-saved-theme-id="${theme.id}"]` })),
  ]
  for (const theme of themes) {
    required<HTMLButtonElement>(theme.selector).click()
    const baseline = readControls()
    const root = document.documentElement
    expect(getComputedStyle(root).getPropertyValue('--paper-color').trim()).toBe(theme.background)
    const primary = root.style.getPropertyValue('--reader-custom-ui-text-color')
    const secondary = root.style.getPropertyValue('--reader-custom-ui-secondary-color')
    expect(colorContrastRatio(theme.background, primary)).toBeGreaterThanOrEqual(4.5)
    expect(colorContrastRatio(theme.background, secondary)).toBeGreaterThanOrEqual(4.5)
    for (const lightness of ['0', '100']) {
      const input = required<HTMLInputElement>('[aria-label="Text lightness"]')
      input.value = lightness
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      expect(getComputedStyle(required('.word')).color).toBe(lightness === '0' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)')
      expect(readControls(), `${theme.selector} at lightness ${lightness}`).toEqual(baseline)
    }
  }
})

test.each([390, 1280])('custom theme circles keep independent edits, enforce five slots, and free deleted slots at %ipx', async (width) => {
  await page.viewport(width, 900)
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="appearance"]').click()
  expect(fixture.querySelectorAll('[data-saved-theme-id]')).toHaveLength(1)
  required<HTMLButtonElement>('[data-saved-theme-id]').click()
  const originalId = state.preferences.activeSavedThemeId
  const background = required<HTMLInputElement>('[aria-label="Background color"]')
  background.value = '#112233'
  background.dispatchEvent(new Event('input', { bubbles: true }))
  // Switching slots must commit an in-flight color preview to its original slot.
  required<HTMLButtonElement>('[aria-label="Add custom theme"]').click()
  expect(state.preferences.savedThemes[0].background).toBe('#112233')
  expect(state.preferences.savedThemes[1].background).toBe('#112233')
  expect(state.preferences.savedThemes[1].text).toBe(state.preferences.savedThemes[0].text)
  expect(state.preferences.savedThemes[1].id).not.toBe(originalId)
  expect(state.preferences.customBackgroundColor).toBe(defaultReaderPreferences.customBackgroundColor)
  required<HTMLButtonElement>('[data-custom-theme-preset="sage"]').click()
  expect(state.preferences.savedThemes[1].background).toBe('#e6ede5')
  required<HTMLButtonElement>(`[data-saved-theme-id="${originalId}"]`).click()
  expect(required<HTMLInputElement>('[aria-label="Background color"]').value).toBe('#112233')
  for (let index = 2; index < 5; index += 1) required<HTMLButtonElement>('[aria-label="Add custom theme"]').click()
  expect(fixture.querySelectorAll('[data-saved-theme-id]')).toHaveLength(5)
  expect(fixture.querySelector('[aria-label="Add custom theme"]')).toBeNull()
  const circle = required<HTMLElement>('[data-saved-theme-id]')
  expect(circle.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
  const row = required<HTMLElement>('.settings-saved-themes')
  expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
  required<HTMLButtonElement>('.settings-theme-delete').click()
  expect(state.preferences.savedThemes).toHaveLength(4)
  expect(required('[aria-label="Add custom theme"]')).toBeTruthy()
  expect(document.activeElement?.getAttribute('data-saved-theme-id')).toBe(originalId)
  required<HTMLButtonElement>('[aria-label="Add custom theme"]').click()
  expect(state.preferences.savedThemes).toHaveLength(5)
  for (let index = 0; index < 5; index += 1) required<HTMLButtonElement>('.settings-theme-delete').click()
  expect(state.preferences.savedThemes).toEqual([])
  expect(state.preferences.activeSavedThemeId).toBeNull()
  expect(document.activeElement?.getAttribute('data-theme-mode')).toBe('custom')
  expect(fixture.querySelector('.settings-theme-delete')).toBeNull()
})

test.each([
  { mode: 'light', system: 'dark', background: '#fafafa', text: '#323232' },
  { mode: 'dark', system: 'light', background: '#222222', text: '#d3d3d3' },
  { mode: 'sepia', system: 'light', background: '#efddab', text: '#302c22' },
  { mode: 'automatic', system: 'light', background: '#fafafa', text: '#323232' },
  { mode: 'automatic', system: 'dark', background: '#222222', text: '#d3d3d3' },
  { mode: 'custom', system: 'light', background: '#123456', text: '#fedcba' },
] as const)('new themes start from $mode with system $system', async ({ mode, system, background, text }) => {
  await commands.emulateColorScheme(system)
  try {
    const state = createState()
    state.preferences = mergeReaderPreferences(state.preferences, {
      customBackgroundColor: '#123456', customTextColor: '#fedcba',
    })
    let settings: ReaderSettings | null = null
    destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
    settings!.open()
    required<HTMLButtonElement>('[data-settings-category="appearance"]').click()
    required<HTMLButtonElement>(`[data-theme-mode="${mode}"]`).click()
    applyReaderPreferences(state.preferences)
    required<HTMLButtonElement>('[aria-label="Add custom theme"]').click()
    expect(state.preferences.savedThemes[1]).toMatchObject({ background, text })
    expect(state.preferences.activeSavedThemeId).toBe(state.preferences.savedThemes[1].id)
    expect(state.preferences.customBackgroundColor).toBe('#123456')
    expect(state.preferences.customTextColor).toBe('#fedcba')
    expect(required<HTMLInputElement>('[aria-label="Background color"]').value).toBe(background)
    expect(required<HTMLInputElement>('[aria-label="Text color"]').value).toBe(text)
  } finally {
    await commands.emulateColorScheme(null)
  }
})

test('copies the latest custom colors and pastes only into the selected circle', async () => {
  let clipboard = ''
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: vi.fn(async (value: string) => { clipboard = value }),
    readText: vi.fn(async () => clipboard),
  } })
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="appearance"]').click()
  required<HTMLButtonElement>('[data-theme-mode="custom"]').click()
  const background = required<HTMLInputElement>('[aria-label="Background color"]')
  background.value = '#123456'
  background.dispatchEvent(new Event('input', { bubbles: true }))
  required<HTMLButtonElement>('.settings-theme-transfer button').click()
  await vi.waitFor(() => expect(required('.settings-theme-transfer-status').textContent).toBe('Theme copied.'))
  expect(JSON.parse(clipboard).background).toBe('#123456')
  expect(JSON.parse(clipboard)).not.toHaveProperty('savedThemes')
  required<HTMLButtonElement>('[data-saved-theme-id]').click()
  required<HTMLButtonElement>('[data-target-id="settings-theme-paste"]').click()
  await vi.waitFor(() => expect(required('.settings-theme-transfer-status').textContent).toBe('Theme pasted.'))
  expect(state.preferences.savedThemes[0].background).toBe('#123456')
  expect(state.preferences.narratorId).toBe(defaultReaderPreferences.narratorId)
  required<HTMLButtonElement>('[data-custom-theme-preset="night"]').click()
  required<HTMLButtonElement>('[data-theme-mode="custom"]').click()
  expect(required<HTMLInputElement>('[aria-label="Background color"]').value).toBe('#123456')
})

test('rejects bad configs without changing colors and supports manual paste when clipboard access fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const readText = vi.fn(async () => 'not a theme')
  const writeText = vi.fn(async () => { throw new Error('denied') })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } })
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="appearance"]').click()
  required<HTMLButtonElement>('[data-saved-theme-id]').click()
  const before = JSON.stringify(state.preferences)
  required<HTMLButtonElement>('[data-target-id="settings-theme-paste"]').click()
  await vi.waitFor(() => expect(required('.settings-theme-transfer-status').textContent).toContain('not a theme config'))
  expect(JSON.stringify(state.preferences)).toBe(before)
  readText.mockRejectedValue(new Error('denied'))
  required<HTMLButtonElement>('[data-target-id="settings-theme-paste"]').click()
  await vi.waitFor(() => expect(required('.settings-theme-transfer-status').textContent).toContain('Paste your theme config below'))
  const input = required<HTMLTextAreaElement>('#reader-theme-config')
  expect(document.activeElement).toBe(input)
  input.value = serializeReaderTheme({ background: '#233344', text: '#e5edf4' })
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(required<HTMLButtonElement>('.settings-theme-config button').disabled).toBe(false))
  required<HTMLButtonElement>('.settings-theme-config button').click()
  expect(state.preferences.savedThemes[0].background).toBe('#233344')
  await vi.waitFor(() => expect(fixture.querySelector('#reader-theme-config')).toBeNull())
  required<HTMLButtonElement>('.settings-theme-transfer button').click()
  await vi.waitFor(() => expect(required('.settings-theme-transfer-status').textContent).toContain('Copy the selected config below'))
  const output = required<HTMLTextAreaElement>('#reader-theme-config')
  expect(output.readOnly).toBe(true)
  expect(JSON.parse(output.value).background).toBe('#233344')
  expect(output.selectionEnd).toBe(output.value.length)
  expect(log).toHaveBeenCalledTimes(2)
})

test('an outstanding clipboard read cannot overwrite a different selected theme', async () => {
  let resolveRead!: (value: string) => void
  const readText = vi.fn(() => new Promise<string>((resolve) => { resolveRead = resolve }))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } })
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
  settings!.open()
  required<HTMLButtonElement>('[data-saved-theme-id]').click()
  required<HTMLButtonElement>('[data-target-id="settings-theme-paste"]').click()
  expect(required('#reader-theme-config')).toBeTruthy()
  required<HTMLButtonElement>('[aria-label="Add custom theme"]').click()
  const before = JSON.stringify(state.preferences)
  resolveRead(serializeReaderTheme({ background: '#112233', text: '#ffffff' }))
  await flushMessages()
  expect(JSON.stringify(state.preferences)).toBe(before)
  expect(required('.settings-theme-transfer-status').textContent).toBe('')
})

test('manual paste stays available while clipboard permission is pending and wins over a late read', async () => {
  let resolveRead!: (value: string) => void
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    readText: () => new Promise<string>((resolve) => { resolveRead = resolve }),
  } })
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
  settings!.open()
  required<HTMLButtonElement>('[data-settings-category="appearance"]').click()
  required<HTMLButtonElement>('[data-saved-theme-id]').click()
  required<HTMLButtonElement>('[data-target-id="settings-theme-paste"]').click()
  const input = required<HTMLTextAreaElement>('#reader-theme-config')
  input.value = serializeReaderTheme({ background: '#233344', text: '#e5edf4' })
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(required<HTMLButtonElement>('.settings-theme-config button').disabled).toBe(false))
  required<HTMLButtonElement>('.settings-theme-config button').click()
  expect(state.preferences.savedThemes[0].background).toBe('#233344')
  resolveRead(serializeReaderTheme({ background: '#112233', text: '#ffffff' }))
  await flushMessages()
  expect(state.preferences.savedThemes[0].background).toBe('#233344')
  expect(required('.settings-theme-transfer-status').textContent).toBe('Theme pasted.')
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
    serviceWorker: null,
    getCurrentRecording: () => null,
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

async function flushMessages() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
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

const activeRecording: ParshaAudioRecording = {
  id: 'beresheet-1',
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'beresheet', name: 'Beresheet' },
  aliyah: 1,
  title: 'Beresheet Aliyah 1',
  playSrc: `/audio/beresheet-1.m4a?tikkun-media=${'a'.repeat(64)}`,
  downloadSrc: '/audio/beresheet-1.m4a',
  format: 'm4a',
  status: 'available',
  mediaIdentity: {
    algorithm: 'sha256',
    digest: 'a'.repeat(64),
    byteLength: 12,
  },
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
}
