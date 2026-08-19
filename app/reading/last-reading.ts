import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'
import { semanticParshaUrlForLeining } from '../view-model/navigation/parsha-routes.ts'
import { isReaderHash } from '../view-model/navigation/reader-hash.ts'
import { generateUrl } from '../view-model/navigation/url-parser.ts'
import {
  isPlausiblePersistedTimestamp,
  readPersistedJson,
  removeStorageItem,
  writeStorageItem,
} from '../persistence/persisted-state.ts'

export const LAST_READING_STORAGE_KEY = 'tikkun.last-reading.v1'
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
    writeStorageItem(storage, LAST_READING_STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    throw new LastReadingStorageError(error)
  }
}

export function loadEligibleLastReading(
  storage: Storage | null,
  now = Date.now(),
  validateHash: (hash: string) => boolean = isReaderHash
): LastReading | null {
  const result = readPersistedJson({
    storage,
    key: LAST_READING_STORAGE_KEY,
    validate: (value): value is LastReading =>
      isValidLastReading(value, now) && validateHash(value.hash),
  })
  if (result.status === 'unavailable') {
    console.error('Failed to read the last-reading checkpoint', result.error)
    return null
  }
  if (result.status === 'invalid') {
    if (result.reason === 'invalid-json') {
      console.error('Failed to parse the last-reading checkpoint', result.error)
    }
    return null
  }
  if (result.status === 'missing') return null

  if (now - result.value.savedAt > LAST_READING_MAX_AGE_MS) {
    discardExpiredLastReading(storage)
    return null
  }

  return result.value
}

function discardExpiredLastReading(storage: Storage | null) {
  try {
    removeStorageItem(storage, LAST_READING_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to remove an invalid last-reading checkpoint', error)
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
