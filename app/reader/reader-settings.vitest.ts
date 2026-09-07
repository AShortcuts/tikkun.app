import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type {
  AudioNarrator,
  ParshaAudioRecording,
} from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import { hexToOklch, oklchToHex } from './oklch-color.ts'
import {
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
  document.documentElement.dataset.readerTheme = 'automatic'
  document.documentElement.style.removeProperty(
    '--reader-custom-background-color'
  )
  document.documentElement.style.removeProperty('--reader-custom-text-color')
  document.documentElement.style.colorScheme = ''
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
