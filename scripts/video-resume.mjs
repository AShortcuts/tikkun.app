import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

export function recordingSettings(options) {
  return Object.fromEntries([
    'width', 'height', 'deviceScaleFactor', 'fps', 'crf', 'preset',
    'renderMode', 'frameTransport', 'crop', 'cropMargin',
  ].map(key => [key, options[key]]))
}

export async function videoFileHash(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

export async function completedVideoMatches({ metadata, outputRoot, relativePath, options, generatedFrom }) {
  if (!metadata?.validation?.passed || !metadata.outputHash ||
      metadata.outputRelativePath !== relativePath || !metadata.recordingSettings ||
      Object.entries(recordingSettings(options)).some(([key, value]) => metadata.recordingSettings[key] !== value) ||
      ['audioHash', 'cueHash'].some(key => !generatedFrom[key] || metadata.generatedFrom?.[key] !== generatedFrom[key])) return false
  const filePath = path.resolve(outputRoot, relativePath)
  const relative = path.relative(path.resolve(outputRoot), filePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false
  try {
    const file = await stat(filePath)
    if (!file.isFile() || file.size !== metadata.bytes) return false
    return await videoFileHash(filePath) === metadata.outputHash
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}
