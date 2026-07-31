import { expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import type { CommandPalette } from './command-palette.ts'
import {
  createLazyCommandPalette,
  type CommandPaletteModule,
  type LazyCommandPalette,
} from './lazy-command-palette.ts'

function deferredModule() {
  let resolve!: (module: CommandPaletteModule) => void
  const promise = new Promise<CommandPaletteModule>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function fakePalette(): CommandPalette {
  let open = false
  return {
    open: vi.fn(() => {
      open = true
    }),
    close: vi.fn(() => {
      open = false
    }),
    toggle: vi.fn(),
    isOpen: () => open,
    refresh: vi.fn(),
  }
}

function mountLazyPalette(
  load: () => Promise<CommandPaletteModule>,
  onLoadError = vi.fn()
) {
  let palette!: LazyCommandPalette
  const destroy = createMount()((scope) => {
    palette = createLazyCommandPalette(scope, {
      document,
      getActions: () => [],
      restoreFocus: vi.fn(),
      isBookmarkAction: () => false,
      formatBadge: (label) => label,
      load,
      onLoadError,
    })
  })
  return { destroy, onLoadError, palette }
}

async function flushLazyWork() {
  for (let count = 0; count < 5; count += 1) {
    await Promise.resolve()
  }
}

test('loads and mounts the Command Palette only when first opened', async () => {
  const deferred = deferredModule()
  const load = vi.fn(() => deferred.promise)
  const connected = fakePalette()
  const createCommandPalette = vi.fn(() => connected)
  const { destroy, palette } = mountLazyPalette(load)

  expect(load).not.toHaveBeenCalled()
  palette.open()
  expect(load).toHaveBeenCalledOnce()
  expect(palette.isOpen()).toBe(true)

  deferred.resolve({ createCommandPalette })
  await flushLazyWork()

  expect(createCommandPalette).toHaveBeenCalledOnce()
  expect(connected.open).toHaveBeenCalledOnce()
  palette.refresh()
  expect(connected.refresh).toHaveBeenCalledOnce()

  destroy()
})

test('a second toggle cancels an open request while the module loads', async () => {
  const deferred = deferredModule()
  const connected = fakePalette()
  const { destroy, palette } = mountLazyPalette(() => deferred.promise)

  palette.toggle()
  palette.toggle()
  deferred.resolve({
    createCommandPalette: vi.fn(() => connected),
  })
  await flushLazyWork()

  expect(connected.open).not.toHaveBeenCalled()
  expect(palette.isOpen()).toBe(false)

  destroy()
})

test('load failures are reported and a later open retries', async () => {
  const connected = fakePalette()
  const failure = new Error('palette unavailable')
  const load = vi
    .fn<() => Promise<CommandPaletteModule>>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({
      createCommandPalette: vi.fn(() => connected),
    })
  const { destroy, onLoadError, palette } = mountLazyPalette(load)

  palette.open()
  await flushLazyWork()
  expect(onLoadError).toHaveBeenCalledWith(failure)
  expect(palette.isOpen()).toBe(false)

  palette.open()
  await flushLazyWork()
  expect(load).toHaveBeenCalledTimes(2)
  expect(connected.open).toHaveBeenCalledOnce()

  destroy()
})

test('destroying the lifetime prevents a pending module from mounting', async () => {
  const deferred = deferredModule()
  const createCommandPalette = vi.fn(() => fakePalette())
  const { destroy, palette } = mountLazyPalette(() => deferred.promise)

  palette.open()
  destroy()
  deferred.resolve({ createCommandPalette })
  await flushLazyWork()

  expect(createCommandPalette).not.toHaveBeenCalled()
})
