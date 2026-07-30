import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
} from './access.ts'
import {
  createCueAuthoringLoader,
  type CueAuthoringLoader,
  type CueAuthoringModule,
} from './cue-authoring-loader.ts'
import type { CueAuthoring } from './cue-authoring.ts'

let destroy: (() => void) | null = null

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  destroy?.()
  destroy = null
  sessionStorage.clear()
})

function createAuthoring(): CueAuthoring {
  return {
    isUnlocked: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    isActive: vi.fn(() => false),
    isRecording: vi.fn(() => false),
    getSession: vi.fn(() => null),
    setVisible: vi.fn(),
    closeAccess: vi.fn(),
    openIssue: vi.fn(),
    restoreAccessState: vi.fn(),
    bindSession: vi.fn(async () => {}),
    clearSession: vi.fn(),
    selectReaderToken: vi.fn(async () => {}),
    handleKeydown: vi.fn(() => true),
    closeOverlays: vi.fn(),
    recordingIssuesChanged: vi.fn(),
  }
}

function createModule(): CueAuthoringModule {
  return {
    createCueAuthoring: vi.fn(),
  }
}

function mountLoader({
  load,
  authoring = createAuthoring(),
}: {
  load: () => Promise<CueAuthoringModule>
  authoring?: CueAuthoring
}) {
  let loader: CueAuthoringLoader | null = null
  const onLoadError = vi.fn()
  destroy = createMount()((scope) => {
    loader = createCueAuthoringLoader(scope, {
      sessionStorage,
      load,
      mount: () => authoring,
      onMounted: vi.fn(),
      onUnmounted: vi.fn(),
      onLoadError,
    })
  })
  return {
    get loader() {
      if (!loader) throw new Error('Cue Authoring loader was not mounted')
      return loader
    },
    authoring,
    onLoadError,
  }
}

test('shares one in-flight optional import and one mount', async () => {
  const load = vi.fn(async () => createModule())
  const harness = mountLoader({ load })

  const [first, second] = await Promise.all([
    harness.loader.ensureLoaded(),
    harness.loader.ensureLoaded(),
  ])

  expect(load).toHaveBeenCalledOnce()
  expect(first).toBe(harness.authoring)
  expect(second).toBe(harness.authoring)
  expect(harness.authoring.restoreAccessState).toHaveBeenCalledOnce()
})

test('a failed optional import reports the error and can retry', async () => {
  const failure = new Error('chunk unavailable')
  const load = vi
    .fn<() => Promise<CueAuthoringModule>>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(createModule())
  const harness = mountLoader({ load })

  await expect(harness.loader.ensureLoaded()).resolves.toBeNull()
  await expect(harness.loader.ensureLoaded()).resolves.toBe(harness.authoring)

  expect(load).toHaveBeenCalledTimes(2)
  expect(harness.onLoadError).toHaveBeenCalledWith(failure)
})

test('closing while the shortcut import is pending prevents a late open', async () => {
  const deferred: {
    resolve?: (module: CueAuthoringModule) => void
  } = {}
  const harness = mountLoader({
    load: () =>
      new Promise((resolve) => {
        deferred.resolve = resolve
      }),
  })
  const shortcut = new KeyboardEvent('keydown', {
    key: 'a',
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  })

  expect(harness.loader.handleShortcut(shortcut)).toBe(true)
  expect(shortcut.defaultPrevented).toBe(true)
  harness.loader.close()
  deferred.resolve?.(createModule())
  await Promise.resolve()
  await Promise.resolve()

  expect(harness.authoring.handleKeydown).not.toHaveBeenCalled()
  expect(harness.authoring.setVisible).toHaveBeenCalledWith(false)
})

test('restores only a panel that was open, not closed unlocked access', async () => {
  const closedLoad = vi.fn(async () => createModule())
  sessionStorage.setItem(CUE_AUTHORING_UNLOCKED_KEY, '1')
  const closedHarness = mountLoader({ load: closedLoad })
  closedHarness.loader.restoreIfOpen()
  await Promise.resolve()
  expect(closedLoad).not.toHaveBeenCalled()
  destroy?.()
  destroy = null

  sessionStorage.setItem(CUE_AUTHORING_PANEL_OPEN_KEY, '1')
  const openLoad = vi.fn(async () => createModule())
  const openHarness = mountLoader({ load: openLoad })
  openHarness.loader.restoreIfOpen()
  await Promise.resolve()
  await Promise.resolve()
  expect(openLoad).toHaveBeenCalledOnce()
  expect(openHarness.authoring.restoreAccessState).toHaveBeenCalledOnce()
})
