import {
  audioMediaIdentitiesEqual,
  parseAudioMediaIdentity,
  parseDraftWordCues,
} from './cue-validation.ts'
import type {
  AudioFormat,
  AudioMediaIdentity,
  AudioRecording,
  WordCue,
} from './types.ts'
import { TOKENIZATION_VERSION } from './cue-schema.ts'
import {
  compareTokenPositions,
  formatTokenKey,
  isValidTokenKey,
} from '../reader/token-position.ts'
import { isPlausiblePersistedTimestamp } from '../persistence/persisted-state.ts'

type CueDraftRecordingIdentity = {
  audioId: string
  audioFormat: AudioFormat
  narratorId: string
  readingId: string
  aliyah: number
  mediaIdentity?: AudioMediaIdentity
  /** @deprecated Used only for recordings without a durable media identity. */
  audioVersion?: string
}

export type CueDraftPayload = CueDraftRecordingIdentity & {
  tokenCount: number
  tokenPointer: number
  tokenizationVersion: typeof TOKENIZATION_VERSION
  updatedAt: number
  cues: WordCue[]
}

export type CueDraftExpectation = {
  recording: AudioRecording
  tokenCount: number
  tokenKeys?: readonly string[]
  now?: number
}

type CreateCueDraftPayloadOptions = CueDraftExpectation & {
  tokenPointer: number
  updatedAt: number
  cues: readonly WordCue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasStrictlyIncreasingCuePositions(cues: readonly WordCue[]) {
  return cues.every(
    (cue, index) =>
      index === 0 || compareTokenPositions(cues[index - 1], cue) < 0
  )
}

function hasExpectedTokenPrefix(
  cues: readonly WordCue[],
  tokenKeys: readonly string[] | undefined,
  tokenCount: number
) {
  if (!tokenKeys) return true
  if (
    tokenKeys.length !== tokenCount ||
    tokenKeys.some((key) => !isValidTokenKey(key)) ||
    new Set(tokenKeys).size !== tokenKeys.length
  ) {
    return false
  }
  return cues.every((cue, index) => formatTokenKey(cue) === tokenKeys[index])
}

function draftIdentityMatchesRecording(
  value: Record<string, unknown>,
  recording: AudioRecording
) {
  if (
    value.audioId !== recording.id ||
    value.audioFormat !== recording.format ||
    value.narratorId !== recording.narratorId ||
    value.readingId !== recording.reading.id ||
    value.aliyah !== recording.aliyah
  ) {
    return false
  }

  const mediaIdentity = parseAudioMediaIdentity(value.mediaIdentity)
  const audioVersion = value.audioVersion
  if (recording.mediaIdentity) {
    return (
      audioVersion === undefined &&
      mediaIdentity !== null &&
      audioMediaIdentitiesEqual(mediaIdentity, recording.mediaIdentity)
    )
  }

  return (
    mediaIdentity === null &&
    typeof recording.notes === 'string' &&
    recording.notes.length > 0 &&
    audioVersion === recording.notes
  )
}

export function parseCueDraftPayload(
  value: unknown,
  { recording, tokenCount, tokenKeys, now = Date.now() }: CueDraftExpectation
): CueDraftPayload | null {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(tokenCount) ||
    tokenCount <= 0 ||
    !draftIdentityMatchesRecording(value, recording)
  ) {
    return null
  }

  const cues = parseDraftWordCues(value.cues)
  if (
    value.tokenizationVersion !== TOKENIZATION_VERSION ||
    value.tokenCount !== tokenCount ||
    !Number.isSafeInteger(value.tokenPointer) ||
    typeof value.tokenPointer !== 'number' ||
    value.tokenPointer < -1 ||
    value.tokenPointer >= tokenCount ||
    !isPlausiblePersistedTimestamp(value.updatedAt, { now }) ||
    !cues ||
    cues.length > tokenCount ||
    !hasStrictlyIncreasingCuePositions(cues) ||
    !hasExpectedTokenPrefix(cues, tokenKeys, tokenCount)
  ) {
    return null
  }

  const mediaIdentity = parseAudioMediaIdentity(value.mediaIdentity)
  return {
    audioId: recording.id,
    audioFormat: recording.format,
    narratorId: recording.narratorId,
    readingId: recording.reading.id,
    aliyah: recording.aliyah,
    ...(mediaIdentity ? { mediaIdentity } : { audioVersion: recording.notes! }),
    tokenCount,
    tokenPointer: value.tokenPointer,
    tokenizationVersion: TOKENIZATION_VERSION,
    updatedAt: value.updatedAt,
    cues,
  }
}

export function createCueDraftPayload({
  recording,
  tokenCount,
  tokenKeys,
  tokenPointer,
  updatedAt,
  cues,
}: CreateCueDraftPayloadOptions): CueDraftPayload {
  const identity: CueDraftRecordingIdentity = recording.mediaIdentity
    ? {
        audioId: recording.id,
        audioFormat: recording.format,
        narratorId: recording.narratorId,
        readingId: recording.reading.id,
        aliyah: recording.aliyah,
        mediaIdentity: recording.mediaIdentity,
      }
    : {
        audioId: recording.id,
        audioFormat: recording.format,
        narratorId: recording.narratorId,
        readingId: recording.reading.id,
        aliyah: recording.aliyah,
        audioVersion: recording.notes ?? '',
      }
  const candidate = {
    ...identity,
    tokenCount,
    tokenPointer,
    tokenizationVersion: TOKENIZATION_VERSION,
    updatedAt,
    cues: [...cues],
  }
  const payload = parseCueDraftPayload(candidate, {
    recording,
    tokenCount,
    tokenKeys,
  })
  if (!payload) {
    throw new TypeError('Cannot create an invalid Cue Draft')
  }
  return payload
}
