import { createPersistedJsonStore, requirePersistedJsonMutation } from '../persistence/persisted-state.ts'
import { holdSharedLocks } from './shared-locks.ts'

export interface CapacityAsset { url: string; byteLength: number }
export interface CapacityEstimate { assets: readonly CapacityAsset[]; availableBytes: number | null }
interface Reservation { owner: string; assets: CapacityAsset[] }
export const CAPACITY_KEY = 'tikkun.download-capacity.v1'
export const capacityOwnerLock = (owner: string) => `${CAPACITY_KEY}:${owner}`
const validBytes = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
export const isCapacityAsset = (value: unknown): value is CapacityAsset => !!value && typeof value === 'object' &&
  'url' in value && typeof value.url === 'string' && /^https?:\/\//.test(value.url) &&
  'byteLength' in value && validBytes(value.byteLength) && value.byteLength > 0

export function capacityRequired(assets: readonly CapacityAsset[]) {
  const unique = new Map<string, number>()
  for (const asset of assets) {
    if (!isCapacityAsset(asset)) throw new Error('Invalid download capacity asset.')
    unique.set(asset.url, Math.max(unique.get(asset.url) ?? 0, asset.byteLength))
  }
  // ponytail: reserve a full staging copy until the batch ends. Track remaining
  // writes only if this conservative bound prevents useful low-space batches.
  const bytes = unique.size ? [...unique.values()].reduce((sum, size) => sum + size * 2, 0) + 33_554_432 : 0
  if (!Number.isSafeInteger(bytes)) throw new Error('Download capacity reservation is too large.')
  return bytes
}

export function createCapacityReservations(storage: Storage | null, locks: LockManager | null) {
  const store = createPersistedJsonStore<Reservation[]>({ storage, key: CAPACITY_KEY,
    validate: (value): value is Reservation[] => Array.isArray(value) && value.every((entry) =>
      !!entry && typeof entry === 'object' && typeof entry.owner === 'string' &&
      /^[a-f0-9-]{36}$/.test(entry.owner) && Array.isArray(entry.assets) && entry.assets.every(isCapacityAsset)) &&
      new Set(value.map((entry) => entry.owner)).size === value.length,
  })
  const read = () => {
    const result = store.read()
    if (result.status === 'unavailable') throw result.error
    if (result.status === 'invalid') throw new Error('Saved download capacity data is invalid; existing data was kept.')
    return { entries: result.status === 'ready' ? result.value : [], revision: result.revision }
  }
  return {
    async reserve(measure: () => Promise<CapacityEstimate>, signal: AbortSignal): Promise<() => Promise<void>> {
      if (!locks) throw new Error('Shared download capacity coordination is unavailable.')
      const owner = crypto.randomUUID()
      const release = await holdSharedLocks(locks, [capacityOwnerLock(owner)], signal)
      try {
        await locks.request(CAPACITY_KEY, { signal }, async () => {
          const current = read()
          const { held } = await locks.query()
          if (!held) throw new Error('Shared download capacity ownership is unavailable.')
          const live = new Set(held.map((lock) => lock.name))
          const entries = current.entries.filter((entry) => live.has(capacityOwnerLock(entry.owner)))
          const estimate = await measure()
          signal.throwIfAborted()
          if (estimate.availableBytes !== null && !validBytes(estimate.availableBytes)) throw new Error('Invalid download capacity estimate.')
          const required = capacityRequired([...entries.flatMap((entry) => entry.assets), ...estimate.assets])
          if (estimate.availableBytes !== null && required > estimate.availableBytes) {
            throw new Error('Not enough browser storage including downloads queued in other tabs. Cancel a batch or remove downloads and try again.')
          }
          requirePersistedJsonMutation(store.write([...entries, { owner, assets: [...estimate.assets] }], current.revision))
        })
      } catch (error) { await release(); throw error }
      let finishing: Promise<void> | undefined
      return () => finishing ??= locks.request(CAPACITY_KEY, () => {
        const current = read()
        requirePersistedJsonMutation(store.write(current.entries.filter((entry) => entry.owner !== owner), current.revision))
      }).finally(release)
    },
  }
}
