import { expect, test, vi } from 'vitest'
import { protectQueuedRecording, queueLockName } from './queue-protection.ts'
import { createDownloadLibrary } from './download-library.ts'
import { recordingAssetKey, type RecordingStorage } from './recording-storage.ts'
import type { RecordingDescriptor } from './recording-download.ts'
import { renderRecordingMutationLocks } from '../../scripts/recording-mutation-locks.mjs'

interface Worker {
  withRecordingRemoval<T>(url: string | null, task: () => Promise<T>): Promise<T>
}
const worker = (scope: string): Worker => new Function('self', `${renderRecordingMutationLocks(scope)}; return {withRecordingRemoval}`)({ navigator, registration: { scope } })
const noLocks = async (scope: string) => {
  await expect.poll(async () => (await navigator.locks.query()).held?.filter((lock) => lock.name?.includes(scope))).toEqual([])
  expect((await navigator.locks.query()).pending?.filter((lock) => lock.name?.includes(scope))).toEqual([])
}

test('unsubmitted queue protects selected and bulk removal; cancel permits removal without a later download', async () => {
  const scope = `https://tikkun.test/${crypto.randomUUID()}/`
  const api = worker(scope)
  const assets: RecordingDescriptor[] = ['one', 'two', 'waiting'].map((audioId) => ({
    audioId, title: audioId, url: `${scope}${audioId}`, digest: 'a'.repeat(64), byteLength: 100,
  }))
  const keys = assets.map(recordingAssetKey)
  const saved = new Set<string>()
  const removed = vi.fn(async () => {})
  const backend: RecordingStorage = {
    supported: true, inventory: async () => [], destroy() {},
    protectQueued: (asset, signal) => protectQueuedRecording(navigator.locks, scope, asset.url, signal),
    download: vi.fn<RecordingStorage['download']>((_asset, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })),
    remove: (asset) => api.withRecordingRemoval(asset.url, removed),
  }
  const intent = { read: async () => [...saved], update: async (add: readonly string[], remove: readonly string[]) => {
    remove.forEach((key) => saved.delete(key)); add.forEach((key) => saved.add(key))
  } }
  const first = createDownloadLibrary({ assets, backend, intent })
  const second = createDownloadLibrary({ assets, backend: { ...backend }, intent })
  try {
    await first.enqueue(keys)
    expect(first.snapshot().entries[2].phase).toBe('queued')
    expect(backend.download).toHaveBeenCalledTimes(2)
    await expect(second.remove([keys[2]])).rejects.toThrow('could not be removed')
    expect(second.snapshot().entries[2].error).toContain('queued or active')
    await expect(api.withRecordingRemoval(null, removed)).rejects.toThrow('queued or active')
    expect(removed).not.toHaveBeenCalled()
    await api.withRecordingRemoval(`${scope}unrelated`, removed)
    await first.cancel([keys[2]])
    await second.remove([keys[2]])
    await first.cancel(keys.slice(0, 2))
    expect(backend.download).toHaveBeenCalledTimes(2)
    await api.withRecordingRemoval(null, removed)
  } finally { first.destroy(); second.destroy() }
  await noLocks(scope)
})

test('removal rejects new queue claims and partial acquisition releases every lease', async () => {
  const scope = `https://tikkun.test/${crypto.randomUUID()}/`, url = `${scope}one`
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const entered = vi.fn()
  const removing = worker(scope).withRecordingRemoval(url, async () => { entered(); await held })
  try {
    await expect.poll(() => entered.mock.calls.length).toBe(1)
    await expect(protectQueuedRecording(navigator.locks, scope, url, new AbortController().signal)).rejects.toThrow('removing')
    const heldNames = (await navigator.locks.query()).held?.map((lock) => lock.name)
    expect(heldNames?.filter((name) => name === queueLockName(scope))).toHaveLength(1)
    const unrelated = await protectQueuedRecording(navigator.locks, `${scope}other/`, url, new AbortController().signal)
    await unrelated()
  } finally { release(); await removing }
  await noLocks(scope)
})

test('destroy releases queued and active claims while keeping retry intent', async () => {
  const scope = `https://tikkun.test/${crypto.randomUUID()}/`
  const assets = ['one', 'two', 'three'].map((audioId) => ({ audioId, title: audioId,
    url: `${scope}${audioId}`, digest: 'a'.repeat(64), byteLength: 100 }))
  const saved = new Set<string>()
  const library = createDownloadLibrary({ assets,
    intent: { read: async () => [...saved], update: async (add) => { add.forEach((key) => saved.add(key)) } },
    backend: { supported: true, inventory: async () => [], destroy() {}, remove: async () => {},
      protectQueued: (asset, signal) => protectQueuedRecording(navigator.locks, scope, asset.url, signal),
      download: (_asset, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    },
  })
  try { await library.enqueue(assets.map(recordingAssetKey)) } finally { library.destroy() }
  await noLocks(scope)
  expect(saved.size).toBe(3)
  await worker(scope).withRecordingRemoval(null, async () => {})
})

test('aborted or unsupported queue protection cannot create leases', async () => {
  const scope = `https://tikkun.test/${crypto.randomUUID()}/`
  const controller = new AbortController()
  controller.abort()
  await expect(protectQueuedRecording(navigator.locks, scope, `${scope}one`, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(() => protectQueuedRecording(null, scope, `${scope}one`, new AbortController().signal)).toThrow('unavailable')
  await noLocks(scope)
})
