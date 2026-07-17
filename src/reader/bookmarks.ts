import { isValidTokenKey } from './checkpoints.ts'
import {
  quarantineStorageItem,
  readStorageItem,
  writeStorageItem,
} from '../persistence/persisted-state.ts'

export const BOOKMARKS_STORAGE_KEY = 'tikkun.bookmarks.v1'

export interface ReaderBookmark {
  id: string
  hash: string
  label: string
  tokenKey: string
  audioId?: string
  timeStart?: number
  createdAt: number
}

export function createBookmark({
  hash,
  label,
  tokenKey,
  audioId,
  timeStart,
  createdAt = Date.now(),
}: Omit<ReaderBookmark, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: number
}): ReaderBookmark {
  return {
    id: `bookmark:${tokenKey}:${createdAt}`,
    hash,
    label,
    tokenKey,
    ...(audioId ? { audioId } : {}),
    ...(timeStart === undefined ? {} : { timeStart }),
    createdAt,
  }
}

function isReaderHash(hash: string) {
  return (
    hash.startsWith('#/run/') ||
    hash.startsWith('#/torah/') ||
    hash.startsWith('#/esther/') ||
    hash.startsWith('#/r/')
  )
}

function isReaderBookmark(value: unknown): value is ReaderBookmark {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ReaderBookmark>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.hash === 'string' &&
    isReaderHash(candidate.hash) &&
    typeof candidate.label === 'string' &&
    typeof candidate.tokenKey === 'string' &&
    isValidTokenKey(candidate.tokenKey) &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    (candidate.timeStart === undefined ||
      (typeof candidate.timeStart === 'number' && Number.isFinite(candidate.timeStart)))
  )
}

export function loadBookmarks(storage: Storage | null) {
  let raw: string | null
  try {
    raw = readStorageItem(storage, BOOKMARKS_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to read reader bookmarks', error)
    return []
  }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      quarantineStorageItem({
        storage,
        key: BOOKMARKS_STORAGE_KEY,
        rawValue: raw,
        reason: 'bookmark payload is not an array',
      })
      return []
    }
    const bookmarks = parsed
      .filter(isReaderBookmark)
      .sort((a, b) => b.createdAt - a.createdAt)
    if (bookmarks.length !== parsed.length) {
      quarantineStorageItem({
        storage,
        key: BOOKMARKS_STORAGE_KEY,
        rawValue: raw,
        reason: 'bookmark payload contains invalid entries',
        ...(bookmarks.length
          ? { replacementValue: JSON.stringify(bookmarks) }
          : {}),
      })
    }
    return bookmarks
  } catch (error) {
    console.error('Failed to parse reader bookmarks', error)
    quarantineStorageItem({
      storage,
      key: BOOKMARKS_STORAGE_KEY,
      rawValue: raw,
      reason: 'bookmark payload is not valid JSON',
    })
    return []
  }
}

export function saveBookmarks(storage: Storage | null, bookmarks: ReaderBookmark[]) {
  const bookmarkIds = new Set<string>()
  const tokenKeys = new Set<string>()
  if (bookmarks.some((bookmark) => {
    if (
      !isReaderBookmark(bookmark) ||
      bookmarkIds.has(bookmark.id) ||
      tokenKeys.has(bookmark.tokenKey)
    ) return true
    bookmarkIds.add(bookmark.id)
    tokenKeys.add(bookmark.tokenKey)
    return false
  })) {
    throw new TypeError('Cannot persist invalid or duplicate reader bookmarks')
  }
  try {
    writeStorageItem(
      storage,
      BOOKMARKS_STORAGE_KEY,
      JSON.stringify([...bookmarks].sort((a, b) => b.createdAt - a.createdAt))
    )
  } catch (error) {
    throw new BookmarkStorageError(error)
  }
}

export class BookmarkStorageError extends Error {
  readonly cause: unknown

  constructor(cause?: unknown) {
    super('Failed to save reader bookmarks')
    this.name = 'BookmarkStorageError'
    this.cause = cause
  }
}
