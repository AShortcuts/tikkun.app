import {
  loadCuePayloadForRecording,
  resolveCueDataForRecording,
  retryCueDataForRecording,
} from './cue-data.ts'
import {
  audioNarrators,
} from '../../generated/audio-manifest.ts'
import { audioRecordings } from '../data/audio-catalog.ts'
import type { AudioNarrator, AudioRecording, WordCue } from './types.ts'
import { normalizeFirstCueStart } from './normalize-first-cue.ts'
import { TOKENIZATION_VERSION } from './cue-schema.ts'
import { filterRecordingIssues } from './recording-issues.ts'
export {
  findAuthoringRecordingForRun,
  findRecordingForRun,
  parshaSlugForRun,
} from './recording-lookup.ts'

export function listNarrators(): AudioNarrator[] {
  return audioNarrators
}

export function listRecordings(): AudioRecording[] {
  return audioRecordings
}

export async function getCuePayloadForRecording(recording: AudioRecording) {
  return loadCuePayloadForRecording(recording)
}

export function getCueDataResolutionForRecording(recording: AudioRecording) {
  return resolveCueDataForRecording(recording)
}

export function retryCueDataResolutionForRecording(recording: AudioRecording) {
  return retryCueDataForRecording(recording)
}

export async function getCuesForRecording(recording: AudioRecording): Promise<WordCue[]> {
  const payload = await getCuePayloadForRecording(recording)
  return normalizeFirstCueStart(payload?.cues ?? [])
}

export async function getPassageCuesForRecording(recording: AudioRecording): Promise<WordCue[]> {
  const payload = await getCuePayloadForRecording(recording)
  if (!payload) return []
  if (payload.tokenizationVersion !== TOKENIZATION_VERSION) {
    console.warn(`Ignoring outdated passage timings for ${recording.id}`)
    return []
  }
  // Excerpts need original media offsets, including a late first published cue.
  return payload.cues
}

export async function getIssuesForRecording(
  recording: AudioRecording,
  tokenizationVersion: string
) {
  const payload = await getCuePayloadForRecording(recording)
  return filterRecordingIssues(
    payload?.issues,
    recording.id,
    tokenizationVersion
  )
}

export async function getCueSavedAtForRecording(recording: AudioRecording) {
  const payload = await getCuePayloadForRecording(recording)
  const savedAt = payload?.savedAt
  if (typeof savedAt !== 'string') return null

  const parsed = Date.parse(savedAt)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getCueProgressForRecording(recording: AudioRecording) {
  const payload = await getCuePayloadForRecording(recording)
  const cueCount = payload?.cueCount ?? payload?.cues.length ?? 0
  const tokenCount = payload?.tokenCount ?? 0

  return {
    cueCount,
    tokenCount,
    isUnfinished: cueCount > 0 && tokenCount > 0 && cueCount < tokenCount,
    isComplete: cueCount > 0 && tokenCount > 0 && cueCount >= tokenCount,
  }
}
