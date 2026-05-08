import type { LeiningAliyah, LeiningRun } from '../calendar-model/model-types.ts'
import { audioRecordings } from '../data/audio-manifest.generated.ts'
import { canonicalizeParshaSlug } from '../view-model/navigation/parsha-routes.ts'
import slugify from '../slugify.ts'
import type { AudioRecording } from './types.ts'

const audioRecordingSlugs = new Set(
  audioRecordings.map((recording) => recording.parshaSlug)
)

export function parshaSlugForRun(run: LeiningRun): string | null {
  if (!run.leining.isParsha) return null

  const titleSlug = slugify(run.leining.date.title.en.replace(/^Parshat\s+/i, ''))
  if (audioRecordingSlugs.has(titleSlug)) return titleSlug

  const canonicalSlug = canonicalizeParshaSlug(titleSlug)
  return canonicalSlug && audioRecordingSlugs.has(canonicalSlug)
    ? canonicalSlug
    : titleSlug
}

export function findRecordingForRun({
  narratorId,
  run,
  aliyahIndex,
}: {
  narratorId: string
  run: LeiningRun
  aliyahIndex: LeiningAliyah['index']
}): AudioRecording | null {
  const parshaSlug = parshaSlugForRun(run)
  if (!parshaSlug || !aliyahIndex) return null
  const normalizedAliyah =
    aliyahIndex === 'Maftir' ? 7 : Math.max(1, Math.min(aliyahIndex, 7))

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
