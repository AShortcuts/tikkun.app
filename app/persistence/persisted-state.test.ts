import { expect, test, vi } from 'vitest'
import {
  PersistedStateStorageError,
  quarantineStorageItem,
  readStorageItem,
  removeStorageItem,
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

test('normalizes denied storage operations into one error contract', () => {
  expect(() => readStorageItem(null, 'reader')).toThrow(PersistedStateStorageError)
  expect(() => writeStorageItem(null, 'reader', '{}')).toThrow(
    PersistedStateStorageError
  )
  expect(() => removeStorageItem(null, 'reader')).toThrow(
    PersistedStateStorageError
  )
})

test('quarantines a bounded recovery copy before removing invalid state', () => {
  const storage = memoryStorage()
  storage.setItem('reader', '{bad json')

  expect(quarantineStorageItem({
    storage,
    key: 'reader',
    rawValue: '{bad json',
    reason: 'invalid JSON',
    quarantinedAt: 123,
  })).toBe(true)
  expect(storage.getItem('reader')).toBeNull()
  expect(JSON.parse(storage.getItem('reader:quarantine') ?? '{}')).toMatchObject({
    sourceKey: 'reader',
    reason: 'invalid JSON',
    quarantinedAt: 123,
    rawValue: '{bad json',
  })
})

test('keeps a recovery copy while replacing partially valid state', () => {
  const storage = memoryStorage()
  storage.setItem('reader', '[{"valid":true},{"invalid":true}]')

  expect(quarantineStorageItem({
    storage,
    key: 'reader',
    rawValue: '[{"valid":true},{"invalid":true}]',
    reason: 'invalid entries',
    replacementValue: '[{"valid":true}]',
    quarantinedAt: 123,
  })).toBe(true)
  expect(storage.getItem('reader')).toBe('[{"valid":true}]')
  expect(JSON.parse(storage.getItem('reader:quarantine') ?? '{}')).toMatchObject({
    sourceKey: 'reader',
    reason: 'invalid entries',
    rawValue: '[{"valid":true},{"invalid":true}]',
  })
})

test('keeps the original value when a repaired replacement cannot be stored', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const storage = memoryStorage()
  const setItem = storage.setItem.bind(storage)
  const originalValue = '[{"valid":true},{"invalid":true}]'
  setItem('reader', originalValue)
  storage.setItem = (key, value) => {
    if (key === 'reader') throw new DOMException('quota', 'QuotaExceededError')
    setItem(key, value)
  }

  expect(quarantineStorageItem({
    storage,
    key: 'reader',
    rawValue: originalValue,
    reason: 'invalid entries',
    replacementValue: '[{"valid":true}]',
  })).toBe(false)
  expect(storage.getItem('reader')).toBe(originalValue)
  expect(storage.getItem('reader:quarantine')).not.toBeNull()
  expect(log).toHaveBeenCalledOnce()
  log.mockRestore()
})

test('contains quarantine failures without masking the original recovery path', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const storage = {
    ...memoryStorage(),
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError')
    },
  } as Storage

  expect(quarantineStorageItem({
    storage,
    key: 'reader',
    rawValue: '{}',
    reason: 'invalid shape',
  })).toBe(false)
  expect(log).toHaveBeenCalledOnce()
  log.mockRestore()
})
