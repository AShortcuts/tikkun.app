import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import type { ReaderSettings } from './reader-settings.ts'
import {
  createLazyReaderSettings,
  type LazyReaderSettings,
  type ReaderSettingsModule,
} from './lazy-reader-settings.ts'

let toggle: HTMLButtonElement

beforeEach(() => {
  toggle = document.createElement('button')
  toggle.dataset.targetId = 'settings-toggle'
  toggle.setAttribute('aria-expanded', 'false')
  document.body.append(toggle)
})

afterEach(() => {
  toggle.remove()
  vi.restoreAllMocks()
})

function fakeSettings(): ReaderSettings {
  return {
    open: vi.fn(),
    close: vi.fn(() => true),
    sync: vi.fn(),
  }
}

function mountLazySettings(
  load: () => Promise<ReaderSettingsModule>,
  onLoadError = vi.fn()
) {
  let settings!: LazyReaderSettings
  const destroy = createMount()((scope) => {
    settings = createLazyReaderSettings(scope, {
      document,
      view: window,
      narrators: [],
      getPreferences: vi.fn(),
      updatePreferences: vi.fn(),
      setPlaybackRate: vi.fn(),
      restoreFocus: vi.fn(),
      animateThemeChanges: true,
      serviceWorker: null,
      getCurrentRecording: () => null,
      load,
      onLoadError,
    })
  })
  return { destroy, onLoadError, settings }
}

async function flushLazyWork() {
  for (let count = 0; count < 5; count += 1) {
    await Promise.resolve()
  }
}

test('load failures are reported and a later open retries', async () => {
  const connected = fakeSettings()
  const failure = new Error('settings unavailable')
  const load = vi
    .fn<() => Promise<ReaderSettingsModule>>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({
      createReaderSettings: vi.fn(() => connected),
    })
  const { destroy, onLoadError, settings } = mountLazySettings(load)

  settings.open()
  await flushLazyWork()
  expect(onLoadError).toHaveBeenCalledWith(failure)

  settings.open()
  await flushLazyWork()
  expect(load).toHaveBeenCalledTimes(2)
  expect(connected.open).toHaveBeenCalledOnce()

  destroy()
})
