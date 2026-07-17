import { HDate } from '@hebcal/hdate'
import type { LeiningAliyah, LeiningRun } from '../calendar-model/model-types.ts'
import { compareRefs } from '../calendar-model/ref-utils.ts'
import { audioRecordings } from '../data/audio-catalog.ts'
import { canonicalizeParshaSlug } from '../view-model/navigation/parsha-routes.ts'
import slugify from '../slugify.ts'
import type {
  AudioRecording,
  RangeReadingIdentity,
} from './types.ts'
import { isParshaAudioRecording, isRangeAudioRecording } from './types.ts'

const audioRecordingSlugs = new Set(
  audioRecordings
    .filter(isParshaAudioRecording)
    .map((recording) => recording.parshaSlug)
)

export const roshChodeshReadingIdentity: RangeReadingIdentity = {
  kind: 'range',
  id: 'rosh-chodesh',
  name: 'Rosh Chodesh',
}

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
  recordings = audioRecordings,
}: {
  narratorId: string
  run: LeiningRun
  aliyahIndex: LeiningAliyah['index']
  recordings?: AudioRecording[]
}): AudioRecording | null {
  if (!aliyahIndex) return null
  const aliyah = run.aliyot.find((candidate) => candidate.index === aliyahIndex)
  if (!aliyah) return null

  const rangeReading = rangeReadingForAliyah(run, aliyah)
  if (rangeReading) {
    return (
      recordings.find(
        (recording) =>
          isRangeAudioRecording(recording) &&
          recording.status === 'available' &&
          recording.narratorId === narratorId &&
          recording.reading.id === rangeReading.id &&
          sameAliyahRange(recording.range, aliyah)
      ) ?? null
    )
  }

  const parshaSlug = parshaSlugForRun(run)
  if (!parshaSlug) return null
  const normalizedAliyah =
    aliyahIndex === 'Maftir' ? 7 : Math.max(1, Math.min(aliyahIndex, 7))

  return (
    recordings.find(
      (recording) =>
        isParshaAudioRecording(recording) &&
        recording.narratorId === narratorId &&
        recording.parshaSlug === parshaSlug &&
        recording.aliyah === normalizedAliyah &&
        recording.status === 'available'
    ) ?? null
  )
}

export function rangeReadingForAliyah(
  run: LeiningRun,
  aliyah: LeiningAliyah
): RangeReadingIdentity | null {
  const hdate = new HDate(run.leining.date.date)
  const isRoshChodesh = hdate.getDate() === 1 || hdate.getDate() === 30
  const isRoshChodeshPassage =
    aliyah.start.scroll === 'torah' &&
    aliyah.start.b === 4 &&
    aliyah.start.c === 28 &&
    aliyah.start.v >= 1 &&
    aliyah.end.b === 4 &&
    aliyah.end.c === 28 &&
    aliyah.end.v <= 15

  return isRoshChodesh && isRoshChodeshPassage
    ? roshChodeshReadingIdentity
    : null
}

function sameAliyahRange(
  left: { start: LeiningAliyah['start']; end: LeiningAliyah['end'] },
  right: LeiningAliyah
) {
  return (
    left.start.scroll === right.start.scroll &&
    left.end.scroll === right.end.scroll &&
    compareRefs(left.start, right.start) === 0 &&
    compareRefs(left.end, right.end) === 0
  )
}
