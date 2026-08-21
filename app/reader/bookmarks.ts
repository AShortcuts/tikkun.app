import { isValidTokenKey } from './checkpoints.ts'
import {
  createPersistedJsonStore,
  requirePersistedJsonMutation,
  type PersistedJsonRevision,
} from '../persistence/persisted-state.ts'
import { isReaderHash } from '../view-model/navigation/reader-hash.ts'

export const BOOKMARKS_STORAGE_KEY = 'tikkun.bookmarks'

export interface ReaderBookmark {
  id: string
  hash: string
  label: string
  tokenKey: string
  audioId?: string
  timeStart?: number
  createdAt: number
}

export interface LoadedBookmarks {
  bookmarks: ReaderBookmark[]
  revision: PersistedJsonRevision | null
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

function isReaderBookmark(
  value: unknown,
  validateHash: (hash: string) => boolean = isReaderHash
): value is ReaderBookmark {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ReaderBookmark>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.hash === 'string' &&
    isReaderHash(candidate.hash) &&
    validateHash(candidate.hash) &&
    typeof candidate.label === 'string' &&
    candidate.label.trim().length > 0 &&
    typeof candidate.tokenKey === 'string' &&
    isValidTokenKey(candidate.tokenKey) &&
    typeof candidate.createdAt === 'number' &&
    Number.isSafeInteger(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    (candidate.audioId === undefined ||
      (typeof candidate.audioId === 'string' && candidate.audioId.length > 0)) &&
    (candidate.timeStart === undefined ||
      (typeof candidate.timeStart === 'number' &&
        Number.isFinite(candidate.timeStart) &&
        candidate.timeStart >= 0))
  )
}

function createBookmarksStore(storage: Storage | null) {
  return createPersistedJsonStore({
    storage,
    key: BOOKMARKS_STORAGE_KEY,
    validate: (value): value is unknown[] => Array.isArray(value),
  })
}

export function loadBookmarks(
  storage: Storage | null,
  validateHash: (hash: string) => boolean = isReaderHash
) {
  return loadBookmarksState(storage, validateHash).bookmarks
}

export function loadBookmarksState(
  storage: Storage | null,
  validateHash: (hash: string) => boolean = isReaderHash
): LoadedBookmarks {
  const store = createBookmarksStore(storage)
  const result = store.read()
  if (result.status === 'unavailable') {
    console.error('Failed to read reader bookmarks', result.error)
    return { bookmarks: [], revision: null }
  }
  if (result.status === 'invalid') {
    if (result.reason === 'invalid-json') {
      console.error('Failed to parse reader bookmarks', result.error)
    } else {
      console.error('Invalid reader bookmarks')
    }
    return { bookmarks: [], revision: result.revision }
  }
  if (result.status === 'missing') {
    return { bookmarks: [], revision: result.revision }
  }
  const bookmarks = result.value
    .filter((value): value is ReaderBookmark =>
      isReaderBookmark(value, validateHash)
    )
    .sort((a, b) => b.createdAt - a.createdAt)
  return { bookmarks, revision: result.revision }
}

export function saveBookmarks(
  storage: Storage | null,
  bookmarks: ReaderBookmark[],
  expectedRevision?: PersistedJsonRevision | null
) {
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
    const store = createBookmarksStore(storage)
    const sorted = [...bookmarks].sort((a, b) => b.createdAt - a.createdAt)
    let revision = expectedRevision
    if (!revision) {
      const current = store.read()
      if (current.status === 'unavailable') throw current.error
      revision = current.revision
    }
    return requirePersistedJsonMutation(store.write(sorted, revision))
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
