import type { AudioRecording, CueExportPayload } from './types.ts'

const narratorCueFileSuffixes = new Map<string, string>([
  ['yoni-davidov', 'yd'],
])

const hebrewAliyot = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז'] as const

export function cueFileNameForRecording({
  reading,
  aliyah,
  narratorId,
}: Pick<AudioRecording, 'reading' | 'aliyah' | 'narratorId'>) {
  const aliyahKey = aliyahFileKey(aliyah)
  const narratorSuffix = narratorCueFileSuffixes.get(narratorId)
  if (!aliyahKey || !narratorSuffix) return null
  return `${reading.id}-${aliyahKey}-${narratorSuffix}.json`
}

export function cueFileRelativePath(
  recording: Pick<AudioRecording, 'reading' | 'aliyah' | 'narratorId'>
) {
  const fileName = cueFileNameForRecording(recording)
  if (!fileName) {
    throw new Error(
      `No cue-file identity for narrator ${recording.narratorId}, aliyah ${recording.aliyah}`
    )
  }
  return `src/data/audio-cues/${recording.reading.id}/${fileName}`
}

export function formatCueFileJson(payload: CueExportPayload) {
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function aliyahFileKey(aliyah: number) {
  return Number.isInteger(aliyah) ? hebrewAliyot[aliyah - 1] ?? null : null
}
