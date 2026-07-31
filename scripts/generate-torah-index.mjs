import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PAGE_LINE_RADIX = 64

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function contiguousNumericValues(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)

  const keys = Object.keys(value)
    .map((key) => Number(key))
    .sort((left, right) => left - right)
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] !== index + 1) {
      throw new Error(`${label} keys must be contiguous from 1`)
    }
  }
  return keys.map((key) => value[String(key)])
}

export function createTorahIndex(toc) {
  const pageLines = contiguousNumericValues(toc, 'Torah books').map(
    (book, bookIndex) =>
      contiguousNumericValues(book, `Torah book ${bookIndex + 1} chapters`).map(
        (chapter, chapterIndex) =>
          contiguousNumericValues(
            chapter,
            `Torah ${bookIndex + 1}:${chapterIndex + 1} verses`
          ).map((location, verseIndex) => {
            const label =
              `Torah ${bookIndex + 1}:${chapterIndex + 1}:${verseIndex + 1}`
            if (
              !isRecord(location) ||
              !Number.isInteger(location.p) ||
              location.p <= 0 ||
              !Number.isInteger(location.l) ||
              location.l <= 0
            ) {
              throw new Error(`${label} must have positive integer p and l`)
            }
            if (location.l >= PAGE_LINE_RADIX) {
              throw new Error(
                `${label} line ${location.l} exceeds radix ${PAGE_LINE_RADIX}`
              )
            }
            return location.p * PAGE_LINE_RADIX + location.l
          })
      )
  )

  return {
    radix: PAGE_LINE_RADIX,
    pageLines,
  }
}

export function renderTorahIndex(index) {
  return `${JSON.stringify(index)}\n`
}

async function readExisting(targetFile) {
  try {
    return await readFile(targetFile, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function generateTorahIndex(root = repoRoot) {
  const sourceFile = path.join(root, 'text', 'torah-toc.json')
  const targetFile = path.join(root, 'generated', 'torah-index.json')
  const toc = JSON.parse(await readFile(sourceFile, 'utf8'))
  const output = renderTorahIndex(createTorahIndex(toc))
  if ((await readExisting(targetFile)) === output) return false

  await mkdir(path.dirname(targetFile), { recursive: true })
  const stagedFile = `${targetFile}.stage-${process.pid}-${Date.now()}`
  try {
    await writeFile(stagedFile, output)
    await rename(stagedFile, targetFile)
  } finally {
    await rm(stagedFile, { force: true })
  }
  return true
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = await generateTorahIndex()
  console.log(changed ? 'Generated compact Torah index' : 'Compact Torah index is current')
}
