import { getCuesForRecording, listNarrators, listRecordings } from './library.ts'
import type { AudioRecording, WordCue } from './types.ts'

export interface CueIntervalSample {
  cueNumber: number
  previousCueNumber: number
  gap: number
  wordsPerMinute: number
  isOutlier: boolean
  outlierDirection: 'slow' | 'fast' | null
  severity: number
}

export interface CueAnalyticsRecord {
  recording: AudioRecording
  narratorName: string
  cueCount: number
  intervalCount: number
  cues: WordCue[]
  intervals: number[]
  intervalSamples: CueIntervalSample[]
  totalDuration: number
  averageGap: number
  medianGap: number
  longestGap: number
  shortestGap: number
  averageWordsPerMinute: number
  outlierCount: number
  lowerOutlierThreshold: number
  upperOutlierThreshold: number
}

export interface CueAnalyticsOverview {
  recordingCount: number
  cueCount: number
  intervalCount: number
  totalDuration: number
  averageGap: number
  medianGap: number
  averageWordsPerMinute: number
  longestGap: number
  outlierCount: number
}

export interface CueAnalyticsAliyahSummary {
  aliyah: number
  recordingCount: number
  cueCount: number
  averageDuration: number
  averageGap: number
  medianGap: number
  averageWordsPerMinute: number
  longestGap: number
  outlierCount: number
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

function quartile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * ratio
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  if (lowerIndex === upperIndex) return sorted[lowerIndex]!
  const weight = position - lowerIndex
  return sorted[lowerIndex]! * (1 - weight) + sorted[upperIndex]! * weight
}

function getIntervals(cues: WordCue[]) {
  const intervals: number[] = []

  for (let index = 1; index < cues.length; index += 1) {
    const interval = Number((cues[index]!.timeStart - cues[index - 1]!.timeStart).toFixed(3))
    if (interval > 0) intervals.push(interval)
  }

  return intervals
}

function getOutlierThresholds(intervals: number[]) {
  if (intervals.length < 4) {
    return { lower: 0, upper: Number.POSITIVE_INFINITY }
  }

  const q1 = quartile(intervals, 0.25)
  const q3 = quartile(intervals, 0.75)
  const iqr = q3 - q1

  return {
    lower: Math.max(0, q1 - iqr * 1.5),
    upper: q3 + iqr * 1.5,
  }
}

function createIntervalSamples(
  cues: WordCue[],
  intervals: number[],
  thresholds: { lower: number; upper: number }
) {
  return intervals.map((gap, index) => {
    const isSlowOutlier = gap > thresholds.upper
    const isFastOutlier = thresholds.lower > 0 && gap < thresholds.lower
    const outlierDirection = isSlowOutlier ? 'slow' : isFastOutlier ? 'fast' : null
    const severity = isSlowOutlier
      ? gap / thresholds.upper
      : isFastOutlier && thresholds.lower > 0
        ? thresholds.lower / gap
        : 0

    return {
      cueNumber: cues[index + 1]?.cueNumber ?? index + 2,
      previousCueNumber: cues[index]?.cueNumber ?? index + 1,
      gap,
      wordsPerMinute: gap > 0 ? 60 / gap : 0,
      isOutlier: isSlowOutlier || isFastOutlier,
      outlierDirection,
      severity,
    } satisfies CueIntervalSample
  })
}

export function listCueAnalyticsRecords(): CueAnalyticsRecord[] {
  const narratorNames = new Map(
    listNarrators().map((narrator) => [narrator.id, narrator.displayName])
  )

  return listRecordings()
    .filter((recording) => recording.status === 'available')
    .map((recording) => {
      const cues = getCuesForRecording(recording)
      const intervals = getIntervals(cues)
      const thresholds = getOutlierThresholds(intervals)
      const intervalSamples = createIntervalSamples(cues, intervals, thresholds)
      const totalDuration = intervals.length
        ? Number((cues[cues.length - 1]!.timeStart - cues[0]!.timeStart).toFixed(3))
        : 0

      return {
        recording,
        narratorName: narratorNames.get(recording.narratorId) ?? recording.narratorId,
        cueCount: cues.length,
        intervalCount: intervals.length,
        cues,
        intervals,
        intervalSamples,
        totalDuration,
        averageGap: average(intervals),
        medianGap: median(intervals),
        longestGap: intervals.length ? Math.max(...intervals) : 0,
        shortestGap: intervals.length ? Math.min(...intervals) : 0,
        averageWordsPerMinute: intervals.length ? 60 / average(intervals) : 0,
        outlierCount: intervalSamples.filter((sample) => sample.isOutlier).length,
        lowerOutlierThreshold: thresholds.lower,
        upperOutlierThreshold: thresholds.upper,
      } satisfies CueAnalyticsRecord
    })
    .sort(
      (left, right) =>
        (left.recording.parshaNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.recording.parshaNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.recording.aliyah - right.recording.aliyah ||
        left.narratorName.localeCompare(right.narratorName)
    )
}

export function getCueAnalyticsOverview(records: CueAnalyticsRecord[]) {
  const allIntervals = records.flatMap((record) => record.intervals)
  const cueCount = records.reduce((total, record) => total + record.cueCount, 0)
  const totalDuration = records.reduce((total, record) => total + record.totalDuration, 0)

  return {
    recordingCount: records.length,
    cueCount,
    intervalCount: allIntervals.length,
    totalDuration,
    averageGap: average(allIntervals),
    medianGap: median(allIntervals),
    averageWordsPerMinute: allIntervals.length ? 60 / average(allIntervals) : 0,
    longestGap: allIntervals.length ? Math.max(...allIntervals) : 0,
    outlierCount: records.reduce((total, record) => total + record.outlierCount, 0),
  } satisfies CueAnalyticsOverview
}

export function getCueAnalyticsAliyahSummaries(records: CueAnalyticsRecord[]) {
  const summaries: CueAnalyticsAliyahSummary[] = []

  for (let aliyah = 1; aliyah <= 7; aliyah += 1) {
    const matchingRecords = records.filter(
      (record) => record.recording.aliyah === aliyah && record.intervalCount > 0
    )
    const allIntervals = matchingRecords.flatMap((record) => record.intervals)
    summaries.push({
      aliyah,
      recordingCount: matchingRecords.length,
      cueCount: matchingRecords.reduce((total, record) => total + record.cueCount, 0),
      averageDuration: average(matchingRecords.map((record) => record.totalDuration)),
      averageGap: average(allIntervals),
      medianGap: median(allIntervals),
      averageWordsPerMinute: allIntervals.length ? 60 / average(allIntervals) : 0,
      longestGap: allIntervals.length ? Math.max(...allIntervals) : 0,
      outlierCount: matchingRecords.reduce((total, record) => total + record.outlierCount, 0),
    })
  }

  return summaries
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
      } satisfies CueAnalyticsParshaSummary
    })
    .sort(
      (left, right) =>
        (left.parshaNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.parshaNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.parshaName.localeCompare(right.parshaName)
    )
}
