export type StorageOperation = 'read' | 'write' | 'remove'

const REVISION_RAW: unique symbol = Symbol('persisted-json-revision')

export interface PersistedJsonRevision {
  readonly key: string
  readonly [REVISION_RAW]: string | null
}

export interface PersistedJsonStoreOptions<T> {
  storage: Storage | null
  key: string
  validate: (value: unknown) => value is T
}

export type PersistedJsonStoreReadResult<T> =
  | { status: 'ready'; value: T; revision: PersistedJsonRevision }
  | { status: 'missing'; revision: PersistedJsonRevision }
  | { status: 'unavailable'; error: PersistedStateStorageError }
  | {
      status: 'invalid'
      reason: 'invalid-json' | 'invalid-value'
      error?: unknown
      revision: PersistedJsonRevision
    }

export type PersistedJsonMutationResult =
  | { status: 'written'; revision: PersistedJsonRevision }
  | { status: 'conflict'; revision: PersistedJsonRevision }
  | { status: 'unavailable'; error: PersistedStateStorageError }

// localStorage has no synchronous compare-and-swap. Rechecking exact bytes
// immediately before mutation catches ordinary stale-tab writes.
export class PersistedStateConflictError extends Error {
  readonly reason = 'conflict' as const

  constructor() {
    super('Browser state changed in another context')
    this.name = 'PersistedStateConflictError'
  }
}

export function requirePersistedJsonMutation(
  result: PersistedJsonMutationResult
): PersistedJsonRevision {
  if (result.status === 'written') return result.revision
  if (result.status === 'unavailable') throw result.error
  throw new PersistedStateConflictError()
}

export interface PersistedJsonStore<T> {
  read(): PersistedJsonStoreReadResult<T>
  write(
    value: T,
    expectedRevision: PersistedJsonRevision
  ): PersistedJsonMutationResult
  remove(expectedRevision: PersistedJsonRevision): PersistedJsonMutationResult
}

export const PERSISTED_TIMESTAMP_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

export function isPlausiblePersistedTimestamp(
  value: unknown,
  {
    now = Date.now(),
    futureToleranceMs = PERSISTED_TIMESTAMP_FUTURE_TOLERANCE_MS,
  }: { now?: number; futureToleranceMs?: number } = {}
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    Number.isSafeInteger(now) &&
    Number.isSafeInteger(futureToleranceMs) &&
    futureToleranceMs >= 0 &&
    value <= now + futureToleranceMs
  )
}

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
    console.error(
      `${kind === 'local' ? 'Local' : 'Session'} browser storage is unavailable`,
      error
    )
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

function revision(key: string, rawValue: string | null): PersistedJsonRevision {
  return Object.freeze({ key, [REVISION_RAW]: rawValue })
}

function matches(
  expected: PersistedJsonRevision,
  key: string,
  rawValue: string | null
) {
  return expected.key === key && expected[REVISION_RAW] === rawValue
}

export function createPersistedJsonStore<T>({
  storage,
  key,
  validate,
}: PersistedJsonStoreOptions<T>): PersistedJsonStore<T> {
  function readRaw():
    | { status: 'ready'; rawValue: string | null }
    | { status: 'unavailable'; error: PersistedStateStorageError } {
    try {
      return { status: 'ready', rawValue: readStorageItem(storage, key) }
    } catch (error) {
      return {
        status: 'unavailable',
        error:
          error instanceof PersistedStateStorageError
            ? error
            : new PersistedStateStorageError('read', key, error),
      }
    }
  }

  function unavailable(
    operation: StorageOperation,
    error: unknown
  ): PersistedJsonMutationResult {
    return {
      status: 'unavailable',
      error:
        error instanceof PersistedStateStorageError
          ? error
          : new PersistedStateStorageError(operation, key, error),
    }
  }

  return {
    read() {
      const current = readRaw()
      if (current.status === 'unavailable') return current
      const currentRevision = revision(key, current.rawValue)
      if (current.rawValue === null) {
        return { status: 'missing', revision: currentRevision }
      }

      let value: unknown
      try {
        value = JSON.parse(current.rawValue)
      } catch (error) {
        return {
          status: 'invalid',
          reason: 'invalid-json',
          error,
          revision: currentRevision,
        }
      }
      if (!validate(value)) {
        return {
          status: 'invalid',
          reason: 'invalid-value',
          revision: currentRevision,
        }
      }
      return { status: 'ready', value, revision: currentRevision }
    },

    write(value, expectedRevision) {
      if (!validate(value)) {
        throw new TypeError(`Cannot persist an invalid value for ${key}`)
      }
      const current = readRaw()
      if (current.status === 'unavailable') return current
      const currentRevision = revision(key, current.rawValue)
      if (!matches(expectedRevision, key, current.rawValue)) {
        return { status: 'conflict', revision: currentRevision }
      }

      const serialized = JSON.stringify(value)
      try {
        writeStorageItem(storage, key, serialized)
        const after = readStorageItem(storage, key)
        if (after !== serialized) {
          return { status: 'conflict', revision: revision(key, after) }
        }
        return { status: 'written', revision: revision(key, serialized) }
      } catch (error) {
        return unavailable('write', error)
      }
    },

    remove(expectedRevision) {
      const current = readRaw()
      if (current.status === 'unavailable') return current
      const currentRevision = revision(key, current.rawValue)
      if (!matches(expectedRevision, key, current.rawValue)) {
        return { status: 'conflict', revision: currentRevision }
      }
      if (current.rawValue === null) {
        return { status: 'written', revision: currentRevision }
      }
      try {
        removeStorageItem(storage, key)
        const after = readStorageItem(storage, key)
        if (after !== null) {
          return { status: 'conflict', revision: revision(key, after) }
        }
        return { status: 'written', revision: revision(key, null) }
      } catch (error) {
        return unavailable('remove', error)
      }
    },
  }
}
