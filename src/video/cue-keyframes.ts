import type { WordCue } from '../audio/types.ts'

export interface CueCaptureTimeline {
  captureTimes: number[]
}

export interface ConcatEntry {
  file: string
  durationSeconds: number | null
}

const roundTimestamp = (seconds: number) => Number(seconds.toFixed(3))

export function buildCueCaptureTimeline({
  cues,
  durationSeconds,
  preCueMs,
  postCueMs,
  minGapMs,
}: {
  cues: WordCue[]
  durationSeconds: number
  preCueMs: number
  postCueMs: number
  minGapMs: number
}): CueCaptureTimeline {
  const duration = Math.max(0, durationSeconds)
  const preCueSeconds = preCueMs / 1000
  const postCueSeconds = postCueMs / 1000
  const minGapSeconds = minGapMs / 1000
  const roundedDuration = roundTimestamp(duration)
  const rawTimes = [0, roundedDuration]

  for (const cue of cues) {
    rawTimes.push(
      cue.timeStart - preCueSeconds,
      cue.timeStart,
      cue.timeStart + postCueSeconds
    )
  }

  const sortedTimes = rawTimes
    .map((time) => roundTimestamp(Math.max(0, Math.min(duration, time))))
    .sort((left, right) => left - right)

  const captureTimes: number[] = []
  for (const time of sortedTimes) {
    const previous = captureTimes[captureTimes.length - 1]
    if (previous === undefined || time - previous >= minGapSeconds) {
      captureTimes.push(time)
    }
  }

  if (captureTimes[captureTimes.length - 1] !== roundedDuration) {
    captureTimes.push(roundedDuration)
  }

  return { captureTimes }
}

export function createConcatEntries({
  captureTimes,
  frameName,
}: {
  captureTimes: number[]
  frameName: (index: number) => string
}): ConcatEntry[] {
  return captureTimes.map((time, index) => {
    const next = captureTimes[index + 1]
    return {
      file: frameName(index),
      durationSeconds:
        next === undefined ? null : Number((next - time).toFixed(6)),
    }
  })
}

function escapeConcatFilePath(filePath: string) {
  return filePath.replace(/'/g, "'\\''")
}

export function renderConcatFile(entries: ConcatEntry[]) {
  const lines: string[] = []

  for (const entry of entries) {
    lines.push(`file '${escapeConcatFilePath(entry.file)}'`)
    if (entry.durationSeconds !== null) {
      lines.push(`duration ${entry.durationSeconds.toFixed(6)}`)
    }
  }

  const last = entries[entries.length - 1]
  if (last) lines.push(`file '${escapeConcatFilePath(last.file)}'`)

  return `${lines.join('\n')}\n`
}
