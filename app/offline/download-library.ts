import type { RecordingDescriptor } from './recording-download.ts'
import type { DownloadIntentStore } from './download-intent.ts'
import type { StoredRecording } from './recording-inventory.ts'
import { recordingAssetKey, type RecordingStorage } from './recording-storage.ts'
import { recordingDependenciesReady, type RecordingDependencies, type RecordingReadiness } from './recording-dependencies.ts'

export type DownloadPhase = 'idle' | 'queued' | 'downloading' | 'verifying' | 'stored' | 'paused' | 'error' | 'removing' | 'removal-pending'
export interface DownloadEntry {
  readonly key: string
  readonly asset: Readonly<RecordingDescriptor>
  readonly phase: DownloadPhase
  readonly downloadedBytes: number
  readonly error: string | null
  readonly readiness: RecordingReadiness
}
export interface DownloadLibrarySnapshot {
  readonly supported: boolean
  readonly location: 'browser' | 'device'
  readonly phase: 'idle' | 'checking' | 'ready' | 'error'
  readonly entries: readonly DownloadEntry[]
  readonly inventory: readonly StoredRecording[]
  readonly error: string | null
  readonly persistenceError: string | null
  readonly unavailableIntent: readonly string[]
}
export interface DownloadLibrary {
  snapshot(): DownloadLibrarySnapshot
  subscribe(listener: (snapshot: DownloadLibrarySnapshot) => void): () => void
  refresh(): Promise<void>
  enqueue(keys: readonly string[]): Promise<void>
  cancel(keys: readonly string[]): Promise<void>
  remove(keys: readonly string[]): Promise<void>
  releasePlayback(): Promise<void>
  destroy(): void
}

const message = (error: unknown) => error instanceof Error ? error.message : 'Download operation failed.'

// Inventory measures verified audio even when its supporting content is missing.
// A complete practice package also requires checked dependency readiness.
export function createDownloadLibrary({ assets, backend, intent, dependencies, inUse = () => false }: {
  assets: readonly RecordingDescriptor[]
  backend: RecordingStorage
  intent: DownloadIntentStore
  dependencies?: RecordingDependencies
  inUse?: (asset: RecordingDescriptor) => boolean
}): DownloadLibrary {
  const entries = new Map<string, DownloadEntry>()
  for (const asset of assets) {
    const key = recordingAssetKey(asset)
    if (!entries.has(key)) entries.set(key, Object.freeze({
      key, asset: Object.freeze({ ...asset }), phase: 'idle', downloadedBytes: 0, error: null, readiness: 'unchecked',
    }))
  }
  let inventory = new Map<string, StoredRecording>()
  let phase: DownloadLibrarySnapshot['phase'] = 'idle'
  let error: string | null = null
  let persistenceError: string | null = null
  let unavailableIntent: readonly string[] = []
  let initialized = false
  let destroyed = false
  let revision = 0
  let refreshing: Promise<void> | null = null
  let mutations: Promise<void> = Promise.resolve()
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>()
  const queueProtection = new Map<string, () => Promise<void>>()
  const capacityProtection = new Map<string, () => Promise<void>>()
  const releaseQueued = async (key: string) => {
    const releases = [queueProtection.get(key), capacityProtection.get(key)]
    queueProtection.delete(key)
    capacityProtection.delete(key)
    for (const release of releases) try { await release?.() }
    catch (failure) {
      persistenceError = message(failure)
      console.error('Download reservation cleanup failed', failure)
      publish()
    }
  }
  const listeners = new Set<(snapshot: DownloadLibrarySnapshot) => void>()
  const lifetime = new AbortController()
  const snapshot = (): DownloadLibrarySnapshot => Object.freeze({
    supported: backend.supported, location: backend.location ?? 'browser', phase, entries: Object.freeze([...entries.values()]),
    inventory: Object.freeze([...inventory.values()]), error, persistenceError,
    unavailableIntent: Object.freeze([...unavailableIntent]),
  })
  const publish = () => { if (!destroyed) listeners.forEach((listener) => listener(snapshot())) }
  const set = (key: string, update: Partial<DownloadEntry>) => {
    const entry = entries.get(key)
    if (entry) entries.set(key, Object.freeze({ ...entry, ...update }))
    publish()
  }
  const persist = async (add: readonly string[], remove: readonly string[]) => {
    try { await intent.update(add, remove); persistenceError = null }
    catch (error) { persistenceError = message(error); publish(); throw error }
  }
  const serialize = (action: () => Promise<void>) => {
    const result = mutations.then(async () => {
      if (destroyed) throw new Error('Download library was destroyed.')
      await action()
    })
    mutations = result.catch(() => {})
    return result
  }
  const requireKeys = (keys: readonly string[]) => [...new Set(keys)].map((key) => {
    const entry = entries.get(key)
    if (!entry) throw new Error('Recording is not in the current download catalog.')
    return entry
  })

  const refresh = (): Promise<void> => {
    if (destroyed) return Promise.reject(new Error('Download library was destroyed.'))
    if (refreshing) return refreshing
    const before = revision
    phase = 'checking'; error = null; publish()
    const request = (async () => {
      try {
        const saved = initialized ? null : await intent.read()
        const stored = await backend.inventory()
        const support = new Map<string, { readiness: RecordingReadiness; error: string | null }>()
        if (dependencies) for (const asset of stored) {
          const key = recordingAssetKey(asset)
          if (active.has(key)) continue
          try { support.set(key, { readiness: await dependencies.check({ ...asset, title: entries.get(key)?.asset.title ?? asset.audioId }), error: null }) }
          catch (failure) { support.set(key, { readiness: 'error', error: message(failure) }) }
        }
        if (destroyed) return
        if (before === revision) {
          inventory = new Map(stored.map((asset) => [recordingAssetKey(asset), Object.freeze({ ...asset })]))
          for (const [key, asset] of inventory) {
            if (!entries.has(key)) entries.set(key, Object.freeze({
              key, asset: Object.freeze({ ...asset, title: asset.audioId }),
              phase: 'stored', downloadedBytes: asset.byteLength, error: null, readiness: 'unchecked',
            }))
          }
          for (const [key, entry] of entries) {
            if (active.has(key) || ['queued', 'removing', 'removal-pending'].includes(entry.phase)) continue
            if (inventory.has(key)) {
              const state = support.get(key) ?? { readiness: 'unchecked' as const, error: null }
              set(key, { ...state, phase: state.readiness === 'error' ? 'error' : state.readiness === 'missing' ? 'paused' : 'stored', downloadedBytes: entry.asset.byteLength })
            } else if (entry.phase === 'stored') set(key, { phase: 'idle', downloadedBytes: 0, readiness: 'unchecked' })
          }
        }
        if (saved) {
          unavailableIntent = saved.filter((key) => !entries.has(key))
          for (const key of saved) {
            if (entries.has(key) && !inventory.has(key)) set(key, { phase: 'paused' })
          }
        }
        initialized = true
        phase = 'ready'
      } catch (failure) { phase = 'error'; error = message(failure); throw failure }
      finally { publish() }
    })().finally(() => { if (refreshing === request) refreshing = null })
    refreshing = request
    return request
  }

  const pump = () => {
    if (destroyed) return
    for (const [key, entry] of entries) {
      if (active.size >= 2) break
      if (entry.phase !== 'queued') continue
      const controller = new AbortController()
      const done = Promise.resolve().then(async () => {
        set(key, { phase: dependencies ? 'verifying' : 'downloading', downloadedBytes: inventory.get(key)?.byteLength ?? 0, error: null })
        try {
          const readiness = dependencies ? await dependencies.prepare(entry.asset, controller.signal) : 'unchecked'
          controller.signal.throwIfAborted()
          set(key, { readiness })
          const stored = inventory.get(key) ?? await backend.download(entry.asset, controller.signal, (bytes) => {
            if (controller.signal.aborted || destroyed) return
            if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > entry.asset.byteLength) throw new Error('Invalid download progress.')
            set(key, { phase: bytes === entry.asset.byteLength ? 'verifying' : 'downloading', downloadedBytes: bytes })
          })
          if (recordingAssetKey(stored) !== key) throw new Error('Stored recording identity does not match the request.')
          inventory.set(key, Object.freeze({ ...stored }))
          revision += 1
          set(key, { phase: 'stored', downloadedBytes: stored.byteLength, error: null })
          await persist([], [key])
        } catch (failure) {
          // Persistence failure after a successful commit must not un-save it.
          if (entries.get(key)?.phase !== 'stored') set(key, {
            phase: controller.signal.aborted ? 'paused' : 'error', error: controller.signal.aborted ? null : message(failure),
            downloadedBytes: inventory.get(key)?.byteLength ?? 0,
            readiness: controller.signal.aborted ? 'unchecked' : 'error',
          })
        }
      }).finally(async () => { await releaseQueued(key); active.delete(key); publish(); pump() })
      active.set(key, { controller, done })
      set(key, { phase: 'downloading' })
    }
  }

  const removeOne = async (key: string) => {
    const entry = entries.get(key)!
    if (inUse(entry.asset)) { set(key, { phase: 'removal-pending' }); return }
    set(key, { phase: 'removing', error: null })
    try {
      await backend.remove(entry.asset)
      inventory.delete(key)
      revision += 1
      set(key, { phase: 'idle', downloadedBytes: 0, readiness: 'unchecked' })
      await persist([], [key])
    } catch (failure) { set(key, { phase: 'error', error: message(failure) }); throw failure }
  }

  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => { listeners.delete(listener) } },
    refresh,
    enqueue: (keys) => serialize(async () => {
      if (!initialized) await refresh()
      // A terminal state can be visible while its cross-tab lease is releasing.
      await Promise.all(requireKeys(keys).filter((entry) => ['stored', 'paused', 'error'].includes(entry.phase))
        .map((entry) => active.get(entry.key)?.done))
      const missing = requireKeys(keys).filter((entry) => (!inventory.has(entry.key) || (dependencies && !recordingDependenciesReady(entry.readiness))) &&
        !active.has(entry.key) && entry.phase !== 'queued' && entry.phase !== 'removal-pending')
      if (!missing.length) return
      try {
        if (backend.preflight || dependencies?.preflight || dependencies?.reserve) {
          const pending = new Map([...entries.values()]
            .filter((entry) => active.has(entry.key) || entry.phase === 'queued')
            .map((entry) => [entry.key, entry]))
          for (const entry of missing) pending.set(entry.key, entry)
          const assets = [...pending.values()].map((entry) => entry.asset)
          if (dependencies?.reserve) {
            const release = await dependencies.reserve(assets, lifetime.signal)
            let remaining = missing.length
            for (const entry of missing) capacityProtection.set(entry.key, async () => {
              if (--remaining === 0) await release()
            })
          } else await dependencies?.preflight?.(assets, lifetime.signal)
          const audio = [...pending.values()].filter((entry) => !inventory.has(entry.key)).map((entry) => entry.asset)
          if (audio.length) await backend.preflight?.(audio)
        }
        if (destroyed) throw new Error('Download library was destroyed.')
        if (backend.protectQueued) for (const entry of missing) {
          queueProtection.set(entry.key, await backend.protectQueued(entry.asset, lifetime.signal))
        }
        if (destroyed) throw new Error('Download library was destroyed.')
        await persist(missing.map((entry) => entry.key), [])
        if (destroyed) throw new Error('Download library was destroyed.')
      } catch (failure) {
        await Promise.all(missing.map((entry) => releaseQueued(entry.key)))
        throw failure
      }
      for (const entry of missing) set(entry.key, { phase: 'queued', error: null })
      pump()
    }),
    cancel: (keys) => serialize(async () => {
      const selected = requireKeys(keys)
      for (const entry of selected) {
        if (entry.phase === 'queued') set(entry.key, { phase: 'paused' })
        active.get(entry.key)?.controller.abort()
      }
      // Stopped work remains a manual retry offer. Removing shared intent here
      // could erase another tab's still-active request for the same recording.
      await Promise.all(selected.map((entry) => active.get(entry.key)?.done))
      await Promise.all(selected.map((entry) => releaseQueued(entry.key)))
      await refresh()
    }),
    remove: (keys) => serialize(async () => {
      if (!initialized) await refresh()
      const selected = requireKeys(keys)
      // Mark every queued item before waiting, so an unrelated completion cannot
      // start one of the assets this removal is about to delete.
      for (const entry of selected) {
        if (entry.phase === 'queued') set(entry.key, { phase: 'paused' })
        active.get(entry.key)?.controller.abort()
      }
      await Promise.all(selected.map((entry) => active.get(entry.key)?.done))
      await Promise.all(selected.map((entry) => releaseQueued(entry.key)))
      const failures: unknown[] = []
      for (const entry of selected) {
        try { await removeOne(entry.key) } catch (error) { failures.push(error) }
      }
      if (failures.length) throw new AggregateError(failures, 'Some recording downloads could not be removed.')
    }),
    releasePlayback: () => serialize(async () => {
      for (const [key, entry] of entries) if (entry.phase === 'removal-pending' && !inUse(entry.asset)) await removeOne(key)
    }),
    destroy() {
      if (destroyed) return
      destroyed = true
      lifetime.abort()
      listeners.clear()
      for (const operation of active.values()) operation.controller.abort()
      void Promise.allSettled([mutations, ...[...active.values()].map(({ done }) => done)])
        .then(() => Promise.all([...new Set([...queueProtection.keys(), ...capacityProtection.keys()])].map(releaseQueued)))
        .then(() => { dependencies?.destroy?.(); backend.destroy() })
    },
  }
}
