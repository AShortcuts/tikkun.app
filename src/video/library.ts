import type { AudioRecording } from '../audio/types.ts'
import { aliyahVideos as defaultAliyahVideos } from '../data/video-manifest.generated.ts'
import type {
  AliyahVideo,
  VideoLinkRegistry,
  VideoRenderMetadata,
} from './types.ts'

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
}: {
  recordings: AudioRecording[]
  metadata: VideoRenderMetadata[]
  links: VideoLinkRegistry
}) {
  const recordingsById = new Map(recordings.map((recording) => [recording.id, recording]))

  return mergeVideoLinks({ metadata, links })
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
