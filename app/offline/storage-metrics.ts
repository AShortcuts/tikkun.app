import type { NativeMediaPlugin } from '../platform/native-media.ts'
import type { DownloadLibrarySnapshot } from './download-library.ts'

export interface StorageCategory { id: string; label: string; bytes: number }
export interface StorageMetrics {
  categories: readonly StorageCategory[]
  availableBytes: number | null
  availableLabel: string
  note: string
  originUsageBytes?: number | null
}
export interface StorageMeter {
  measure(snapshot: DownloadLibrarySnapshot): Promise<StorageMetrics>
  clearTemporary?: () => Promise<void>
}

export function parseNativeStorageMetrics(value: unknown): StorageMetrics {
  if (!value || typeof value !== 'object') throw new Error('Invalid device storage measurement.')
  const bytes = (key: string): number => {
    const amount = Reflect.get(value, key)
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) throw new Error(`Invalid device storage field: ${key}.`)
    return amount
  }
  return { categories: [
    { id: 'core', label: 'App and core text', bytes: bytes('appBytes') },
    { id: 'audio', label: 'Audio downloads', bytes: bytes('audioBytes') },
    { id: 'temporary', label: 'Temporary files', bytes: bytes('temporaryBytes') },
    { id: 'metadata', label: 'Download records', bytes: bytes('metadataBytes') },
  ], availableBytes: Reflect.get(value, 'availableBytes') === null ? null : bytes('availableBytes'),
  availableLabel: 'Device space available for downloads',
  note: 'Logical file sizes. Personal data and system overhead are not included.' }
}

export function createNativeStorageMeter(bridge: NativeMediaPlugin): StorageMeter {
  return { measure: async () => parseNativeStorageMetrics(await bridge.metrics()), clearTemporary: () => bridge.clearTemporary() }
}

export function createWebStorageMeter({ caches, storage, basePath, crypto }: {
  caches: (Pick<CacheStorage, 'keys'> & { open(name: string): Promise<Pick<Cache, 'keys' | 'match'>> }) | undefined
  storage: Pick<StorageManager, 'estimate'> | undefined
  basePath: string
  crypto: Crypto
}): StorageMeter {
  return { async measure(snapshot) {
    if (snapshot.phase !== 'ready') throw new Error('Audio inventory is not verified yet. Refresh downloads before measuring storage.')
    if (!caches) throw new Error('Browser cache measurements are unavailable.')
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basePath.replace(/\/+$/, '') || '/'))
    const namespace = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12)
    let core = 0
    let support = 0
    for (const name of await caches.keys()) {
      const isCore = name.startsWith(`tikkun-shell-${namespace}-`) || name === `tikkun-torah-${namespace}`
      if (!isCore && name !== `tikkun-dependencies-${namespace}`) continue
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        if (!response) throw new Error('Browser storage changed during measurement. Refresh to try again.')
        // Read decoded bodies, not compressed Content-Length; audio is accounted
        // by verified inventory without loading large recordings into memory.
        const reader = response.body?.getReader()
        let size = 0
        if (reader) try {
          for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength }
        } finally { reader.releaseLock() }
        if (isCore) core += size
        else support += size
      }
    }
    const estimate = await storage?.estimate()
    const valid = (amount: number | undefined): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
    return { categories: [
      { id: 'core', label: 'App and core text caches', bytes: core },
      { id: 'support', label: 'Offline reading dependencies', bytes: support },
      { id: 'audio', label: 'Verified audio downloads', bytes: snapshot.inventory.reduce((sum, asset) => sum + asset.byteLength, 0) },
    ], availableBytes: valid(estimate?.quota) && valid(estimate?.usage) ? Math.max(0, estimate.quota - estimate.usage) : null,
    availableLabel: 'Browser storage available (estimated)',
    originUsageBytes: valid(estimate?.usage) ? estimate.usage : null,
    note: 'Known Tikkun cache bytes. Personal data and browser overhead are not included. Browser quota is not device free space.' }
  } }
}
