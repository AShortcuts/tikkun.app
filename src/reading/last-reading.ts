import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'
import { semanticParshaUrlForLeining } from '../view-model/navigation/parsha-routes.ts'
import { generateUrl } from '../view-model/navigation/url-parser.ts'

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
    hash.startsWith('#/parsha/') ||
    hash.startsWith('#/r/')
}

export function saveLastReading(
  storage: Storage,
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
  storage.setItem(LAST_READING_STORAGE_KEY, JSON.stringify(payload))
}

export function loadEligibleLastReading(
  storage: Storage,
  now = Date.now()
): LastReading | null {
  const raw = storage.getItem(LAST_READING_STORAGE_KEY)
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    storage.removeItem(LAST_READING_STORAGE_KEY)
    return null
  }

  if (!isValidLastReading(parsed) || now - parsed.savedAt > LAST_READING_MAX_AGE_MS) {
    storage.removeItem(LAST_READING_STORAGE_KEY)
    return null
  }

  return parsed
}
