import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { audioNarrators, audioRecordingsByParsha } from '../generated/audio-manifest.ts'
import { importAudioCatalog } from './generate-audio-manifest.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const work = path.join(root, 'experiments/torah-audio-aligner/work')

export async function audioImportSource(configPath, env = process.env) {
  if (env.TIKKUN_AUDIO_SOURCE_ROOT) return env.TIKKUN_AUDIO_SOURCE_ROOT
  let config
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (typeof config?.sourceRoot !== 'string' || !config.sourceRoot.trim()) {
    throw new Error(`Set sourceRoot to your recordings directory in ${configPath}`)
  }
  return config.sourceRoot
}

async function main() {
  const sourceRoot = await audioImportSource(path.join(work, 'audio-source.json'))
  if (!sourceRoot) {
    console.log('Audio import not configured; using registered recordings. Set TIKKUN_AUDIO_SOURCE_ROOT to enable startup import.')
    return
  }
  const narratorId = process.env.TIKKUN_AUDIO_NARRATOR_ID || 'yoni-davidov'
  const narrator = audioNarrators.find(entry => entry.id === narratorId)
  if (!narrator) throw new Error(`Narrator ${narratorId} is not registered in the audio manifest.`)
  const targetAudioRoot = path.join(root, 'site/audio', narrator.id)
  console.log(`Checking audio import: ${path.resolve(sourceRoot)} -> ${targetAudioRoot}`)
  const result = await importAudioCatalog({
    sourceRoot,
    targetAudioRoot,
    targetFile: path.join(root, 'generated/audio-manifest.ts'),
    narrator,
    existingRecordings: Object.values(audioRecordingsByParsha).flat(),
  })
  const report = { sourceRoot: path.resolve(sourceRoot), targetAudioRoot,
    added: result.added, restored: result.restored, copiedBytes: result.copiedBytes,
    totalRecordings: result.recordings.length }
  await mkdir(work, { recursive: true })
  await writeFile(path.join(work, 'audio-import-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`Audio import: ${result.added.length} new, ${result.restored.length} restored; ${result.recordings.length} registered recordings.`)
  if (result.added.length) console.log(`Added: ${result.added.join(', ')}`)
  execFileSync(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/generate-public-reading-manifest.mjs')], {
    cwd: root, stdio: 'inherit',
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
