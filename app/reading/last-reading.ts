import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'
import { semanticParshaUrlForLeining } from '../view-model/navigation/parsha-routes.ts'
import { generateUrl } from '../view-model/navigation/url-parser.ts'
import {
  quarantineStorageItem,
  readStorageItem,
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

function isValidLastReading(value: unknown): value is LastReading {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LastReading>
  return (
    typeof candidate.hash === 'string' &&
    isReaderHash(candidate.hash) &&
    typeof candidate.parshaName === 'string' &&
    candidate.parshaName.trim().length > 0 &&
    (candidate.aliyahLabel === undefined ||
      typeof candidate.aliyahLabel === 'string') &&
    typeof candidate.savedAt === 'number' &&
    Number.isFinite(candidate.savedAt)
  )
}

function isReaderHash(hash: string) {
  return hash.startsWith('#/run/') ||
    hash.startsWith('#/torah/') ||
    hash.startsWith('#/esther/') ||
    hash.startsWith('#/r/')
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
  now = Date.now()
): LastReading | null {
  let raw: string | null
  try {
    raw = readStorageItem(storage, LAST_READING_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to read the last-reading checkpoint', error)
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('Failed to parse the last-reading checkpoint', error)
    quarantineStorageItem({
      storage,
      key: LAST_READING_STORAGE_KEY,
      rawValue: raw,
      reason: 'last-reading checkpoint is not valid JSON',
    })
    return null
  }

  if (!isValidLastReading(parsed)) {
    quarantineStorageItem({
      storage,
      key: LAST_READING_STORAGE_KEY,
      rawValue: raw,
      reason: 'last-reading checkpoint has an invalid shape',
    })
    return null
  }
  if (now - parsed.savedAt > LAST_READING_MAX_AGE_MS) {
    discardExpiredLastReading(storage)
    return null
  }

  return parsed
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
