import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  cueFileRelativePathForRecording,
  formatCueFileJson,
} from '../app/audio/cue-file.ts'
import { parseCueExportPayload } from '../app/audio/cue-validation.ts'
import { audioRecordings } from '../generated/audio-manifest.ts'
import { readPublishedCueCoverage } from './generate-public-reading-manifest.mjs'

const defaultRepoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

async function readExisting(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

/**
 * Validates one exported cue payload with the same checks the build applies
 * to published Cue Data, then writes it to its canonical audio-cues path.
 *
 * @param {unknown} value
 * @param {{
 *   repoRoot?: string
 *   recordings?: import('../app/audio/types.ts').AudioRecording[]
 *   expectedTokenKeysByAudioId?: Map<string, string[]>
 * }} [options]
 */
export async function saveCueFile(value, options = {}) {
  const {
    repoRoot = defaultRepoRoot,
    recordings = audioRecordings,
    expectedTokenKeysByAudioId,
  } = options
  const payload = parseCueExportPayload(value)
  if (!payload) throw new Error('This is not a valid cue file.')
  const recording = recordings.find((candidate) => candidate.id === payload.audioId)
  if (!recording || recording.status !== 'available') {
    throw new Error(`No available recording is registered for ${payload.audioId}. Add its audio to the project before saving these cues.`)
  }
  if (payload.cueCount > 0 && !payload.mediaIdentity) {
    throw new Error(`These cues for ${recording.title} have no audio fingerprint. Open that aliyah in the admin panel and use Import cues to confirm they match its audio.`)
  }
  const relativePath = cueFileRelativePathForRecording(recording)
  if (!relativePath) throw new Error(`${recording.title} has no cue file location.`)

  const serialized = formatCueFileJson(payload)
  const pathParts = relativePath.split('/')
  const staging = await mkdtemp(path.join(os.tmpdir(), 'tikkun-cue-save-'))
  let coverage
  try {
    const stagedFile = path.join(staging, ...pathParts.slice(1))
    await mkdir(path.dirname(stagedFile), { recursive: true })
    await writeFile(stagedFile, serialized)
    coverage = (await readPublishedCueCoverage({
      root: staging,
      recordings: [recording],
      expectedTokenKeysByAudioId,
    })).get(recording.id)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }

  const target = path.join(repoRoot, ...pathParts)
  const previous = await readExisting(target)
  if (previous !== serialized) {
    await mkdir(path.dirname(target), { recursive: true })
    const temporary = `${target}.saving-${process.pid}`
    await writeFile(temporary, serialized)
    await rename(temporary, target)
  }
  return {
    path: relativePath,
    title: recording.title,
    cueCount: payload.cueCount,
    coverage: coverage?.status ?? 'missing',
    replaced: previous !== null && previous !== serialized,
    unchanged: previous === serialized,
  }
}

async function readStandardInput() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const errorMessage = (error) => (error instanceof Error ? error.message : String(error))

const isDirectExecution = process.argv.some(
  (argument) => path.resolve(argument) === fileURLToPath(import.meta.url)
)

if (isDirectExecution) {
  const files = process.argv.slice(2)
  if (files[0] === '--stdin') {
    // Dev-server protocol: one payload in, one JSON result line out.
    try {
      const result = await saveCueFile(JSON.parse(await readStandardInput()))
      process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: errorMessage(error) })}\n`)
      process.exitCode = 1
    }
  } else if (!files.length) {
    console.error('Usage: npm run cues:save -- <cue file.json> [more cue files]')
    process.exitCode = 2
  } else {
    for (const file of files) {
      try {
        const result = await saveCueFile(JSON.parse(await readFile(file, 'utf8')))
        const change = result.unchanged ? 'unchanged' : result.replaced ? 'replaced' : 'new file'
        console.log(`Saved ${result.title} to ${result.path} (${result.cueCount} cues, ${change}).`)
      } catch (error) {
        console.error(`${file}: ${errorMessage(error)}`)
        process.exitCode = 1
      }
    }
  }
}
