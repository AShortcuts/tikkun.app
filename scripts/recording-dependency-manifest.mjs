import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { nativeContentFiles } from './native-build-config.mjs'

const playbackSources = ['app/reading/passage-audio-tools.ts']

export async function recordingDependencyManifest({ manifest, inventory, root, outputFiles, basePath = '' }) {
  if (!inventory || typeof inventory.version !== 'string' || !inventory.version || !inventory.modules || typeof inventory.modules !== 'object') {
    throw new Error('Missing build-matched content inventory')
  }
  const contentSources = Object.keys(inventory.modules).sort()
  if (!contentSources.some((source) => source.startsWith('text/pages/'))) throw new Error('Offline dependency manifest contains no text pages')
  const content = nativeContentFiles(manifest, [...contentSources, ...playbackSources], outputFiles, inventory.modules)
  const assets = new Map()
  for (const file of new Set(content.flatMap((entry) => entry.files))) {
    if (!file.startsWith('_app/immutable/') || file.includes('..')) throw new Error(`Unsafe compiled dependency: ${file}`)
    const bytes = await readFile(path.join(root, file))
    if (!bytes.length) throw new Error(`Empty compiled dependency: ${file}`)
    if (bytes.length > 2_000_000) console.warn(`Compiled dependency ${file} is ${bytes.length} bytes; recommended budget is 2000000 bytes`)
    assets.set(file, { url: `${basePath}/${file}`, byteLength: bytes.length, digest: createHash('sha256').update(bytes).digest('hex') })
  }
  const core = new Set()
  /** @type {Record<string, {url: string, byteLength: number, digest: string}[]>} */
  const cues = {}
  for (const entry of content) {
    if (entry.source.startsWith('text/pages/') || playbackSources.includes(entry.source)) entry.files.forEach((file) => core.add(file))
    else if (entry.source.startsWith('audio-cues/')) cues[entry.source] = entry.files.map((file) => assets.get(file))
  }
  return { version: inventory.version, core: [...core].sort().map((file) => assets.get(file)), cues }
}
