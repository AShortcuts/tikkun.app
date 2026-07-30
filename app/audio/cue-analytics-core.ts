import type { AudioRecording, WordCue } from './types.ts'

const MIN_REVIEW_GAP_SECONDS = 8
const INVALID_TRANSITION_SEVERITY = 10

export type CueOutlierDirection =
  | 'slow'
  | 'invalid'
  | null

export interface CueIntervalSample {
  cueNumber: number
  previousCueNumber: number
  gap: number
  wordsPerMinute: number
  isOutlier: boolean
  isStructuralPause: boolean
  outlierDirection: CueOutlierDirection
  severity: number
  reviewLabel: string
  deviationSeconds: number
  localMedianGap: number
  thresholdGap: number | null
  thresholdDirection: 'above' | 'below' | null
}

export interface CueAnalyticsRecord<Recording extends AudioRecording = AudioRecording> {
  recording: Recording
  narratorName: string
  cueCount: number
  intervalCount: number
  transitionCount: number
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
  invalidTransitionCount: number
  structuralPauseCount: number
  lowerOutlierThreshold: number
  upperOutlierThreshold: number
  cueSource: 'published' | 'draft'
  cueUpdatedAt: number | null
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
  invalidTransitionCount: number
  structuralPauseCount: number
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
  structuralPauseCount: number
}

interface CueTransition {
  previousCue: WordCue
  cue: WordCue
  gap: number
}

interface CueThresholds {
  lower: number
  upper: number
}

export function cueAnalyticsCueKey(cue: WordCue) {
  return `${cue.pageNumber}:${cue.lineIndex}:${cue.fragmentIndex}:${cue.wordIndex}`
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

function getTransitions(cues: WordCue[]) {
  const transitions: CueTransition[] = []

  for (let index = 1; index < cues.length; index += 1) {
    const previousCue = cues[index - 1]
    const cue = cues[index]
    if (!previousCue || !cue) continue

    transitions.push({
      previousCue,
      cue,
      gap: Number((cue.timeStart - previousCue.timeStart).toFixed(3)),
    })
  }

  return transitions
}

function getPositiveIntervals(transitions: CueTransition[]) {
  return transitions
    .map((transition) => transition.gap)
    .filter((gap) => gap > 0)
}

function getOutlierThresholds(intervals: number[]): CueThresholds {
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
  transitions: CueTransition[],
  thresholds: CueThresholds,
  medianGap: number
) {
  return transitions.map((transition, index) => {
    const { cue, previousCue, gap } = transition
    const isInvalidTransition = gap <= 0
    const reviewUpperThreshold = Math.max(MIN_REVIEW_GAP_SECONDS, thresholds.upper)
    const isSlowOutlier = !isInvalidTransition && gap >= reviewUpperThreshold
    const outlierDirection = isInvalidTransition ? 'invalid' : isSlowOutlier ? 'slow' : null
    const thresholdGap =
      isInvalidTransition || outlierDirection === null
        ? null
        : Number(reviewUpperThreshold.toFixed(3))
    const thresholdDirection = isInvalidTransition || outlierDirection === null ? null : 'above'
    const reviewLabel = isInvalidTransition
      ? 'Out of order'
      : isSlowOutlier
        ? 'Long pause outlier'
        : 'Within expected range'
    const severity = isInvalidTransition
      ? INVALID_TRANSITION_SEVERITY
      : thresholdGap && thresholdGap > 0
        ? gap / thresholdGap
        : 0

    return {
      cueNumber: cue.cueNumber ?? index + 2,
      previousCueNumber: previousCue.cueNumber ?? index + 1,
      gap,
      wordsPerMinute: gap > 0 ? 60 / gap : 0,
      isOutlier: isInvalidTransition || outlierDirection !== null,
      isStructuralPause: false,
      outlierDirection,
      severity,
      reviewLabel,
      deviationSeconds: Number((gap - medianGap).toFixed(3)),
      localMedianGap: Number(medianGap.toFixed(3)),
      thresholdGap,
      thresholdDirection,
    } satisfies CueIntervalSample
  })
}

export function createCueAnalyticsRecord<Recording extends AudioRecording>({
  recording,
  narratorName,
  cues,
  cueSource = 'published',
  cueUpdatedAt = null,
}: {
  recording: Recording
  narratorName: string
  cues: WordCue[]
  cueSource?: 'published' | 'draft'
  cueUpdatedAt?: number | null
}) {
  const transitions = getTransitions(cues)
  const intervals = getPositiveIntervals(transitions)
  const thresholds = getOutlierThresholds(intervals)
  const intervalSamples = createIntervalSamples(
    transitions,
    thresholds,
    median(intervals)
  )
  const totalDuration =
    cues.length > 1 ? Number((cues[cues.length - 1]!.timeStart - cues[0]!.timeStart).toFixed(3)) : 0

  return {
    recording,
    narratorName,
    cueCount: cues.length,
    intervalCount: intervals.length,
    transitionCount: transitions.length,
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
    invalidTransitionCount: intervalSamples.filter(
      (sample) => sample.outlierDirection === 'invalid'
    ).length,
    structuralPauseCount: intervalSamples.filter((sample) => sample.isStructuralPause).length,
    lowerOutlierThreshold: thresholds.lower,
    upperOutlierThreshold: thresholds.upper,
    cueSource,
    cueUpdatedAt,
  } satisfies CueAnalyticsRecord<Recording>
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
    invalidTransitionCount: records.reduce(
      (total, record) => total + record.invalidTransitionCount,
      0
    ),
    structuralPauseCount: records.reduce(
      (total, record) => total + record.structuralPauseCount,
      0
    ),
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
      structuralPauseCount: matchingRecords.reduce(
        (total, record) => total + record.structuralPauseCount,
        0
      ),
    })
  }

  return summaries
}
