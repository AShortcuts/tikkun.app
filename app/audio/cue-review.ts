import type { CueReview, CueReviewFlag, WordCue } from './types.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isStatus = (value: unknown): value is CueReview['status'] =>
  value === 'pending' || value === 'reviewed'
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max

export function parseCueReview(value: unknown): CueReview | null {
  if (!isRecord(value) || value.source !== 'torah-audio-aligner' ||
      !isStatus(value.status) || !Array.isArray(value.flags) || value.flags.length > 1000) return null
  const flags: CueReviewFlag[] = []
  const ids = new Set<string>()
  for (const flag of value.flags) {
    if (!isRecord(flag) || !isText(flag.id, 200) || ids.has(flag.id) ||
        !isText(flag.kind, 120) || !isText(flag.message, 2000) || !isStatus(flag.status) ||
        (flag.sourceTime !== undefined && (typeof flag.sourceTime !== 'number' ||
          !Number.isFinite(flag.sourceTime) || flag.sourceTime < 0)) ||
        (flag.note !== undefined && !isText(flag.note, 2000))) return null
    ids.add(flag.id)
    flags.push({
      id: flag.id, kind: flag.kind, message: flag.message, status: flag.status,
      ...(flag.sourceTime === undefined ? {} : { sourceTime: flag.sourceTime }),
      ...(flag.note === undefined ? {} : { note: flag.note }),
    })
  }
  if (value.status === 'reviewed' && flags.some(flag => flag.status === 'pending')) return null
  return { source: value.source, status: value.status, flags }
}

export const pendingCueFlags = (cue: Readonly<WordCue>) =>
  cue.review?.flags.filter(flag => flag.status === 'pending') ?? []

export function nextFlaggedCueIndex(cues: readonly Readonly<WordCue>[], current: number) {
  for (let offset = 1; offset <= cues.length; offset += 1) {
    const index = (Math.max(-1, current) + offset) % cues.length
    if (pendingCueFlags(cues[index]).length) return index
  }
  return -1
}

export function markCueReviewed(cue: Readonly<WordCue>): WordCue {
  if (!cue.review) return { ...cue }
  return { ...cue, review: { ...cue.review, status: 'reviewed',
    flags: cue.review.flags.map(flag => ({ ...flag, status: 'reviewed' })) } }
}

export function cloneCueReview(cue: Readonly<WordCue>): WordCue {
  return { ...cue, ...(cue.review ? { review: { ...cue.review,
    flags: cue.review.flags.map(flag => ({ ...flag })) } } : {}) }
}
