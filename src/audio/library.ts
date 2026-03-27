import type { LeiningRun } from '../calendar-model/model-types.ts'
import slugify from '../slugify.ts'
import { audioCuePayloadsByAudioId } from '../data/audio-cues/index.ts'
import {
  audioNarrators,
  audioRecordings,
} from '../data/audio-manifest.generated.ts'
import type { AudioNarrator, AudioRecording, WordCue } from './types.ts'
import { normalizeFirstCueStart } from './normalize-first-cue.ts'

export function listNarrators(): AudioNarrator[] {
  return audioNarrators
}

export function listRecordings(): AudioRecording[] {
  return audioRecordings
}

export function parshaSlugForRun(run: LeiningRun): string | null {
  if (!run.leining.isParsha) return null
  return slugify(run.leining.date.title.en.replace(/^Parshat\s+/i, ''))
}

export function findRecordingForRun({
  narratorId,
  run,
  aliyahIndex,
}: {
  narratorId: string
  run: LeiningRun
  aliyahIndex: number
}): AudioRecording | null {
  const parshaSlug = parshaSlugForRun(run)
  if (!parshaSlug) return null
  const normalizedAliyah = Math.max(1, Math.min(aliyahIndex, 7))

  return (
    audioRecordings.find(
      (recording) =>
        recording.narratorId === narratorId &&
        recording.parshaSlug === parshaSlug &&
        recording.aliyah === normalizedAliyah &&
        recording.status === 'available'
    ) ?? null
  )
}

export function getCuesForRecording(recording: AudioRecording): WordCue[] {
  return normalizeFirstCueStart(audioCuePayloadsByAudioId[recording.id]?.cues ?? [])
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
