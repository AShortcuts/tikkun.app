import { cp } from 'node:fs/promises'
import path from 'node:path'

// Recordings live in audio/ beside audio-cues/, in the same numbered reading
// folders, and each URL mirrors its file:
// audio/yoni-davidov/03 lech-lecha/1.m4a is /audio/yoni-davidov/03%20lech-lecha/1.m4a.
export const AUDIO_DIRECTORY = 'audio'

export const audioFolderName = (parshaNumber, readingId) =>
  parshaNumber ? `${String(parshaNumber).padStart(2, '0')} ${readingId}` : readingId

export const audioUrlPath = (relativePath) =>
  `/${AUDIO_DIRECTORY}/${relativePath.split('/').map(encodeURIComponent).join('/')}`

/** Repository file for a recording URL such as `/audio/yoni-davidov/03%20lech-lecha/1.m4a`. */
export function recordingFilePath(root, playSrc) {
  const { pathname } = new URL(playSrc, 'https://tikkun.local')
  return path.join(root, decodeURIComponent(pathname))
}

/** Copies the library into `<destination>/audio/` unchanged. */
export const publishAudio = (root, destination) =>
  cp(path.join(root, AUDIO_DIRECTORY), path.join(destination, AUDIO_DIRECTORY), {
    recursive: true,
    filter: (file) => !path.basename(file).startsWith('.') && path.basename(file) !== 'README.md',
  })
