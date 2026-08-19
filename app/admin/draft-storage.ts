import {
  parseCueDraftPayload,
  type CueDraftPayload,
} from '../audio/cue-draft.ts'
import type { AudioRecording } from '../audio/types.ts'
import { audioRecordings } from '../data/audio-catalog.ts'
import {
  getBrowserStorage,
  readStorageItem,
  writeStorageItem,
} from '../persistence/persisted-state.ts'

export type AdminDraftPayload = CueDraftPayload
export type AdminDraftRevision = string | null

export interface AdminDraftWriteRequest {
  writerToken: string
  expectedRevision: AdminDraftRevision
}

export interface AdminDraftWriteResult {
  revision: Exclude<AdminDraftRevision, null>
}

const ADMIN_DRAFT_STORAGE_PREFIX = 'tikkun-admin-draft:'
const ADMIN_DRAFT_RECOVERY_STORAGE_PREFIX =
  'tikkun-admin-draft-recovery:v1:'
const ADMIN_DRAFT_STORAGE_METADATA_KEY = '_tikkunDraftStorage'

interface AdminDraftStorageMetadata {
  version: 1
  revisionToken: string
  writerToken: string
}

export interface AdminDraftRecoveryRecord {
  version: 1
  audioId: string
  sourceKey: string
  reason: string
  recoveredAt: number
  rawValue: string
}

export interface StoredAdminDraftRecovery extends AdminDraftRecoveryRecord {
  storageKey: string
}

export type AdminDraftLoadResult =
  | {
      status: 'ready'
      draft: AdminDraftPayload
      revision: Exclude<AdminDraftRevision, null>
    }
  | { status: 'missing'; revision: null }
  | {
      status: 'recovered'
      revision: Exclude<AdminDraftRevision, null>
    }
  | {
      status: 'recovery-failed'
      rawValue: string
      reason: string
      revision: Exclude<AdminDraftRevision, null>
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isOpaqueToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function parseAdminDraftStorageMetadata(
  value: unknown
): AdminDraftStorageMetadata | null {
  if (!isRecord(value)) return null
  const metadata = value[ADMIN_DRAFT_STORAGE_METADATA_KEY]
  if (
    !isRecord(metadata) ||
    metadata.version !== 1 ||
    !isOpaqueToken(metadata.revisionToken) ||
    !isOpaqueToken(metadata.writerToken)
  ) {
    return null
  }
  return {
    version: 1,
    revisionToken: metadata.revisionToken,
    writerToken: metadata.writerToken,
  }
}

function getStoredDraftRevision(rawValue: string, value: unknown) {
  return (
    parseAdminDraftStorageMetadata(value)?.revisionToken ??
    `raw:${rawValue}`
  )
}

let fallbackTokenSequence = 0

function createOpaqueToken() {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto?.getRandomValues === 'function') {
    const values = crypto.getRandomValues(new Uint32Array(4))
    return [...values]
      .map((value) => value.toString(16).padStart(8, '0'))
      .join('')
  }
  fallbackTokenSequence += 1
  return `${Date.now().toString(36)}-${fallbackTokenSequence.toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createAdminDraftWriterToken() {
  return createOpaqueToken()
}

export function getAdminDraftStorageKey(audioId: string) {
  return `${ADMIN_DRAFT_STORAGE_PREFIX}${audioId}`
}

function getAdminDraftRecoveryStoragePrefix(audioId: string) {
  return `${ADMIN_DRAFT_RECOVERY_STORAGE_PREFIX}${encodeURIComponent(audioId)}:`
}

export function getAdminDraftRecoveryStorageKey(
  audioId: string,
  recoveredAt: number,
  sequence = 0
) {
  const suffix = sequence > 0 ? `:${sequence}` : ''
  return `${getAdminDraftRecoveryStoragePrefix(audioId)}${recoveredAt}${suffix}`
}

const recordingsById = new Map(
  audioRecordings.map((recording) => [recording.id, recording])
)

function resolveRecording(recording: AudioRecording | string) {
  return typeof recording === 'string'
    ? recordingsById.get(recording) ?? null
    : recording
}

function getAdminDraftStorage() {
  return getBrowserStorage('local')
}

function parseRecoveryRecord(
  storageKey: string,
  value: unknown,
  audioId: string
): StoredAdminDraftRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<AdminDraftRecoveryRecord>
  if (
    candidate.version !== 1 ||
    candidate.audioId !== audioId ||
    candidate.sourceKey !== getAdminDraftStorageKey(audioId) ||
    typeof candidate.reason !== 'string' ||
    !candidate.reason ||
    typeof candidate.recoveredAt !== 'number' ||
    !Number.isSafeInteger(candidate.recoveredAt) ||
    candidate.recoveredAt < 0 ||
    typeof candidate.rawValue !== 'string'
  ) {
    return null
  }
  return {
    storageKey,
    version: 1,
    audioId,
    sourceKey: candidate.sourceKey,
    reason: candidate.reason,
    recoveredAt: candidate.recoveredAt,
    rawValue: candidate.rawValue,
  }
}

function readAdminDraftRecoveriesFromStorage(
  storage: Storage,
  audioId: string
): StoredAdminDraftRecovery[] {
  const prefix = getAdminDraftRecoveryStoragePrefix(audioId)
  const recoveries: StoredAdminDraftRecovery[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index)
    if (!storageKey?.startsWith(prefix)) continue
    const rawRecord = storage.getItem(storageKey)
    if (rawRecord === null) continue
    try {
      const recovery = parseRecoveryRecord(
        storageKey,
        JSON.parse(rawRecord),
        audioId
      )
      if (recovery) recoveries.push(recovery)
      else console.warn(`Ignoring invalid admin draft recovery ${storageKey}`)
    } catch (error) {
      console.warn(`Ignoring unreadable admin draft recovery ${storageKey}`, error)
    }
  }
  return recoveries.sort(
    (left, right) =>
      right.recoveredAt - left.recoveredAt ||
      right.storageKey.localeCompare(left.storageKey)
  )
}

export function readAdminDraftRecoveries(audioId: string) {
  const storage = getAdminDraftStorage()
  if (!storage) return []
  try {
    return readAdminDraftRecoveriesFromStorage(storage, audioId)
  } catch (error) {
    console.error(`Failed to read admin draft recoveries for ${audioId}`, error)
    return []
  }
}

function writeAdminDraftRecovery(
  storage: Storage,
  audioId: string,
  rawValue: string,
  reason: string
) {
  const sourceKey = getAdminDraftStorageKey(audioId)
  const existingRecovery = readAdminDraftRecoveriesFromStorage(
    storage,
    audioId
  ).find(
    (recovery) =>
      recovery.sourceKey === sourceKey && recovery.rawValue === rawValue
  )

  if (existingRecovery) return true

  const recoveredAt = Date.now()
  let sequence = 0
  let recoveryKey = getAdminDraftRecoveryStorageKey(
    audioId,
    recoveredAt,
    sequence
  )
  while (storage.getItem(recoveryKey) !== null) {
    sequence += 1
    recoveryKey = getAdminDraftRecoveryStorageKey(
      audioId,
      recoveredAt,
      sequence
    )
  }
  const recovery: AdminDraftRecoveryRecord = {
    version: 1,
    audioId,
    sourceKey,
    reason,
    recoveredAt,
    rawValue,
  }
  const serialized = JSON.stringify(recovery)
  storage.setItem(recoveryKey, serialized)
  if (storage.getItem(recoveryKey) !== serialized) {
    throw new Error('Admin draft recovery could not be verified')
  }
  return true
}

function preserveInvalidDraft(
  audioId: string,
  storage: Storage | null,
  rawValue: string,
  reason: string
) {
  if (!storage) return false
  const sourceKey = getAdminDraftStorageKey(audioId)
  try {
    writeAdminDraftRecovery(storage, audioId, rawValue, reason)

    if (storage.getItem(sourceKey) !== rawValue) {
      console.warn(
        `Admin draft changed while preserving ${audioId}; newer source retained`
      )
      return false
    }
    console.warn(`Preserved incompatible admin draft for ${audioId}`)
    return true
  } catch (error) {
    console.error(
      `Failed to preserve incompatible admin draft for ${audioId}; source retained`,
      error
    )
    return false
  }
}

export async function preserveAdminDraftSnapshot(
  payload: AdminDraftPayload,
  reason: string
) {
  const locks = globalThis.navigator?.locks
  if (!locks) {
    console.error(
      `Failed to preserve admin draft snapshot for ${payload.audioId}: Web Locks are unavailable`
    )
    return false
  }

  try {
    return await locks.request(
      `tikkun-admin-draft:${payload.audioId}`,
      { mode: 'exclusive' },
      () => {
        const storage = getAdminDraftStorage()
        if (!storage) return false
        try {
          return writeAdminDraftRecovery(
            storage,
            payload.audioId,
            JSON.stringify(payload),
            reason
          )
        } catch (error) {
          console.error(
            `Failed to preserve admin draft snapshot for ${payload.audioId}`,
            error
          )
          return false
        }
      }
    )
  } catch (error) {
    console.error(
      `Failed to acquire the admin draft recovery lock for ${payload.audioId}`,
      error
    )
    return false
  }
}

function readStoredAdminDraft(audioId: string) {
  const storage = getAdminDraftStorage()
  const key = getAdminDraftStorageKey(audioId)
  let rawDraft: string | null = null
  try {
    rawDraft = readStorageItem(storage, key)
  } catch (error) {
    console.error(`Failed to read admin draft for ${audioId}`, error)
    return { status: 'missing' as const }
  }
  if (rawDraft === null) return { status: 'missing' as const }

  try {
    return {
      status: 'ready' as const,
      storage,
      rawValue: rawDraft,
      value: JSON.parse(rawDraft) as unknown,
    }
  } catch (error) {
    console.error(`Failed to parse admin draft for ${audioId}`, error)
    return {
      status: 'invalid' as const,
      storage,
      rawValue: rawDraft,
      reason: 'invalid JSON',
    }
  }
}

function recoverStoredAdminDraft(
  audioId: string,
  storage: Storage | null,
  rawValue: string,
  reason: string,
  revision: Exclude<AdminDraftRevision, null>
): AdminDraftLoadResult {
  return preserveInvalidDraft(audioId, storage, rawValue, reason)
    ? { status: 'recovered', revision }
    : { status: 'recovery-failed', rawValue, reason, revision }
}

export function loadAdminDraftResult(
  recordingOrAudioId: AudioRecording | string,
  tokenExpectation: number | readonly string[]
): AdminDraftLoadResult {
  const recording = resolveRecording(recordingOrAudioId)
  const audioId = typeof recordingOrAudioId === 'string'
    ? recordingOrAudioId
    : recordingOrAudioId.id
  const storedDraft = readStoredAdminDraft(audioId)
  if (storedDraft.status === 'missing') return { status: 'missing', revision: null }
  if (storedDraft.status === 'invalid') {
    return recoverStoredAdminDraft(
      audioId,
      storedDraft.storage,
      storedDraft.rawValue,
      storedDraft.reason,
      getStoredDraftRevision(storedDraft.rawValue, null)
    )
  }
  const tokenKeys = typeof tokenExpectation === 'number'
    ? undefined
    : tokenExpectation
  const tokenCount = typeof tokenExpectation === 'number'
    ? tokenExpectation
    : tokenExpectation.length
  const draft = recording && parseCueDraftPayload(storedDraft.value, {
    recording,
    tokenCount,
    tokenKeys,
  })
  const revision = getStoredDraftRevision(
    storedDraft.rawValue,
    storedDraft.value
  )
  if (draft) return { status: 'ready', draft, revision }

  return recoverStoredAdminDraft(
    audioId,
    storedDraft.storage,
    storedDraft.rawValue,
    'invalid draft schema',
    revision
  )
}

export function loadAdminDraft(
  recordingOrAudioId: AudioRecording | string,
  tokenExpectation: number | readonly string[]
) {
  const result = loadAdminDraftResult(recordingOrAudioId, tokenExpectation)
  return result.status === 'ready' ? result.draft : null
}

export function readVerifiedAdminDraftSummary(
  recordingOrAudioId: AudioRecording | string,
  tokenKeys: readonly string[]
) {
  const result = loadAdminDraftResult(recordingOrAudioId, tokenKeys)
  if (result.status !== 'ready') return null
  const draft = result.draft
  const cueCount = draft.cues.length
  return {
    audioId: draft.audioId,
    tokenCount: draft.tokenCount,
    cueCount,
    updatedAt: draft.updatedAt,
    isIncomplete: cueCount > 0 && cueCount < draft.tokenCount,
  }
}

function writeAdminDraftPayload(
  payload: AdminDraftPayload,
  recording: AudioRecording,
  tokenKeys: readonly string[] | undefined,
  request: AdminDraftWriteRequest
): AdminDraftWriteResult {
  if (!isOpaqueToken(request.writerToken)) {
    throw new TypeError('Cannot persist an admin draft without a writer token')
  }
  const draft = parseCueDraftPayload(payload, {
    recording,
    tokenCount: payload.tokenCount,
    tokenKeys,
  })
  if (!draft) throw new TypeError('Cannot persist an invalid admin draft')

  const storage = getAdminDraftStorage()
  if (!storage) throw new AdminDraftStorageError(draft.audioId)
  const key = getAdminDraftStorageKey(draft.audioId)
  try {
    const existingRaw = readStorageItem(storage, key)
    let existingRevision: AdminDraftRevision = null
    let existingMetadata: AdminDraftStorageMetadata | null = null
    if (existingRaw !== null) {
      let existing: AdminDraftPayload | null = null
      let existingValue: unknown = null
      try {
        existingValue = JSON.parse(existingRaw) as unknown
        existing = parseCueDraftPayload(existingValue, {
          recording,
          tokenCount: draft.tokenCount,
          tokenKeys,
        })
      } catch {
        existing = null
      }
      const draftsMatch =
        existing !== null && JSON.stringify(existing) === JSON.stringify(draft)
      existingRevision = getStoredDraftRevision(existingRaw, existingValue)
      existingMetadata = parseAdminDraftStorageMetadata(existingValue)
      if (draftsMatch) return { revision: existingRevision }
      if (
        existing &&
        (existing.updatedAt > draft.updatedAt ||
          (existing.updatedAt === draft.updatedAt && !draftsMatch))
      ) {
        throw new AdminDraftConflictError(
          draft.audioId,
          existing.updatedAt,
          draft.updatedAt
        )
      }
      if (
        request.expectedRevision !== existingRevision &&
        existingMetadata?.writerToken !== request.writerToken
      ) {
        throw new AdminDraftConflictError(
          draft.audioId,
          existing?.updatedAt ?? null,
          draft.updatedAt
        )
      }
      if (!existing) {
        const preserved = preserveInvalidDraft(
          draft.audioId,
          storage,
          existingRaw,
          'invalid draft schema replaced by a valid draft'
        )
        if (!preserved) {
          throw new Error('Existing admin draft could not be preserved')
        }
      }
    } else if (request.expectedRevision !== null) {
      throw new AdminDraftConflictError(draft.audioId, null, draft.updatedAt)
    }
    const revisionToken = createOpaqueToken()
    const serialized = JSON.stringify({
      ...draft,
      [ADMIN_DRAFT_STORAGE_METADATA_KEY]: {
        version: 1,
        revisionToken,
        writerToken: request.writerToken,
      } satisfies AdminDraftStorageMetadata,
    })
    if (
      existingRaw !== null &&
      readStorageItem(storage, key) !== existingRaw
    ) {
      throw new AdminDraftConflictError(draft.audioId, null, draft.updatedAt)
    }
    writeStorageItem(storage, key, serialized)
    if (readStorageItem(storage, key) !== serialized) {
      throw new Error('Admin draft write could not be verified')
    }
    return { revision: revisionToken }
  } catch (error) {
    if (error instanceof AdminDraftConflictError) throw error
    throw new AdminDraftStorageError(draft.audioId, error)
  }
}

export async function saveAdminDraftPayload(
  payload: AdminDraftPayload,
  recording: AudioRecording,
  tokenKeys: readonly string[] | undefined,
  request: AdminDraftWriteRequest
) {
  const locks = globalThis.navigator?.locks
  if (!locks) {
    throw new AdminDraftStorageError(
      payload.audioId,
      new Error('Web Locks are unavailable; refusing an unsafe draft write')
    )
  }
  return locks.request(
    `tikkun-admin-draft:${payload.audioId}`,
    { mode: 'exclusive' },
    () => writeAdminDraftPayload(payload, recording, tokenKeys, request)
  )
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
    existingUpdatedAt: number | null,
    attemptedUpdatedAt: number
  ) {
    super(
      `Refusing to overwrite conflicting admin draft for ${audioId} ` +
      `(${existingUpdatedAt ?? 'missing'} vs ${attemptedUpdatedAt})`
    )
    this.name = 'AdminDraftConflictError'
  }
}
