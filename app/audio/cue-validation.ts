import {
  compareTokenPositions,
} from '../reader/token-position.ts'
import { parseCueReview } from './cue-review.ts'
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

export interface CuePayloadValidationIssue {
  path: string
  message: string
}

export type CuePayloadInspection =
  | { status: 'valid'; payload: CueExportPayload }
  | { status: 'invalid'; issues: CuePayloadValidationIssue[] }

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
  const review = value.review === undefined ? undefined : parseCueReview(value.review)
  if (review === null) return null
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
    ...(review === undefined ? {} : { review }),
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

  if (
    !isNonEmptyString(value.audioId) ||
    (value.audioFormat !== 'mp3' && value.audioFormat !== 'm4a') ||
    !isNonEmptyString(value.narratorId) ||
    !isNonEmptyString(value.readingId) ||
    !isPositiveInteger(value.aliyah) ||
    !isNonNegativeInteger(value.tokenCount) ||
    !isNonNegativeInteger(value.cueCount) ||
    value.cueCount !== cues.length ||
    value.tokenCount < cues.length ||
    !isNonEmptyString(value.tokenizationVersion)
  ) {
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
  const savedAt = typeof value.savedAt === 'string' ? value.savedAt : undefined
  const payload = {
    audioId: value.audioId,
    audioFormat,
    narratorId: value.narratorId,
    readingId: value.readingId,
    aliyah: value.aliyah,
    tokenCount: value.tokenCount,
    cueCount: value.cueCount,
    tokenizationVersion: value.tokenizationVersion,
    ...(mediaIdentity === undefined ? {} : { mediaIdentity }),
    ...(savedAt === undefined ? {} : { savedAt }),
    ...(issues === undefined ? {} : { issues }),
    cues,
  }
  return payload
}

export function inspectCueExportPayload(value: unknown): CuePayloadInspection {
  const payload = parseCueExportPayload(value)
  if (payload) return { status: 'valid', payload }

  if (!isRecord(value)) {
    return {
      status: 'invalid',
      issues: [{ path: '$', message: 'Cue Data must be a JSON object.' }],
    }
  }

  const issues: CuePayloadValidationIssue[] = []
  const addIssue = (path: string, message: string) => {
    issues.push({ path, message })
  }

  if (
    ('tokenPointer' in value || 'updatedAt' in value) &&
    (!('audioFormat' in value) || !('cueCount' in value))
  ) {
    addIssue(
      '$',
      'This looks like a local Cue Draft. Use Export in Cue Authoring and publish the exported Cue Data JSON.'
    )
  }

  if (!isNonEmptyString(value.audioId)) {
    addIssue('audioId', 'audioId must be a non-empty string.')
  }
  if (value.audioFormat !== 'mp3' && value.audioFormat !== 'm4a') {
    addIssue('audioFormat', 'audioFormat must be "mp3" or "m4a".')
  }
  if (!isNonEmptyString(value.narratorId)) {
    addIssue('narratorId', 'narratorId must be a non-empty string.')
  }

  if (!isNonEmptyString(value.readingId)) {
    addIssue('readingId', 'readingId must be a non-empty string.')
  }
  if (!isPositiveInteger(value.aliyah)) {
    addIssue('aliyah', 'aliyah must be a positive integer.')
  }
  if (!isNonNegativeInteger(value.tokenCount)) {
    addIssue('tokenCount', 'tokenCount must be a non-negative integer.')
  }
  if (!isNonNegativeInteger(value.cueCount)) {
    addIssue('cueCount', 'cueCount must be a non-negative integer.')
  }
  if (!isNonEmptyString(value.tokenizationVersion)) {
    addIssue(
      'tokenizationVersion',
      'tokenizationVersion must be a non-empty string.'
    )
  }

  const draftCues = parseDraftWordCues(value.cues)
  if (!Array.isArray(value.cues)) {
    addIssue('cues', 'cues must be an array.')
  } else if (!draftCues) {
    const invalidCueIndex = value.cues.findIndex(
      (candidate) => !parseWordCue(candidate)
    )
    addIssue(
      invalidCueIndex >= 0 ? `cues[${invalidCueIndex}]` : 'cues',
      'Every cue must contain a valid timestamp, token position, and review metadata when present.'
    )
  } else {
    const invalidNumberIndex = draftCues.findIndex(
      (cue, index) => cue.cueNumber !== index + 1
    )
    if (invalidNumberIndex >= 0) {
      addIssue(
        `cues[${invalidNumberIndex}].cueNumber`,
        `Published cues require sequential cueNumber values; expected ${invalidNumberIndex + 1}.`
      )
    } else if (!isPublishableCueSequence(draftCues)) {
      const invalidOrderIndex = draftCues.findIndex((cue, index) => {
        if (index === 0) return false
        const previous = draftCues[index - 1]
        return (
          cue.timeStart <= previous.timeStart ||
          (previous.timeEnd !== undefined &&
            previous.timeEnd > cue.timeStart) ||
          compareTokenPositions(previous, cue) >= 0
        )
      })
      addIssue(
        invalidOrderIndex >= 0 ? `cues[${invalidOrderIndex}]` : 'cues',
        'Published cues must move forward in both time and Torah token order without overlapping.'
      )
    }

    if (
      isNonNegativeInteger(value.cueCount) &&
      value.cueCount !== draftCues.length
    ) {
      addIssue(
        'cueCount',
        `cueCount is ${value.cueCount}, but cues contains ${draftCues.length} entries.`
      )
    }
    if (
      isNonNegativeInteger(value.tokenCount) &&
      value.tokenCount < draftCues.length
    ) {
      addIssue(
        'tokenCount',
        `tokenCount cannot be smaller than the ${draftCues.length} published cues.`
      )
    }
  }

  if (value.savedAt !== undefined && !isIsoTimestamp(value.savedAt)) {
    addIssue('savedAt', 'savedAt must be an ISO timestamp.')
  }
  if (
    value.mediaIdentity !== undefined &&
    !parseAudioMediaIdentity(value.mediaIdentity)
  ) {
    addIssue(
      'mediaIdentity',
      'mediaIdentity must contain a SHA-256 digest and positive byteLength.'
    )
  }
  if (
    value.issues !== undefined &&
    isNonEmptyString(value.audioId) &&
    isNonEmptyString(value.tokenizationVersion) &&
    !parseRecordingIssues(
      value.issues,
      value.audioId,
      value.tokenizationVersion
    )
  ) {
    addIssue('issues', 'issues contains invalid recording issue data.')
  }

  if (!issues.length) {
    addIssue('$', 'Cue Data does not satisfy the published file contract.')
  }
  return { status: 'invalid', issues }
}

export function cuePayloadMatchesRecording(
  payload: CueExportPayload,
  recording: AudioRecording
) {
  const mediaIdentityMatches = !payload.mediaIdentity || (
    recording.mediaIdentity !== undefined &&
    audioMediaIdentitiesEqual(payload.mediaIdentity, recording.mediaIdentity)
  )
  return (
    payload.audioId === recording.id &&
    payload.audioFormat === recording.format &&
    payload.narratorId === recording.narratorId &&
    payload.aliyah === recording.aliyah &&
    payload.readingId === recording.reading.id &&
    mediaIdentityMatches
  )
}
