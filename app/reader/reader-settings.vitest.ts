import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import '../../css/master.css'
import type {
  AudioNarrator,
  ParshaAudioRecording,
} from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import { createDownloadLibrary } from '../offline/download-library.ts'
import { descriptorForRecording } from '../offline/recording-download.ts'
import { resolveRecordingAsset, type RecordingStorage } from '../offline/recording-storage.ts'
import type { StoredRecording } from '../offline/recording-inventory.ts'
import { defaultReaderPreferences, mergeReaderPreferences, colorContrastRatio, type ReaderPreferences } from '../reader-preferences.ts'
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

test.each([390])('adjusts Reading font size and retains it across layout changes at %ipx', async (width) => {
  await page.viewport(width, 900)
  const state = createState()
  let settings: ReaderSettings | null = null
  destroy = createMount()((scope) => { settings = createReaderSettings(scope, createOptions(state)) })
  settings!.open()
  expect(fixture.querySelector('[data-target-id="settings-reading-font-scale"]')).toBeNull()
  required<HTMLButtonElement>('[data-reader-text-layout="reading"]').click()
  await vi.waitFor(() => expect(fixture.querySelector('[data-target-id="settings-reading-font-scale"]')).not.toBeNull())
  const slider = required<HTMLInputElement>('[data-target-id="settings-reading-font-scale"]')
  await vi.waitFor(() => expect(slider.disabled).toBe(false))
  const basePixels = Number(slider.value)
  expect(slider.getAttribute('aria-valuetext')).toMatch(/^\d+(\.\d+)? px$/)
  slider.value = String(basePixels * 1.25)
  slider.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(slider.getAttribute('aria-valuetext')).toBe(`${Number((basePixels * 1.25).toFixed(1))} px`))
  expect(state.preferences.readingFontScale).toBe(1.25)
  const panel = required<HTMLElement>('[data-settings-panel="reading"]')
  const labels = [...panel.querySelectorAll<HTMLElement>('.settings-field-label')]
  for (const label of labels) expect(label.getBoundingClientRect().left).toBeCloseTo(labels[0].getBoundingClientRect().left, 1)
  expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1)
  expect(slider.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `../../.vitest-attachments/reading-font-settings-${width}.png` })
  required<HTMLButtonElement>('[data-reader-text-layout="match"]').click()
  await vi.waitFor(() => expect(fixture.querySelector('[data-target-id="settings-reading-font-scale"]')).toBeNull())
  required<HTMLButtonElement>('[data-reader-text-layout="reading"]').click()
  await vi.waitFor(() => expect(Number(required<HTMLInputElement>('[data-target-id="settings-reading-font-scale"]').value)).toBeCloseTo(basePixels * 1.25, 3))
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

  expect(state.preferences.focalPointMode).toBe('browser')
  required<HTMLButtonElement>('[data-focal-point-mode="reader"]').click()
  expect(state.preferences.focalPointMode).toBe('reader')

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

test.each([390])('shared downloads survive closing Settings and announce deferred deletion at %ipx', async (width) => {
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

test.each([390])('repairs missing offline content without deleting or re-downloading saved audio at %ipx', async (width) => {
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
