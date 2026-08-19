import { expect, test, vi } from 'vitest'
import {
  BOOKMARKS_STORAGE_KEY,
  createBookmark,
  loadBookmarks,
  saveBookmarks,
} from './bookmarks.ts'

function createStorage(initial?: string) {
  const entries = new Map<string, string>()
  if (initial) entries.set(BOOKMARKS_STORAGE_KEY, initial)
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } as unknown as Storage
}

test('creates a token-anchored bookmark without requiring audio', () => {
  const bookmark = createBookmark({
    hash: '#/torah/parsha/noach',
    label: 'Hard phrase',
    tokenKey: '10:2:0:5',
    createdAt: 123,
  })

  expect(bookmark).toMatchObject({
    id: 'bookmark:10:2:0:5:123',
    hash: '#/torah/parsha/noach',
    tokenKey: '10:2:0:5',
  })
})

test('loads only valid bookmarks from storage', () => {
  const validBookmark = createBookmark({
    hash: '#/torah/parsha/noach',
    label: 'Keep',
    tokenKey: '1:0:0:0',
    createdAt: 1,
  })
  const storage = createStorage(JSON.stringify([
    validBookmark,
    { id: 'bad', hash: '#/about' },
  ]))

  expect(loadBookmarks(storage)).toEqual([validBookmark])
  expect(loadBookmarks(storage)).toEqual([validBookmark])
  expect(storage.getItem(`${BOOKMARKS_STORAGE_KEY}:quarantine`)).not.toBeNull()
})

test('quarantines grammar-valid bookmarks that are not routable', () => {
  const deadBookmark = createBookmark({
    hash: '#/torah/parsha/noach/1-1-1',
    label: 'Dead route',
    tokenKey: '1:0:0:0',
    createdAt: 1,
  })
  const storage = createStorage(JSON.stringify([deadBookmark]))

  expect(loadBookmarks(storage, () => false)).toEqual([])
  expect(storage.getItem(BOOKMARKS_STORAGE_KEY)).toBeNull()
  expect(storage.getItem(`${BOOKMARKS_STORAGE_KEY}:quarantine`)).not.toBeNull()
})

test.each([
  { label: '' },
  { createdAt: -1 },
  { audioId: 42 },
  { timeStart: -0.1 },
])('rejects malformed persisted bookmark fields: %o', (override) => {
  const validBookmark = createBookmark({
    hash: '#/torah/parsha/noach',
    label: 'Keep',
    tokenKey: '1:0:0:0',
    createdAt: 1,
  })
  const storage = createStorage(JSON.stringify([{ ...validBookmark, ...override }]))

  expect(loadBookmarks(storage)).toEqual([])
  expect(storage.getItem(BOOKMARKS_STORAGE_KEY)).toBeNull()
  expect(storage.getItem(`${BOOKMARKS_STORAGE_KEY}:quarantine`)).not.toBeNull()
})

test('saves bookmarks newest first', () => {
  const storage = createStorage()
  saveBookmarks(storage, [
    createBookmark({ hash: '#/torah/parsha/a', label: 'old', tokenKey: '1:0:0:0', createdAt: 1 }),
    createBookmark({ hash: '#/torah/parsha/b', label: 'new', tokenKey: '1:0:0:1', createdAt: 2 }),
  ])

  expect(loadBookmarks(storage)[0]?.label).toBe('new')
})

test('contains denied storage access and rejects invalid writes', () => {
  const readError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const deniedStorage = {
    ...createStorage(),
    getItem: () => {
      throw new DOMException('denied', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('denied', 'SecurityError')
    },
  } as Storage
  const bookmark = createBookmark({
    hash: '#/torah/parsha/noach',
    label: 'Keep',
    tokenKey: '1:0:0:0',
    createdAt: 1,
  })

  expect(loadBookmarks(deniedStorage)).toEqual([])
  expect(() => saveBookmarks(deniedStorage, [bookmark])).toThrow(
    'Failed to save reader bookmarks'
  )
  expect(() => saveBookmarks(createStorage(), [bookmark, bookmark])).toThrow(
    'invalid or duplicate'
  )
  readError.mockRestore()
})
