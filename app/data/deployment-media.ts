import type { AudioRecording } from '../audio/types.ts'

export function resolveDeploymentMediaUrl(src: string, basePath: string) {
  if (!basePath || !src.startsWith('/') || src.startsWith('//')) return src

  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '')
  if (!normalizedBase) return src
  if (!normalizedBase.startsWith('/')) {
    throw new Error('Deployment base path must be empty or start with "/"')
  }
  if (src === normalizedBase || src.startsWith(`${normalizedBase}/`)) return src
  return `${normalizedBase}${src}`
}

export function resolveRecordingMediaUrls(
  recording: AudioRecording,
  basePath: string
): AudioRecording {
  return {
    ...recording,
    playSrc: resolveDeploymentMediaUrl(recording.playSrc, basePath),
    downloadSrc: resolveDeploymentMediaUrl(recording.downloadSrc, basePath),
  }
}
