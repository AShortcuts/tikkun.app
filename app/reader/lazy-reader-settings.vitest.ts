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

function deferredModule() {
  let resolve!: (module: ReaderSettingsModule) => void
  const promise = new Promise<ReaderSettingsModule>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

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

test('loads Reader Settings on the first launcher click', async () => {
  const deferred = deferredModule()
  const load = vi.fn(() => deferred.promise)
  const connected = fakeSettings()
  const createReaderSettings = vi.fn(() => connected)
  const { destroy, settings } = mountLazySettings(load)

  expect(load).not.toHaveBeenCalled()
  toggle.click()
  expect(load).toHaveBeenCalledOnce()
  expect(toggle.getAttribute('aria-busy')).toBe('true')

  deferred.resolve({ createReaderSettings })
  await flushLazyWork()

  expect(createReaderSettings).toHaveBeenCalledOnce()
  expect(connected.open).toHaveBeenCalledWith({ returnFocus: toggle })
  expect(toggle.hasAttribute('aria-busy')).toBe(false)
  settings.sync()
  expect(connected.sync).toHaveBeenCalledOnce()

  destroy()
})

test('closing before the module resolves cancels the pending open', async () => {
  const deferred = deferredModule()
  const connected = fakeSettings()
  const { destroy } = mountLazySettings(() => deferred.promise)

  toggle.click()
  toggle.click()
  deferred.resolve({
    createReaderSettings: vi.fn(() => connected),
  })
  await flushLazyWork()

  expect(connected.open).not.toHaveBeenCalled()
  expect(toggle.hasAttribute('aria-busy')).toBe(false)

  destroy()
})

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

test('destroying the lifetime prevents a pending module from mounting', async () => {
  const deferred = deferredModule()
  const createReaderSettings = vi.fn(() => fakeSettings())
  const { destroy, settings } = mountLazySettings(() => deferred.promise)

  settings.open()
  destroy()
  deferred.resolve({ createReaderSettings })
  await flushLazyWork()

  expect(createReaderSettings).not.toHaveBeenCalled()
})
