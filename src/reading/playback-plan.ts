import type { AudioRecording, WordCue } from '../audio/types.ts'
import type { AliyahIdentity } from './aliyah-identity.ts'

export type PlaybackPlanStatus =
  | 'current-only'
  | 'previous-opening'
  | 'partial-start'
  | 'overlap-only'

export interface PlaybackSegment {
  recording: AudioRecording
  tokenKeys: string[]
  cues: WordCue[]
  startTime: number
  endTime: number | null
}

export interface PlaybackPlan {
  target: AliyahIdentity
  tokenKeys: string[]
  segments: PlaybackSegment[]
  status: PlaybackPlanStatus
}

type RecordingWithCues = {
  recording: AudioRecording
  cues: WordCue[]
}

type SegmentEndPolicy = 'media-end' | 'cue-boundary'

const cueKey = (cue: WordCue) =>
  `${cue.pageNumber}:${cue.lineIndex}:${cue.fragmentIndex}:${cue.wordIndex}`

export function contiguousOpeningOverlap(
  previousTokenKeys: string[],
  targetTokenKeys: string[]
) {
  const maximum = Math.min(previousTokenKeys.length, targetTokenKeys.length)
  for (let length = maximum; length > 0; length--) {
    const previousSuffix = previousTokenKeys.slice(-length)
    const targetPrefix = targetTokenKeys.slice(0, length)
    if (previousSuffix.every((key, index) => key === targetPrefix[index])) {
      return targetPrefix
    }
  }
  return []
}

function selectCues(cues: WordCue[], tokenKeys: string[]) {
  const requested = new Set(tokenKeys)
  return cues.filter((cue) => requested.has(cueKey(cue)))
}

function hasEveryCue(cues: WordCue[], tokenKeys: string[]) {
  if (!tokenKeys.length) return true
  const available = new Set(cues.map(cueKey))
  return tokenKeys.every((key) => available.has(key))
}

function segment(
  source: RecordingWithCues,
  tokenKeys: string[],
  endPolicy: SegmentEndPolicy
): PlaybackSegment | null {
  const cues = selectCues(source.cues, tokenKeys)
  const firstCue = cues[0]
  if (!firstCue) {
    if (source.cues.length || endPolicy === 'cue-boundary') return null
    return {
      recording: source.recording,
      tokenKeys: [...tokenKeys],
      cues: [],
      startTime: 0,
      endTime: null,
    }
  }
  const lastCue = cues[cues.length - 1]!
  const lastCueIndex = source.cues.indexOf(lastCue)
  const nextCue = source.cues[lastCueIndex + 1]
  const endTime =
    endPolicy === 'media-end'
      ? null
      : lastCue.timeEnd ?? nextCue?.timeStart ?? lastCue.timeStart + 0.75
  return {
    recording: source.recording,
    tokenKeys: tokenKeys.filter((key) => cues.some((cue) => cueKey(cue) === key)),
    cues,
    startTime: firstCue.timeStart,
    endTime,
  }
}

export function buildPlaybackPlan({
  target,
  tokenKeys,
  current,
  previous,
  previousTokenKeys = [],
}: {
  target: AliyahIdentity
  tokenKeys: string[]
  current?: RecordingWithCues | null
  previous?: RecordingWithCues | null
  previousTokenKeys?: string[]
}): PlaybackPlan | null {
  if (!tokenKeys.length) return null

  const overlap = contiguousOpeningOverlap(previousTokenKeys, tokenKeys)
  const currentCoversOpening = Boolean(
    current && hasEveryCue(current.cues, overlap)
  )

  if (current && currentCoversOpening) {
    const currentSegment = segment(current, tokenKeys, 'media-end')
    if (!currentSegment) return null
    const beginsAtTarget = currentSegment.tokenKeys[0] === tokenKeys[0]
    return {
      target,
      tokenKeys,
      segments: [currentSegment],
      status: beginsAtTarget ? 'current-only' : 'partial-start',
    }
  }

  const previousCanSupplyOpening = Boolean(
    overlap.length &&
      previous &&
      (!current || previous.recording.narratorId === current.recording.narratorId) &&
      hasEveryCue(previous.cues, overlap)
  )

  if (previous && previousCanSupplyOpening) {
    const openingSegment = segment(previous, overlap, 'cue-boundary')
    const remainderKeys = tokenKeys.slice(overlap.length)
    const currentSegment = current ? segment(current, remainderKeys, 'media-end') : null
    const segments = [openingSegment, currentSegment].filter(
      (entry): entry is PlaybackSegment => Boolean(entry)
    )
    if (!segments.length) return null
    return {
      target,
      tokenKeys,
      segments,
      status: currentSegment ? 'previous-opening' : 'overlap-only',
    }
  }

  if (!current) return null
  const currentSegment = segment(current, tokenKeys, 'media-end')
  if (!currentSegment) return null
  return {
    target,
    tokenKeys,
    segments: [currentSegment],
    status: 'partial-start',
  }
}
