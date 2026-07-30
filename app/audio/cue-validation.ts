import {
  compareTokenPositions,
} from '../reader/token-position.ts'
import {
  parseRecordingIssues,
  type RecordingIssue,
} from './recording-issues.ts'
import type {
  AudioFormat,
  AudioMediaIdentity,
  AudioRecording,
  CueExportPayload,
  WordCue,
} from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value
  )
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

export function parseAudioMediaIdentity(
  value: unknown
): AudioMediaIdentity | null {
  if (!isRecord(value)) return null
  if (
    value.algorithm !== 'sha256' ||
    typeof value.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    !isPositiveInteger(value.byteLength)
  ) {
    return null
  }
  return {
    algorithm: 'sha256',
    digest: value.digest,
    byteLength: value.byteLength,
  }
}

export function audioMediaIdentitiesEqual(
  left: AudioMediaIdentity,
  right: AudioMediaIdentity
) {
  return (
    left.algorithm === right.algorithm &&
    left.digest === right.digest &&
    left.byteLength === right.byteLength
  )
}

export function parseWordCue(value: unknown): WordCue | null {
  if (!isRecord(value)) return null
  if (
    !isFiniteNumber(value.timeStart) ||
    value.timeStart < 0 ||
    !isPositiveInteger(value.pageNumber) ||
    !isNonNegativeInteger(value.lineIndex) ||
    !isNonNegativeInteger(value.fragmentIndex) ||
    !isNonNegativeInteger(value.wordIndex)
  ) {
    return null
  }

  let timeEnd: number | undefined
  if (value.timeEnd !== undefined) {
    if (!isFiniteNumber(value.timeEnd) || value.timeEnd < value.timeStart) return null
    timeEnd = value.timeEnd
  }
  let cueNumber: number | undefined
  if (value.cueNumber !== undefined) {
    if (!isPositiveInteger(value.cueNumber)) return null
    cueNumber = value.cueNumber
  }

  return {
    ...(cueNumber === undefined ? {} : { cueNumber }),
    timeStart: value.timeStart,
    ...(timeEnd === undefined ? {} : { timeEnd }),
    pageNumber: value.pageNumber,
    lineIndex: value.lineIndex,
    fragmentIndex: value.fragmentIndex,
    wordIndex: value.wordIndex,
  }
}

/** Structural parsing used by Cue Drafts, including states an author can repair. */
export function parseDraftWordCues(value: unknown): WordCue[] | null {
  if (!Array.isArray(value)) return null
  const cues: WordCue[] = []
  for (const entry of value) {
    const cue = parseWordCue(entry)
    if (!cue) return null
    cues.push(cue)
  }
  return cues
}

/** @deprecated Prefer parseDraftWordCues when accepting repairable authoring state. */
export const parseWordCues = parseDraftWordCues

export function isPublishableCueSequence(cues: readonly WordCue[]) {
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index]
    if (cue.cueNumber !== index + 1) return false
    if (index === 0) continue

    const previousCue = cues[index - 1]
    if (cue.timeStart <= previousCue.timeStart) return false
    if (
      previousCue.timeEnd !== undefined &&
      previousCue.timeEnd > cue.timeStart
    ) {
      return false
    }
    if (compareTokenPositions(previousCue, cue) >= 0) return false
  }
  return true
}

export function parsePublishedWordCues(value: unknown): WordCue[] | null {
  const cues = parseDraftWordCues(value)
  return cues && isPublishableCueSequence(cues) ? cues : null
}

export function parseCueExportPayload(value: unknown): CueExportPayload | null {
  if (!isRecord(value)) return null
  const cues = parsePublishedWordCues(value.cues)
  if (!cues) return null

  const readingId = isNonEmptyString(value.readingId) ? value.readingId : null
  const parshaSlug = isNonEmptyString(value.parshaSlug) ? value.parshaSlug : null
  if (Boolean(readingId) === Boolean(parshaSlug)) return null

  if (
    !isNonEmptyString(value.audioId) ||
    (value.audioFormat !== 'mp3' && value.audioFormat !== 'm4a') ||
    !isNonEmptyString(value.narratorId) ||
    !isPositiveInteger(value.aliyah) ||
    !isNonNegativeInteger(value.tokenCount) ||
    !isNonNegativeInteger(value.cueCount) ||
    value.cueCount !== cues.length ||
    value.tokenCount < cues.length ||
    !isNonEmptyString(value.tokenizationVersion)
  ) {
    return null
  }

  if (value.audioVersion !== undefined && !isNonEmptyString(value.audioVersion)) {
    return null
  }
  if (
    value.savedAt !== undefined &&
    !isIsoTimestamp(value.savedAt)
  ) {
    return null
  }

  let mediaIdentity: AudioMediaIdentity | undefined
  if (value.mediaIdentity !== undefined) {
    const parsedMediaIdentity = parseAudioMediaIdentity(value.mediaIdentity)
    if (!parsedMediaIdentity) return null
    mediaIdentity = parsedMediaIdentity
  }

  let issues: RecordingIssue[] | undefined
  if (value.issues !== undefined) {
    const parsedIssues = parseRecordingIssues(
      value.issues,
      value.audioId,
      value.tokenizationVersion
    )
    if (!parsedIssues) return null
    issues = parsedIssues
  }

  const audioFormat: AudioFormat = value.audioFormat
  const audioVersion = typeof value.audioVersion === 'string'
    ? value.audioVersion
    : undefined
  const savedAt = typeof value.savedAt === 'string' ? value.savedAt : undefined
  const payload = {
    audioId: value.audioId,
    audioFormat,
    narratorId: value.narratorId,
    aliyah: value.aliyah,
    tokenCount: value.tokenCount,
    cueCount: value.cueCount,
    tokenizationVersion: value.tokenizationVersion,
    ...(mediaIdentity === undefined ? {} : { mediaIdentity }),
    ...(audioVersion === undefined ? {} : { audioVersion }),
    ...(savedAt === undefined ? {} : { savedAt }),
    ...(issues === undefined ? {} : { issues }),
    cues,
  }
  if (readingId) return { ...payload, readingId }
  if (parshaSlug) return { ...payload, parshaSlug }
  return null
}

export function cuePayloadMatchesRecording(
  payload: CueExportPayload,
  recording: AudioRecording
) {
  const readingId = payload.readingId ?? payload.parshaSlug
  const mediaIdentityMatches = !payload.mediaIdentity || (
    recording.mediaIdentity !== undefined &&
    audioMediaIdentitiesEqual(payload.mediaIdentity, recording.mediaIdentity)
  )
  const legacyAudioVersionMatches = Boolean(payload.mediaIdentity) ||
    !payload.audioVersion ||
    payload.audioVersion === recording.notes
  return (
    payload.audioId === recording.id &&
    payload.audioFormat === recording.format &&
    payload.narratorId === recording.narratorId &&
    payload.aliyah === recording.aliyah &&
    readingId === recording.reading.id &&
    mediaIdentityMatches &&
    legacyAudioVersionMatches
  )
}
