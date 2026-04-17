import {
  getCuesForRecording,
  getCueSavedAtForRecording,
  listNarrators,
  listRecordings,
} from './library.ts'
import type { WordCue } from './types.ts'
import {
  createCueAnalyticsRecord,
  getCueAnalyticsAliyahSummaries,
  getCueAnalyticsOverview,
  type CueAnalyticsAliyahSummary,
  type CueAnalyticsOverview,
  type CueAnalyticsRecord,
  type CueIntervalSample,
  type CueOutlierDirection,
  cueAnalyticsCueKey,
} from './cue-analytics-core.ts'

export {
  createCueAnalyticsRecord,
  cueAnalyticsCueKey,
  getCueAnalyticsAliyahSummaries,
  getCueAnalyticsOverview,
  type CueAnalyticsAliyahSummary,
  type CueAnalyticsOverview,
  type CueAnalyticsRecord,
  type CueIntervalSample,
  type CueOutlierDirection,
}

export interface CueAnalyticsParshaSummary {
  parshaSlug: string
  parshaName: string
  parshaNumber?: number
  recordingCount: number
  cueRecordingCount: number
  availableAliyot: number[]
  cueAliyot: number[]
  missingCueAliyot: number[]
  averageDuration: number
  averageGap: number
  medianGap: number
  averageWordsPerMinute: number
  longestGap: number
  outlierCount: number
  structuralPauseCount: number
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

export function listCueAnalyticsRecords(options?: {
  cueOverrides?: Map<string, WordCue[]>
  cueSourceByAudioId?: Map<string, 'published' | 'draft'>
  cueUpdatedAtByAudioId?: Map<string, number | null>
}) {
  const narratorNames = new Map(
    listNarrators().map((narrator) => [narrator.id, narrator.displayName])
  )

  return listRecordings()
    .filter((recording) => recording.status === 'available')
    .map((recording) => {
      const cues = options?.cueOverrides?.has(recording.id)
        ? options.cueOverrides.get(recording.id) ?? []
        : getCuesForRecording(recording)

      return createCueAnalyticsRecord({
        recording,
        narratorName: narratorNames.get(recording.narratorId) ?? recording.narratorId,
        cues,
        cueSource: options?.cueSourceByAudioId?.get(recording.id) ?? 'published',
        cueUpdatedAt:
          options?.cueUpdatedAtByAudioId?.get(recording.id) ?? getCueSavedAtForRecording(recording),
      })
    })
    .sort(
      (left, right) =>
        (left.recording.parshaNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.recording.parshaNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.recording.aliyah - right.recording.aliyah ||
        left.narratorName.localeCompare(right.narratorName)
    )
}

export function getCueAnalyticsParshaSummaries(records: CueAnalyticsRecord[]) {
  const recordsById = new Map(records.map((record) => [record.recording.id, record]))
  const parshaMap = new Map<string, CueAnalyticsParshaSummary>()

  for (const recording of listRecordings().filter((entry) => entry.status === 'available')) {
    const existing = parshaMap.get(recording.parshaSlug) ?? {
      parshaSlug: recording.parshaSlug,
      parshaName: recording.parshaName,
      parshaNumber: recording.parshaNumber,
      recordingCount: 0,
      cueRecordingCount: 0,
      availableAliyot: [],
      cueAliyot: [],
      missingCueAliyot: [],
      averageDuration: 0,
      averageGap: 0,
      medianGap: 0,
      averageWordsPerMinute: 0,
      longestGap: 0,
      outlierCount: 0,
      structuralPauseCount: 0,
    }

    existing.recordingCount += 1
    existing.availableAliyot.push(recording.aliyah)

    const record = recordsById.get(recording.id)
    if (record && record.intervalCount > 0) {
      existing.cueRecordingCount += 1
      existing.cueAliyot.push(recording.aliyah)
    } else {
      existing.missingCueAliyot.push(recording.aliyah)
    }

    parshaMap.set(recording.parshaSlug, existing)
  }

  return [...parshaMap.values()]
    .map((summary) => {
      const matchingRecords = records.filter(
        (record) => record.recording.parshaSlug === summary.parshaSlug && record.intervalCount > 0
      )
      const allIntervals = matchingRecords.flatMap((record) => record.intervals)
      return {
        ...summary,
        availableAliyot: [...new Set(summary.availableAliyot)].sort((a, b) => a - b),
        cueAliyot: [...new Set(summary.cueAliyot)].sort((a, b) => a - b),
        missingCueAliyot: [...new Set(summary.missingCueAliyot)].sort((a, b) => a - b),
        averageDuration: average(matchingRecords.map((record) => record.totalDuration)),
        averageGap: average(allIntervals),
        medianGap: median(allIntervals),
        averageWordsPerMinute: allIntervals.length ? 60 / average(allIntervals) : 0,
        longestGap: allIntervals.length ? Math.max(...allIntervals) : 0,
        outlierCount: matchingRecords.reduce((total, record) => total + record.outlierCount, 0),
        structuralPauseCount: matchingRecords.reduce(
          (total, record) => total + record.structuralPauseCount,
          0
        ),
      } satisfies CueAnalyticsParshaSummary
    })
    .sort(
      (left, right) =>
        (left.parshaNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.parshaNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.parshaName.localeCompare(right.parshaName)
    )
}
