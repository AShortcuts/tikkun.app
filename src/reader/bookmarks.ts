import { isValidTokenKey } from './checkpoints.ts'

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

export function loadBookmarks(storage: Storage) {
  const raw = storage.getItem(BOOKMARKS_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isReaderBookmark)
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    storage.removeItem(BOOKMARKS_STORAGE_KEY)
    return []
  }
}

export function saveBookmarks(storage: Storage, bookmarks: ReaderBookmark[]) {
  storage.setItem(
    BOOKMARKS_STORAGE_KEY,
    JSON.stringify([...bookmarks].sort((a, b) => b.createdAt - a.createdAt))
  )
}
