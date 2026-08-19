import { isParshaAudioRecording } from '../../app/audio/types.ts'
import { audioRecordings } from '../../app/data/audio-catalog.ts'
import {
  recordingWorkRows,
  type RecordingWorkStatus,
} from '../../app/data/about-progress.ts'
import {
  publicAliyotByParsha,
  type GeneratedPublicAliyah,
  type PublicCueStatus,
} from '../../generated/public-reading-manifest.ts'

export const aliyahLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז'] as const

export type ReadingStatusKind =
  | 'ready'
  | 'progress'
  | 'review'
  | 'audio'
  | 'planned'

export type CoverageFilter =
  | 'all'
  | 'audio'
  | 'ready'
  | 'active'
  | 'planned'

export type CueCoverageStatus = PublicCueStatus
export type PublicAliyah = GeneratedPublicAliyah

export type PublicReading = {
  number: number | null
  parshaSlug: string | null
  parshaName: string
  parshaHebrew: string
  availableAliyot: readonly number[]
  aliyot: readonly PublicAliyah[]
  workStatus: RecordingWorkStatus | null
  statusKind: ReadingStatusKind
  statusLabel: string
}

function getPublicAliyot(parshaSlug: string | undefined) {
  if (!parshaSlug) return []
  const aliyot = publicAliyotByParsha[parshaSlug]
  if (!aliyot) {
    throw new Error(`Public aliyah manifest is missing ${parshaSlug}`)
  }
  return aliyot
}

const parshaSlugByNumber = new Map<number, string>()

for (const recording of audioRecordings.filter(isParshaAudioRecording)) {
  if (recording.status !== 'available' || recording.parshaNumber === undefined) {
    continue
  }
  parshaSlugByNumber.set(recording.parshaNumber, recording.parshaSlug)
}

function publicStatus(
  workStatus: RecordingWorkStatus | undefined,
  aliyot: readonly PublicAliyah[]
) {
  const availableCount = aliyot.filter((aliyah) => aliyah.audioId).length
  const wordSyncReady =
    aliyot.length === 7 &&
    aliyot.every(
      (aliyah) => aliyah.audioId !== null && aliyah.cueStatus === 'cued'
    )
  const timingStarted = aliyot.some(
    (aliyah) => aliyah.cueStatus === 'cued' || aliyah.cueStatus === 'draft'
  )

  if (wordSyncReady) {
    return { statusKind: 'ready', statusLabel: 'Word sync ready' } as const
  }
  if (workStatus === 'Needs review') {
    return { statusKind: 'review', statusLabel: 'Recording review' } as const
  }
  if (timingStarted || workStatus === 'Active') {
    return {
      statusKind: 'progress',
      statusLabel: availableCount > 0 ? 'Sync in progress' : 'Recording in progress',
    } as const
  }
  if (availableCount > 0) {
    return { statusKind: 'audio', statusLabel: 'Audio available' } as const
  }
  return { statusKind: 'planned', statusLabel: 'Planned' } as const
}

export const readingCoverage: readonly PublicReading[] = recordingWorkRows.map(
  (work) => {
    const parshaSlug =
      work.number === null
        ? undefined
        : parshaSlugByNumber.get(work.number)
    const aliyot = getPublicAliyot(parshaSlug)
    const availableAliyot = aliyot
      .filter((aliyah) => aliyah.audioId !== null)
      .map((aliyah) => aliyah.number)
    return {
      number: work.number,
      parshaSlug: parshaSlug ?? null,
      parshaName: work.parshaEnglish,
      parshaHebrew: work.parshaHebrew,
      availableAliyot,
      aliyot,
      workStatus: work.workStatus ?? null,
      ...publicStatus(work.workStatus, aliyot),
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

export function matchesCoverageFilter(
  reading: PublicReading,
  filter: CoverageFilter
) {
  if (filter === 'audio') return reading.availableAliyot.length > 0
  if (filter === 'ready') return reading.statusKind === 'ready'
  if (filter === 'active') {
    return reading.statusKind === 'progress' || reading.statusKind === 'review'
  }
  if (filter === 'planned') return reading.statusKind === 'planned'
  return true
}

function normalizeCoverageSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

export function filterReadingCoverage(
  readings: readonly PublicReading[],
  query: string,
  filter: CoverageFilter
) {
  const normalizedQuery = normalizeCoverageSearch(query)
  return readings.filter((reading) => {
    if (!matchesCoverageFilter(reading, filter)) return false
    if (!normalizedQuery) return true
    return normalizeCoverageSearch(
      `${reading.parshaName} ${reading.parshaHebrew}`
    ).includes(normalizedQuery)
  })
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
