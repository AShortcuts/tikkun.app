import { expect, test } from 'vitest'
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
  const storage = createStorage(JSON.stringify([
    createBookmark({
      hash: '#/torah/parsha/noach',
      label: 'Keep',
      tokenKey: '1:0:0:0',
      createdAt: 1,
    }),
    { id: 'bad', hash: '#/about' },
  ]))

  expect(loadBookmarks(storage).length).toBe(1)
})

test('saves bookmarks newest first', () => {
  const storage = createStorage()
  saveBookmarks(storage, [
    createBookmark({ hash: '#/torah/parsha/a', label: 'old', tokenKey: '1:0:0:0', createdAt: 1 }),
    createBookmark({ hash: '#/torah/parsha/b', label: 'new', tokenKey: '1:0:0:1', createdAt: 2 }),
  ])

  expect(loadBookmarks(storage)[0]?.label).toBe('new')
})
