import type { AudioRecording, CueExportPayload } from './types.ts'

const pathSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
  return `audio-cues/${recording.narratorId}/${recording.reading.id}/${fileName}`
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
