import { afterEach, beforeEach, expect, test } from 'vitest'
import { createDownloadIntentStore, DOWNLOAD_INTENT_KEY } from './download-intent.ts'

let previous: string | null
beforeEach(() => {
  previous = localStorage.getItem(DOWNLOAD_INTENT_KEY)
  localStorage.removeItem(DOWNLOAD_INTENT_KEY)
})
afterEach(() => {
  if (previous === null) localStorage.removeItem(DOWNLOAD_INTENT_KEY)
  else localStorage.setItem(DOWNLOAD_INTENT_KEY, previous)
})

test('merges concurrent clients through the real browser lock manager', async () => {
  const first = createDownloadIntentStore(localStorage, navigator.locks)
  const second = createDownloadIntentStore(localStorage, navigator.locks)
  await Promise.all([first.update(['one'], []), second.update(['two', 'one'], [])])
  expect([...(await first.read())].sort()).toEqual(['one', 'two'])
  await Promise.all([first.update(['three'], []), second.update([], ['one'])])
  expect([...(await second.read())].sort()).toEqual(['three', 'two'])
})

test('does not replace corrupt persisted intent', async () => {
  localStorage.setItem(DOWNLOAD_INTENT_KEY, '{broken')
  const store = createDownloadIntentStore(localStorage, navigator.locks)
  await expect(store.read()).rejects.toThrow('invalid')
  await expect(store.update(['one'], [])).rejects.toThrow('invalid')
  expect(localStorage.getItem(DOWNLOAD_INTENT_KEY)).toBe('{broken')
})

test('reports missing storage and missing coordination explicitly', async () => {
  await expect(createDownloadIntentStore(null, navigator.locks).read()).rejects.toThrow('storage read failed')
  await expect(createDownloadIntentStore(localStorage, null).update(['one'], [])).rejects.toThrow('coordination is unavailable')
  expect(localStorage.getItem(DOWNLOAD_INTENT_KEY)).toBeNull()
})
