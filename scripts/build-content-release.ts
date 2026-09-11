import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audioRecordings } from '../generated/audio-manifest.ts'
import { rangeAudioRecordings } from '../app/data/range-audio-manifest.ts'
import { CONTENT_MAX_BYTES, contentCompatibility, digestText, parseContentSnapshot } from '../app/updates/content-schema.ts'
import { signUpdateManifest } from './sign-update.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
export async function buildContentRelease(contractOnly = false) {
  const pages: Record<string, unknown> = {}
  const cues: Record<string, unknown> = {}
  for (const scroll of ['torah', 'esther']) {
    for (const name of (await readdir(path.join(root, 'text/pages', scroll))).filter(name => name.endsWith('.json')).sort()) {
      pages[`${scroll}/${name.slice(0, -5)}`] = JSON.parse(await readFile(path.join(root, 'text/pages', scroll, name), 'utf8'))
    }
  }
  async function collect(directory: string) {
    for (const entry of (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const relative = `${directory}/${entry.name}`
      if (entry.isDirectory()) await collect(relative)
      else if (entry.name.endsWith('.json')) cues[relative] = JSON.parse(await readFile(path.join(root, relative), 'utf8'))
    }
  }
  if (!contractOnly) await collect('audio-cues')
  const snapshot = parseContentSnapshot({ schema: 1, pages, cues, recordings: [...audioRecordings, ...rangeAudioRecordings] })
  const compatibility = await contentCompatibility(snapshot)
  const payload = JSON.stringify(snapshot)
  const bytes = Buffer.byteLength(payload)
  if (bytes > CONTENT_MAX_BYTES) throw new Error('Content release exceeds the automatic download limit')
  const digest = await digestText(payload)
  return { compatibility, payload, manifest: { schema: 1, digest, bytes } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const release = await buildContentRelease(process.argv.includes('--contract'))
  if (process.argv.includes('--contract')) {
    await writeFile(path.join(root, 'generated/native-content-contract.json'), `${JSON.stringify({ compatibility: release.compatibility })}\n`)
  } else {
    const output = path.join(root, '.asc/updates/content', release.compatibility)
    await mkdir(output, { recursive: true })
    await writeFile(path.join(output, `${release.manifest.digest}.json`), release.payload)
    await writeFile(path.join(output, 'latest.json'), `${JSON.stringify(await signUpdateManifest(release.manifest))}\n`)
    console.log(JSON.stringify({ output, ...release.manifest, compatibility: release.compatibility }))
  }
}
