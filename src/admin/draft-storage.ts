import { TOKENIZATION_VERSION } from '../reader-preferences.ts'
import type { WordCue } from '../audio/types.ts'

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

export function loadAdminDraft(audioId: string, tokenCount: number) {
  const rawDraft = window.localStorage.getItem(getAdminDraftStorageKey(audioId))
  if (!rawDraft) return null

  let parsedDraft: unknown
  try {
    parsedDraft = JSON.parse(rawDraft)
  } catch (error) {
    console.error(`Failed to parse admin draft for ${audioId}`, error)
    window.localStorage.removeItem(getAdminDraftStorageKey(audioId))
    return null
  }

  if (!parsedDraft || typeof parsedDraft !== 'object') {
    window.localStorage.removeItem(getAdminDraftStorageKey(audioId))
    return null
  }

  const draft = parsedDraft as Partial<AdminDraftPayload>
  if (
    draft.audioId !== audioId ||
    draft.tokenizationVersion !== TOKENIZATION_VERSION ||
    draft.tokenCount !== tokenCount ||
    !Array.isArray(draft.cues) ||
    typeof draft.updatedAt !== 'number'
  ) {
    window.localStorage.removeItem(getAdminDraftStorageKey(audioId))
    return null
  }

  return {
    audioId,
    tokenCount,
    tokenPointer:
      typeof draft.tokenPointer === 'number'
        ? Math.max(-1, Math.min(draft.tokenPointer, tokenCount - 1))
        : -1,
    tokenizationVersion: TOKENIZATION_VERSION,
    updatedAt: draft.updatedAt,
    cues: (draft.cues.filter(Boolean) as WordCue[]).slice(0, tokenCount),
  } satisfies AdminDraftPayload
}

export function readAdminDraftSummary(audioId: string) {
  const rawDraft = window.localStorage.getItem(getAdminDraftStorageKey(audioId))
  if (!rawDraft) return null

  let parsedDraft: unknown
  try {
    parsedDraft = JSON.parse(rawDraft)
  } catch (error) {
    console.error(`Failed to parse admin draft summary for ${audioId}`, error)
    return null
  }

  if (!parsedDraft || typeof parsedDraft !== 'object') return null

  const draft = parsedDraft as Partial<AdminDraftPayload>
  if (
    draft.audioId !== audioId ||
    draft.tokenizationVersion !== TOKENIZATION_VERSION ||
    !Array.isArray(draft.cues) ||
    typeof draft.tokenCount !== 'number' ||
    typeof draft.updatedAt !== 'number'
  ) {
    return null
  }

  const cueCount = draft.cues.filter(Boolean).length
  return {
    audioId,
    tokenCount: draft.tokenCount,
    cueCount,
    updatedAt: draft.updatedAt,
    isIncomplete: cueCount > 0 && cueCount < draft.tokenCount,
  }
}
