import { expect, test } from 'vitest'
import {
  PERSISTED_TIMESTAMP_FUTURE_TOLERANCE_MS,
  PersistedStateConflictError,
  PersistedStateStorageError,
  createPersistedJsonStore,
  isPlausiblePersistedTimestamp,
  readStorageItem,
  removeStorageItem,
  requirePersistedJsonMutation,
  writeStorageItem,
} from './persisted-state.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage
}

function stringListStore(storage: Storage | null) {
  return createPersistedJsonStore({
    storage,
    key: 'reader',
    validate: (value): value is string[] =>
      Array.isArray(value) && value.every((item) => typeof item === 'string'),
  })
}

test('accepts bounded timestamps and rejects impossible future values', () => {
  const now = 1_000_000
  expect(isPlausiblePersistedTimestamp(now, { now })).toBe(true)
  expect(
    isPlausiblePersistedTimestamp(
      now + PERSISTED_TIMESTAMP_FUTURE_TOLERANCE_MS,
      { now }
    )
  ).toBe(true)
  expect(
    isPlausiblePersistedTimestamp(
      now + PERSISTED_TIMESTAMP_FUTURE_TOLERANCE_MS + 1,
      { now }
    )
  ).toBe(false)
})

test('normalizes denied storage operations into one error contract', () => {
  expect(() => readStorageItem(null, 'reader')).toThrow(PersistedStateStorageError)
  expect(() => writeStorageItem(null, 'reader', '{}')).toThrow(
    PersistedStateStorageError
  )
  expect(() => removeStorageItem(null, 'reader')).toThrow(
    PersistedStateStorageError
  )
})

test('stores the current value directly as JSON', () => {
  const storage = memoryStorage()
  const store = stringListStore(storage)
  const empty = store.read()
  expect(empty.status).toBe('missing')
  if (empty.status !== 'missing') throw new Error('Expected missing state')

  const written = store.write(['one', 'two'], empty.revision)
  expect(written.status).toBe('written')
  expect(storage.getItem('reader')).toBe('["one","two"]')
  expect(store.read()).toMatchObject({
    status: 'ready',
    value: ['one', 'two'],
  })
})

test.each([
  ['{bad json', 'invalid-json'],
  ['["valid",1]', 'invalid-value'],
] as const)('returns a revision for %s without mutating it', (raw, reason) => {
  const storage = memoryStorage()
  storage.setItem('reader', raw)
  const store = stringListStore(storage)
  const result = store.read()
  expect(result).toMatchObject({ status: 'invalid', reason })
  expect(storage.getItem('reader')).toBe(raw)
  if (result.status !== 'invalid') throw new Error('Expected invalid state')

  expect(store.write(['recovered'], result.revision)).toMatchObject({
    status: 'written',
  })
  expect(storage.getItem('reader')).toBe('["recovered"]')
})

test('rejects stale writes and removals without losing newer state', () => {
  const storage = memoryStorage()
  const store = stringListStore(storage)
  const first = store.read()
  const stale = store.read()
  if (first.status !== 'missing' || stale.status !== 'missing') {
    throw new Error('Expected missing state')
  }
  expect(store.write(['newer'], first.revision)).toMatchObject({
    status: 'written',
  })

  expect(store.write(['stale'], stale.revision)).toMatchObject({
    status: 'conflict',
  })
  expect(store.remove(stale.revision)).toMatchObject({ status: 'conflict' })
  expect(store.read()).toMatchObject({ status: 'ready', value: ['newer'] })
})

test('reports unavailable reads and writes', () => {
  const denied = new DOMException('denied', 'SecurityError')
  const storage = memoryStorage()
  storage.getItem = () => {
    throw denied
  }
  expect(stringListStore(storage).read()).toMatchObject({
    status: 'unavailable',
    error: { operation: 'read', key: 'reader', cause: denied },
  })

  const writable = memoryStorage()
  const store = stringListStore(writable)
  const current = store.read()
  if (current.status !== 'missing') throw new Error('Expected missing state')
  writable.setItem = () => {
    throw denied
  }
  expect(store.write([], current.revision)).toMatchObject({
    status: 'unavailable',
    error: { operation: 'write', key: 'reader', cause: denied },
  })
})

test('throws a typed error when a required mutation conflicts', () => {
  const storage = memoryStorage()
  const store = stringListStore(storage)
  const stale = store.read()
  if (stale.status !== 'missing') throw new Error('Expected missing state')
  storage.setItem('reader', '[]')

  expect(() =>
    requirePersistedJsonMutation(store.write(['stale'], stale.revision))
  ).toThrow(PersistedStateConflictError)
})

test('rejects invalid values before touching storage', () => {
  const storage = memoryStorage()
  const store = stringListStore(storage)
  const current = store.read()
  if (current.status !== 'missing') throw new Error('Expected missing state')

  expect(() => store.write(['valid', 1] as never, current.revision)).toThrow(
    TypeError
  )
  expect(storage.getItem('reader')).toBeNull()
})
