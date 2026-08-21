import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'
import { semanticParshaUrlForLeining } from '../view-model/navigation/parsha-routes.ts'
import { isReaderHash } from '../view-model/navigation/reader-hash.ts'
import { generateUrl } from '../view-model/navigation/url-parser.ts'
import {
  createPersistedJsonStore,
  isPlausiblePersistedTimestamp,
  requirePersistedJsonMutation,
  type PersistedJsonRevision,
} from '../persistence/persisted-state.ts'

export const LAST_READING_STORAGE_KEY = 'tikkun.last-reading'
export const LAST_READING_MAX_AGE_MS = 48 * 60 * 60 * 1000

export interface LastReading {
  hash: string
  parshaName: string
  aliyahLabel?: string
  savedAt: number
}

export type LastReadingInput = Omit<LastReading, 'savedAt'>

export function createLastReadingHash(run: LeiningRun, initialRef?: RefWithScroll) {
  return semanticParshaUrlForLeining(run.leining, initialRef) ??
    generateUrl(run, initialRef)
}

function isValidLastReading(value: unknown, now: number): value is LastReading {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LastReading>
  return (
    typeof candidate.hash === 'string' &&
    isReaderHash(candidate.hash) &&
    typeof candidate.parshaName === 'string' &&
    candidate.parshaName.trim().length > 0 &&
    (candidate.aliyahLabel === undefined ||
      typeof candidate.aliyahLabel === 'string') &&
    isPlausiblePersistedTimestamp(candidate.savedAt, { now })
  )
}

function createLastReadingStore(
  storage: Storage | null,
  now: number,
  validateHash: (hash: string) => boolean = isReaderHash
) {
  return createPersistedJsonStore({
    storage,
    key: LAST_READING_STORAGE_KEY,
    validate: (value): value is LastReading =>
      isValidLastReading(value, now) && validateHash(value.hash),
  })
}

export function saveLastReading(
  storage: Storage | null,
  input: LastReadingInput,
  savedAt = Date.now()
) {
  if (!isReaderHash(input.hash)) return
  const parshaName = input.parshaName.trim()
  if (!parshaName) return

  const payload: LastReading = {
    hash: input.hash,
    parshaName,
    aliyahLabel: input.aliyahLabel?.trim() || undefined,
    savedAt,
  }
  try {
    const store = createLastReadingStore(storage, savedAt)
    const current = store.read()
    if (current.status === 'unavailable') throw current.error
    requirePersistedJsonMutation(store.write(payload, current.revision))
  } catch (error) {
    throw new LastReadingStorageError(error)
  }
}

export function loadEligibleLastReading(
  storage: Storage | null,
  now = Date.now(),
  validateHash: (hash: string) => boolean = isReaderHash
): LastReading | null {
  const store = createLastReadingStore(storage, now, validateHash)
  const result = store.read()
  if (result.status === 'unavailable') {
    console.error('Failed to read the last-reading checkpoint', result.error)
    return null
  }
  if (result.status === 'invalid') {
    if (result.reason === 'invalid-json') {
      console.error('Failed to parse the last-reading checkpoint', result.error)
    } else {
      console.error('Invalid last-reading checkpoint')
    }
    return null
  }
  if (result.status === 'missing') return null

  if (now - result.value.savedAt > LAST_READING_MAX_AGE_MS) {
    discardExpiredLastReading(store, result.revision)
    return null
  }

  return result.value
}

function discardExpiredLastReading(
  store: ReturnType<typeof createLastReadingStore>,
  revision: PersistedJsonRevision
) {
  try {
    const removed = store.remove(revision)
    if (removed.status === 'unavailable') throw removed.error
  } catch (error) {
    console.error('Failed to remove an expired last-reading checkpoint', error)
  }
}

export class LastReadingStorageError extends Error {
  readonly cause: unknown

  constructor(cause?: unknown) {
    super('Failed to save the last-reading checkpoint')
    this.name = 'LastReadingStorageError'
    this.cause = cause
  }
}
