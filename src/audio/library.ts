import type { LeiningRun } from '../calendar-model/model-types.ts'
import slugify from '../slugify.ts'
import { audioCues } from '../data/audio-cues.ts'
import {
  audioNarrators,
  audioRecordings,
} from '../data/audio-manifest.generated.ts'
import type { AudioNarrator, AudioRecording, WordCue } from './types.ts'

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

  return (
    audioRecordings.find(
      (recording) =>
        recording.narratorId === narratorId &&
        recording.parshaSlug === parshaSlug &&
        recording.aliyah === aliyahIndex &&
        recording.status === 'available'
    ) ?? null
  )
}

export function getCuesForRecording(recording: AudioRecording): WordCue[] {
  return audioCues[recording.id] ?? []
}
