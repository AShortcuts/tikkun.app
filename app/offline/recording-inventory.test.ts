import { expect, test } from 'vitest'
import { parseRecordingInventory } from './recording-inventory.ts'

const entry = { audioId: 'beresheet-1', digest: 'a'.repeat(64), byteLength: 42, url: 'https://tikkun.test/audio/1.m4a' }
const response = (recordings: unknown[]) => ({ type: 'RECORDING_LIBRARY', state: 'ready', recordings })

test('inventory retains exact identities, sizes, and immutable copies', () => {
  const inventory = parseRecordingInventory(response([entry]))
  expect(inventory).toEqual([entry])
  expect(Object.isFrozen(inventory)).toBe(true)
  expect(Object.isFrozen(inventory[0])).toBe(true)
  expect(inventory[0]).not.toBe(entry)
  expect(parseRecordingInventory(response([]))).toEqual([])
})

test('an unavailable scan is not an empty library', () => {
  expect(() => parseRecordingInventory({ type: 'RECORDING_LIBRARY', state: 'error', errorMessage: 'Storage failed' })).toThrow('Storage failed')
  expect(() => parseRecordingInventory({})).toThrow()
})

test('rejects ambiguous counts and malformed asset identities', () => {
  expect(() => parseRecordingInventory(response([entry, entry]))).toThrow('duplicate')
  for (const updates of [{ byteLength: 0 }, { byteLength: 1.5 }, { digest: 'bad' }, { audioId: '' }]) {
    expect(() => parseRecordingInventory(response([{ ...entry, ...updates }]))).toThrow()
  }
})
