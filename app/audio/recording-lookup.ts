import { HDate } from '@hebcal/hdate'
import type { LeiningAliyah, LeiningRun } from '../calendar-model/model-types.ts'
import { compareRefs } from '../calendar-model/ref-utils.ts'
import { audioRecordings } from '../data/audio-catalog.ts'
import { canonicalizeParshaSlug } from '../view-model/navigation/parsha-routes.ts'
import slugify from '../slugify.ts'
import type {
  AudioRecording,
  ParshaAudioRecording,
  RangeAudioRecording,
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
  const canonicalSlug = canonicalizeParshaSlug(titleSlug)
  if (canonicalSlug && audioRecordingSlugs.has(canonicalSlug)) return canonicalSlug
  if (audioRecordingSlugs.has(titleSlug)) return titleSlug
  return canonicalSlug ?? titleSlug
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

export function findAuthoringRecordingForRun({
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

  const available = findRecordingForRun({
    narratorId,
    run,
    aliyahIndex,
    recordings,
  })
  if (available) return available

  const normalizedAliyah =
    aliyahIndex === 'Maftir' ? 7 : Math.max(1, Math.min(aliyahIndex, 7))
  const rangeReading = rangeReadingForAliyah(run, aliyah)
  if (rangeReading) {
    const catalogRecording = recordings.find(
      (recording) =>
        isRangeAudioRecording(recording) &&
        recording.narratorId === narratorId &&
        recording.reading.id === rangeReading.id &&
        sameAliyahRange(recording.range, aliyah)
    )
    if (catalogRecording) return catalogRecording

    const mediaPath = `/audio/${narratorId}/${rangeReading.id}/${normalizedAliyah}.m4a`
    const recording: RangeAudioRecording = {
      id: `${rangeReading.id}-${normalizedAliyah}`,
      narratorId,
      reading: rangeReading,
      range: { start: aliyah.start, end: aliyah.end },
      aliyah: normalizedAliyah,
      title: `${rangeReading.name} Aliyah ${normalizedAliyah}`,
      playSrc: mediaPath,
      downloadSrc: mediaPath,
      format: 'm4a',
      status: 'missing',
    }
    return recording
  }

  const parshaSlug = parshaSlugForRun(run)
  if (!parshaSlug) return null
  const catalogRecording = recordings.find(
    (recording) =>
      isParshaAudioRecording(recording) &&
      recording.narratorId === narratorId &&
      recording.parshaSlug === parshaSlug &&
      recording.aliyah === normalizedAliyah
  )
  if (catalogRecording) return catalogRecording

  const relatedRecording = recordings.find(
    (recording): recording is ParshaAudioRecording =>
      isParshaAudioRecording(recording) &&
      recording.narratorId === narratorId &&
      recording.parshaSlug === parshaSlug
  )
  const parshaName =
    relatedRecording?.parshaName ??
    (run.leining.date.title.en.replace(/^Parshat\s+/i, '').trim() ||
      parshaSlug)
  const mediaPath = `/audio/${narratorId}/${parshaSlug}/${normalizedAliyah}.m4a`
  const recording: ParshaAudioRecording = {
    id: `${parshaSlug}-${normalizedAliyah}`,
    narratorId,
    reading: {
      kind: 'parsha',
      id: parshaSlug,
      name: parshaName,
      ...(relatedRecording?.parshaNumber
        ? { order: relatedRecording.parshaNumber }
        : {}),
    },
    parshaSlug,
    parshaName,
    ...(relatedRecording?.parshaNumber
      ? { parshaNumber: relatedRecording.parshaNumber }
      : {}),
    aliyah: normalizedAliyah,
    title: `${parshaName} Aliyah ${normalizedAliyah}`,
    playSrc: mediaPath,
    downloadSrc: mediaPath,
    format: 'm4a',
    status: 'missing',
  }
  return recording
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
