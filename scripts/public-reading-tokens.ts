import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AudioRecording } from '../app/audio/types.ts'
import { isParshaAudioRecording } from '../app/audio/types.ts'
import { LeiningGenerator } from '../app/calendar-model/generator.ts'
import type { LeiningAliyah } from '../app/calendar-model/model-types.ts'
import type { LineType } from '../app/components/Page.ts'
import type { RefWithScroll } from '../app/ref.ts'
import { canonicalLineWords } from '../app/reader/canonical-line-words.ts'
import {
  collectExactTokenRange,
  type SequencedWord,
} from '../app/reading/exact-token-range.ts'
import { resolveParshaRun } from '../app/view-model/navigation/parsha-routes.ts'

type TocLocation = { p: number; l: number }
type TorahToc = Record<
  string,
  Record<string, Record<string, TocLocation>>
>

type LocatedLine = {
  pageNumber: number
  lineIndex: number
  line: LineType
}

function locationForRef(toc: TorahToc, ref: RefWithScroll) {
  if (ref.scroll !== 'torah') {
    throw new Error(`Canonical Cue Data tokens require a Torah reference`)
  }
  const location = toc[String(ref.b)]?.[String(ref.c)]?.[String(ref.v)]
  if (!location) {
    throw new Error(`No Torah page location for ${ref.b}:${ref.c}:${ref.v}`)
  }
  return location
}

function maxPageNumber(toc: TorahToc) {
  let maximum = 0
  for (const chapters of Object.values(toc)) {
    for (const verses of Object.values(chapters)) {
      for (const location of Object.values(verses)) {
        maximum = Math.max(maximum, location.p)
      }
    }
  }
  return maximum
}

function wordsForLine({
  pageNumber,
  lineIndex,
  line,
}: LocatedLine): SequencedWord[] {
  return canonicalLineWords(pageNumber, lineIndex, line)
}

function verseOrdinal(line: LineType, ref: RefWithScroll) {
  return line.verses.findIndex(
    (verse) =>
      verse.book === ref.b &&
      verse.chapter === ref.c &&
      verse.verse === ref.v
  )
}

async function readPage(pageRoot: string, pageNumber: number) {
  const value: unknown = JSON.parse(
    await readFile(path.join(pageRoot, `${pageNumber}.json`), 'utf8')
  )
  if (!Array.isArray(value)) {
    throw new Error(`Torah page ${pageNumber} is not an array`)
  }
  return value as LineType[]
}

async function tokenKeysForRange({
  toc,
  pageRoot,
  start,
  end,
}: {
  toc: TorahToc
  pageRoot: string
  start: RefWithScroll
  end: RefWithScroll
}) {
  const startLocation = locationForRef(toc, start)
  const endLocation = locationForRef(toc, end)
  const firstPage = Math.max(1, startLocation.p - 1)
  const lastPage = Math.min(maxPageNumber(toc), endLocation.p + 1)
  const pageNumbers = Array.from(
    { length: lastPage - firstPage + 1 },
    (_, index) => firstPage + index
  )
  const pages = await Promise.all(
    pageNumbers.map(async (pageNumber) => ({
      pageNumber,
      lines: await readPage(pageRoot, pageNumber),
    }))
  )
  const locatedLines = pages.flatMap(({ pageNumber, lines }) =>
    lines.map((line, lineIndex) => ({ pageNumber, lineIndex, line }))
  )
  const startLineIndex = locatedLines.findIndex(
    (entry) =>
      entry.pageNumber === startLocation.p &&
      entry.lineIndex === startLocation.l - 1
  )
  const endLineIndex = locatedLines.findIndex(
    (entry) =>
      entry.pageNumber === endLocation.p && entry.lineIndex === endLocation.l - 1
  )
  const startLine = locatedLines[startLineIndex]?.line
  const endLine = locatedLines[endLineIndex]?.line
  if (!startLine || !endLine) {
    throw new Error(`Could not load the canonical Torah lines for a reading`)
  }

  const startVerseOrdinal = verseOrdinal(startLine, start)
  const endVerseOrdinal = verseOrdinal(endLine, end)
  const tokenKeys = collectExactTokenRange({
    wordsByLine: locatedLines.map(wordsForLine),
    startLineIndex,
    startVerseOrdinal,
    endLineIndex,
    endVerseOrdinal,
  })
  if (!tokenKeys.length) {
    throw new Error(
      `Could not derive canonical tokens for ${start.b}:${start.c}:${start.v}-${
        end.b
      }:${end.c}:${end.v}`
    )
  }
  return tokenKeys
}

function rangeForRecording(
  recording: AudioRecording,
  generator: LeiningGenerator,
  now: Date
): { start: RefWithScroll; end: RefWithScroll } {
  if (!isParshaAudioRecording(recording)) return recording.range

  const resolved = resolveParshaRun(generator, recording.parshaSlug, now)
  const aliyah: LeiningAliyah | undefined = resolved?.run.aliyot.find(
    (candidate) => candidate.index === recording.aliyah
  )
  if (!aliyah) {
    throw new Error(`Could not resolve canonical aliyah for ${recording.id}`)
  }
  return { start: aliyah.start, end: aliyah.end }
}

export async function readCanonicalTokenKeysForRecordings({
  recordings,
  repoRoot,
  now,
}: {
  recordings: readonly AudioRecording[]
  repoRoot: string
  now: Date
}) {
  const [tocValue] = await Promise.all([
    readFile(path.join(repoRoot, 'text/torah-toc.json'), 'utf8'),
  ])
  const toc = JSON.parse(tocValue) as TorahToc
  const pageRoot = path.join(repoRoot, 'text/pages/torah')
  const generator = new LeiningGenerator({
    ashkenazi: true,
    includeModernHolidays: false,
    israel: false,
  })
  const entries = await Promise.all(
    recordings
      .filter((recording) => recording.status === 'available')
      .map(async (recording) => {
        const range = rangeForRecording(recording, generator, now)
        return [
          recording.id,
          await tokenKeysForRange({ toc, pageRoot, ...range }),
        ] as const
      })
  )
  return new Map(entries)
}
