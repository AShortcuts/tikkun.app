import { afterEach, expect, test, vi } from 'vitest'
import { createDownloadLibrary } from './download-library.ts'
import { createDownloadOwner, type DownloadOwner } from './download-owner.ts'
import { recordingAssetKey, type RecordingStorage } from './recording-storage.ts'
import type { RecordingDescriptor } from './recording-download.ts'

const owners: DownloadOwner[] = []
afterEach(() => { owners.splice(0).forEach((owner) => owner.destroy()); vi.restoreAllMocks() })

function fixture() {
  const owner = createDownloadOwner()
  owners.push(owner)
  const asset: RecordingDescriptor = {
    audioId: 'one', title: 'One', url: 'https://tikkun.test/audio/one.m4a', digest: 'a'.repeat(64), byteLength: 100,
  }
  const key = recordingAssetKey(asset)
  let saved = false
  let finish: (() => void) | undefined
  let signal: AbortSignal | undefined
  const intent = new Set<string>()
  const backend: RecordingStorage = {
    supported: true,
    inventory: vi.fn(async () => saved ? [asset] : []),
    download: vi.fn<RecordingStorage['download']>((_asset, transferSignal) => new Promise((resolve, reject) => {
      signal = transferSignal
      transferSignal.addEventListener('abort', () => reject(transferSignal.reason), { once: true })
      finish = () => { saved = true; resolve(asset) }
    })),
    remove: vi.fn(async () => { saved = false }),
    destroy: vi.fn(),
  }
  const create = vi.fn((inUse: (asset: RecordingDescriptor) => boolean) => createDownloadLibrary({
    assets: [asset], backend, inUse,
    intent: {
      read: async () => [...intent],
      update: async (add, remove) => { remove.forEach((key) => intent.delete(key)); add.forEach((key) => intent.add(key)) },
    },
  }))
  // These tests use only the EventTarget contract of the two browser surfaces.
  const view = new EventTarget() as Window
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as Document
  const events = { view, document, intentKey: 'test-intent' }
  const library = () => owner.getLibrary(create, events)
  return { owner, library, create, events, backend, key, intent, finish: () => finish!(), signal: () => signal }
}

test('constructs lazily and reuses one transfer owner after the Reader detaches', async () => {
  const f = fixture()
  expect(f.create).not.toHaveBeenCalled()
  const library = f.library()
  const release = f.owner.protectPlayback(() => false)
  await library.enqueue([f.key])
  expect(f.signal()?.aborted).toBe(false)
  await release()
  expect(f.signal()?.aborted).toBe(false)
  expect(f.backend.destroy).not.toHaveBeenCalled()
  f.finish()
  await vi.waitFor(() => expect(library.snapshot().entries[0].phase).toBe('stored'))
  expect(f.library()).toBe(library)
  expect(f.create).toHaveBeenCalledOnce()
  expect(f.backend.download).toHaveBeenCalledOnce()
  expect(f.intent.size).toBe(0)
})

test('preserves pending removal until every playback protection releases', async () => {
  const f = fixture()
  const library = f.library()
  await library.enqueue([f.key])
  f.finish()
  await vi.waitFor(() => expect(library.snapshot().entries[0].phase).toBe('stored'))
  const inUse = () => true
  const first = f.owner.protectPlayback(inUse)
  const second = f.owner.protectPlayback(inUse)
  await library.remove([f.key])
  expect(library.snapshot().entries[0].phase).toBe('removal-pending')
  await first()
  await first()
  expect(f.backend.remove).not.toHaveBeenCalled()
  await second()
  expect(f.backend.remove).toHaveBeenCalledOnce()
  expect(library.snapshot().entries[0].phase).toBe('idle')
})

test('keeps refresh listeners outside Reader and removes them at application teardown', async () => {
  const f = fixture()
  const library = f.library()
  const refresh = vi.spyOn(library, 'refresh')
  f.events.view.dispatchEvent(new Event('focus'))
  expect(refresh).not.toHaveBeenCalled()
  await library.refresh()
  refresh.mockClear()
  f.events.view.dispatchEvent(new Event('focus'))
  f.events.view.dispatchEvent(Object.assign(new Event('storage'), { key: 'other' }))
  f.events.view.dispatchEvent(Object.assign(new Event('storage'), { key: f.events.intentKey }))
  f.events.view.dispatchEvent(Object.assign(new Event('storage'), { key: null }))
  f.events.document.dispatchEvent(new Event('visibilitychange'))
  expect(refresh).toHaveBeenCalledTimes(4)
  await library.refresh()
  f.owner.destroy()
  refresh.mockClear()
  f.events.view.dispatchEvent(new Event('focus'))
  f.events.view.dispatchEvent(Object.assign(new Event('storage'), { key: f.events.intentKey }))
  f.events.document.dispatchEvent(new Event('visibilitychange'))
  expect(refresh).not.toHaveBeenCalled()
})

test('aborts only on application teardown, preserving persisted retry intent', async () => {
  const f = fixture()
  await f.library().enqueue([f.key])
  const release = f.owner.protectPlayback(() => false)
  f.owner.destroy()
  f.owner.destroy()
  await release()
  expect(f.signal()?.aborted).toBe(true)
  expect(f.intent.has(f.key)).toBe(true)
  await vi.waitFor(() => expect(f.backend.destroy).toHaveBeenCalledOnce())
  expect(() => f.library()).toThrow('destroyed')
  expect(() => f.owner.protectPlayback(() => false)).toThrow('destroyed')
})

test('does not automatically refresh an unsupported download backend', async () => {
  const f = fixture()
  Object.defineProperty(f.backend, 'supported', { value: false })
  const library = f.library()
  await library.refresh()
  const refresh = vi.spyOn(library, 'refresh')
  f.events.view.dispatchEvent(new Event('focus'))
  f.events.view.dispatchEvent(Object.assign(new Event('storage'), { key: f.events.intentKey }))
  f.events.document.dispatchEvent(new Event('visibilitychange'))
  expect(refresh).not.toHaveBeenCalled()
})

test('separate application roots never share a library or playback protections', async () => {
  const first = fixture()
  const second = fixture()
  expect(first.library()).not.toBe(second.library())
  first.owner.destroy()
  await second.library().enqueue([second.key])
  expect(second.signal()?.aborted).toBe(false)
  second.finish()
  await vi.waitFor(() => expect(second.library().snapshot().entries[0].phase).toBe('stored'))
})

test('retries failed initialization without retaining a broken library', () => {
  const f = fixture()
  f.create.mockImplementationOnce(() => { throw new Error('unavailable') })
  expect(() => f.library()).toThrow('unavailable')
  expect(f.library().snapshot().phase).toBe('idle')
  expect(f.create).toHaveBeenCalledTimes(2)
})
