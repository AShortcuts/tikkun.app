import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audioRecordings } from '../../generated/audio-manifest.ts'
import { rangeAudioRecordings } from '../../app/data/range-audio-manifest.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pageRoot = path.join(root, 'text/pages/torah')
const pageHash = createHash('sha256')
for (const filename of (await readdir(pageRoot)).filter(name => /^\d+\.json$/.test(name)).sort((a, b) => parseInt(a) - parseInt(b))) {
  pageHash.update(filename + '\0').update(await readFile(path.join(pageRoot, filename))).update('\0')
}
const sources = []
for (const recording of [...audioRecordings, ...rangeAudioRecordings]) {
  if (!recording.mediaIdentity || recording.status !== 'available') continue
  const mediaPath = path.join('site', recording.playSrc)
  let size: number
  try { size = (await stat(path.join(root, mediaPath))).size }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
    throw error
  }
  sources.push({ id: `${recording.narratorId}--${recording.id}`, audioId: recording.id,
    narratorId: recording.narratorId, title: recording.title, readingId: recording.reading.id,
    aliyah: recording.aliyah, mediaPath, mediaIdentity: recording.mediaIdentity,
    available: size === recording.mediaIdentity.byteLength })
}
console.log(JSON.stringify({ textPagesSha256: pageHash.digest('hex'), sources }))
