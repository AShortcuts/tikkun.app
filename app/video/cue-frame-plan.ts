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

function requirePositiveFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(name + ' must be a positive finite number')
}

export function validateRecordingCues(cues: readonly Readonly<WordCue>[], durationSeconds: number) {
  requirePositiveFinite('durationSeconds', durationSeconds)
  let previousStart = -1
  for (const cue of cues) {
    if (!Number.isFinite(cue.timeStart) || cue.timeStart < 0 || cue.timeStart > durationSeconds) {
      throw new RangeError('Cue start times must be finite and within the media duration')
    }
    if (cue.timeStart <= previousStart) throw new RangeError('Cue start times must be strictly increasing')
    if (cue.timeEnd !== undefined && (!Number.isFinite(cue.timeEnd) || cue.timeEnd < cue.timeStart)) {
      throw new RangeError('Cue end times must be finite and not precede their start')
    }
    previousStart = cue.timeStart
  }
}

// A frame can be held only until the clock's next visual change. Null means
// something is still animating, so the next output frame needs its own capture.
export function nextCaptureFrame({
  frameIndex, frameCount, fps, stableUntil,
}: {
  frameIndex: number
  frameCount: number
  fps: number
  stableUntil: number | null
}) {
  requirePositiveFinite('fps', fps)
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || !Number.isSafeInteger(frameIndex) ||
      frameIndex < 0 || frameIndex >= frameCount) throw new RangeError('Invalid recording frame range')
  if (stableUntil === null) return frameIndex + 1
  if (!Number.isFinite(stableUntil) || stableUntil < frameIndex / fps) {
    throw new RangeError('Invalid or missing recording motion state')
  }
  return Math.min(frameCount, Math.max(frameIndex + 1, Math.ceil(stableUntil * fps - 1e-7)))
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
  if (plan.entries[0].frameIndex !== 0) throw new Error('Cue frame plan must start at frame zero')

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

export function renderCueConcatFile(entries: CueConcatEntry[], fps: number) {
  requirePositiveFinite('fps', fps)
  const lines: string[] = []

  for (const entry of entries) {
    if (!entry.file) throw new Error('Cue concat entries require a file path')
    requirePositiveFinite('Cue concat duration', entry.durationSeconds)
    lines.push(`file '${escapeConcatFilePath(entry.file)}'`)
    // PNG's default 25 fps time base would shift 30/60 fps cue boundaries.
    lines.push(`option framerate ${fps}`)
    lines.push(`duration ${entry.durationSeconds.toFixed(6)}`)
  }

  const last = entries[entries.length - 1]
  if (last) lines.push(`file '${escapeConcatFilePath(last.file)}'`, `option framerate ${fps}`)

  return `${lines.join('\n')}\n`
}
