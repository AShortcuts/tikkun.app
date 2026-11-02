import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import { CUE_AUTHORING_UNLOCKED_KEY } from './access.ts'
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

async function flushLazyWork() {
  for (let count = 0; count < 6; count += 1) {
    await Promise.resolve()
  }
}

test('a failed optional import reports the error and can retry', async () => {
  sessionStorage.setItem(CUE_AUTHORING_UNLOCKED_KEY, '1')
  const failure = new Error('chunk unavailable')
  const load = vi
    .fn<() => Promise<CueAuthoringModule>>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(createModule())
  const harness = mountLoader({ load })

  harness.loader.open()
  await flushLazyWork()
  harness.loader.open()
  await flushLazyWork()

  expect(load).toHaveBeenCalledTimes(2)
  expect(harness.onLoadError).toHaveBeenCalledWith(failure)
})

test('does not load or open when authoring access is locked', async () => {
  const load = vi.fn(async () => createModule())
  const harness = mountLoader({ load })

  harness.loader.open()
  await flushLazyWork()

  expect(load).not.toHaveBeenCalled()
  expect(harness.authoring.setVisible).not.toHaveBeenCalled()
})
