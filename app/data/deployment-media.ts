import type { AudioRecording } from '../audio/types.ts'

export const RECORDING_MEDIA_VERSION_PARAM = 'tikkun-media'

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
  const playSrc = resolveDeploymentMediaUrl(recording.playSrc, basePath)
  const versionedPlaySrc = recording.mediaIdentity
    ? appendRecordingMediaVersion(playSrc, recording.mediaIdentity.digest)
    : playSrc
  return {
    ...recording,
    playSrc: versionedPlaySrc,
    downloadSrc: resolveDeploymentMediaUrl(recording.downloadSrc, basePath),
  }
}

export function appendRecordingMediaVersion(src: string, digest: string) {
  if (!src.startsWith('/') || src.startsWith('//')) return src
  const url = new URL(src, 'https://tikkun.invalid')
  url.searchParams.set(RECORDING_MEDIA_VERSION_PARAM, digest)
  return `${url.pathname}${url.search}${url.hash}`
}
