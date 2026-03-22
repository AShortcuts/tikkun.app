import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sourceRoot =
  '/Users/adambh/Documents/Torah Projects/Torah Recordings/Yoni Davidov/YD Torah Aliyah Recordings'
const targetFile = new URL('../src/data/audio-manifest.generated.ts', import.meta.url)
const targetAudioRoot = new URL('../static/audio/yoni-davidov/', import.meta.url)

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

const slugify = (value) =>
  value
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()

const toPublicUrl = (...segments) =>
  encodeURI(`/audio/yoni-davidov/${segments.join('/')}`)

const inferAliyah = (filename) => {
  const english = Object.entries(numberWords).find(([needle]) =>
    filename.includes(needle)
  )
  if (english) return english[1]

  const hebrewMatch = filename.match(/([אבגדהוז])[׳'’]/)
  if (hebrewMatch) return hebrewOrdinals[hebrewMatch[1]]

  return null
}

const folders = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))

const recordings = []

await rm(targetAudioRoot, { recursive: true, force: true })
await mkdir(targetAudioRoot, { recursive: true })

for (const folder of folders) {
  const [, number, rawName] = folder.name.match(/^(\d+)\s+(.+)$/) ?? []
  if (!number || !rawName) continue
  const targetFolderName = `${number}-${slugify(rawName)}`
  const sourceFolderPath = path.join(sourceRoot, folder.name)
  const targetFolderPath = new URL(`../static/audio/yoni-davidov/${targetFolderName}/`, import.meta.url)
  await mkdir(targetFolderPath, { recursive: true })

  const files = (await readdir(sourceFolderPath, {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.m4a$/i.test(name))

  for (const filename of files) {
    await cp(
      path.join(sourceFolderPath, filename),
      new URL(
        `../static/audio/yoni-davidov/${targetFolderName}/${filename}`,
        import.meta.url
      )
    )
  }

  const byAliyah = new Map()
  for (const filename of files) {
    const aliyah = inferAliyah(filename)
    if (!aliyah) continue
    const ext = path.extname(filename).replace(/^\./, '').toLowerCase()
    const current = byAliyah.get(aliyah)
    const score =
      (filename.includes('(fixed)') ? 5 : 0) + (ext === 'm4a' ? 2 : 1)
    if (!current || score > current.score) {
      byAliyah.set(aliyah, {
        score,
        filename,
        format: ext,
      })
    }
  }

  const parshaSlug = slugify(rawName)
  const parshaName = rawName
  for (let aliyah = 1; aliyah <= 7; aliyah++) {
    const match = byAliyah.get(aliyah)
    if (!match) continue
    recordings.push({
      id: `${parshaSlug}-${aliyah}`,
      narratorId: 'yoni-davidov',
      parshaSlug,
      parshaName,
      parshaNumber: Number(number),
      aliyah,
      title: `${parshaName} Aliyah ${aliyah}`,
      playSrc: toPublicUrl(targetFolderName, match.filename),
      downloadSrc: toPublicUrl(targetFolderName, match.filename),
      format: match.format,
      status: 'available',
      notes: `Source file: ${match.filename}`,
    })
  }
}

const formatValue = (value, { indentLevel = 0 } = {}) => {
  const indent = '  '.repeat(indentLevel)
  const nestedIndent = '  '.repeat(indentLevel + 1)

  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return [
      '[',
      ...value.map((entry) => `${nestedIndent}${formatValue(entry, { indentLevel: indentLevel + 1 })},`),
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
    (a, b) =>
      a[1].parshaNumber - b[1].parshaNumber ||
      a[1].parshaName.localeCompare(b[1].parshaName)
  )
  .map(
    ([parshaSlug, group]) => `  // ${String(group.parshaNumber).padStart(2, '0')} ${group.parshaName}
  ${JSON.stringify(parshaSlug)}: ${formatValue(
      group.items.sort((a, b) => a.aliyah - b.aliyah),
      {
        indentLevel: 1,
      }
    )},`
  )
  .join('\n\n')

const source = `import type { AudioNarrator, AudioRecording } from '../audio/types.ts'

// This file is generated by \`npm run audio:sync\`.
// Do not edit it by hand; update the source recordings and rerun the sync instead.

export const audioNarrators: AudioNarrator[] = [
  {
    id: 'yoni-davidov',
    displayName: 'Yoni Davidov',
    credit: 'Recordings by Yoni Davidov',
    default: true,
  },
]

export const audioRecordingsByParsha: Record<string, AudioRecording[]> = {
${groupedSections}
}

export const audioRecordings: AudioRecording[] = Object.values(
  audioRecordingsByParsha
).flat()
`

await writeFile(targetFile, source)
