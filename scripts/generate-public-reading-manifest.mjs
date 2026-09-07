import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isParshaAudioRecording } from '../app/audio/types.ts'
import { cueFileRelativePathForRecording } from '../app/audio/cue-file.ts'
import { TOKENIZATION_VERSION } from '../app/audio/cue-schema.ts'
import {
  cuePayloadMatchesRecording,
  parseCueExportPayload,
} from '../app/audio/cue-validation.ts'
import { LeiningGenerator } from '../app/calendar-model/generator.ts'
import { recordingWorkRows } from '../app/data/about-progress.ts'
import {
  generateParshaUrl,
  resolveParshaRun,
} from '../app/view-model/navigation/parsha-routes.ts'
import { audioRecordings } from '../generated/audio-manifest.ts'
import { formatTokenKey } from '../app/reader/token-position.ts'
import { readCanonicalTokenKeysForRecordings } from './public-reading-tokens.ts'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const cueRoot = path.join(repoRoot, 'audio-cues')
const targetFile = path.join(repoRoot, 'generated/public-reading-manifest.ts')
const routeReferenceDate = new Date('2026-01-01T12:00:00.000Z')

async function listJsonFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name)
      if (entry.isDirectory()) return listJsonFiles(entryPath)
      return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : []
    })
  )
  return files.flat()
}

function cueCoverageForPayload(parsed, expectedTokenKeys) {
  if (parsed.cueCount <= 0) {
    return {
      status: 'missing',
      expectedTokenCount: expectedTokenKeys?.length ?? null,
    }
  }
  if (!expectedTokenKeys?.length) {
    throw new Error(`No canonical token sequence for ${parsed.audioId}`)
  }
  if (parsed.tokenCount !== expectedTokenKeys.length) {
    throw new Error(
      `Cue Data for ${parsed.audioId} declares ${parsed.tokenCount} tokens; canonical reading has ${expectedTokenKeys.length}`
    )
  }
  const mismatchedCueIndex = parsed.cues.findIndex(
    (cue, index) => formatTokenKey(cue) !== expectedTokenKeys[index]
  )
  if (mismatchedCueIndex >= 0) {
    throw new Error(
      `Cue Data for ${parsed.audioId} diverges from the canonical token sequence at cue ${mismatchedCueIndex + 1}`
    )
  }
  if (parsed.cueCount === expectedTokenKeys.length) {
    return {
      status: 'cued',
      expectedTokenCount: expectedTokenKeys.length,
    }
  }
  return {
    status: 'draft',
    expectedTokenCount: expectedTokenKeys.length,
  }
}

function relativeCuePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/')
}

function expectedRelativeCuePath(recording) {
  return cueFileRelativePathForRecording(recording)?.replace(/^audio-cues\//, '')
}

/**
 * @param {{
 *   root?: string
 *   recordings?: import('../app/audio/types.ts').AudioRecording[]
 *   expectedTokenKeysByAudioId?: Map<string, string[]>
 * }} [options]
 */
export async function readPublishedCueCoverage(options = {}) {
  const {
    root = cueRoot,
    recordings = audioRecordings,
    expectedTokenKeysByAudioId,
  } = options
  const canonicalTokenKeys =
    expectedTokenKeysByAudioId ??
    (await readCanonicalTokenKeysForRecordings({
      recordings,
      repoRoot,
      now: routeReferenceDate,
    }))
  const coverageByAudioId = new Map()
  const recordingsById = new Map(
    recordings.map((recording) => [recording.id, recording])
  )
  for (const filePath of await listJsonFiles(root)) {
    let value
    try {
      value = JSON.parse(await readFile(filePath, 'utf8'))
    } catch (error) {
      throw new Error(`Invalid Cue Data JSON in ${filePath}`, { cause: error })
    }
    const payload = parseCueExportPayload(value)
    if (!payload) throw new Error(`Invalid Cue Data payload in ${filePath}`)

    const recording = recordingsById.get(payload.audioId)
    if (!recording || recording.status !== 'available') {
      throw new Error(
        `Published Cue Data has no available recording: ${payload.audioId}`
      )
    }
    const actualPath = relativeCuePath(root, filePath)
    const expectedPath = expectedRelativeCuePath(recording)
    if (!expectedPath || actualPath !== expectedPath) {
      throw new Error(
        `Cue Data path for ${payload.audioId} is ${actualPath}; expected ${expectedPath ?? 'no valid path'}`
      )
    }
    if (!cuePayloadMatchesRecording(payload, recording)) {
      throw new Error(
        `Cue Data for ${payload.audioId} does not match its available recording`
      )
    }
    if (
      payload.cueCount > 0 &&
      !payload.mediaIdentity
    ) {
      throw new Error(
        `Cue Data for ${payload.audioId} has no recording media identity`
      )
    }
    if (
      payload.cueCount > 0 &&
      payload.tokenizationVersion !== TOKENIZATION_VERSION
    ) {
      throw new Error(
        `Cue Data for ${payload.audioId} uses ${payload.tokenizationVersion}; expected ${TOKENIZATION_VERSION}`
      )
    }
    if (coverageByAudioId.has(payload.audioId)) {
      throw new Error(`Duplicate Cue Data for audio id ${payload.audioId}`)
    }
    coverageByAudioId.set(
      payload.audioId,
      cueCoverageForPayload(payload, canonicalTokenKeys.get(payload.audioId))
    )
  }
  for (const recording of recordings) {
    if (recording.status !== 'available' || coverageByAudioId.has(recording.id)) {
      continue
    }
    const expectedTokenKeys = canonicalTokenKeys.get(recording.id)
    coverageByAudioId.set(recording.id, {
      status: 'missing',
      expectedTokenCount: expectedTokenKeys?.length ?? null,
    })
  }
  return coverageByAudioId
}

export function createPublicAliyotByParsha({
  recordings,
  cueCoverage,
  now = routeReferenceDate,
}) {
  const generator = new LeiningGenerator({
    ashkenazi: true,
    includeModernHolidays: false,
    israel: false,
  })
  const recordingsByParsha = new Map()
  const availableRecordingIds = new Set()

  for (const recording of recordings.filter(isParshaAudioRecording)) {
    if (recording.status !== 'available') continue
    availableRecordingIds.add(recording.id)
    const group = recordingsByParsha.get(recording.parshaSlug) ?? {
      parshaNumber: recording.parshaNumber ?? Number.MAX_SAFE_INTEGER,
      recordings: new Map(),
    }
    if (group.recordings.has(recording.aliyah)) {
      throw new Error(
        `Duplicate public aliyah ${recording.parshaSlug}:${recording.aliyah}`
      )
    }
    group.recordings.set(recording.aliyah, recording)
    recordingsByParsha.set(recording.parshaSlug, group)
  }

  for (const audioId of cueCoverage.keys()) {
    if (!availableRecordingIds.has(audioId)) {
      throw new Error(`Published cue payload has no available recording: ${audioId}`)
    }
  }

  return Object.fromEntries(
    [...recordingsByParsha.entries()]
      .sort(
        ([leftSlug, left], [rightSlug, right]) =>
          left.parshaNumber - right.parshaNumber ||
          leftSlug.localeCompare(rightSlug)
      )
      .map(([parshaSlug, group]) => {
        const resolved = resolveParshaRun(generator, parshaSlug, now)
        if (!resolved) throw new Error(`Could not resolve public route for ${parshaSlug}`)

        const aliyot = Array.from({ length: 7 }, (_, index) => {
          const aliyah = index + 1
          const recording = group.recordings.get(aliyah) ?? null
          const coverage = recording
            ? cueCoverage.get(recording.id) ?? null
            : null
          const startRef = resolved.run.aliyot.find(
            (candidate) => candidate.index === aliyah
          )?.start
          if (!startRef) {
            throw new Error(`Could not resolve ${parshaSlug} aliyah ${aliyah}`)
          }

          return {
            number: aliyah,
            audioId: recording?.id ?? null,
            cueStatus: recording
              ? coverage?.status ?? 'missing'
              : 'empty',
            expectedTokenCount: coverage?.expectedTokenCount ?? null,
            readerHash: generateParshaUrl(resolved.canonicalSlug, startRef),
          }
        })

        return [parshaSlug, aliyot]
      })
  )
}

export function validateRecordingWorkPlans({
  recordings,
  workRows,
  publicAliyotByParsha,
}) {
  const parshaSlugByNumber = new Map()
  for (const recording of recordings.filter(isParshaAudioRecording)) {
    if (recording.status !== 'available' || recording.parshaNumber === undefined) {
      continue
    }
    const existingSlug = parshaSlugByNumber.get(recording.parshaNumber)
    if (existingSlug && existingSlug !== recording.parshaSlug) {
      throw new Error(
        `Parsha ${recording.parshaNumber} has conflicting public slugs: ${existingSlug}, ${recording.parshaSlug}`
      )
    }
    parshaSlugByNumber.set(recording.parshaNumber, recording.parshaSlug)
  }

  const workByNumber = new Map()
  for (const work of workRows) {
    if (work.number === null) continue
    if (workByNumber.has(work.number)) {
      throw new Error(`Duplicate recording work plan for parsha ${work.number}`)
    }
    workByNumber.set(work.number, work)

    const parshaSlug = parshaSlugByNumber.get(work.number)
    const aliyot = parshaSlug ? publicAliyotByParsha[parshaSlug] : undefined
    if (parshaSlug && !aliyot) {
      throw new Error(
        `Published audio for ${work.parshaEnglish} is missing from public reading manifest`
      )
    }
  }

  for (const [parshaNumber, parshaSlug] of parshaSlugByNumber) {
    if (!workByNumber.has(parshaNumber)) {
      throw new Error(
        `Public reading ${parshaSlug} has no maintained recording work row`
      )
    }
  }
}

export function renderPublicReadingManifest(publicAliyotByParsha) {
  return `export type PublicCueStatus = 'cued' | 'draft' | 'missing' | 'empty'

export interface GeneratedPublicAliyah {
  number: number
  audioId: string | null
  cueStatus: PublicCueStatus
  expectedTokenCount: number | null
  readerHash: \`#/\${string}\`
}

// This file is generated by \`npm run reading:manifest\`.
// Do not edit it by hand; update recordings or cue data and regenerate it instead.

export const publicAliyotByParsha: Readonly<
  Record<string, readonly GeneratedPublicAliyah[]>
> = ${JSON.stringify(publicAliyotByParsha, null, 2)}
`
}

export async function generatePublicReadingManifestSource({
  recordings = audioRecordings,
  workRows = recordingWorkRows,
  root = cueRoot,
} = {}) {
  const cueCoverage = await readPublishedCueCoverage({ root, recordings })
  const publicAliyotByParsha = createPublicAliyotByParsha({
    recordings,
    cueCoverage,
  })
  validateRecordingWorkPlans({
    recordings,
    workRows,
    publicAliyotByParsha,
  })
  return {
    contents: renderPublicReadingManifest(publicAliyotByParsha),
    aliyahCount: Object.values(publicAliyotByParsha).flat().length,
  }
}

async function writeFileAtomically(filePath, contents) {
  const stagedFile = `${filePath}.stage-${process.pid}-${Date.now()}`
  try {
    await writeFile(stagedFile, contents)
    await rename(stagedFile, filePath)
  } finally {
    await rm(stagedFile, { force: true })
  }
}

async function main() {
  const { contents, aliyahCount } = await generatePublicReadingManifestSource()
  await writeFileAtomically(targetFile, contents)
  console.log(`Generated ${aliyahCount} public aliyah links with cue coverage`)
}

const isDirectExecution = process.argv.some(
  (argument) => path.resolve(argument) === fileURLToPath(import.meta.url)
)

if (isDirectExecution || process.env.npm_lifecycle_event === 'reading:manifest') {
  await main()
}
