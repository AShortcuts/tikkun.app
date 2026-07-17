import type { WordCue } from '../audio/types.ts'

export interface CueFramePlanEntry {
  frameIndex: number
  seconds: number
  settleMs?: number
  highlightAnimationMs?: number
  settleBeforeAnimation?: boolean
  scrollTransition?: boolean
  transitionWaitMs?: number
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
const cueStartSettleMs = 100
const lineScrollTransitionMs = 240

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function requirePositiveFinite(name: string, value: number) {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`)
  }
}

function requireNonNegativeFinite(name: string, value: number) {
  if (!isFiniteNumber(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`)
  }
}

const isSameRenderedLine = (left: WordCue, right: WordCue) =>
  left.pageNumber === right.pageNumber && left.lineIndex === right.lineIndex

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
  requirePositiveFinite('durationSeconds', durationSeconds)
  requirePositiveFinite('fps', fps)
  requireNonNegativeFinite('burstPreEndMs', burstPreEndMs)
  requireNonNegativeFinite('burstMaxMs', burstMaxMs)
  let previousCueStart = -1
  for (const cue of cues) {
    if (!isFiniteNumber(cue.timeStart) || cue.timeStart < 0) {
      throw new RangeError('Cue start times must be non-negative finite numbers')
    }
    if (cue.timeStart <= previousCueStart) {
      throw new RangeError('Cue start times must be strictly increasing')
    }
    if (cue.timeStart > durationSeconds) {
      throw new RangeError('Cue start times cannot exceed the media duration')
    }
    if (
      cue.timeEnd !== undefined &&
      (!isFiniteNumber(cue.timeEnd) || cue.timeEnd < cue.timeStart)
    ) {
      throw new RangeError('Cue end times must be finite and not precede their start')
    }
    previousCueStart = cue.timeStart
  }

  const frameCount = Math.max(1, Math.ceil(durationSeconds * fps))
  const maxFrame = frameCount - 1
  const frameIndexes = new Set<number>([maxFrame])
  const frameSeconds = new Map<number, number>()
  const frameSettleMs = new Map<number, number>()
  const frameHighlightAnimationMs = new Map<number, number>()
  const frameSettleBeforeAnimation = new Set<number>()
  const scrollTransitionFrames = new Set<number>()
  const frameTransitionWaitMs = new Map<number, number>()
  const addFrame = (
    frameIndex: number,
    {
      seconds,
      settleMs,
      highlightAnimationMs,
      settleBeforeAnimation = false,
      scrollTransition = false,
      transitionWaitMs,
    }: {
      seconds?: number
      settleMs?: number
      highlightAnimationMs?: number
      settleBeforeAnimation?: boolean
      scrollTransition?: boolean
      transitionWaitMs?: number
    } = {}
  ) => {
    frameIndexes.add(frameIndex)
    if (seconds !== undefined && !frameSeconds.has(frameIndex)) {
      frameSeconds.set(frameIndex, Number(seconds.toFixed(6)))
    }
    if (settleMs !== undefined && !frameSettleMs.has(frameIndex)) {
      frameSettleMs.set(frameIndex, settleMs)
    }
    if (
      highlightAnimationMs !== undefined &&
      !frameHighlightAnimationMs.has(frameIndex)
    ) {
      frameHighlightAnimationMs.set(frameIndex, Number(highlightAnimationMs.toFixed(3)))
    }
    if (settleBeforeAnimation) {
      frameSettleBeforeAnimation.add(frameIndex)
    }
    if (scrollTransition) {
      scrollTransitionFrames.add(frameIndex)
    }
    if (transitionWaitMs !== undefined && !frameTransitionWaitMs.has(frameIndex)) {
      frameTransitionWaitMs.set(frameIndex, Number(transitionWaitMs.toFixed(3)))
    }
  }
  const cueFrames: number[] = []
  let previousCueFrame = -1
  for (const cue of cues) {
    const cueFrame = clamp(
      Math.max(frameAtOrAfter(cue.timeStart, fps), previousCueFrame + 1),
      0,
      maxFrame
    )
    cueFrames.push(cueFrame)
    previousCueFrame = cueFrame
  }

  for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
    const cue = cues[cueIndex]
    const previousCue = cues[cueIndex - 1]
    const nextCue = cues[cueIndex + 1]
    const cueFrame = cueFrames[cueIndex]
    const nextCueStart = nextCue?.timeStart ?? durationSeconds
    const cueEnd = isFiniteNumber(cue.timeEnd) ? cue.timeEnd : nextCue?.timeStart
    const startsNewLine = Boolean(previousCue && !isSameRenderedLine(previousCue, cue))
    const targetTransitionEnd =
      cue.timeStart + (startsNewLine ? lineScrollTransitionMs : cueStartSettleMs) / 1000
    const burstProtectedTransitionEnd = isFiniteNumber(cueEnd)
      ? Math.max(cue.timeStart + cueStartSettleMs / 1000, cueEnd - burstPreEndMs / 1000)
      : targetTransitionEnd
    const nextCueFrame = cueFrames[cueIndex + 1] ?? maxFrame + 1
    const lastCueStartFrame = Math.max(
      cueFrame,
      Math.min(nextCueFrame - 1, maxFrame)
    )
    const settledFrame = clamp(
      frameAtOrAfter(
        Math.min(targetTransitionEnd, burstProtectedTransitionEnd, nextCueStart),
        fps
      ),
      cueFrame,
      lastCueStartFrame
    )
    const cueStartSeconds = Math.min(cue.timeStart, nextCueStart, durationSeconds)

    if (settledFrame === cueFrame) {
      addFrame(cueFrame, { seconds: cueStartSeconds, settleMs: cueStartSettleMs })
    } else {
      for (let frameIndex = cueFrame; frameIndex < settledFrame; frameIndex += 1) {
        const elapsedMs = (frameIndex - cueFrame + 1) * (1000 / fps)
        addFrame(frameIndex, {
          seconds: cueStartSeconds,
          highlightAnimationMs: Math.min(elapsedMs, cueStartSettleMs),
          settleBeforeAnimation: !startsNewLine && frameIndex === cueFrame,
          scrollTransition: startsNewLine && frameIndex === cueFrame,
          transitionWaitMs: startsNewLine ? 1000 / fps : undefined,
        })
      }
      addFrame(settledFrame, {
        seconds: cueStartSeconds,
        settleMs: cueStartSettleMs,
      })
    }

    if (!isFiniteNumber(cueEnd)) continue

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
      nextCue ? nextCueFrame - 1 : maxFrame
    )

    for (let frameIndex = burstStartFrame; frameIndex <= burstEndFrame; frameIndex += 1) {
      addFrame(frameIndex)
    }
  }

  if (!frameIndexes.has(0)) {
    const firstCue = cues[0]
    if (firstCue) {
      addFrame(
        0,
        {
          seconds: Math.min(
            firstCue.timeStart,
            cues[1]?.timeStart ?? durationSeconds,
            durationSeconds
          ),
          settleMs: cueStartSettleMs,
        }
      )
    }
  }

  const entries = [...frameIndexes]
    .sort((left, right) => left - right)
    .map((frameIndex) => {
      const entry: CueFramePlanEntry = {
        frameIndex,
        seconds: frameSeconds.get(frameIndex) ?? secondsForFrame(frameIndex, fps),
      }
      const settleMs = frameSettleMs.get(frameIndex)
      if (settleMs !== undefined) entry.settleMs = settleMs
      const highlightAnimationMs = frameHighlightAnimationMs.get(frameIndex)
      if (highlightAnimationMs !== undefined) {
        entry.highlightAnimationMs = highlightAnimationMs
      }
      if (frameSettleBeforeAnimation.has(frameIndex)) {
        entry.settleBeforeAnimation = true
      }
      if (scrollTransitionFrames.has(frameIndex)) {
        entry.scrollTransition = true
      }
      const transitionWaitMs = frameTransitionWaitMs.get(frameIndex)
      if (transitionWaitMs !== undefined) {
        entry.transitionWaitMs = transitionWaitMs
      }
      return entry
    })

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
  requirePositiveFinite('fps', fps)
  if (!Number.isSafeInteger(plan.frameCount) || plan.frameCount <= 0) {
    throw new RangeError('Cue frame count must be a positive safe integer')
  }
  if (!plan.entries.length) {
    throw new Error('Cue frame plan must contain at least one entry')
  }

  return plan.entries.map((entry, index) => {
    const next = plan.entries[index + 1]
    if (
      !Number.isSafeInteger(entry.frameIndex) ||
      entry.frameIndex < 0 ||
      entry.frameIndex >= plan.frameCount
    ) {
      throw new RangeError(`Invalid cue frame index at entry ${index}`)
    }
    const heldFrames = next
      ? next.frameIndex - entry.frameIndex
      : plan.frameCount - entry.frameIndex
    if (!Number.isSafeInteger(heldFrames) || heldFrames <= 0) {
      throw new RangeError(`Cue frame entries are not strictly increasing at entry ${index}`)
    }
    const file = frameName(index)
    if (!file) throw new Error(`Cue frame ${index} has no output filename`)

    return {
      file,
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
    if (!entry.file) throw new Error('Cue concat entries require a file path')
    requirePositiveFinite('Cue concat duration', entry.durationSeconds)
    lines.push(`file '${escapeConcatFilePath(entry.file)}'`)
    lines.push(`duration ${entry.durationSeconds.toFixed(6)}`)
  }

  const last = entries[entries.length - 1]
  if (last) lines.push(`file '${escapeConcatFilePath(last.file)}'`)

  return `${lines.join('\n')}\n`
}
