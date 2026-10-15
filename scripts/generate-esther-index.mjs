import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export function createEstherIndex(pages) {
  /** @type {Record<number, Record<number, { p: number, l: number }>>} */
  const chapters = {}
  let previous = { chapter: 1, verse: 0 }
  for (const [index, lines] of pages.entries()) {
    if (!Array.isArray(lines) || !lines.length) throw new Error(`Esther column ${index + 1} is empty`)
    for (const [lineIndex, line] of lines.entries()) {
      for (const ref of line.verses) {
        const follows = ref.chapter === previous.chapter && ref.verse === previous.verse + 1
        const nextChapter = ref.chapter === previous.chapter + 1 && ref.verse === 1
        if (ref.book !== 1 || !(follows || nextChapter)) {
          throw new Error(`Out-of-order Esther reference at column ${index + 1}, line ${lineIndex + 1}`)
        }
        chapters[ref.chapter] ??= {}
        chapters[ref.chapter][ref.verse] = { p: index + 1, l: lineIndex + 1 }
        previous = ref
      }
    }
  }
  if (previous.chapter !== 10 || previous.verse !== 3) throw new Error('Esther must end at 10:3')
  return { 1: chapters }
}

export async function generateEstherIndex(root = repoRoot) {
  const directory = path.join(root, 'text/pages/esther')
  const files = (await readdir(directory)).filter(file => /^\d+\.json$/.test(file)).sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))
  if (files.some((file, index) => file !== `${index + 1}.json`)) throw new Error('Esther columns must be contiguous from 1')
  const pages = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(directory, file), 'utf8'))))
  const output = `${JSON.stringify(createEstherIndex(pages))}\n`
  const target = path.join(root, 'text/esther-toc.json')
  if (await readFile(target, 'utf8') === output) return false
  const staged = `${target}.stage-${process.pid}-${Date.now()}`
  try {
    await writeFile(staged, output)
    await rename(staged, target)
  } finally {
    await rm(staged, { force: true })
  }
  return true
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await generateEstherIndex() ? 'Generated Esther index' : 'Esther index is current')
}
