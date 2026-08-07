import { isParshaAudioRecording } from '../../app/audio/types.ts'
import { audioRecordings } from '../../app/data/audio-catalog.ts'
import {
  recordingProgressRows,
  type RecordingStatus,
} from '../../app/data/about-progress.ts'

export const aliyahLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז'] as const

export type ReadingStatusKind =
  | 'ready'
  | 'progress'
  | 'review'
  | 'audio'
  | 'planned'

export type PublicReading = {
  number: number | null
  parshaSlug: string | null
  parshaName: string
  parshaHebrew: string
  availableAliyot: readonly number[]
  trackerStatus: RecordingStatus
  statusKind: ReadingStatusKind
  statusLabel: string
}

type CatalogReading = {
  parshaSlug: string
  parshaName: string
  parshaNumber?: number
  availableAliyot: Set<number>
}

const catalogByNumber = new Map<number, CatalogReading>()

for (const recording of audioRecordings.filter(isParshaAudioRecording)) {
  if (recording.parshaNumber === undefined) continue
  const reading = catalogByNumber.get(recording.parshaNumber) ?? {
    parshaSlug: recording.parshaSlug,
    parshaName: recording.parshaName,
    parshaNumber: recording.parshaNumber,
    availableAliyot: new Set<number>(),
  }
  if (recording.status === 'available') {
    reading.availableAliyot.add(recording.aliyah)
  }
  catalogByNumber.set(recording.parshaNumber, reading)
}

function publicStatus(status: RecordingStatus, availableCount: number) {
  if (status === 'Completed') {
    return { statusKind: 'ready', statusLabel: 'Word sync ready' } as const
  }
  if (status === 'In progress') {
    return { statusKind: 'progress', statusLabel: 'Sync in progress' } as const
  }
  if (status === 'Redo, please') {
    return { statusKind: 'review', statusLabel: 'Recording review' } as const
  }
  if (availableCount > 0) {
    return { statusKind: 'audio', statusLabel: 'Audio available' } as const
  }
  return { statusKind: 'planned', statusLabel: 'Planned' } as const
}

export const readingCoverage: readonly PublicReading[] = recordingProgressRows.map(
  (progress) => {
    const catalog =
      progress.number === null ? undefined : catalogByNumber.get(progress.number)
    const availableAliyot = [...(catalog?.availableAliyot ?? [])].sort(
      (a, b) => a - b
    )
    return {
      number: progress.number,
      parshaSlug: catalog?.parshaSlug ?? null,
      parshaName: progress.parshaEnglish,
      parshaHebrew: progress.parshaHebrew,
      availableAliyot,
      trackerStatus: progress.status,
      ...publicStatus(progress.status, availableAliyot.length),
    }
  }
)

export const availableReadings = readingCoverage.filter(
  (reading): reading is PublicReading & { parshaSlug: string } =>
    reading.parshaSlug !== null && reading.availableAliyot.length > 0
)

export const coverageSummary = {
  readingsWithAudio: availableReadings.length,
  availableAliyot: availableReadings.reduce(
    (total, reading) => total + reading.availableAliyot.length,
    0
  ),
  syncedReadings: readingCoverage.filter(
    (reading) => reading.statusKind === 'ready'
  ).length,
}

export function getRequiredReading(parshaSlug: string) {
  const reading = availableReadings.find(
    (candidate) => candidate.parshaSlug === parshaSlug
  )
  if (!reading) {
    throw new Error(`Public reading catalog is missing ${parshaSlug}`)
  }
  return reading
}
