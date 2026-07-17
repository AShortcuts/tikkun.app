import {
  isParshaAudioRecording,
  type AudioRecording,
} from '../audio/types.ts'
import { aliyahVideos as defaultAliyahVideos } from '../data/video-manifest.generated.ts'
import type {
  AliyahVideo,
  VideoGeneratedFrom,
  VideoLinkRegistry,
  VideoRenderMetadata,
} from './types.ts'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function parseGeneratedFrom(value: unknown): VideoGeneratedFrom | null {
  if (!isRecord(value)) return null
  if (
    !isSha256(value.audioHash) ||
    !isSha256(value.cueHash) ||
    (typeof value.appBuildHash !== 'string' ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value.appBuildHash))
  ) {
    return null
  }
  return {
    audioHash: value.audioHash,
    cueHash: value.cueHash,
    appBuildHash: value.appBuildHash,
  }
}

function parseVideoMetadata(value: unknown): VideoRenderMetadata | null {
  if (!isRecord(value)) return null
  const generatedFrom = parseGeneratedFrom(value.generatedFrom)
  const validation = value.validation
  if (
    !isNonEmptyString(value.audioId) ||
    !isNonEmptyString(value.narratorId) ||
    !isNonEmptyString(value.narratorInitials) ||
    !isNonEmptyString(value.parshaSlug) ||
    !isPositiveInteger(value.aliyah) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.fileName) ||
    !value.fileName.toLowerCase().endsWith('.mp4') ||
    !isPositiveInteger(value.width) ||
    !isPositiveInteger(value.height) ||
    !isPositiveNumber(value.fps) ||
    !isPositiveNumber(value.durationSeconds) ||
    !isPositiveInteger(value.frameCount) ||
    !isNonEmptyString(value.quality) ||
    !isNonEmptyString(value.generatedAt) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !generatedFrom ||
    !isRecord(validation) ||
    typeof validation.passed !== 'boolean' ||
    !isStringArray(validation.errors) ||
    !isStringArray(validation.warnings)
  ) {
    return null
  }

  let bytes: number | undefined
  if (value.bytes !== undefined) {
    if (!isPositiveInteger(value.bytes)) return null
    bytes = value.bytes
  }
  let renderMode: string | undefined
  if (value.renderMode !== undefined) {
    if (!isNonEmptyString(value.renderMode)) return null
    renderMode = value.renderMode
  }
  let capturedFrameCount: number | undefined
  if (
    value.capturedFrameCount !== undefined &&
    !isPositiveInteger(value.capturedFrameCount)
  ) {
    return null
  }
  if (typeof value.capturedFrameCount === 'number') {
    capturedFrameCount = value.capturedFrameCount
  }
  if (capturedFrameCount !== undefined && capturedFrameCount > value.frameCount) {
    return null
  }
  if (validation.passed && validation.errors.length > 0) return null

  let crop: VideoRenderMetadata['crop']
  if (value.crop !== undefined) {
    if (
      !isRecord(value.crop) ||
      typeof value.crop.x !== 'number' ||
      !Number.isFinite(value.crop.x) ||
      value.crop.x < 0 ||
      typeof value.crop.y !== 'number' ||
      !Number.isFinite(value.crop.y) ||
      value.crop.y < 0 ||
      !isPositiveNumber(value.crop.width) ||
      !isPositiveNumber(value.crop.height)
    ) {
      return null
    }
    crop = {
      x: value.crop.x,
      y: value.crop.y,
      width: value.crop.width,
      height: value.crop.height,
    }
  }

  return {
    audioId: value.audioId,
    narratorId: value.narratorId,
    narratorInitials: value.narratorInitials,
    parshaSlug: value.parshaSlug,
    aliyah: value.aliyah,
    title: value.title,
    fileName: value.fileName,
    width: value.width,
    height: value.height,
    fps: value.fps,
    durationSeconds: value.durationSeconds,
    frameCount: value.frameCount,
    ...(bytes === undefined ? {} : { bytes }),
    quality: value.quality,
    ...(renderMode === undefined ? {} : { renderMode }),
    ...(capturedFrameCount === undefined ? {} : { capturedFrameCount }),
    ...(crop ? { crop } : {}),
    generatedAt: value.generatedAt,
    generatedFrom,
    validation: {
      passed: validation.passed,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  }
}

export function parseVideoRenderMetadataList(value: unknown): VideoRenderMetadata[] {
  if (!Array.isArray(value)) throw new Error('Video render metadata must be an array')
  return value.map((entry, index) => {
    const parsed = parseVideoMetadata(entry)
    if (!parsed) throw new Error(`Invalid video render metadata at index ${index}`)
    return parsed
  })
}

function isWebUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseVideoLinkRegistry(value: unknown): VideoLinkRegistry {
  if (!isRecord(value)) throw new Error('Video link registry must be an object')
  const result: VideoLinkRegistry = {}
  for (const [audioId, entry] of Object.entries(value)) {
    if (
      !isNonEmptyString(audioId) ||
      !isRecord(entry) ||
      !isWebUrl(entry.videoSrc) ||
      !isWebUrl(entry.downloadSrc)
    ) {
      throw new Error(`Invalid video link registry entry for ${JSON.stringify(audioId)}`)
    }
    result[audioId] = {
      videoSrc: entry.videoSrc,
      downloadSrc: entry.downloadSrc,
    }
  }
  return result
}

function assertUniqueIds(values: { audioId: string }[], label: string) {
  const ids = new Set<string>()
  for (const value of values) {
    if (ids.has(value.audioId)) throw new Error(`Duplicate ${label} audio id: ${value.audioId}`)
    ids.add(value.audioId)
  }
}

export function videoMetadataMatchesProvenance(
  metadata: VideoRenderMetadata,
  expected: Partial<VideoGeneratedFrom> | undefined
) {
  if (!expected) return true
  return (['audioHash', 'cueHash', 'appBuildHash'] as const).every(
    (key) => expected[key] === undefined || metadata.generatedFrom[key] === expected[key]
  )
}

export function getCompleteCueEligibleRecordings({
  recordings,
  cueCountByAudioId,
  tokenCountByAudioId,
}: {
  recordings: AudioRecording[]
  cueCountByAudioId: Map<string, number>
  tokenCountByAudioId: Map<string, number>
}) {
  return recordings.filter((recording) => {
    if (!isParshaAudioRecording(recording)) return false
    if (recording.status !== 'available') return false

    const cueCount = cueCountByAudioId.get(recording.id) ?? 0
    const tokenCount = tokenCountByAudioId.get(recording.id) ?? 0
    return tokenCount > 0 && cueCount >= tokenCount
  })
}

export function mergeVideoLinks({
  metadata,
  links,
}: {
  metadata: VideoRenderMetadata[]
  links: VideoLinkRegistry
}): AliyahVideo[] {
  return metadata.flatMap((entry) => {
    const link = links[entry.audioId]
    if (!entry.validation.passed || !link) return []

    return [
      {
        audioId: entry.audioId,
        narratorId: entry.narratorId,
        narratorInitials: entry.narratorInitials,
        parshaSlug: entry.parshaSlug,
        aliyah: entry.aliyah,
        title: entry.title,
        videoSrc: link.videoSrc,
        downloadSrc: link.downloadSrc,
        width: entry.width,
        height: entry.height,
        fps: entry.fps,
        durationSeconds: entry.durationSeconds,
        frameCount: entry.frameCount,
        bytes: entry.bytes,
        quality: entry.quality,
        renderMode: entry.renderMode,
        capturedFrameCount: entry.capturedFrameCount,
        crop: entry.crop,
        generatedAt: entry.generatedAt,
        generatedFrom: entry.generatedFrom,
      },
    ]
  })
}

export function createAliyahVideoManifest({
  recordings,
  metadata,
  links,
  currentProvenanceByAudioId,
}: {
  recordings: AudioRecording[]
  metadata: VideoRenderMetadata[]
  links: VideoLinkRegistry
  currentProvenanceByAudioId?: ReadonlyMap<string, Partial<VideoGeneratedFrom>>
}) {
  const parshaRecordings = recordings.filter(isParshaAudioRecording)
  const recordingIds = new Set<string>()
  for (const recording of parshaRecordings) {
    if (recordingIds.has(recording.id)) {
      throw new Error(`Duplicate audio recording id: ${recording.id}`)
    }
    recordingIds.add(recording.id)
  }
  assertUniqueIds(metadata, 'video metadata')
  const recordingsById = new Map(parshaRecordings.map((recording) => [recording.id, recording]))

  for (const entry of metadata) {
    if (!entry.validation.passed || !links[entry.audioId]) continue
    const recording = recordingsById.get(entry.audioId)
    if (!recording) continue
    if (
      entry.narratorId !== recording.narratorId ||
      entry.parshaSlug !== recording.parshaSlug ||
      entry.aliyah !== recording.aliyah
    ) {
      throw new Error(`Video metadata identity does not match recording ${entry.audioId}`)
    }
  }

  return mergeVideoLinks({
    metadata: metadata.filter((entry) =>
      videoMetadataMatchesProvenance(
        entry,
        currentProvenanceByAudioId?.get(entry.audioId)
      )
    ),
    links,
  })
    .filter((video) => recordingsById.has(video.audioId))
    .map((video) => {
      const recording = recordingsById.get(video.audioId)!
      return {
        ...video,
        narratorId: recording.narratorId,
        parshaSlug: recording.parshaSlug,
        aliyah: recording.aliyah,
        title: recording.title,
      }
    })
    .sort(
      (left, right) =>
        left.parshaSlug.localeCompare(right.parshaSlug) ||
        left.aliyah - right.aliyah ||
        left.audioId.localeCompare(right.audioId)
    )
}

export function findVideoForRecording(
  audioId: string,
  manifest: AliyahVideo[] = defaultAliyahVideos
) {
  return manifest.find((video) => video.audioId === audioId) ?? null
}
