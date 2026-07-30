import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

const hebrewOrdinals = {
  א: 1,
  ב: 2,
  ג: 3,
  ד: 4,
  ה: 5,
  ו: 6,
  ז: 7,
}

const numberWords = {
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
  '7th': 7,
}

const extensionScores = {
  m4a: 2,
  mp3: 1,
}

const canonicalParshaIdentities = new Map([
  ['bereshit', { slug: 'beresheet', name: 'Beresheet' }],
  ['beresheet', { slug: 'beresheet', name: 'Beresheet' }],
  ['vayetze', { slug: 'vayetzei', name: 'Vayetzei' }],
  ['vayetzei', { slug: 'vayetzei', name: 'Vayetzei' }],
])

export const slugify = (value) =>
  value
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

const toSiteUrl = (narratorId, ...segments) =>
  `/audio/${[narratorId, ...segments].map(encodeURIComponent).join('/')}`

export function inferAliyah(filename) {
  const stem = path.basename(filename, path.extname(filename))
  const normalizedStem = stem.replace(/\(fixed\)/gi, ' ').trim()
  const matches = []

  for (const [needle, aliyah] of Object.entries(numberWords)) {
    if (normalizedStem.toLowerCase().includes(needle)) matches.push(aliyah)
  }

  const trailingDigit = normalizedStem.match(
    /(?:^|[\s_-])([1-7])(?:\s+aliyah)?$/i
  )
  if (trailingDigit) matches.push(Number(trailingDigit[1]))

  for (const match of normalizedStem.matchAll(/([אבגדהוז])[׳'\u2019]/g)) {
    matches.push(hebrewOrdinals[match[1]])
  }

  const trailingHebrew = normalizedStem.match(
    /(?:^|[\s_-])[׳'\u2019]?([אבגדהוז])$/
  )
  if (trailingHebrew) matches.push(hebrewOrdinals[trailingHebrew[1]])

  const candidates = [...new Set(matches)]
  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous aliyah number in ${JSON.stringify(filename)}: ${candidates.join(', ')}`
    )
  }
  return candidates[0] ?? null
}

function selectionScore(filename) {
  const extension = path.extname(filename).slice(1).toLowerCase()
  return (/\(fixed\)/i.test(filename) ? 5 : 0) + extensionScores[extension]
}

export function selectAliyahFiles(filenames, folderName = 'source folder') {
  const candidatesByAliyah = new Map()

  for (const filename of filenames) {
    const extension = path.extname(filename).slice(1).toLowerCase()
    if (!(extension in extensionScores)) continue
    const aliyah = inferAliyah(filename)
    if (!aliyah) continue
    const candidates = candidatesByAliyah.get(aliyah) ?? []
    candidates.push({ filename, format: extension, score: selectionScore(filename) })
    candidatesByAliyah.set(aliyah, candidates)
  }

  const selected = new Map()
  for (const [aliyah, candidates] of candidatesByAliyah) {
    const bestScore = Math.max(...candidates.map((candidate) => candidate.score))
    const best = candidates.filter((candidate) => candidate.score === bestScore)
    if (best.length !== 1) {
      throw new Error(
        `Ambiguous source files for aliyah ${aliyah} in ${JSON.stringify(folderName)}: ${best
          .map((candidate) => candidate.filename)
          .sort()
          .join(', ')}`
      )
    }
    selected.set(aliyah, best[0])
  }

  return selected
}

async function mediaIdentity(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  const fileStat = await stat(filePath)
  return {
    algorithm: 'sha256',
    digest: hash.digest('hex'),
    byteLength: fileStat.size,
  }
}

function formatValue(value, { indentLevel = 0 } = {}) {
  const indent = '  '.repeat(indentLevel)
  const nestedIndent = '  '.repeat(indentLevel + 1)

  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return [
      '[',
      ...value.map(
        (entry) =>
          `${nestedIndent}${formatValue(entry, { indentLevel: indentLevel + 1 })},`
      ),
      `${indent}]`,
    ].join('\n')
  }

  return [
    '{',
    ...Object.entries(value).map(
      ([key, entry]) =>
        `${nestedIndent}${key}: ${formatValue(entry, {
          indentLevel: indentLevel + 1,
        })},`
    ),
    `${indent}}`,
  ].join('\n')
}

export function validateAudioCatalog(recordings) {
  if (!recordings.length) throw new Error('No recognizable recordings were found')

  const ids = new Set()
  const mediaUrls = new Set()
  const aliyot = new Set()
  const parshaNamesBySlug = new Map()
  const parshaSlugsByNumber = new Map()

  for (const recording of recordings) {
    if (ids.has(recording.id)) throw new Error(`Duplicate recording id: ${recording.id}`)
    ids.add(recording.id)

    if (mediaUrls.has(recording.playSrc)) {
      throw new Error(`Two recordings resolve to the same media URL: ${recording.playSrc}`)
    }
    mediaUrls.add(recording.playSrc)

    const aliyahKey = `${recording.narratorId}:${recording.parshaSlug}:${recording.aliyah}`
    if (aliyot.has(aliyahKey)) throw new Error(`Duplicate catalog slot: ${aliyahKey}`)
    aliyot.add(aliyahKey)

    const knownName = parshaNamesBySlug.get(recording.parshaSlug)
    if (knownName && knownName !== recording.parshaName) {
      throw new Error(`Parsha slug ${recording.parshaSlug} has multiple names`)
    }
    parshaNamesBySlug.set(recording.parshaSlug, recording.parshaName)

    const knownSlug = parshaSlugsByNumber.get(recording.parshaNumber)
    if (knownSlug && knownSlug !== recording.parshaSlug) {
      throw new Error(`Parsha number ${recording.parshaNumber} has multiple slugs`)
    }
    parshaSlugsByNumber.set(recording.parshaNumber, recording.parshaSlug)

    if (
      recording.mediaIdentity.algorithm !== 'sha256' ||
      !/^[a-f0-9]{64}$/.test(recording.mediaIdentity.digest) ||
      !Number.isSafeInteger(recording.mediaIdentity.byteLength) ||
      recording.mediaIdentity.byteLength <= 0
    ) {
      throw new Error(`Invalid media identity for ${recording.id}`)
    }
  }
}

export function renderAudioManifest({ recordings, narrator }) {
  const groupedRecordings = recordings.reduce((groups, recording) => {
    const existing = groups.get(recording.parshaSlug) ?? {
      parshaName: recording.parshaName,
      parshaNumber: recording.parshaNumber,
      items: [],
    }
    existing.items.push(recording)
    groups.set(recording.parshaSlug, existing)
    return groups
  }, new Map())

  const groupedSections = [...groupedRecordings.entries()]
    .sort(
      (left, right) =>
        left[1].parshaNumber - right[1].parshaNumber ||
        left[1].parshaName.localeCompare(right[1].parshaName)
    )
    .map(
      ([parshaSlug, group]) => `  // ${String(group.parshaNumber).padStart(2, '0')} ${group.parshaName}
  ${JSON.stringify(parshaSlug)}: ${formatValue(
        group.items.sort((left, right) => left.aliyah - right.aliyah),
        { indentLevel: 1 }
      )},`
    )
    .join('\n\n')

  return `import type {
  AudioNarrator,
  AudioRecording,
  ParshaAudioRecording,
} from '../app/audio/types.ts'

type GeneratedParshaAudioRecording = Omit<ParshaAudioRecording, 'reading'>

// This file is generated by \`npm run audio:sync\`.
// Do not edit it by hand; update the source recordings and rerun the sync instead.

export const audioNarrators: AudioNarrator[] = [
  ${formatValue(narrator, { indentLevel: 1 })},
]

export const audioRecordingsByParsha: Record<string, GeneratedParshaAudioRecording[]> = {
${groupedSections}
}

export const audioRecordings: AudioRecording[] = Object.values(
  audioRecordingsByParsha
).flat().map((recording) => ({
  ...recording,
  reading: {
    kind: 'parsha',
    id: recording.parshaSlug,
    name: recording.parshaName,
    order: recording.parshaNumber,
  },
}))
`
}

async function pathExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false
    throw error
  }
}

async function replaceCatalogAtomically({
  stagedAudioRoot,
  targetAudioRoot,
  stagedManifest,
  targetFile,
}) {
  const suffix = `${process.pid}-${Date.now()}`
  const audioBackup = `${targetAudioRoot}.backup-${suffix}`
  const manifestBackup = `${targetFile}.backup-${suffix}`
  let oldAudioMoved = false
  let oldManifestMoved = false
  let newAudioMoved = false
  let newManifestMoved = false

  try {
    if (await pathExists(targetAudioRoot)) {
      await rename(targetAudioRoot, audioBackup)
      oldAudioMoved = true
    }
    if (await pathExists(targetFile)) {
      await rename(targetFile, manifestBackup)
      oldManifestMoved = true
    }

    await rename(stagedAudioRoot, targetAudioRoot)
    newAudioMoved = true
    await rename(stagedManifest, targetFile)
    newManifestMoved = true
  } catch (error) {
    if (newManifestMoved) await rm(targetFile, { force: true })
    if (newAudioMoved) await rm(targetAudioRoot, { recursive: true, force: true })
    if (oldManifestMoved) await rename(manifestBackup, targetFile)
    if (oldAudioMoved) await rename(audioBackup, targetAudioRoot)
    throw error
  }

  await Promise.all([
    rm(audioBackup, { recursive: true, force: true }),
    rm(manifestBackup, { force: true }),
  ])
}

export async function syncAudioCatalog({
  sourceRoot,
  targetAudioRoot,
  targetFile,
  narrator = {
    id: 'yoni-davidov',
    displayName: 'Yoni Davidov',
    credit: 'Recordings by Yoni Davidov',
    default: true,
  },
}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(narrator.id)) {
    throw new Error(`Invalid narrator id: ${JSON.stringify(narrator.id)}`)
  }

  const resolvedSourceRoot = path.resolve(sourceRoot)
  const resolvedTargetAudioRoot = path.resolve(targetAudioRoot)
  const resolvedTargetFile = path.resolve(targetFile)
  const stageSuffix = `${process.pid}-${Date.now()}`
  const stagedAudioRoot = `${resolvedTargetAudioRoot}.stage-${stageSuffix}`
  const stagedManifest = `${resolvedTargetFile}.stage-${stageSuffix}`

  await mkdir(path.dirname(resolvedTargetAudioRoot), { recursive: true })
  await mkdir(path.dirname(resolvedTargetFile), { recursive: true })
  await mkdir(stagedAudioRoot, { recursive: true })

  try {
    const folders = (await readdir(resolvedSourceRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
    const recordings = []
    const seenParshaSlugs = new Set()
    const seenParshaNumbers = new Set()

    for (const folder of folders) {
      const [, numberText, rawName] = folder.name.match(/^(\d+)\s+(.+)$/) ?? []
      if (!numberText || !rawName) continue
      const parshaNumber = Number(numberText)
      const sourceParshaSlug = slugify(rawName)
      const canonicalIdentity = canonicalParshaIdentities.get(sourceParshaSlug)
      const parshaSlug = canonicalIdentity?.slug ?? sourceParshaSlug
      const parshaName = canonicalIdentity?.name ?? rawName
      if (!parshaSlug || !Number.isSafeInteger(parshaNumber) || parshaNumber <= 0) {
        throw new Error(`Invalid parsha folder name: ${JSON.stringify(folder.name)}`)
      }
      if (seenParshaSlugs.has(parshaSlug)) {
        throw new Error(`Duplicate parsha slug from source folders: ${parshaSlug}`)
      }
      if (seenParshaNumbers.has(parshaNumber)) {
        throw new Error(`Duplicate parsha number from source folders: ${parshaNumber}`)
      }
      seenParshaSlugs.add(parshaSlug)
      seenParshaNumbers.add(parshaNumber)

      const sourceFolderPath = path.join(resolvedSourceRoot, folder.name)
      const filenames = (await readdir(sourceFolderPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
      const selected = selectAliyahFiles(filenames, folder.name)
      if (!selected.size) continue

      const targetFolderName = parshaSlug
      const stagedTargetFolder = path.join(stagedAudioRoot, targetFolderName)
      await mkdir(stagedTargetFolder, { recursive: true })

      for (const [aliyah, match] of [...selected].sort(
        (left, right) => left[0] - right[0]
      )) {
        const sourcePath = path.join(sourceFolderPath, match.filename)
        const targetFileName = `${aliyah}.${match.format}`
        const stagedMediaPath = path.join(stagedTargetFolder, targetFileName)
        await copyFile(sourcePath, stagedMediaPath)
        recordings.push({
          id: `${parshaSlug}-${aliyah}`,
          narratorId: narrator.id,
          parshaSlug,
          parshaName,
          parshaNumber,
          aliyah,
          title: `${parshaName} Aliyah ${aliyah}`,
          playSrc: toSiteUrl(narrator.id, targetFolderName, targetFileName),
          downloadSrc: toSiteUrl(narrator.id, targetFolderName, targetFileName),
          format: match.format,
          status: 'available',
          mediaIdentity: await mediaIdentity(stagedMediaPath),
          notes: `Source file: ${match.filename}`,
        })
      }
    }

    recordings.sort(
      (left, right) =>
        left.parshaNumber - right.parshaNumber || left.aliyah - right.aliyah
    )
    validateAudioCatalog(recordings)
    await writeFile(stagedManifest, renderAudioManifest({ recordings, narrator }))
    await replaceCatalogAtomically({
      stagedAudioRoot,
      targetAudioRoot: resolvedTargetAudioRoot,
      stagedManifest,
      targetFile: resolvedTargetFile,
    })
    return recordings
  } finally {
    await Promise.all([
      rm(stagedAudioRoot, { recursive: true, force: true }),
      rm(stagedManifest, { force: true }),
    ])
  }
}

export function parseAudioSyncOptions(argv, env = process.env) {
  const options = {
    sourceRoot: env.TIKKUN_AUDIO_SOURCE_ROOT,
    narratorId: env.TIKKUN_AUDIO_NARRATOR_ID || 'yoni-davidov',
    narratorName: env.TIKKUN_AUDIO_NARRATOR_NAME || 'Yoni Davidov',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const [name, inlineValue] = argument.split('=', 2)
    if (!['--source', '--narrator-id', '--narrator-name'].includes(name)) {
      throw new Error(`Unknown audio sync option: ${argument}`)
    }
    const value = inlineValue ?? argv[++index]
    if (!value) throw new Error(`${name} requires a value`)
    if (name === '--source') options.sourceRoot = value
    if (name === '--narrator-id') options.narratorId = value
    if (name === '--narrator-name') options.narratorName = value
  }

  if (!options.sourceRoot) {
    throw new Error(
      'Audio source is required; pass --source <directory> or set TIKKUN_AUDIO_SOURCE_ROOT'
    )
  }

  return options
}

async function main() {
  const options = parseAudioSyncOptions(process.argv.slice(2))
  const targetFile = path.join(repoRoot, 'generated/audio-manifest.ts')
  const targetAudioRoot = path.join(repoRoot, 'site/audio', options.narratorId)
  const recordings = await syncAudioCatalog({
    sourceRoot: options.sourceRoot,
    targetAudioRoot,
    targetFile,
    narrator: {
      id: options.narratorId,
      displayName: options.narratorName,
      credit: `Recordings by ${options.narratorName}`,
      default: true,
    },
  })
  console.log(
    `Synced ${recordings.length} selected recordings from ${path.resolve(options.sourceRoot)}`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
