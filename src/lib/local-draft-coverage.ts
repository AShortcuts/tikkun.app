import {
  parseCueDraftPayload,
  type CueDraftPayload,
} from '../../app/audio/cue-draft.ts'
import type { AudioRecording } from '../../app/audio/types.ts'
import { audioRecordings } from '../../app/data/audio-catalog.ts'
import {
  getBrowserStorage,
  readStorageItem,
} from '../../app/persistence/persisted-state.ts'

export type LocalCueDraftStatus = 'draft'

const adminDraftStoragePrefix = 'tikkun-admin-draft:'
const recordingsById = new Map(
  audioRecordings.map((recording) => [recording.id, recording])
)

function statusForDraft(draft: CueDraftPayload): LocalCueDraftStatus | null {
  if (draft.cues.length === 0) return null
  return 'draft'
}

export function parseLocalCueDraftStatus(
  rawDraft: string,
  recording: AudioRecording,
  expectedTokenCount: number
): LocalCueDraftStatus | null {
  let value: unknown
  try {
    value = JSON.parse(rawDraft) as unknown
  } catch {
    return null
  }
  const draft = parseCueDraftPayload(value, {
    recording,
    tokenCount: expectedTokenCount,
  })
  return draft ? statusForDraft(draft) : null
}

export function getLocalCueDraftStatus(
  audioId: string,
  expectedTokenCount: number | null
): LocalCueDraftStatus | null {
  if (!expectedTokenCount) return null
  const recording = recordingsById.get(audioId)
  if (!recording) return null

  const storage = getBrowserStorage('local')
  const key = `${adminDraftStoragePrefix}${audioId}`
  let rawDraft: string | null
  try {
    rawDraft = readStorageItem(storage, key)
  } catch (error) {
    console.error(`Failed to read local Cue Draft for ${audioId}`, error)
    return null
  }
  if (rawDraft === null) return null

  // Readings is a disclosure-only surface. Invalid authoring data is left in
  // place for Cue Authoring's lossless recovery flow.
  return parseLocalCueDraftStatus(rawDraft, recording, expectedTokenCount)
}
