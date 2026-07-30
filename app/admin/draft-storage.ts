import { TOKENIZATION_VERSION } from '../reader-preferences.ts'
import { parseDraftWordCues } from '../audio/cue-validation.ts'
import type { WordCue } from '../audio/types.ts'
import {
  formatTokenKey,
  isValidTokenKey,
} from '../reader/token-position.ts'
import {
  getBrowserStorage,
  quarantineStorageItem,
  readStorageItem,
  writeStorageItem,
} from '../persistence/persisted-state.ts'

export type AdminDraftPayload = {
  audioId: string
  tokenCount: number
  tokenPointer: number
  tokenizationVersion: string
  updatedAt: number
  cues: WordCue[]
}

const ADMIN_DRAFT_STORAGE_PREFIX = 'tikkun-admin-draft:'

export function getAdminDraftStorageKey(audioId: string) {
  return `${ADMIN_DRAFT_STORAGE_PREFIX}${audioId}`
}

function parseAdminDraftPayload(
  value: unknown,
  {
    audioId,
    tokenCount,
    tokenKeys,
  }: {
    audioId: string
    tokenCount?: number
    tokenKeys?: string[]
  }
): AdminDraftPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const draft = value as Partial<AdminDraftPayload>
  const cues = parseDraftWordCues(draft.cues)
  if (
    audioId.trim().length === 0 ||
    draft.audioId !== audioId ||
    draft.tokenizationVersion !== TOKENIZATION_VERSION ||
    !Number.isSafeInteger(draft.tokenCount) ||
    typeof draft.tokenCount !== 'number' ||
    draft.tokenCount < 0 ||
    (tokenCount !== undefined && draft.tokenCount !== tokenCount) ||
    !Number.isSafeInteger(draft.tokenPointer) ||
    typeof draft.tokenPointer !== 'number' ||
    draft.tokenPointer < -1 ||
    draft.tokenPointer >= draft.tokenCount ||
    typeof draft.updatedAt !== 'number' ||
    !Number.isSafeInteger(draft.updatedAt) ||
    draft.updatedAt < 0 ||
    !cues ||
    cues.length > draft.tokenCount
  ) {
    return null
  }

  if (
    tokenKeys &&
    (
      tokenKeys.some((key) => !isValidTokenKey(key)) ||
      new Set(tokenKeys).size !== tokenKeys.length ||
      cues.some((cue, index) => formatTokenKey(cue) !== tokenKeys[index])
    )
  ) {
    return null
  }

  return {
    audioId,
    tokenCount: draft.tokenCount,
    tokenPointer: draft.tokenPointer,
    tokenizationVersion: TOKENIZATION_VERSION,
    updatedAt: draft.updatedAt,
    cues,
  }
}

function getAdminDraftStorage() {
  return getBrowserStorage('local')
}

function discardInvalidDraft(
  audioId: string,
  storage: Storage | null,
  rawValue: string,
  reason: string
) {
  console.warn(`Discarding invalid admin draft for ${audioId}`)
  quarantineStorageItem({
    storage,
    key: getAdminDraftStorageKey(audioId),
    rawValue,
    reason,
  })
}

function readStoredAdminDraft(audioId: string) {
  const storage = getAdminDraftStorage()
  const key = getAdminDraftStorageKey(audioId)
  let rawDraft: string | null = null
  try {
    rawDraft = readStorageItem(storage, key)
  } catch (error) {
    console.error(`Failed to read admin draft for ${audioId}`, error)
    return undefined
  }
  if (!rawDraft) return undefined

  try {
    return {
      storage,
      rawValue: rawDraft,
      value: JSON.parse(rawDraft) as unknown,
    }
  } catch (error) {
    console.error(`Failed to parse admin draft for ${audioId}`, error)
    discardInvalidDraft(audioId, storage, rawDraft, 'invalid JSON')
    return undefined
  }
}

export function loadAdminDraft(
  audioId: string,
  tokenExpectation: number | string[]
) {
  const storedDraft = readStoredAdminDraft(audioId)
  if (storedDraft === undefined) return null
  const tokenKeys = Array.isArray(tokenExpectation) ? tokenExpectation : undefined
  const tokenCount = Array.isArray(tokenExpectation)
    ? tokenExpectation.length
    : tokenExpectation
  const draft = parseAdminDraftPayload(storedDraft.value, {
    audioId,
    tokenCount,
    tokenKeys,
  })
  if (draft) return draft

  discardInvalidDraft(
    audioId,
    storedDraft.storage,
    storedDraft.rawValue,
    'invalid draft schema'
  )
  return null
}

export function readAdminDraftSummary(audioId: string) {
  const storedDraft = readStoredAdminDraft(audioId)
  if (storedDraft === undefined) return null
  const draft = parseAdminDraftPayload(storedDraft.value, { audioId })
  if (!draft) {
    discardInvalidDraft(
      audioId,
      storedDraft.storage,
      storedDraft.rawValue,
      'invalid draft schema'
    )
    return null
  }

  const cueCount = draft.cues.length
  return {
    audioId,
    tokenCount: draft.tokenCount,
    cueCount,
    updatedAt: draft.updatedAt,
    isIncomplete: cueCount > 0 && cueCount < draft.tokenCount,
  }
}

export function saveAdminDraftPayload(payload: AdminDraftPayload) {
  const draft = parseAdminDraftPayload(payload, {
    audioId: payload.audioId,
    tokenCount: payload.tokenCount,
  })
  if (!draft) throw new TypeError('Cannot persist an invalid admin draft')

  const storage = getAdminDraftStorage()
  if (!storage) throw new AdminDraftStorageError(draft.audioId)
  const key = getAdminDraftStorageKey(draft.audioId)
  try {
    const existingRaw = readStorageItem(storage, key)
    if (existingRaw) {
      let existing: AdminDraftPayload | null = null
      try {
        existing = parseAdminDraftPayload(JSON.parse(existingRaw), {
          audioId: draft.audioId,
          tokenCount: draft.tokenCount,
        })
      } catch {
        existing = null
      }
      if (existing && existing.updatedAt > draft.updatedAt) {
        throw new AdminDraftConflictError(
          draft.audioId,
          existing.updatedAt,
          draft.updatedAt
        )
      }
      if (!existing) {
        quarantineStorageItem({
          storage,
          key,
          rawValue: existingRaw,
          reason: 'invalid draft schema replaced by a valid draft',
        })
      }
    }
    writeStorageItem(storage, key, JSON.stringify(draft))
  } catch (error) {
    if (error instanceof AdminDraftConflictError) throw error
    throw new AdminDraftStorageError(draft.audioId, error)
  }
}

export class AdminDraftStorageError extends Error {
  readonly cause: unknown

  constructor(audioId: string, cause?: unknown) {
    super(`Failed to access admin draft storage for ${audioId}`)
    this.name = 'AdminDraftStorageError'
    this.cause = cause
  }
}

export class AdminDraftConflictError extends Error {
  constructor(
    audioId: string,
    existingUpdatedAt: number,
    attemptedUpdatedAt: number
  ) {
    super(
      `Refusing to overwrite newer admin draft for ${audioId} ` +
      `(${existingUpdatedAt} > ${attemptedUpdatedAt})`
    )
    this.name = 'AdminDraftConflictError'
  }
}
