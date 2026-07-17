export type StorageOperation = 'read' | 'write' | 'remove'

const MAX_QUARANTINED_VALUE_LENGTH = 32_768

export class PersistedStateStorageError extends Error {
  constructor(
    readonly operation: StorageOperation,
    readonly key: string,
    readonly cause?: unknown
  ) {
    super(`Browser storage ${operation} failed for ${key}`)
    this.name = 'PersistedStateStorageError'
  }
}

export function getBrowserStorage(kind: 'local' | 'session') {
  try {
    if (typeof window !== 'undefined') {
      return kind === 'local' ? window.localStorage : window.sessionStorage
    }
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage
  } catch (error) {
    console.error(`${kind === 'local' ? 'Local' : 'Session'} browser storage is unavailable`, error)
    return null
  }
}

export function readStorageItem(storage: Storage | null, key: string) {
  if (!storage) throw new PersistedStateStorageError('read', key)
  try {
    return storage.getItem(key)
  } catch (error) {
    throw new PersistedStateStorageError('read', key, error)
  }
}

export function writeStorageItem(
  storage: Storage | null,
  key: string,
  value: string
) {
  if (!storage) throw new PersistedStateStorageError('write', key)
  try {
    storage.setItem(key, value)
  } catch (error) {
    throw new PersistedStateStorageError('write', key, error)
  }
}

export function removeStorageItem(storage: Storage | null, key: string) {
  if (!storage) throw new PersistedStateStorageError('remove', key)
  try {
    storage.removeItem(key)
  } catch (error) {
    throw new PersistedStateStorageError('remove', key, error)
  }
}

export function quarantineStorageItem({
  storage,
  key,
  rawValue,
  reason,
  replacementValue,
  quarantinedAt = Date.now(),
}: {
  storage: Storage | null
  key: string
  rawValue: string
  reason: string
  replacementValue?: string
  quarantinedAt?: number
}) {
  if (!storage) return false
  const boundedValue = rawValue.slice(0, MAX_QUARANTINED_VALUE_LENGTH)
  const payload = JSON.stringify({
    version: 1,
    sourceKey: key,
    reason,
    quarantinedAt,
    rawValue: boundedValue,
    truncated: boundedValue.length !== rawValue.length,
  })
  try {
    storage.setItem(`${key}:quarantine`, payload)
    if (replacementValue === undefined) storage.removeItem(key)
    else storage.setItem(key, replacementValue)
    return true
  } catch (error) {
    console.error(`Failed to quarantine invalid browser state for ${key}`, error)
    return false
  }
}
