import type { AudioRecording, CueExportPayload } from './types.ts'

export function cueFileRelativePath({
  parshaSlug,
  aliyah,
  narratorId,
}: Pick<AudioRecording, 'parshaSlug' | 'aliyah' | 'narratorId'>) {
  return `src/data/audio-cues/${parshaSlug}/${parshaSlug}-${aliyahFileKey(
    aliyah
  )}-${narratorInitials(narratorId)}.json`
}

export function formatCueFileJson(payload: CueExportPayload) {
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function narratorInitials(narratorId: string) {
  return narratorId
    .split('-')
    .map((part) => part[0])
    .join('')
}

export function aliyahFileKey(aliyah: number) {
  const hebrewAliyot = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז']
  const normalizedAliyah = Math.max(1, Math.min(aliyah, 7))
  return hebrewAliyot[normalizedAliyah - 1] ?? `${normalizedAliyah}`
}
