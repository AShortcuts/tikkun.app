import { audioCuePayloadsByAudioId } from '../data/audio-cues/index.ts'
import {
  audioNarrators,
  audioRecordings,
} from '../data/audio-manifest.generated.ts'
import type { AudioNarrator, AudioRecording, WordCue } from './types.ts'
import { normalizeFirstCueStart } from './normalize-first-cue.ts'
import { filterRecordingIssues } from './recording-issues.ts'
export {
  findRecordingForRun,
  parshaSlugForRun,
} from './recording-lookup.ts'

export function listNarrators(): AudioNarrator[] {
  return audioNarrators
}

export function listRecordings(): AudioRecording[] {
  return audioRecordings
}

export function getCuesForRecording(recording: AudioRecording): WordCue[] {
  return normalizeFirstCueStart(audioCuePayloadsByAudioId[recording.id]?.cues ?? [])
}

export function getIssuesForRecording(recording: AudioRecording, tokenizationVersion: string) {
  return filterRecordingIssues(
    audioCuePayloadsByAudioId[recording.id]?.issues,
    recording.id,
    tokenizationVersion
  )
}

export function getCueSavedAtForRecording(recording: AudioRecording) {
  const savedAt = audioCuePayloadsByAudioId[recording.id]?.savedAt
  if (typeof savedAt !== 'string') return null

  const parsed = Date.parse(savedAt)
  return Number.isFinite(parsed) ? parsed : null
}

export function getCueProgressForRecording(recording: AudioRecording) {
  const payload = audioCuePayloadsByAudioId[recording.id]
  const cueCount = payload?.cueCount ?? payload?.cues.length ?? 0
  const tokenCount = payload?.tokenCount ?? 0

  return {
    cueCount,
    tokenCount,
    isUnfinished: cueCount > 0 && tokenCount > 0 && cueCount < tokenCount,
    isComplete: cueCount > 0 && tokenCount > 0 && cueCount >= tokenCount,
  }
}
