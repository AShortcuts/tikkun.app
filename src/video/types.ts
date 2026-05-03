export interface VideoGeneratedFrom {
  audioHash: string
  cueHash: string
  appBuildHash: string
}

export interface VideoValidationResult {
  passed: boolean
  errors: string[]
  warnings: string[]
}

export interface VideoRenderMetadata {
  audioId: string
  narratorId: string
  narratorInitials: string
  parshaSlug: string
  aliyah: number
  title: string
  fileName: string
  width: number
  height: number
  fps: 60
  durationSeconds: number
  frameCount: number
  bytes?: number
  quality: string
  generatedAt: string
  generatedFrom: VideoGeneratedFrom
  validation: VideoValidationResult
}

export interface VideoLinkEntry {
  videoSrc: string
  downloadSrc: string
}

export type VideoLinkRegistry = Record<string, VideoLinkEntry>

export interface AliyahVideo {
  audioId: string
  narratorId: string
  narratorInitials: string
  parshaSlug: string
  aliyah: number
  title: string
  videoSrc: string
  downloadSrc: string
  width: number
  height: number
  fps: 60
  durationSeconds: number
  frameCount: number
  bytes?: number
  quality: string
  generatedAt: string
  generatedFrom: VideoGeneratedFrom
}
