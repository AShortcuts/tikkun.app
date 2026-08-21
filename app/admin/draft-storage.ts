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

export type AdminDraftLoadResult =
  | {
      status: 'ready'
      draft: AdminDraftPayload
      revision: Exclude<AdminDraftRevision, null>
    }
  | { status: 'missing'; revision: null }
  | {
      status: 'invalid'
      reason: 'invalid-json' | 'invalid-draft'
      revision: Exclude<AdminDraftRevision, null>
    }
  | { status: 'unavailable'; revision: null }

const ADMIN_DRAFT_STORAGE_PREFIX = 'tikkun-admin-draft:'
const recordingsById = new Map(
  audioRecordings.map((recording) => [recording.id, recording])
)
const recentWritesByStorage = new WeakMap<
  Storage,
  Map<string, { rawValue: string; writerToken: string }>
>()

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

function isWriterToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

export function createAdminDraftWriterToken() {
  return createOpaqueToken()
}

export function getAdminDraftStorageKey(audioId: string) {
  return `${ADMIN_DRAFT_STORAGE_PREFIX}${audioId}`
}

function resolveRecording(recording: AudioRecording | string) {
  return typeof recording === 'string'
    ? recordingsById.get(recording) ?? null
    : recording
}

function draftExpectation(tokenExpectation: number | readonly string[]) {
  return typeof tokenExpectation === 'number'
    ? { tokenCount: tokenExpectation }
    : { tokenCount: tokenExpectation.length, tokenKeys: tokenExpectation }
}

export function loadAdminDraftResult(
  recordingOrAudioId: AudioRecording | string,
  tokenExpectation: number | readonly string[]
): AdminDraftLoadResult {
  const recording = resolveRecording(recordingOrAudioId)
  const audioId = typeof recordingOrAudioId === 'string'
    ? recordingOrAudioId
    : recordingOrAudioId.id
  const storage = getBrowserStorage('local')
  const key = getAdminDraftStorageKey(audioId)

  let rawValue: string | null
  try {
    rawValue = readStorageItem(storage, key)
  } catch (error) {
    console.error(`Failed to read admin draft for ${audioId}`, error)
    return { status: 'unavailable', revision: null }
  }
  if (rawValue === null) return { status: 'missing', revision: null }

  let value: unknown
  try {
    value = JSON.parse(rawValue)
  } catch (error) {
    console.error(`Failed to parse admin draft for ${audioId}`, error)
    return { status: 'invalid', reason: 'invalid-json', revision: rawValue }
  }

  const draft = recording
    ? parseCueDraftPayload(value, {
        recording,
        ...draftExpectation(tokenExpectation),
      })
    : null
  if (!draft) {
    return { status: 'invalid', reason: 'invalid-draft', revision: rawValue }
  }
  return { status: 'ready', draft, revision: rawValue }
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

function recentWrites(storage: Storage) {
  let writes = recentWritesByStorage.get(storage)
  if (!writes) {
    writes = new Map()
    recentWritesByStorage.set(storage, writes)
  }
  return writes
}

function writeAdminDraftPayload(
  payload: AdminDraftPayload,
  recording: AudioRecording,
  tokenKeys: readonly string[] | undefined,
  request: AdminDraftWriteRequest
): AdminDraftWriteResult {
  if (!isWriterToken(request.writerToken)) {
    throw new TypeError('Cannot persist an admin draft without a writer token')
  }
  const draft = parseCueDraftPayload(payload, {
    recording,
    tokenCount: payload.tokenCount,
    tokenKeys,
  })
  if (!draft) throw new TypeError('Cannot persist an invalid admin draft')

  const storage = getBrowserStorage('local')
  if (!storage) throw new AdminDraftStorageError(draft.audioId)
  const key = getAdminDraftStorageKey(draft.audioId)
  const serialized = JSON.stringify(draft)

  try {
    const existingRaw = readStorageItem(storage, key)
    if (existingRaw === serialized) return { revision: serialized }

    let existing: AdminDraftPayload | null = null
    if (existingRaw !== null) {
      try {
        existing = parseCueDraftPayload(JSON.parse(existingRaw), {
          recording,
          tokenCount: draft.tokenCount,
          tokenKeys,
        })
      } catch {
        existing = null
      }
    }

    const recentWrite = recentWrites(storage).get(key)
    const followsOwnWrite =
      recentWrite?.rawValue === existingRaw &&
      recentWrite.writerToken === request.writerToken
    if (
      request.expectedRevision !== existingRaw &&
      !followsOwnWrite
    ) {
      throw new AdminDraftConflictError(
        draft.audioId,
        existing?.updatedAt ?? null,
        draft.updatedAt
      )
    }
    if (
      existing &&
      (existing.updatedAt > draft.updatedAt ||
        (existing.updatedAt === draft.updatedAt && existingRaw !== serialized))
    ) {
      throw new AdminDraftConflictError(
        draft.audioId,
        existing.updatedAt,
        draft.updatedAt
      )
    }
    if (readStorageItem(storage, key) !== existingRaw) {
      throw new AdminDraftConflictError(draft.audioId, null, draft.updatedAt)
    }

    writeStorageItem(storage, key, serialized)
    if (readStorageItem(storage, key) !== serialized) {
      throw new Error('Admin draft write could not be verified')
    }
    recentWrites(storage).set(key, {
      rawValue: serialized,
      writerToken: request.writerToken,
    })
    return { revision: serialized }
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
