import type { AudioRecording, CueExportPayload } from './types.ts'
import { singleParshaRouteSpecs } from '../view-model/navigation/parsha-route-catalog.ts'

const pathSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const parshaNumberBySlug = new Map(
  singleParshaRouteSpecs.map((spec, index) => [spec.canonicalSlug, index + 1])
)

// Parsha folders carry their Torah-order number, for example `01 beresheet`.
// Other readings keep their plain reading id as the folder name.
export function cueReadingFolderName(reading: AudioRecording['reading']) {
  const parshaNumber =
    reading.kind === 'parsha' ? parshaNumberBySlug.get(reading.id) : undefined
  return parshaNumber
    ? `${String(parshaNumber).padStart(2, '0')} ${reading.id}`
    : reading.id
}

// Content update snapshots keep the unnumbered `narrator/reading/aliyah.json`
// keys that installed native builds validate, so map file paths onto them.
export function cueContentKeyForPath(relativePath: string) {
  return relativePath.replace(/^(audio-cues\/[^/]+\/)\d{2} /, '$1')
}

export function cueFileNameForRecording({
  aliyah,
}: Pick<AudioRecording, 'aliyah'>) {
  return Number.isInteger(aliyah) && aliyah >= 1 && aliyah <= 7
    ? `${aliyah}.json`
    : null
}

export function cueFileRelativePathForRecording(
  recording: Pick<AudioRecording, 'reading' | 'aliyah' | 'narratorId'>
) {
  const fileName = cueFileNameForRecording(recording)
  if (
    !fileName ||
    !pathSegmentPattern.test(recording.narratorId) ||
    !pathSegmentPattern.test(recording.reading.id)
  ) {
    return null
  }
  return `audio-cues/${recording.narratorId}/${cueReadingFolderName(recording.reading)}/${fileName}`
}

export function cueFileRelativePath(
  recording: Pick<AudioRecording, 'reading' | 'aliyah' | 'narratorId'>
) {
  const relativePath = cueFileRelativePathForRecording(recording)
  if (!relativePath) {
    throw new Error(
      `No cue-file identity for narrator ${recording.narratorId}, aliyah ${recording.aliyah}`
    )
  }
  return relativePath
}

export function formatCueFileJson(payload: CueExportPayload) {
  return `${JSON.stringify(payload, null, 2)}\n`
}
