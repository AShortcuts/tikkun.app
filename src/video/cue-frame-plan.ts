import type { WordCue } from '../audio/types.ts'

export interface CueFramePlanEntry {
  frameIndex: number
  seconds: number
}

export interface CueFramePlan {
  frameCount: number
  entries: CueFramePlanEntry[]
}

export interface CueConcatEntry {
  file: string
  durationSeconds: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const secondsForFrame = (frameIndex: number, fps: number) =>
  Number((frameIndex / fps).toFixed(6))
const frameAtOrAfter = (seconds: number, fps: number) =>
  Math.ceil(seconds * fps - 1e-6)
const frameAtOrBefore = (seconds: number, fps: number) =>
  Math.floor(seconds * fps + 1e-6)

export function buildCueFramePlan({
  cues,
  durationSeconds,
  fps,
  burstPreEndMs,
  burstMaxMs,
}: {
  cues: WordCue[]
  durationSeconds: number
  fps: number
  burstPreEndMs: number
  burstMaxMs: number
}): CueFramePlan {
  const frameCount = Math.max(1, Math.ceil(durationSeconds * fps))
  const maxFrame = frameCount - 1
  const frameIndexes = new Set<number>([maxFrame])
  const frameSeconds = new Map<number, number>()
  const addFrame = (frameIndex: number, seconds?: number) => {
    frameIndexes.add(frameIndex)
    if (seconds !== undefined && !frameSeconds.has(frameIndex)) {
      frameSeconds.set(frameIndex, Number(seconds.toFixed(6)))
    }
  }

  for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
    const cue = cues[cueIndex]
    const nextCue = cues[cueIndex + 1]
    const cueFrame = clamp(Math.round(cue.timeStart * fps), 0, maxFrame)
    addFrame(cueFrame, cue.timeStart)

    const cueEnd = Number.isFinite(cue.timeEnd) ? cue.timeEnd : nextCue?.timeStart
    if (!Number.isFinite(cueEnd)) continue

    const nextCueStart = nextCue?.timeStart ?? durationSeconds
    const burstStartSeconds = Math.max(cue.timeStart, cueEnd - burstPreEndMs / 1000)
    const burstEndSeconds = Math.min(
      nextCueStart,
      burstStartSeconds + burstMaxMs / 1000,
      durationSeconds
    )
    const burstStartFrame = Math.max(
      cueFrame + 1,
      clamp(frameAtOrAfter(burstStartSeconds, fps), 0, maxFrame)
    )
    const burstEndFrame = Math.min(
      clamp(frameAtOrBefore(burstEndSeconds, fps), 0, maxFrame),
      nextCue ? clamp(Math.round(nextCue.timeStart * fps), 0, maxFrame) - 1 : maxFrame
    )

    for (let frameIndex = burstStartFrame; frameIndex <= burstEndFrame; frameIndex += 1) {
      addFrame(frameIndex)
    }
  }

  if (!frameIndexes.has(0)) {
    const firstCue = cues[0]
    if (firstCue) {
      addFrame(0, firstCue.timeStart)
    }
  }

  const entries = [...frameIndexes]
    .sort((left, right) => left - right)
    .map((frameIndex) => ({
      frameIndex,
      seconds: frameSeconds.get(frameIndex) ?? secondsForFrame(frameIndex, fps),
    }))

  return { frameCount, entries }
}

export function createCueConcatEntries({
  plan,
  fps,
  frameName,
}: {
  plan: CueFramePlan
  fps: number
  frameName: (captureIndex: number) => string
}): CueConcatEntry[] {
  return plan.entries.map((entry, index) => {
    const next = plan.entries[index + 1]
    const heldFrames = next
      ? next.frameIndex - entry.frameIndex
      : plan.frameCount - entry.frameIndex

    return {
      file: frameName(index),
      durationSeconds: Number((heldFrames / fps).toFixed(6)),
    }
  })
}

function escapeConcatFilePath(filePath: string) {
  return filePath.replace(/'/g, "'\\''")
}

export function renderCueConcatFile(entries: CueConcatEntry[]) {
  const lines: string[] = []

  for (const entry of entries) {
    lines.push(`file '${escapeConcatFilePath(entry.file)}'`)
    lines.push(`duration ${entry.durationSeconds.toFixed(6)}`)
  }

  const last = entries[entries.length - 1]
  if (last) lines.push(`file '${escapeConcatFilePath(last.file)}'`)

  return `${lines.join('\n')}\n`
}
